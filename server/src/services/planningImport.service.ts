import { db } from '../db';
import type {
  ImportPreview,
  ImportApplyRequest,
  ImportApplyResult,
  ImportLabel,
  ImportLabelMapping,
  ImportEmployee,
  ImportParsedShift,
  ShiftType,
  ShiftStatus,
} from '@obliplan/shared';
import { userService } from './user.service';
import { hourTypeService } from './hourType.service';
import { shiftService } from './shift.service';
import { boardService } from './kanban.service';

// ── Parsing ───────────────────────────────────────────────────────────────────
// The spreadsheet is ";"-delimited with REPEATING WEEK BLOCKS: a day-header row
// (Lundi JJ/MM … Dimanche JJ/MM), then an hour-slot row (8h-9h … 19h-20h, 12 slots
// per day), then employee "bands". A band starts on a row with a non-empty first
// column (the name) and spans following rows until the next named row - the format
// stacks a "site" layer and a "task" layer, so per slot we take the last non-empty
// value in the band (task wins, site is the fallback). Consecutive equal slots are
// collapsed into one shift.

const DAY_RE = /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+(\d{2})\/(\d{2})/i;
const HOUR_RE = /^(\d{1,2})h-(\d{1,2})h?$/i;
const SLOTS_PER_DAY = 12;

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

interface ParsedPlanning {
  weekLabels: string[];
  employees: string[];
  labelCounts: Map<string, number>;
  shifts: ImportParsedShift[];
}

function slotTime(hourCell: string): { start: string; end: string } | null {
  const m = hourCell.match(HOUR_RE);
  if (!m) return null;
  return { start: `${m[1].padStart(2, '0')}:00`, end: `${m[2].padStart(2, '0')}:00` };
}

export function parsePlanningCsv(csvText: string): ParsedPlanning {
  const rows = csvText.split(/\r?\n/).map((l) => l.split(';').map((c) => c.trim()));

  // Locate every week block (row carrying ≥3 day headers).
  const weeks: { headerRow: number; hourRow: number; days: { col: number; dd: string; mm: string }[] }[] = [];
  for (let r = 0; r < rows.length; r += 1) {
    const days: { col: number; dd: string; mm: string }[] = [];
    rows[r].forEach((cell, c) => {
      const m = cell.match(DAY_RE);
      if (m) days.push({ col: c, dd: m[2], mm: m[3] });
    });
    if (days.length >= 3) weeks.push({ headerRow: r, hourRow: r + 1, days });
  }

  const weekLabels: string[] = [];
  const employees: string[] = [];
  const employeeSeen = new Set<string>();
  const labelCounts = new Map<string, number>();
  const shifts: ImportParsedShift[] = [];

  for (let w = 0; w < weeks.length; w += 1) {
    const week = weeks[w];
    const hourRow = rows[week.hourRow] ?? [];
    weekLabels.push(week.days.map((d) => `${d.dd}/${d.mm}`).join(' → '));
    const blockStart = week.hourRow + 1;
    const blockEnd = w + 1 < weeks.length ? weeks[w + 1].headerRow : rows.length;

    // Employee band boundaries: rows with a non-empty first cell that isn't a day header.
    const bands: { name: string; start: number }[] = [];
    for (let r = blockStart; r < blockEnd; r += 1) {
      const name = rows[r][0];
      if (name && !DAY_RE.test(name)) bands.push({ name, start: r });
    }

    for (let b = 0; b < bands.length; b += 1) {
      const name = bands[b].name;
      if (!employeeSeen.has(name)) {
        employeeSeen.add(name);
        employees.push(name);
      }
      const start = bands[b].start;
      const end = b + 1 < bands.length ? bands[b + 1].start : blockEnd;

      for (const day of week.days) {
        // Build the 12 slot values for this day, then collapse consecutive equals.
        let cur: { label: string; start: string; end: string } | null = null;
        const flush = () => {
          if (cur) {
            shifts.push({ employeeName: name, dd: day.dd, mm: day.mm, start: cur.start, end: cur.end, label: cur.label });
            cur = null;
          }
        };
        for (let s = 0; s < SLOTS_PER_DAY; s += 1) {
          const col = day.col + s;
          let val = '';
          for (let rr = start; rr < end; rr += 1) {
            const v = rows[rr]?.[col];
            if (v) val = v; // later rows (task layer) override earlier (site layer)
          }
          const time = slotTime(hourRow[col] ?? '');
          if (!val || !time) {
            flush();
            continue;
          }
          labelCounts.set(val, (labelCounts.get(val) ?? 0) + 1);
          if (cur && cur.label === val) cur.end = time.end;
          else {
            flush();
            cur = { label: val, start: time.start, end: time.end };
          }
        }
        flush();
      }
    }
  }

  return { weekLabels, employees, labelCounts, shifts };
}

// ── Mapping suggestions ─────────────────────────────────────────────────────────

/** Default action for a label, given the tenant's existing hour-types (by normalized libellé). */
function suggestLabel(label: string, hourTypesByNorm: Map<string, number>): ImportLabelMapping {
  const n = norm(label);
  if (/https?:\/\//i.test(label) || n.replace(/[^a-z0-9]/g, '').length < 2) return { action: 'ignore', hourTypeId: null };
  if (n === 'off') return { action: 'ignore', hourTypeId: null };
  if (n.startsWith('conge')) return { action: 'conge', hourTypeId: null };
  if (n === 'maladie') return { action: 'absence', hourTypeId: null };
  if (n === 'ecole') return { action: 'ecole', hourTypeId: null };
  if (n.startsWith('pause')) return { action: 'pause', hourTypeId: null };
  const existing = hourTypesByNorm.get(n);
  if (existing != null) return { action: 'hourtype', hourTypeId: existing };
  return { action: 'hourtype', hourTypeId: null }; // create a new hour-type from the label
}

interface UserCandidate {
  id: number;
  full: string; // normalized "display name"
  tokens: string[];
}

/**
 * Fuzzy-match a CSV name to an existing user. The CSV often carries only a first
 * name ("Marie") while Obliplan holds the full name ("Marie Durand"), so:
 * (1) exact normalized match, then (2) all CSV tokens contained in a candidate's
 * tokens, then (3) same first token. Each tier only auto-suggests when EXACTLY one
 * candidate qualifies - an ambiguous name stays unmatched for the user to map.
 */
function matchUserId(csvName: string, candidates: UserCandidate[]): number | null {
  const cn = norm(csvName);
  const cTokens = cn.split(/\s+/).filter(Boolean);
  const exact = candidates.filter((c) => c.full === cn);
  if (exact.length === 1) return exact[0].id;
  const contains = candidates.filter((c) => cTokens.length > 0 && cTokens.every((t) => c.tokens.includes(t)));
  if (contains.length === 1) return contains[0].id;
  if (cTokens.length > 0) {
    const firstTok = candidates.filter((c) => c.tokens[0] === cTokens[0]);
    if (firstTok.length === 1) return firstTok[0].id;
  }
  return null;
}

// ── Time-interval helpers (merge mode) ────────────────────────────────────────
const hm5 = (v: string | null): string | null => (v == null ? null : v.slice(0, 5));
const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const minToHm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Subtract a set of intervals (the imported slots) from [s,e], returning the parts of
 * [s,e] left uncovered - 0, 1 or 2+ pieces. Drives merge: an existing shift keeps only
 * what the import doesn't claim (empty ⇒ fully swallowed, unchanged ⇒ no overlap).
 */
function subtractIntervals(s: number, e: number, union: [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[s, e]];
  for (const [is, ie] of union) {
    const next: [number, number][] = [];
    for (const [ps, pe] of pieces) {
      if (ie <= ps || is >= pe) {
        next.push([ps, pe]); // disjoint
        continue;
      }
      if (ps < is) next.push([ps, is]); // left remainder
      if (ie < pe) next.push([ie, pe]); // right remainder
      // middle is covered by the import → dropped
    }
    pieces = next;
  }
  return pieces;
}

/** Uppercase alnum code (≤16) for a freshly-created hour-type. */
function codeFor(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 16) || null
  ) as string;
}

export const planningImportService = {
  /** Parse + auto-match employees to users + suggest label mappings + a sample. */
  async preview(tenantId: number, csvText: string): Promise<ImportPreview> {
    const parsed = parsePlanningCsv(csvText);
    const warnings: string[] = [];
    if (parsed.weekLabels.length === 0) warnings.push('Aucune semaine détectée - vérifie le format (délimiteur « ; », en-têtes de jour).');

    // Employee → user FUZZY auto-match (a CSV first name → a full Obliplan name).
    const users = (await userService.getByTenant(tenantId)).filter((u) => u.isActive);
    const candidates: UserCandidate[] = users.map((u) => {
      const uname = u.username.startsWith('og_') ? u.username.slice(3) : u.username;
      const full = norm(u.displayName || uname);
      return { id: u.id, full, tokens: full.split(/\s+/).filter(Boolean) };
    });
    const perEmpCount = new Map<string, number>();
    for (const s of parsed.shifts) perEmpCount.set(s.employeeName, (perEmpCount.get(s.employeeName) ?? 0) + 1);
    const employees: ImportEmployee[] = parsed.employees.map((csvName) => ({
      csvName,
      suggestedUserId: matchUserId(csvName, candidates),
      count: perEmpCount.get(csvName) ?? 0,
    }));
    if (employees.some((e) => e.suggestedUserId === null))
      warnings.push('Certains salariés du fichier ne correspondent à aucun compte - associe-les à la main (ou laisse-les de côté).');

    // Label → mapping suggestions.
    const hourTypes = await hourTypeService.getAll(tenantId);
    const hourTypesByNorm = new Map<string, number>(hourTypes.map((h) => [norm(h.libelle), h.id]));
    const labels: ImportLabel[] = [...parsed.labelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, suggestion: suggestLabel(label, hourTypesByNorm) }));

    // Sample: first week's collapsed shifts (up to 6 employee-days).
    const firstWeekMm = parsed.shifts.length ? parsed.shifts[0].mm : '';
    const sample: ImportPreview['sample'] = [];
    const byEmpDay = new Map<string, { start: string; end: string; label: string }[]>();
    for (const s of parsed.shifts) {
      const key = `${s.employeeName}|${s.dd}/${s.mm}`;
      if (!byEmpDay.has(key)) byEmpDay.set(key, []);
      byEmpDay.get(key)!.push({ start: s.start, end: s.end, label: s.label });
    }
    for (const [key, list] of byEmpDay) {
      if (sample.length >= 6) break;
      const [employeeName, date] = key.split('|');
      if (!date.endsWith(`/${firstWeekMm}`)) continue;
      sample.push({ employeeName, date, shifts: list });
    }

    return { weekLabels: parsed.weekLabels, employees, labels, totalShifts: parsed.shifts.length, sample, warnings };
  },

  /** Create the shifts (drafts by default), creating missing hour-types, deduping re-imports. */
  async apply(
    tenantId: number,
    actor: { userId: number; role: string },
    req: ImportApplyRequest,
  ): Promise<ImportApplyResult> {
    const parsed = parsePlanningCsv(req.csvText);
    const statut: 'brouillon' | 'valide' = req.statut === 'valide' ? 'valide' : 'brouillon';
    const mode: 'merge' | 'replace' | 'add' = req.mode === 'merge' || req.mode === 'add' ? req.mode : 'replace';
    const warnings: string[] = [];
    const dateOf = (s: ImportParsedShift) => `${req.year}-${s.mm.padStart(2, '0')}-${s.dd.padStart(2, '0')}`;

    // Authorization: never trust the client map. A target is importable only if it is
    // a MEMBER of this tenant AND the actor may manage it (admin → any member,
    // manager → their reports, or self). This blocks cross-tenant ids and out-of-scope
    // users regardless of what the client submitted.
    const distinctIds = [...new Set(Object.values(req.employeeMap).filter((v): v is number => v != null))];
    const memberIds = new Set((await userService.getByTenant(tenantId)).map((u) => u.id));
    const allowed = new Set<number>();
    for (const uid of distinctIds) {
      if (!memberIds.has(uid)) continue;
      if (uid === actor.userId || actor.role === 'admin' || (await userService.canManage(actor, uid, tenantId)))
        allowed.add(uid);
    }
    const blocked = parsed.employees.filter((n) => {
      const uid = req.employeeMap[n];
      return uid != null && !allowed.has(uid);
    });
    if (blocked.length) warnings.push(`Ignorés (hors de votre périmètre de gestion) : ${blocked.join(', ')}`);

    // Project (board) create/reuse cache: normalized name → board id. A label mapping may
    // carry a free-text `projectName` (action 'hourtype' only) - the created worked shift is
    // linked to a board of that name, reusing an existing tenant board (case-insensitive) or
    // creating one (owned by the actor) exactly ONCE per distinct normalized name. Seeded from
    // the tenant's existing boards, but only when at least one label actually asks for a project.
    const boardByNorm = new Map<string, number>();
    let createdBoards = 0;
    const wantsProjects = Object.values(req.labelMap).some(
      (m) => m?.action === 'hourtype' && (m.projectName ?? '').trim() !== '',
    );
    if (wantsProjects) {
      for (const b of await boardService.listAll(tenantId)) {
        const n = norm(b.name);
        if (n && !boardByNorm.has(n)) boardByNorm.set(n, b.id);
      }
    }
    const resolveBoardId = async (projectName: string, clientId?: number | null): Promise<number> => {
      const n = norm(projectName);
      let id = boardByNorm.get(n);
      if (id == null) {
        // Clamp to boards.name's varchar(200) so an over-long label can't raise a
        // DB error mid-import (apply isn't transactional → would leave partial data).
        // The per-label client is only applied to a board actually CREATED here; dedupe
        // stays by normalized NAME, so a reused board keeps its existing client.
        const board = await boardService.create(tenantId, actor.userId, {
          name: projectName.slice(0, 200),
          clientId: clientId ?? null,
        });
        id = board.id;
        boardByNorm.set(n, id);
        createdBoards += 1;
      }
      return id;
    };

    // ── Phase A: resolve each parsed row to a concrete shift (creating hour-types as
    // needed). Board resolution is deferred to insert-time so a shift that ends up
    // skipped never materializes a project. Ignored/unmapped/out-of-scope rows count as skipped.
    interface Resolved {
      userId: number;
      employeeName: string;
      date: string;
      start: string;
      end: string;
      type: ShiftType;
      hourTypeId: number | null;
      projectName: string | null;
      clientId: number | null;
    }
    const resolved: Resolved[] = [];
    const createdHourTypeIds = new Map<string, number>();
    let createdHourTypes = 0;
    let skipped = 0;
    const perEmp = new Map<string, { created: number; mapped: boolean }>();
    for (const name of parsed.employees) perEmp.set(name, { created: 0, mapped: req.employeeMap[name] != null });

    for (const s of parsed.shifts) {
      const userId = req.employeeMap[s.employeeName];
      if (userId == null || !allowed.has(userId)) {
        skipped += 1;
        continue;
      }
      const mapping = req.labelMap[s.label];
      if (!mapping || mapping.action === 'ignore') {
        skipped += 1;
        continue;
      }
      let shiftType: ShiftType;
      let hourTypeId: number | null = null;
      let projectName: string | null = null;
      let clientId: number | null = null;
      if (mapping.action === 'hourtype') {
        shiftType = 'travail';
        if (mapping.hourTypeId != null) hourTypeId = mapping.hourTypeId;
        else {
          let id = createdHourTypeIds.get(s.label);
          if (id == null) {
            const ht = await hourTypeService.create(tenantId, { libelle: s.label, code: codeFor(s.label), color: null });
            id = ht.id;
            createdHourTypeIds.set(s.label, id);
            createdHourTypes += 1;
          }
          hourTypeId = id;
        }
        const pn = (mapping.projectName ?? '').trim();
        if (pn) {
          projectName = pn;
          clientId = mapping.clientId ?? null;
        }
      } else {
        shiftType = mapping.action; // 'repos' | 'conge' | 'absence' | 'ecole' | 'pause'
      }
      resolved.push({
        userId,
        employeeName: s.employeeName,
        date: dateOf(s),
        start: s.start,
        end: s.end,
        type: shiftType,
        hourTypeId,
        projectName,
        clientId,
      });
    }

    // Insert one resolved row (materializing its board lazily). Shared by all modes.
    let createdShifts = 0;
    const insertResolved = async (r: Resolved): Promise<void> => {
      let boardId: number | null = null;
      if (r.type === 'travail' && r.projectName) boardId = await resolveBoardId(r.projectName, r.clientId);
      await shiftService.create(tenantId, actor.userId, {
        userId: r.userId,
        date: r.date,
        heureDebut: r.start,
        heureFin: r.end,
        type: r.type,
        statut,
        hourTypeId: r.hourTypeId,
        boardId,
      });
      createdShifts += 1;
      const rec = perEmp.get(r.employeeName);
      if (rec) rec.created += 1;
    };

    // ── Phase B: existing shifts on the touched (employee, day) pairs, grouped by day.
    const touched = new Set(resolved.map((r) => `${r.userId}|${r.date}`));
    const touchedUserIds = [...new Set(resolved.map((r) => r.userId))];
    const touchedDates = [...new Set(resolved.map((r) => r.date))];
    interface ExistingLite {
      id: number;
      heureDebut: string | null;
      heureFin: string | null;
      type: string;
      statut: string;
      note: string | null;
      hourTypeId: number | null;
      boardId: number | null;
      pauseMin: number;
    }
    const existingByDay = new Map<string, ExistingLite[]>();
    if (touchedUserIds.length && touchedDates.length) {
      const rows = await db('shifts')
        .where('tenant_id', tenantId)
        .whereIn('user_id', touchedUserIds)
        .whereIn('date', touchedDates)
        .select<
          {
            id: number;
            user_id: number;
            date: string;
            heure_debut: string | null;
            heure_fin: string | null;
            type: string;
            statut: string;
            note: string | null;
            hour_type_id: number | null;
            board_id: number | null;
            pause_min: number;
          }[]
        >(
          'id',
          'user_id',
          'date',
          'heure_debut',
          'heure_fin',
          'type',
          'statut',
          'note',
          'hour_type_id',
          'board_id',
          'pause_min',
        );
      for (const r of rows) {
        const key = `${r.user_id}|${String(r.date).slice(0, 10)}`;
        if (!touched.has(key)) continue; // keep only the exact touched pairs, not the user×date cross-product
        const list = existingByDay.get(key) ?? [];
        list.push({
          id: r.id,
          heureDebut: hm5(r.heure_debut),
          heureFin: hm5(r.heure_fin),
          type: r.type,
          statut: r.statut,
          note: r.note,
          hourTypeId: r.hour_type_id,
          boardId: r.board_id,
          pauseMin: r.pause_min ?? 0,
        });
        existingByDay.set(key, list);
      }
    }

    let deletedShifts = 0;
    let trimmedShifts = 0;

    // ── Phase C: combine with the existing planning per the chosen mode. ──
    if (mode === 'replace') {
      // Wipe every touched day, then lay the import down. FK CASCADE on
      // recup_mouvements.shift_id cleans linked récup debits automatically.
      const ids: number[] = [];
      for (const key of touched) for (const e of existingByDay.get(key) ?? []) ids.push(e.id);
      if (ids.length) deletedShifts += await db('shifts').where('tenant_id', tenantId).whereIn('id', ids).del();
      for (const r of resolved) await insertResolved(r);
    } else if (mode === 'add') {
      // Cumulate: insert everything, but never duplicate an exact (start,end) already present.
      const exact = new Set<string>();
      for (const [key, list] of existingByDay)
        for (const e of list) exact.add(`${key}|${e.heureDebut ?? ''}|${e.heureFin ?? ''}`);
      for (const r of resolved) {
        const k = `${r.userId}|${r.date}|${r.start}|${r.end}`;
        if (exact.has(k)) {
          skipped += 1;
          continue;
        }
        await insertResolved(r);
        exact.add(k);
      }
    } else {
      // merge: trim/split existing timed shifts overlapped by an import (import wins the overlap).
      const resolvedByDay = new Map<string, Resolved[]>();
      for (const r of resolved) {
        const key = `${r.userId}|${r.date}`;
        const list = resolvedByDay.get(key) ?? [];
        list.push(r);
        resolvedByDay.set(key, list);
      }
      for (const [key, dayResolved] of resolvedByDay) {
        const [uidStr, date] = key.split('|');
        const uid = Number(uidStr);
        const existDay = existingByDay.get(key) ?? [];
        const existingExact = new Set(existDay.map((e) => `${e.heureDebut ?? ''}|${e.heureFin ?? ''}`));
        // An import identical to an existing shift is a no-op: keep the existing, skip the import.
        const toInsert = dayResolved.filter((r) => !existingExact.has(`${r.start}|${r.end}`));
        skipped += dayResolved.length - toInsert.length;
        const union = toInsert.map((r) => [hmToMin(r.start), hmToMin(r.end)] as [number, number]);
        for (const e of existDay) {
          if (!e.heureDebut || !e.heureFin) continue; // untimed full-day marker - not clippable by time
          const es = hmToMin(e.heureDebut);
          const ee = hmToMin(e.heureFin);
          if (ee <= es) continue;
          const pieces = subtractIntervals(es, ee, union);
          if (pieces.length === 1 && pieces[0][0] === es && pieces[0][1] === ee) continue; // no overlap - untouched
          if (pieces.length === 0) {
            await db('shifts').where({ id: e.id, tenant_id: tenantId }).del();
            deletedShifts += 1;
          } else {
            // Keep the first remaining piece on the existing row; recreate any others (clones).
            await shiftService.update(e.id, tenantId, actor.userId, {
              heureDebut: minToHm(pieces[0][0]),
              heureFin: minToHm(pieces[0][1]),
            });
            for (let i = 1; i < pieces.length; i += 1) {
              await shiftService.create(tenantId, actor.userId, {
                userId: uid,
                date,
                heureDebut: minToHm(pieces[i][0]),
                heureFin: minToHm(pieces[i][1]),
                type: e.type as ShiftType,
                statut: e.statut as ShiftStatus,
                note: e.note,
                hourTypeId: e.hourTypeId,
                boardId: e.boardId,
                pauseMin: e.pauseMin,
              });
            }
            trimmedShifts += 1;
          }
        }
        for (const r of toInsert) await insertResolved(r);
      }
    }

    return {
      createdShifts,
      createdHourTypes,
      createdBoards,
      skipped,
      deletedShifts,
      trimmedShifts,
      perEmployee: [...perEmp.entries()].map(([name, v]) => ({ name, created: v.created, mapped: v.mapped })),
      warnings,
    };
  },
};

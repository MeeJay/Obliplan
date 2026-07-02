import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Trash2 } from 'lucide-react';
import type { ShiftTemplate, ShiftType } from '@obliplan/shared';
import { shiftTemplateApi } from '../../api';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { SHIFT_TYPES, SHIFT_META } from './shiftMeta';
import { cn } from '../../utils/cn';

const empty = { name: '', heureDebut: '09:00', heureFin: '17:00', pauseMin: 60, type: 'travail' as ShiftType };

/** Compact CRUD for reusable shift templates (manager-only). Collapsed by default. */
export function ShiftTemplatesManager() {
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(empty);

  const load = () => shiftTemplateApi.list().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!draft.name.trim()) {
      toast.error('Nom requis');
      return;
    }
    try {
      await shiftTemplateApi.create({ ...draft, name: draft.name.trim() });
      setDraft(empty);
      load();
      toast.success('Modèle créé');
    } catch {
      toast.error('Échec de la création');
    }
  }

  async function remove(id: number) {
    try {
      await shiftTemplateApi.remove(id);
      load();
    } catch {
      toast.error('Suppression impossible');
    }
  }

  return (
    <Card>
      <CardHeader>
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Modèles de créneaux ({templates.length})</span>
          <ChevronDown size={15} className={cn('text-text-muted transition-transform', !open && '-rotate-90')} />
        </button>
      </CardHeader>
      {open && (
        <CardBody className="space-y-3">
          <div className="space-y-1">
            {templates.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun modèle. Crée-en un pour pré-remplir les créneaux en un clic.</p>
            ) : (
              templates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm">
                  <span className="text-text-primary">{t.name}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {t.heureDebut}–{t.heureFin}
                    {t.pauseMin > 0 ? ` · ${t.pauseMin}min pause` : ''}
                  </span>
                  <span className="text-xs text-text-muted">{SHIFT_META[t.type].label}</span>
                  <button onClick={() => remove(t.id)} className="ml-auto text-text-muted hover:text-status-down" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-6">
            <Input label="Nom" className="sm:col-span-2" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Début" type="time" value={draft.heureDebut} onChange={(e) => setDraft({ ...draft, heureDebut: e.target.value })} />
            <Input label="Fin" type="time" value={draft.heureFin} onChange={(e) => setDraft({ ...draft, heureFin: e.target.value })} />
            <Input
              label="Pause"
              type="number"
              value={draft.pauseMin}
              onChange={(e) => setDraft({ ...draft, pauseMin: Number(e.target.value) })}
            />
            <div className="flex items-end">
              <Button className="w-full" onClick={add}>
                Ajouter
              </Button>
            </div>
            <Select
              label="Type"
              className="sm:col-span-2"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as ShiftType })}
            >
              {SHIFT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SHIFT_META[t].label}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      )}
    </Card>
  );
}

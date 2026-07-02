import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import type { SystemInfo } from '@obliplan/shared';

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return 'dev';
  }
}

const MB = 1024 * 1024;

export const systemInfoService = {
  async get(): Promise<SystemInfo> {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await db.raw('select 1');
    } catch {
      dbStatus = 'error';
    }

    const [l1, l5, l15] = os.loadavg();
    const mem = process.memoryUsage();

    return {
      appVersion: appVersion(),
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      environment: {
        isDocker: existsSync('/.dockerenv'),
        platform: `${os.type()} ${os.release()} (${process.arch})`,
        dbStatus,
      },
      cpu: {
        cores: os.cpus().length,
        loadAvg1: Math.round(l1 * 100) / 100,
        loadAvg5: Math.round(l5 * 100) / 100,
        loadAvg15: Math.round(l15 * 100) / 100,
      },
      memory: {
        processRssMb: Math.round(mem.rss / MB),
        processHeapMb: Math.round(mem.heapUsed / MB),
        systemFreeMb: Math.round(os.freemem() / MB),
        systemTotalMb: Math.round(os.totalmem() / MB),
      },
    };
  },
};

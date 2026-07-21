import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { ScheduleAccount, ScheduleConfig, ScheduleState } from '~/types/schedule';

/**
 * 持久化文件存储目录
 * 本地 dev 和 Docker 统一写入 .data/schedule/，确保数据跨重启不丢失
 */
const DATA_DIR = resolve(process.cwd(), '.data', 'schedule');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(resolve(DATA_DIR, `${name}.json`), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, data: unknown): Promise<boolean> {
  try {
    await ensureDir();
    await fs.writeFile(resolve(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[schedule] 写入 ${name}.json 失败:`, err);
    return false;
  }
}

// ========== 调度配置 ==========

export async function getScheduleConfig(): Promise<ScheduleConfig | null> {
  return readJson<ScheduleConfig | null>('config', null);
}

export async function setScheduleConfig(config: ScheduleConfig): Promise<boolean> {
  return writeJson('config', config);
}

// ========== 订阅账号 ==========

export async function getScheduleAccounts(): Promise<ScheduleAccount[]> {
  return readJson<ScheduleAccount[]>('accounts', []);
}

export async function setScheduleAccounts(accounts: ScheduleAccount[]): Promise<boolean> {
  return writeJson('accounts', accounts);
}

// ========== 调度状态 ==========

export async function getScheduleState(): Promise<ScheduleState> {
  return readJson<ScheduleState>('state', { lastCheckTime: null, nextCheckTime: null, isRunning: false });
}

export async function setScheduleState(state: ScheduleState): Promise<boolean> {
  return writeJson('state', state);
}

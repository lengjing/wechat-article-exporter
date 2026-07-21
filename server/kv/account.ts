import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { MpAccount } from '~/store/v2/info';

const DATA_FILE = resolve(process.cwd(), '.data', 'accounts.json');

async function readAll(): Promise<MpAccount[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as MpAccount[];
  } catch {
    return [];
  }
}

async function writeAll(accounts: MpAccount[]): Promise<void> {
  await fs.mkdir(resolve(process.cwd(), '.data'), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

/** 获取所有公众号 */
export async function getAllAccounts(): Promise<MpAccount[]> {
  return readAll();
}

/** 获取单个公众号 */
export async function getAccount(fakeid: string): Promise<MpAccount | undefined> {
  const accounts = await readAll();
  return accounts.find(a => a.fakeid === fakeid);
}

/** 创建或更新公众号 */
export async function upsertAccount(account: MpAccount): Promise<void> {
  const accounts = await readAll();
  const idx = accounts.findIndex(a => a.fakeid === account.fakeid);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...account };
  } else {
    accounts.push(account);
  }
  await writeAll(accounts);
}

/** 批量导入公众号 */
export async function importAccounts(accounts: MpAccount[]): Promise<void> {
  const existing = await readAll();
  for (const account of accounts) {
    const idx = existing.findIndex(a => a.fakeid === account.fakeid);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...account };
    } else {
      existing.push(account);
    }
  }
  await writeAll(existing);
}

/** 删除公众号 */
export async function deleteAccount(fakeid: string): Promise<void> {
  const accounts = await readAll();
  const filtered = accounts.filter(a => a.fakeid !== fakeid);
  await writeAll(filtered);
}

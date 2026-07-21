import { request } from '#shared/utils/request';

export interface MpAccount {
  fakeid: string;
  completed: boolean;
  count: number;
  articles: number;

  // 公众号昵称
  nickname?: string;
  // 公众号头像
  round_head_img?: string;

  // 公众号文章总数
  total_count: number;
  create_time?: number;
  update_time?: number;

  // 最后更新时间
  last_update_time?: number;

  // 是否启用定时监控
  scheduleEnabled?: boolean;

  // 定时调度已知的最新文章信息
  lastArticleTime?: number;
  lastArticleTitle?: string;
  lastArticleUrl?: string;

  // 已推送过的文章 appmsgid 列表（用于去重）
  pushedAppmsgIds?: number[];
}

async function httpGet<T>(url: string): Promise<T | null> {
  try {
    return await request<T>(url);
  } catch {
    return null;
  }
}

async function httpPost<T>(url: string, body: unknown): Promise<T | null> {
  try {
    return await $fetch<T>(url, { method: 'POST', body });
  } catch {
    return null;
  }
}

/**
 * 更新 account 缓存（累加 count/articles）
 * @param mpAccount
 */
export async function updateInfoCache(mpAccount: MpAccount): Promise<boolean> {
  try {
    const existing = await getInfoCache(mpAccount.fakeid);
    const now = Math.round(Date.now() / 1000);

    const merged: MpAccount = existing
      ? {
          ...existing,
          ...mpAccount,
          count: existing.count + (mpAccount.count || 0),
          articles: existing.articles + (mpAccount.articles || 0),
          update_time: now,
        }
      : {
          ...mpAccount,
          count: mpAccount.count || 0,
          articles: mpAccount.articles || 0,
          create_time: now,
          update_time: now,
        };

    const resp = await $fetch('/api/accounts', { method: 'POST', body: merged });
    return resp?.code === 0;
  } catch (err) {
    console.error('updateInfoCache 失败:', err);
    return false;
  }
}

export async function updateLastUpdateTime(fakeid: string): Promise<boolean> {
  try {
    const account = await getInfoCache(fakeid);
    if (!account) return false;
    account.last_update_time = Math.round(Date.now() / 1000);
    const resp = await $fetch('/api/accounts', { method: 'POST', body: account });
    return resp?.code === 0;
  } catch (err) {
    console.error('updateLastUpdateTime 失败:', err);
    return false;
  }
}

/**
 * 获取 info 缓存
 * @param fakeid
 */
export async function getInfoCache(fakeid: string): Promise<MpAccount | undefined> {
  const accounts = await getAllAccountsFromApi();
  return accounts.find(a => a.fakeid === fakeid);
}

export async function getAllInfo(): Promise<MpAccount[]> {
  return getAllAccountsFromApi();
}

// 获取公众号的名称
export async function getAccountNameByFakeid(fakeid: string): Promise<string | null> {
  const account = await getInfoCache(fakeid);
  if (!account) {
    return null;
  }
  return account.nickname || null;
}

// 批量导入公众号
export async function importMpAccounts(mpAccounts: MpAccount[]): Promise<void> {
  const now = Math.round(Date.now() / 1000);
  const accounts = mpAccounts.map(a => ({
    ...a,
    completed: false,
    count: 0,
    articles: 0,
    total_count: 0,
    create_time: a.create_time || now,
    update_time: now,
  }));

  try {
    await $fetch('/api/accounts/batch', {
      method: 'POST',
      body: { accounts },
    });
  } catch (err) {
    console.error('importMpAccounts 失败:', err);
  }
}

// 内部：调用 API 获取所有账号
async function getAllAccountsFromApi(): Promise<MpAccount[]> {
  try {
    const resp = await $fetch('/api/accounts');
    if (resp.code === 0 && Array.isArray(resp.data)) {
      return resp.data as MpAccount[];
    }
  } catch (err) {
    console.error('getAllAccountsFromApi 失败:', err);
  }
  return [];
}

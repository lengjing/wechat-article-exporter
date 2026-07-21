import { importAccounts } from '~/server/kv/account';
import type { MpAccount } from '~/store/v2/info';

/**
 * 批量导入公众号
 */
export default defineEventHandler(async event => {
  const body = await readBody<{ accounts: MpAccount[] }>(event);
  if (!body || !Array.isArray(body.accounts)) {
    return { code: -1, message: '参数错误：accounts 必须为数组' };
  }

  const now = Math.round(Date.now() / 1000);
  const accounts = body.accounts.map(a => ({
    ...a,
    completed: false,
    count: 0,
    articles: 0,
    total_count: 0,
    create_time: a.create_time || now,
    update_time: now,
  }));

  await importAccounts(accounts);
  return { code: 0, message: `导入 ${accounts.length} 个公众号成功` };
});

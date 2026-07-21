import { getScheduleAccounts } from '~/server/kv/schedule';

/**
 * 获取所有订阅的公众号
 */
export default defineEventHandler(async () => {
  const accounts = await getScheduleAccounts();
  return { code: 0, data: accounts };
});

import { getAllAccounts } from '~/server/kv/account';

/**
 * 获取所有公众号
 */
export default defineEventHandler(async () => {
  const accounts = await getAllAccounts();
  return { code: 0, data: accounts };
});

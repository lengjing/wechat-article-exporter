/**
 * （已废弃）账号数据统一通过 /api/accounts 管理
 * 此处仅保留兼容
 */
export default defineEventHandler(async () => {
  return { code: 0, message: '已废弃，请使用 /api/accounts' };
});

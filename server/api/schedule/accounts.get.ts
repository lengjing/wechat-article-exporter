/**
 * （已废弃）账号数据统一通过 /api/accounts 管理
 * 此处仅保留兼容，返回空列表
 */
export default defineEventHandler(async () => {
  return { code: 0, data: [] };
});

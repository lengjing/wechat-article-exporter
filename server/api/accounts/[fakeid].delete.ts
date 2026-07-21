import { deleteAccount } from '~/server/kv/account';

/**
 * 删除公众号
 */
export default defineEventHandler(async event => {
  const fakeid = getRouterParam(event, 'fakeid');
  if (!fakeid) {
    return { code: -1, message: '参数错误：fakeid 不能为空' };
  }

  await deleteAccount(fakeid);
  return { code: 0, message: '删除成功' };
});

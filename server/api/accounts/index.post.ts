import { upsertAccount } from '~/server/kv/account';
import type { MpAccount } from '~/store/v2/info';

/**
 * 创建或更新公众号
 */
export default defineEventHandler(async event => {
  const body = await readBody<MpAccount>(event);
  if (!body || !body.fakeid) {
    return { code: -1, message: '参数错误：fakeid 不能为空' };
  }

  const account: MpAccount = {
    ...body,
    create_time: body.create_time || Math.round(Date.now() / 1000),
    update_time: Math.round(Date.now() / 1000),
  };

  await upsertAccount(account);
  return { code: 0, message: '保存成功', data: account };
});

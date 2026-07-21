import { parseCookies } from 'h3';
import { getScheduleAccounts, setScheduleAccounts, getScheduleConfig, setScheduleConfig } from '~/server/kv/schedule';
import type { ScheduleAccount } from '~/types/schedule';

/**
 * 保存订阅的公众号列表
 * 同时提取当前请求中的 auth-key 保存到调度配置中
 */
export default defineEventHandler(async event => {
  const body = await readBody<{ accounts: ScheduleAccount[] }>(event);
  if (!body || !Array.isArray(body.accounts)) {
    return { code: -1, message: '参数错误：accounts 必须为数组' };
  }

  // 过滤掉无效数据并规范化
  const accounts: ScheduleAccount[] = body.accounts
    .filter(a => a.fakeid && a.nickname)
    .map(a => ({
      fakeid: a.fakeid,
      nickname: a.nickname,
      round_head_img: a.round_head_img || '',
      lastArticleTime: a.lastArticleTime || 0,
      lastArticleTitle: a.lastArticleTitle || '',
      lastArticleUrl: a.lastArticleUrl || '',
      enabled: a.enabled !== false,
    }));

  // 从请求中提取 auth-key（用于后台调度器调用微信 API）
  const cookies = parseCookies(event);
  const authKey = cookies['auth-key'];
  if (authKey) {
    const config = (await getScheduleConfig()) || {
      authKey: '',
      dingtalkUrl: '',
      dingtalkSecret: '',
      enabled: false,
      intervalHours: 2,
    };
    config.authKey = authKey;
    await setScheduleConfig(config);
  }

  const success = await setScheduleAccounts(accounts);
  if (success) {
    return { code: 0, message: '保存成功', data: accounts };
  }
  return { code: -1, message: '保存失败' };
});

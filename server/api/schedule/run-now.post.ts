import { parseCookies } from 'h3';
import { getScheduleConfig, setScheduleConfig } from '~/server/kv/schedule';
import { scheduleEngine } from '~/server/plugins/schedule';

/**
 * 立即执行一次调度检查
 */
export default defineEventHandler(async event => {
  if (!scheduleEngine) {
    return { code: -1, message: '调度引擎未初始化' };
  }

  // 从浏览器 cookie 中提取 auth-key 引用
  const cookies = parseCookies(event);
  const authKey = cookies['auth-key'] || '';
  if (authKey) {
    const config = (await getScheduleConfig()) || { authKey: '', dingtalkUrl: '', dingtalkSecret: '', enabled: false, intervalHours: 2 };
    config.authKey = authKey;
    await setScheduleConfig(config).catch(() => {});
  }

  scheduleEngine.runNow().catch(() => {});

  return { code: 0, message: '已触发立即检查' };
});

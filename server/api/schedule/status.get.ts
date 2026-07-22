import { parseCookies } from 'h3';
import { getScheduleConfig, setScheduleConfig, getScheduleState } from '~/server/kv/schedule';
import { getAllAccounts } from '~/server/kv/account';

/**
 * 获取调度状态
 */
export default defineEventHandler(async event => {
  // 从浏览器 cookie 中提取 auth-key 引用并保存到 config
  const cookies = parseCookies(event);
  const authKey = cookies['auth-key'] || '';

  const [config, state, accounts] = await Promise.all([
    getScheduleConfig(),
    getScheduleState(),
    getAllAccounts(),
  ]);

  if (authKey && config && config.authKey !== authKey) {
    config.authKey = authKey;
    await setScheduleConfig(config).catch(() => {});
  }

  return {
    code: 0,
    data: {
      enabled: config?.enabled || false,
      dingtalkUrl: config?.dingtalkUrl || '',
      dingtalkSecret: config?.dingtalkSecret || '',
      intervalHours: config?.intervalHours || 2,
      lastCheckTime: state.lastCheckTime,
      nextCheckTime: state.nextCheckTime,
      isRunning: state.isRunning,
      error: state.error || config?.lastError || '',
      accountCount: accounts.filter(a => a.scheduleEnabled).length,
      totalAccounts: accounts.length,
    },
  };
});

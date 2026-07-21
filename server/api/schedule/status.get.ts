import { getScheduleConfig, getScheduleAccounts, getScheduleState } from '~/server/kv/schedule';

/**
 * 获取调度状态
 */
export default defineEventHandler(async () => {
  const [config, accounts, state] = await Promise.all([
    getScheduleConfig(),
    getScheduleAccounts(),
    getScheduleState(),
  ]);

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
      accountCount: accounts.filter(a => a.enabled).length,
      totalAccounts: accounts.length,
    },
  };
});

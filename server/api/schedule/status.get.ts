import { getScheduleConfig, getScheduleState } from '~/server/kv/schedule';
import { getAllAccounts } from '~/server/kv/account';

/**
 * 获取调度状态
 */
export default defineEventHandler(async () => {
  const [config, state, accounts] = await Promise.all([
    getScheduleConfig(),
    getScheduleState(),
    getAllAccounts(),
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
      accountCount: accounts.filter(a => a.scheduleEnabled).length,
      totalAccounts: accounts.length,
    },
  };
});

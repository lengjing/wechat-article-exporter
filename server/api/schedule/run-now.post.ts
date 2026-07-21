import { scheduleEngine } from '~/server/plugins/schedule';

/**
 * 立即执行一次调度检查
 * 同时自动同步当前请求的 auth-key
 */
export default defineEventHandler(async event => {
  if (!scheduleEngine) {
    return { code: -1, message: '调度引擎未初始化' };
  }

  // 异步触发，不阻塞返回
  scheduleEngine.runNow().catch(() => {});

  return { code: 0, message: '已触发立即检查' };
});

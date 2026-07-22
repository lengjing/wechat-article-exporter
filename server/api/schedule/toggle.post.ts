import { parseCookies } from 'h3';
import { getScheduleConfig, setScheduleConfig } from '~/server/kv/schedule';
import { scheduleEngine } from '~/server/plugins/schedule';

/**
 * 启用/禁用定时调度
 */
export default defineEventHandler(async event => {
  // 从浏览器 cookie 中提取 auth-key 引用
  const cookies = parseCookies(event);
  const browserAuthKey = cookies['auth-key'] || '';

  const body = await readBody<{ enabled: boolean }>(event);
  if (body === undefined || typeof body.enabled !== 'boolean') {
    return { code: -1, message: '参数错误：enabled 必须为布尔值' };
  }

  const config = (await getScheduleConfig()) || {
    authKey: '',
    dingtalkUrl: '',
    dingtalkSecret: '',
    enabled: false,
    intervalHours: 2,
  };

  config.authKey = browserAuthKey;
  config.enabled = body.enabled;
  config.lastError = '';

  const success = await setScheduleConfig(config);
  if (!success) {
    return { code: -1, message: '保存失败' };
  }

  // 通知调度引擎重新加载配置
  if (scheduleEngine) {
    await scheduleEngine.reload();
  }

  return { code: 0, message: body.enabled ? '调度已启用' : '调度已禁用' };
});

import { parseCookies } from 'h3';
import { getScheduleConfig, setScheduleConfig } from '~/server/kv/schedule';

/**
 * 更新钉钉机器人配置
 */
export default defineEventHandler(async event => {
  const cookies = parseCookies(event);
  const browserAuthKey = cookies['auth-key'] || '';

  const body = await readBody<{ url: string; secret?: string }>(event);
  if (!body || typeof body.url !== 'string') {
    return { code: -1, message: '参数错误：url 必须为字符串' };
  }

  const config = (await getScheduleConfig()) || {
    authKey: '',
    dingtalkUrl: '',
    dingtalkSecret: '',
    enabled: false,
    intervalHours: 2,
  };

  config.authKey = browserAuthKey;
  config.dingtalkUrl = body.url.trim();
  // 签名密钥（可选），未传则清空
  config.dingtalkSecret = typeof body.secret === 'string' ? body.secret.trim() : '';

  const success = await setScheduleConfig(config);
  if (success) {
    return { code: 0, message: '保存成功' };
  }
  return { code: -1, message: '保存失败' };
});

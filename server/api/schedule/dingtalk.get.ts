import { getScheduleConfig } from '~/server/kv/schedule';

/**
 * 获取钉钉机器人配置
 */
export default defineEventHandler(async () => {
  const config = await getScheduleConfig();
  return {
    code: 0,
    data: {
      dingtalkUrl: config?.dingtalkUrl || '',
      dingtalkSecret: config?.dingtalkSecret || '',
    },
  };
});

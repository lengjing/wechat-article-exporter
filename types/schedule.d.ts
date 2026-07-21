// 定时调度模块类型定义

export interface ScheduleAccount {
  fakeid: string
  nickname: string
  round_head_img?: string
  // 已知的最新文章时间戳（Unix 秒）
  lastArticleTime: number
  // 已知的最新文章标题
  lastArticleTitle?: string
  // 已知的最新文章链接
  lastArticleUrl?: string
  // 是否启用
  enabled: boolean
}

export interface ScheduleConfig {
  // 登录用户的 auth-key
  authKey: string
  // 钉钉机器人 Webhook 地址
  dingtalkUrl: string
  // 钉钉机器人签名密钥（加签可选）
  dingtalkSecret: string
  // 调度是否启用
  enabled: boolean
  // 检查间隔（小时）
  intervalHours: number
  // 最近一次检查中是否有错误
  lastError?: string
}

export interface ScheduleState {
  // 最近一次检查时间
  lastCheckTime: number | null
  // 下一次检查时间
  nextCheckTime: number | null
  // 是否正在运行
  isRunning: boolean
  // 错误信息
  error?: string
}

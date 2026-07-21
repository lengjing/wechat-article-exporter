// 定时调度模块类型定义

export interface ScheduleConfig {
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

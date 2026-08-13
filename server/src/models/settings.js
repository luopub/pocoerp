import mongoose from 'mongoose'

// 全局设置（单文档，需求文档 4.10）：预警/补货三级参数的兜底默认值
const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  warnWindowDays: { type: Number, default: 30 }, // 历史出库速度窗口（天）
  warnDays: { type: Number, default: 10 }, // 可用天数门槛（天）
  replenishDays: { type: Number, default: 30 }, // 补货目标天数（天）
})

export const Settings = mongoose.model('Settings', settingsSchema)

/** 读取全局设置（不存在则建默认） */
export async function getSettings() {
  let s = await Settings.findById('global').lean()
  if (!s) s = await Settings.create({ _id: 'global' })
  return s
}

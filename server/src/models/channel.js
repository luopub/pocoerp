import mongoose from 'mongoose'

// 渠道（需求文档 4.12）：预置"非平台产品"，不可删除
const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  builtin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

export const DEFAULT_CHANNEL = '非平台产品'
export const DEFAULT_ACCOUNT = '默认账号'
export const Channel = mongoose.model('Channel', channelSchema)

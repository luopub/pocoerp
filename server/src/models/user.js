import mongoose from 'mongoose'

// 用户：角色 admin（管理员）/ keeper（仓管）/ viewer（只读）
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'keeper', 'viewer'], default: 'viewer' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
})

export const User = mongoose.model('User', userSchema)

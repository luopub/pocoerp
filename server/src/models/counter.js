import mongoose from 'mongoose'

// 序号计数器：_id 为编号前缀（PRD/MAT/SUP/POP/POM/WKO/OUT/STK/RTN 等）
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
})

export const Counter = mongoose.model('Counter', counterSchema)

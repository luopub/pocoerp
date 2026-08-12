import mongoose from 'mongoose'

// 供应商（需求文档 4.4）：名称唯一，类型可多选
const supplierSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // SUP000001
  name: { type: String, required: true, unique: true },
  types: {
    type: [String],
    enum: ['成品供应商', '原材料供应商', '加工商'],
    default: [],
  },
  contact: { type: String, default: '' },
  phone: { type: String, default: '' },
  remark: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
})

export const SUPPLIER_TYPES = ['成品供应商', '原材料供应商', '加工商']
export const Supplier = mongoose.model('Supplier', supplierSchema)

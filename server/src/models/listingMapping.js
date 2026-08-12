import mongoose from 'mongoose'

// 平台产品映射（需求文档 4.12）
// 平台+账号+ID1+ID2 各自可重复，组合必须唯一
const listingMappingSchema = new mongoose.Schema({
  spuNo: { type: String, required: true }, // PRD000001
  skuNo: { type: String, required: true }, // PRD000001-001
  platform: { type: String, required: true }, // 渠道名，如 非平台产品 / Amazon
  account: { type: String, required: true }, // 店铺账号
  id1: { type: String, required: true }, // 平台商品 ID 1
  id2: { type: String, default: '' }, // 平台商品 ID 2（可空，存 ''）
  image: { type: String, default: '' }, // 平台商品图片
  remark: { type: String, default: '' },
  isDefault: { type: Boolean, default: false }, // SKU 创建时自动生成的默认映射
  createdAt: { type: Date, default: Date.now },
})
listingMappingSchema.index({ platform: 1, account: 1, id1: 1, id2: 1 }, { unique: true })
listingMappingSchema.index({ skuNo: 1 })

export const ListingMapping = mongoose.model('ListingMapping', listingMappingSchema)

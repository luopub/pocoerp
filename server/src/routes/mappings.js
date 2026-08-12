import { Router } from 'express'
import { ListingMapping } from '../models/listingMapping.js'
import { Product } from '../models/product.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

const DUP_MSG = '平台+账号+ID1+ID2 的组合已存在，请修改后再保存'

// GET /api/mappings?keyword=&platform=&account=&spuNo=&skuNo=
router.get('/', wrap(async (req, res) => {
  const { keyword, platform, account, spuNo, skuNo } = req.query
  const q = {}
  if (platform) q.platform = platform
  if (account) q.account = new RegExp(account, 'i')
  if (spuNo) q.spuNo = spuNo
  if (skuNo) q.skuNo = skuNo
  if (keyword) {
    const re = new RegExp(keyword, 'i')
    q.$or = [{ id1: re }, { id2: re }, { skuNo: re }, { spuNo: re }]
  }
  const list = await ListingMapping.find(q).sort({ spuNo: 1, skuNo: 1, platform: 1 }).lean()
  // 补充产品名与图片回退（映射图缺失时用 SKU 图）
  const spuNos = [...new Set(list.map((m) => m.spuNo))]
  const products = await Product.find({ no: { $in: spuNos } }).lean()
  const pMap = new Map(products.map((p) => [p.no, p]))
  for (const m of list) {
    const p = pMap.get(m.spuNo)
    m.spuName = p?.name || ''
    const sku = p?.skus.find((s) => s.no === m.skuNo)
    m.skuImage = sku?.image || ''
    m.displayImage = m.image || m.skuImage || ''
  }
  res.json({ list })
}))

/** 校验 skuNo 属于 spuNo 且产品存在 */
async function validateSku(spuNo, skuNo) {
  const p = await Product.findOne({ no: spuNo })
  if (!p) return '产品不存在'
  if (!p.skus.some((s) => s.no === skuNo)) return `SKU ${skuNo} 不属于产品 ${spuNo}`
  return null
}

// POST /api/mappings  { spuNo, skuNo, platform, account, id1, id2, image, remark }
router.post('/', canWrite, wrap(async (req, res) => {
  const { spuNo, skuNo, platform, account, id1, id2 = '', image = '', remark = '' } = req.body || {}
  if (!spuNo || !skuNo || !platform?.trim() || !account?.trim() || !id1?.trim()) {
    return res.status(400).json({ message: 'SPU、SKU、平台、账号、ID1 均必填' })
  }
  const err = await validateSku(spuNo, skuNo)
  if (err) return res.status(400).json({ message: err })
  try {
    const doc = await ListingMapping.create({
      spuNo, skuNo, platform: platform.trim(), account: account.trim(),
      id1: id1.trim(), id2: id2.trim(), image, remark,
    })
    res.json({ doc })
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: DUP_MSG })
    throw e
  }
}))

// PUT /api/mappings/:id
router.put('/:id', canWrite, wrap(async (req, res) => {
  const doc = await ListingMapping.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '映射不存在' })
  const b = req.body || {}
  for (const f of ['platform', 'account', 'id1', 'id2', 'image', 'remark']) {
    if (b[f] !== undefined) doc[f] = typeof b[f] === 'string' ? b[f].trim() : b[f]
  }
  if (!doc.platform || !doc.account || !doc.id1) {
    return res.status(400).json({ message: '平台、账号、ID1 均必填' })
  }
  try {
    await doc.save()
    res.json({ doc })
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: DUP_MSG })
    throw e
  }
}))

// DELETE /api/mappings/:id  （默认映射不可删除——它是线下出库入口）
router.delete('/:id', canWrite, wrap(async (req, res) => {
  const doc = await ListingMapping.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '映射不存在' })
  if (doc.isDefault) return res.status(400).json({ message: '默认映射不可删除（线下出库入口），可修改其 ID 值' })
  await doc.deleteOne()
  res.json({ ok: true })
}))

export default router

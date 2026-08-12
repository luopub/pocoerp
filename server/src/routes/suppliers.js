import { Router } from 'express'
import { Supplier } from '../models/supplier.js'
import { nextNo } from '../services/numbering.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

// GET /api/suppliers?keyword=&type=
router.get('/', wrap(async (req, res) => {
  const { keyword, type } = req.query
  const q = {}
  if (keyword) q.$or = [{ name: new RegExp(keyword, 'i') }, { no: new RegExp(keyword, 'i') }, { contact: new RegExp(keyword, 'i') }]
  if (type) q.types = type
  const list = await Supplier.find(q).sort({ no: 1 }).lean()
  res.json({ list })
}))

// POST /api/suppliers  { name, types, contact, phone, remark }
router.post('/', canWrite, wrap(async (req, res) => {
  const { name, types = [], contact = '', phone = '', remark = '' } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ message: '供应商名称必填' })
  if (await Supplier.findOne({ name: name.trim() })) {
    return res.status(409).json({ message: '供应商名称已存在' })
  }
  const doc = await Supplier.create({
    no: await nextNo('SUP'), name: name.trim(), types, contact, phone, remark,
  })
  res.json({ doc })
}))

// PUT /api/suppliers/:id
router.put('/:id', canWrite, wrap(async (req, res) => {
  const { name, types, contact, phone, remark, active } = req.body || {}
  const doc = await Supplier.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '供应商不存在' })
  if (name && name.trim() !== doc.name) {
    if (await Supplier.findOne({ name: name.trim() })) {
      return res.status(409).json({ message: '供应商名称已存在' })
    }
    doc.name = name.trim()
  }
  if (types !== undefined) doc.types = types
  if (contact !== undefined) doc.contact = contact
  if (phone !== undefined) doc.phone = phone
  if (remark !== undefined) doc.remark = remark
  if (active !== undefined) doc.active = !!active
  await doc.save()
  res.json({ doc })
}))

export default router

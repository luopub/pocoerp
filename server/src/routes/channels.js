import { Router } from 'express'
import { Channel } from '../models/channel.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

// GET /api/channels
router.get('/', wrap(async (req, res) => {
  const list = await Channel.find().sort({ builtin: -1, name: 1 }).lean()
  res.json({ list })
}))

// POST /api/channels  { name }
router.post('/', canWrite, wrap(async (req, res) => {
  const { name } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ message: '渠道名称必填' })
  if (await Channel.findOne({ name: name.trim() })) {
    return res.status(409).json({ message: '渠道已存在' })
  }
  const doc = await Channel.create({ name: name.trim() })
  res.json({ doc })
}))

// DELETE /api/channels/:id （内置渠道不可删除）
router.delete('/:id', canWrite, wrap(async (req, res) => {
  const doc = await Channel.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '渠道不存在' })
  if (doc.builtin) return res.status(400).json({ message: '内置渠道不可删除' })
  await doc.deleteOne()
  res.json({ ok: true })
}))

export default router

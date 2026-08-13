import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getSettings, Settings } from '../models/settings.js'
import { User } from '../models/user.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)

// ---- 全局预警/补货参数（需求文档 4.10） ----

// GET /api/settings
router.get('/settings', wrap(async (req, res) => {
  res.json({ doc: await getSettings() })
}))

// PUT /api/settings  仅管理员
router.put('/settings', requireRole('admin'), wrap(async (req, res) => {
  const { warnWindowDays, warnDays, replenishDays } = req.body || {}
  const doc = await getSettings().then((s) => Settings.findById(s._id))
  for (const [k, v] of Object.entries({ warnWindowDays, warnDays, replenishDays })) {
    if (v !== undefined) {
      if (!Number.isFinite(Number(v)) || Number(v) <= 0) {
        return res.status(400).json({ message: '参数必须为正数' })
      }
      doc[k] = Number(v)
    }
  }
  await doc.save()
  res.json({ doc })
}))

// ---- 用户管理（需求文档 4.1，仅管理员） ----

// GET /api/users
router.get('/users', requireRole('admin'), wrap(async (req, res) => {
  const list = await User.find().sort({ username: 1 }).lean()
  res.json({ list: list.map((u) => ({ _id: u._id, username: u.username, role: u.role, active: u.active })) })
}))

// POST /api/users  { username, password, role }
router.post('/users', requireRole('admin'), wrap(async (req, res) => {
  const { username, password, role = 'viewer' } = req.body || {}
  if (!username?.trim() || !password) return res.status(400).json({ message: '用户名和密码必填' })
  if (!['admin', 'keeper', 'viewer'].includes(role)) return res.status(400).json({ message: '角色无效' })
  if (await User.findOne({ username: username.trim() })) {
    return res.status(409).json({ message: '用户名已存在' })
  }
  const doc = await User.create({
    username: username.trim(), passwordHash: await bcrypt.hash(password, 10), role,
  })
  res.json({ doc: { _id: doc._id, username: doc.username, role: doc.role, active: doc.active } })
}))

// PUT /api/users/:id  { role?, active? }
router.put('/users/:id', requireRole('admin'), wrap(async (req, res) => {
  const doc = await User.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '用户不存在' })
  if (doc.username === 'admin' && req.body?.active === false) {
    return res.status(400).json({ message: '不能停用初始管理员' })
  }
  if (req.body?.role) {
    if (!['admin', 'keeper', 'viewer'].includes(req.body.role)) {
      return res.status(400).json({ message: '角色无效' })
    }
    doc.role = req.body.role
  }
  if (req.body?.active !== undefined) doc.active = !!req.body.active
  await doc.save()
  res.json({ doc: { _id: doc._id, username: doc.username, role: doc.role, active: doc.active } })
}))

// POST /api/users/:id/reset-password  { password }
router.post('/users/:id/reset-password', requireRole('admin'), wrap(async (req, res) => {
  const { password } = req.body || {}
  if (!password || password.length < 6) return res.status(400).json({ message: '新密码至少 6 位' })
  const doc = await User.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '用户不存在' })
  doc.passwordHash = await bcrypt.hash(password, 10)
  await doc.save()
  res.json({ ok: true })
}))

export default router

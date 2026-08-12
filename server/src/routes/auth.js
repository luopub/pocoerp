import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/user.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ message: '请输入用户名和密码' })

  const user = await User.findOne({ username })
  if (!user || !user.active) return res.status(401).json({ message: '用户名或密码错误' })

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ message: '用户名或密码错误' })

  res.json({
    token: signToken(user),
    user: { username: user.username, role: user.role },
  })
})

// GET /api/auth/me  当前登录用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.user.username, role: req.user.role } })
})

export default router

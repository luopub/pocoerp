import jwt from 'jsonwebtoken'
import { config } from '../config.js'

/** 验证 JWT，把用户信息挂到 req.user */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    req.user = jwt.verify(token, config.jwtSecret)
    next()
  } catch {
    return res.status(401).json({ message: '登录已过期，请重新登录' })
  }
}

/** 角色守卫：requireRole('admin') / requireRole('admin','keeper') */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: '未登录' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '没有权限执行此操作' })
    }
    next()
  }
}

export function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  )
}

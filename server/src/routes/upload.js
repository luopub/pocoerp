import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { uploadDir } from '../config.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true)
    else cb(new Error('只支持图片文件'))
  },
})

const router = Router()

// POST /api/upload  单文件，字段名 file；返回 { path: '/uploads/xxx.jpg' }
router.post('/', requireAuth, requireRole('admin', 'keeper'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '未收到文件' })
  res.json({ path: `/uploads/${req.file.filename}` })
})

export default router

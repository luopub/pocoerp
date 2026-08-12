import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { connectDB } from './db.js'
import authRoutes from './routes/auth.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'connected' }))
app.use('/api/auth', authRoutes)

// 统一错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' })
})

await connectDB()
app.listen(config.port, () => {
  console.log(`[server] PocoERP API listening on http://localhost:${config.port}`)
})

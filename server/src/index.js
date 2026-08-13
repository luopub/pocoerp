import express from 'express'
import cors from 'cors'
import { config, uploadDir } from './config.js'
import { connectDB } from './db.js'
import authRoutes from './routes/auth.js'
import supplierRoutes from './routes/suppliers.js'
import channelRoutes from './routes/channels.js'
import materialRoutes from './routes/materials.js'
import productRoutes from './routes/products.js'
import mappingRoutes from './routes/mappings.js'
import uploadRoutes from './routes/upload.js'
import purchaseRoutes from './routes/purchases.js'
import inventoryRoutes from './routes/inventory.js'
import outboundRoutes from './routes/outbound.js'
import workOrderRoutes from './routes/workorders.js'
import importRoutes from './routes/importData.js'
import stocktakeRoutes from './routes/stocktakes.js'
import returnRoutes from './routes/returns.js'
import alertRoutes from './routes/alerts.js'
import settingsRoutes from './routes/settings.js'
import reportRoutes from './routes/reports.js'
import exportRoutes from './routes/exportData.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'connected' }))
app.use('/api/auth', authRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/channels', channelRoutes)
app.use('/api/materials', materialRoutes)
app.use('/api/products', productRoutes)
app.use('/api/mappings', mappingRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/outbounds', outboundRoutes)
app.use('/api/workorders', workOrderRoutes)
app.use('/api/import', importRoutes)
app.use('/api/stocktakes', stocktakeRoutes)
app.use('/api/returns', returnRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api', settingsRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/export', exportRoutes)

// 上传图片静态服务
app.use('/uploads', express.static(uploadDir))

// 统一错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' })
})

await connectDB()
// 启动时校正单号计数器，防止与既有数据冲突
const { syncCounters } = await import('./services/numbering.js')
await syncCounters()
app.listen(config.port, () => {
  console.log(`[server] PocoERP API listening on http://localhost:${config.port}`)
})

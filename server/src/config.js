import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// 显式定位 server/.env（config.js 在 server/src/ 下），不依赖进程 cwd —— PM2 从项目根启动也能读到
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(serverDir, '.env') })

const required = ['MONGODB_HOST', 'MONGODB_PORT', 'MONGODB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_DBNAME']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] 缺少环境变量 ${key}，请参考 .env.example 配置 server/.env`)
    process.exit(1)
  }
}

const user = encodeURIComponent(process.env.MONGODB_USERNAME)
const pass = encodeURIComponent(process.env.MONGODB_PASSWORD)

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // 认证库为 MONGODB_DBNAME（crawler），业务库由 dbName 指定；
  // 单节点副本集下用 directConnection 保证事务可用
  mongoUri: `mongodb://${user}:${pass}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/?authSource=${process.env.MONGODB_DBNAME}&directConnection=true`,
  dbName: process.env.APP_DB_NAME || 'pocoerp',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
}

// uploads 目录在项目根（pocoerp/uploads）：config.js 位于 server/src/，上两级即项目根
export const uploadDir = path.resolve(serverDir, '../uploads')
fs.mkdirSync(uploadDir, { recursive: true })

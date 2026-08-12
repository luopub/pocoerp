import 'dotenv/config'

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

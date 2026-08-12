import bcrypt from 'bcryptjs'
import { connectDB, disconnectDB } from './db.js'
import { User } from './models/user.js'
import { Channel, DEFAULT_CHANNEL } from './models/channel.js'

// 种子数据：初始管理员账号（首次部署后请立即登录修改密码）
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123'

async function main() {
  await connectDB()
  const exists = await User.findOne({ username: ADMIN_USERNAME })
  if (exists) {
    console.log(`[seed] 管理员 ${ADMIN_USERNAME} 已存在，跳过`)
  } else {
    await User.create({
      username: ADMIN_USERNAME,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    })
    console.log(`[seed] 已创建管理员 ${ADMIN_USERNAME}（初始密码 ${ADMIN_PASSWORD}，请尽快修改）`)
  }
  // 预置内置渠道"非平台产品"（需求文档 4.12）
  if (!(await Channel.findOne({ name: DEFAULT_CHANNEL }))) {
    await Channel.create({ name: DEFAULT_CHANNEL, builtin: true })
    console.log(`[seed] 已创建内置渠道「${DEFAULT_CHANNEL}」`)
  }
  await disconnectDB()
}

main().catch((e) => { console.error(e); process.exit(1) })

import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDB() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(config.mongoUri, { dbName: config.dbName })
  console.log(`[db] connected, database=${config.dbName}`)
  return mongoose.connection
}

export async function disconnectDB() {
  await mongoose.disconnect()
}

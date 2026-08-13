import { Counter } from '../models/counter.js'

/**
 * 编号生成服务（需求文档 4.11）
 * 主号：3 位字母前缀 + 6 位顺序号，如 PRD000001
 * 子号：主号 + "-" + 3 位序号，如 PRD000001-001
 * 序号全局连续，作废不回收。
 */
export async function nextNo(prefix, session) {
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new Error(`编号前缀必须是 3 位大写字母: ${prefix}`)
  }
  const doc = await Counter.findOneAndUpdate(
    { _id: prefix },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session }
  )
  return prefix + String(doc.seq).padStart(6, '0')
}

/** 生成子号：subNo('PRD000001', 1) => 'PRD000001-001' */
export function subNo(mainNo, n) {
  return `${mainNo}-${String(n).padStart(3, '0')}`
}

/**
 * 启动时校正计数器：若集合中已存在比计数器更大的编号（如直接导库/清理过数据），
 * 将计数器提升到最大值，避免新单号撞唯一索引。
 */
export async function syncCounters() {
  const db = Counter.db.db
  const MAP = {
    PRD: 'products', MAT: 'materials', SUP: 'suppliers',
    POP: 'purchaseorders', POM: 'purchaseorders', WKO: 'workorders',
    OUT: 'outboundorders', STK: 'stocktakes', RTN: 'returnorders',
  }
  for (const [prefix, coll] of Object.entries(MAP)) {
    const docs = await db.collection(coll)
      .find({ no: new RegExp(`^${prefix}\\d{6}$`) }, { projection: { no: 1 } }).toArray()
    const max = docs.reduce((m, d) => Math.max(m, parseInt(d.no.slice(3), 10)), 0)
    if (max > 0) {
      // $max 只在更大时更新，绝不回退（保证序号不回收）
      await Counter.updateOne({ _id: prefix }, { $max: { seq: max } }, { upsert: true })
    }
  }
}

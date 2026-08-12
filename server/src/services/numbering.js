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

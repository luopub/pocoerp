import { ListingMapping } from '../models/listingMapping.js'
import { DEFAULT_CHANNEL, DEFAULT_ACCOUNT } from '../models/channel.js'

/**
 * 为产品 SKU 确保默认映射存在（需求文档 4.12）：
 * 平台=非平台产品、账号=默认账号、ID1=SKU 编号、ID2=空
 */
export async function ensureDefaultMapping(spuNo, skuNo, session) {
  const exists = await ListingMapping.findOne({
    skuNo, platform: DEFAULT_CHANNEL, account: DEFAULT_ACCOUNT, isDefault: true,
  }).session(session || null)
  if (exists) return exists
  return ListingMapping.create([{
    spuNo, skuNo,
    platform: DEFAULT_CHANNEL,
    account: DEFAULT_ACCOUNT,
    id1: skuNo,
    id2: '',
    isDefault: true,
  }], { session }).then((arr) => arr[0])
}

// Excel 导出下载（携带 JWT，blob 方式）
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { auth } from './store.js'

export async function downloadExcel(entity, params = {}) {
  try {
    const res = await axios.get(`/api/export/${entity}`, {
      params,
      responseType: 'blob',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${entity}-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  }
}

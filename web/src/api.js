import axios from 'axios'
import { ElMessage } from 'element-plus'
import { auth } from './store.js'
import { router } from './router.js'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

// 自动携带 JWT
api.interceptors.request.use((cfg) => {
  if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`
  return cfg
})

// 统一错误提示；401 时登出回登录页
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.message || err.message || '请求失败'
    if (status === 401) {
      auth.logout()
      if (router.currentRoute.value.path !== '/login') router.push('/login')
    }
    ElMessage.error(msg)
    return Promise.reject(err)
  },
)

export default api

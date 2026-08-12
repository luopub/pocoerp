// 极简登录状态管理（localStorage 持久化）
import { reactive } from 'vue'

export const auth = reactive({
  token: localStorage.getItem('token') || '',
  username: localStorage.getItem('username') || '',
  role: localStorage.getItem('role') || '',
  login(data) {
    this.token = data.token
    this.username = data.user.username
    this.role = data.user.role
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.user.username)
    localStorage.setItem('role', data.user.role)
  },
  logout() {
    this.token = ''
    this.username = ''
    this.role = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
  },
})

export const ROLE_NAMES = { admin: '管理员', keeper: '仓管', viewer: '只读' }

import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './store.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./views/Layout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '首页' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  if (!to.meta.public && !auth.token) return { path: '/login' }
  if (to.path === '/login' && auth.token) return { path: '/' }
  document.title = to.meta.title ? `${to.meta.title} - PocoERP` : 'PocoERP'
})

import { createRouter, createWebHistory } from 'vue-router'
import { auth } from './store.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('./views/Layout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '首页' } },
      { path: 'basic/suppliers', component: () => import('./views/Suppliers.vue'), meta: { title: '供应商' } },
      { path: 'basic/channels', component: () => import('./views/Channels.vue'), meta: { title: '渠道' } },
      { path: 'basic/materials', component: () => import('./views/Materials.vue'), meta: { title: '原材料' } },
      { path: 'products', component: () => import('./views/Products.vue'), meta: { title: '产品管理' } },
      { path: 'mappings', component: () => import('./views/Mappings.vue'), meta: { title: '平台映射' } },
      { path: 'purchases', component: () => import('./views/Purchases.vue'), meta: { title: '采购管理' } },
      { path: 'workorders', component: () => import('./views/WorkOrders.vue'), meta: { title: '委外加工' } },
      { path: 'inventory', component: () => import('./views/Inventory.vue'), meta: { title: '库存' } },
      { path: 'stocktakes', component: () => import('./views/Stocktakes.vue'), meta: { title: '库存盘点' } },
      { path: 'outbound', component: () => import('./views/Outbound.vue'), meta: { title: '出库管理' } },
      { path: 'returns', component: () => import('./views/Returns.vue'), meta: { title: '退货入库' } },
      { path: 'replenishment', component: () => import('./views/Replenishment.vue'), meta: { title: '补货建议' } },
      { path: 'reports', component: () => import('./views/Reports.vue'), meta: { title: '报表' } },
      { path: 'import', component: () => import('./views/Import.vue'), meta: { title: '数据导入' } },
      { path: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '系统设置' } },
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

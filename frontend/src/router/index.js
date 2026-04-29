import { createRouter, createWebHistory } from 'vue-router'
import DashboardLayout from '../layouts/DashboardLayout.vue'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import PendingActivation from '../views/PendingActivation.vue'
import KonfirmasiPembayaran from '../views/KonfirmasiPembayaran.vue'

// Client views (lazy-loaded)
const DashboardHome = () => import('../views/DashboardHome.vue')
const MasterKelas = () => import('../views/MasterKelas.vue')
const MasterSiswa = () => import('../views/MasterSiswa.vue')
const MasterMapel = () => import('../views/MasterMapel.vue')
const InputNilai = () => import('../views/InputNilai.vue')
const Pengaturan = () => import('../views/Pengaturan.vue')
const MasterGuru = () => import('../views/MasterGuru.vue')
const WaliKelasRapor = () => import('../views/WaliKelasRapor.vue')
const LegerNilai = () => import('../views/LegerNilai.vue')
const FormatRapor = () => import('../views/FormatRapor.vue')
const DaftarNilai = () => import('../views/DaftarNilai.vue')
const AbsensiSiswa = () => import('../views/AbsensiSiswa.vue')
const Maintenance = () => import('../views/Maintenance.vue')

// Super Admin views (lazy-loaded)
const SuperAdminLayout = () => import('../layouts/SuperAdminLayout.vue')
const SADashboard = () => import('../views/superadmin/SADashboard.vue')
const TenantList = () => import('../views/superadmin/TenantList.vue')

const routes = [
  // ─── Client Dashboard Routes ───
  {
    path: '/',
    component: DashboardLayout,
    meta: { requiresAuth: true, requiresActiveTenant: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: DashboardHome,
        meta: { requiresAdmin: true }
      },
      {
        path: 'rapor',
        name: 'WaliKelasRapor',
        component: WaliKelasRapor,
        meta: { requiresWaliKelasOrAdmin: true }
      },
      {
        path: 'absensi-siswa',
        name: 'AbsensiSiswa',
        component: AbsensiSiswa,
        meta: { requiresGuruMapel: true }
      },
      {
        path: 'guru',
        name: 'MasterGuru',
        component: MasterGuru,
        meta: { requiresAdmin: true }
      },
      {
        path: 'kelas',
        name: 'MasterKelas',
        component: MasterKelas,
        meta: { requiresAdmin: true }
      },
      {
        path: 'siswa',
        name: 'MasterSiswa',
        component: MasterSiswa,
        meta: { requiresAdmin: true }
      },
      {
        path: 'mapel',
        name: 'MasterMapel',
        component: MasterMapel,
        meta: { requiresAdmin: true }
      },
      {
        path: 'nilai',
        name: 'InputNilai',
        component: InputNilai,
        meta: { requiresGuruMapel: true }
      },
      {
        path: 'pengaturan',
        name: 'Pengaturan',
        component: Pengaturan,
        meta: { requiresAdmin: true }
      },
      {
        path: 'leger',
        name: 'LegerNilai',
        component: LegerNilai,
        meta: { requiresWaliKelasOrAdmin: true }
      },
      {
        path: 'daftar-nilai',
        name: 'DaftarNilai',
        component: DaftarNilai,
        meta: { requiresWaliKelasOrAdmin: true }
      },
      {
        path: 'maintenance',
        name: 'Maintenance',
        component: Maintenance,
        meta: { requiresAdmin: true }
      },
      {
        path: 'format-rapor',
        name: 'FormatRapor',
        component: FormatRapor
      },
    ]
  },

  // ─── Super Admin Routes ───
  {
    path: '/superadmin',
    component: SuperAdminLayout,
    meta: { requiresAuth: true, requiresSuperAdmin: true },
    children: [
      {
        path: '',
        name: 'SADashboard',
        component: SADashboard,
      },
      {
        path: 'tenants',
        name: 'TenantList',
        component: TenantList,
      },
    ]
  },

  // ─── Public Routes ───
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresGuest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { requiresGuest: true }
  },
  {
    path: '/pending-activation',
    name: 'PendingActivation',
    component: PendingActivation,
    meta: { requiresAuth: true }
  },
  {
    path: '/konfirmasi-pembayaran',
    name: 'KonfirmasiPembayaran',
    component: KonfirmasiPembayaran,
    meta: { requiresAuth: true }
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation Guards
import { useAuthStore } from '../stores/auth'

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  if (!authStore.isInitialized) {
    await authStore.initAuth()
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest)
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin)
  const requiresWaliKelasOrAdmin = to.matched.some(record => record.meta.requiresWaliKelasOrAdmin)
  const requiresGuruMapel = to.matched.some(record => record.meta.requiresGuruMapel)
  const requiresSuperAdmin = to.matched.some(record => record.meta.requiresSuperAdmin)
  const requiresActiveTenant = to.matched.some(record => record.meta.requiresActiveTenant)
  
  const isAuthenticated = !!authStore.user
  const isGuruMapelOnly = authStore.isGuruMapel && !authStore.isAdmin && !authStore.isWaliKelas

  // 1. Auth check
  if (requiresAuth && !isAuthenticated) return next('/login')
  if (requiresGuest && isAuthenticated) {
    if (authStore.isSuperAdmin) return next('/superadmin')
    if (authStore.tenantStatus !== 'active') return next('/pending-activation')
    return next('/')
  }

  // 2. Super Admin check
  if (requiresSuperAdmin && !authStore.isSuperAdmin) {
    return next('/')
  }

  // 3. Tenant activation check (redirect ke pending jika tenant belum aktif)
  if (requiresActiveTenant && !authStore.isSuperAdmin) {
    if (authStore.tenantStatus !== 'active') {
      return next('/pending-activation')
    }
  }

  // 4. Jika di pending-activation tapi tenant sudah aktif, redirect ke dashboard
  if (to.path === '/pending-activation' && isAuthenticated) {
    if (authStore.isSuperAdmin) return next('/superadmin')
    if (authStore.tenantStatus === 'active') return next('/')
  }

  // 5. Role-based access control (sama seperti sebelumnya)
  const canAccessAdmin = authStore.isAdmin
  const canAccessWali = authStore.isAdmin || authStore.isWaliKelas
  const canAccessGuru = authStore.isAdmin || authStore.isWaliKelas || authStore.isGuruMapel

  if (requiresAdmin && !canAccessAdmin) {
    if (authStore.isWaliKelas) return next('/rapor')
    if (authStore.isGuruMapel) return next('/nilai')
    return next('/')
  }
  
  if (requiresWaliKelasOrAdmin && !canAccessWali) return next('/')
  if (requiresGuruMapel && !canAccessGuru) return next('/')

  // 6. Guru Mapel only strict redirects
  if (isGuruMapelOnly) {
    const allowedForGuruOnly = ['/nilai', '/absensi-siswa', '/login']
    if (!allowedForGuruOnly.includes(to.path)) return next('/nilai')
  }

  // 7. Root redirect behavior
  if (to.path === '/' && isAuthenticated && !authStore.isAdmin) {
    if (authStore.isSuperAdmin) return next('/superadmin')
    if (authStore.isWaliKelas) return next('/rapor')
    if (authStore.isGuruMapel) return next('/nilai')
  }

  next()
})

export default router

import { defineStore } from 'pinia'
import { auth, db } from '../firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useTenantStore } from './tenant'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    role: null,
    tenantId: null,
    tenantStatus: null,
    isAdmin: false,
    isSuperAdmin: false,
    isWaliKelas: false,
    isGuruMapel: false,
    userName: 'Loading...',
    isInitialized: false,
  }),
  actions: {
    initAuth() {
      return new Promise((resolve) => {
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            await this.fetchUserProfile(firebaseUser)
          } else {
            this.clearAuth()
            this.isInitialized = true
          }
          resolve()
        })
      })
    },
    async fetchUserProfile(firebaseUser) {
      this.user = firebaseUser
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
        let role = null

        if (userDoc.exists()) {
          const data = userDoc.data()
          this.userName = data.nama || data.name || firebaseUser.displayName || 'User'
          role = data.role
          this.role = role
          this.tenantId = data.tenantId || null
          this.tenantStatus = data.tenantStatus || null

          // SuperAdmin = pemilik platform
          if (role === 'superadmin' || firebaseUser.email === 'superadmin@smk.id') {
            this.isSuperAdmin = true
            this.isAdmin = true
            this.isGuruMapel = true
            this.isWaliKelas = false
            this.tenantStatus = 'active' // superadmin selalu active
          } else {
            this.isSuperAdmin = false

            // Admin sekolah (client)
            if (role === 'admin') {
              this.isAdmin = true
            } else {
              this.isAdmin = false
            }

            // Guru Mapel
            if (role === 'guru' || (data.assignedMapelIds && data.assignedMapelIds.length > 0)) {
              this.isGuruMapel = true
            } else {
              this.isGuruMapel = false
            }
          }

          // Load tenant data jika ada tenantId
          if (this.tenantId && !this.isSuperAdmin) {
            const tenantStore = useTenantStore()
            await tenantStore.loadTenant(this.tenantId)
            this.tenantStatus = tenantStore.status
          }
        } else {
          // Dokumen user tidak ditemukan — deny access
          console.warn('User document not found in Firestore for:', firebaseUser.uid)
          this.userName = 'Unknown User'
          this.role = null
          this.isAdmin = false
          this.isSuperAdmin = false
          this.isGuruMapel = false
        }

        // Cek wali kelas (tetap menggunakan tenantId-aware path)
        if (this.tenantId && !this.isSuperAdmin) {
          const qClass = await getDocs(
            query(
              collection(db, `tenants/${this.tenantId}/classes`),
              where('waliKelasId', '==', firebaseUser.uid)
            )
          )
          this.isWaliKelas = role === 'walikelas' || !qClass.empty
        } else if (!this.isSuperAdmin) {
          this.isWaliKelas = role === 'walikelas'
        }

        this.isInitialized = true
      } catch (e) {
        console.error('Failed to fetch user profile:', e)
        this.isInitialized = true
      }
    },
    async impersonateTenant(targetTenantId, targetTenantName) {
      if (this.role !== 'superadmin' && this.user?.email !== 'superadmin@smk.id') return false;
      this.tenantId = targetTenantId;
      this.userName = `SA as ${targetTenantName}`;
      this.isSuperAdmin = false;
      this.isAdmin = true;
      this.tenantStatus = 'active';

      const tenantStore = useTenantStore();
      await tenantStore.loadTenant(targetTenantId);
      return true;
    },
    async stopImpersonation() {
      await this.fetchUserProfile(this.user);
      const tenantStore = useTenantStore();
      tenantStore.reset();
    },
    clearAuth() {
      this.user = null
      this.role = null
      this.tenantId = null
      this.tenantStatus = null
      this.isAdmin = false
      this.isSuperAdmin = false
      this.isWaliKelas = false
      this.isGuruMapel = false
      this.userName = ''
      this.isInitialized = true

      // Cleanup tenant store
      const tenantStore = useTenantStore()
      tenantStore.reset()
    }
  }
})

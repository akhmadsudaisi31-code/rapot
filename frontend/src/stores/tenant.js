import { defineStore } from 'pinia'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

export const useTenantStore = defineStore('tenant', {
  state: () => ({
    tenantId: null,
    tenantData: null,
    schoolInfo: {
      nama: '',
      alamat: '',
      npsn: '',
      email: '',
      website: '',
      kepalaSekolah: '',
      nipKepsek: '',
      logoUrl: '',
      headerBaris1: '',
      headerBaris2: '',
      kotaTtd: '',
      provinsi: '',
      kecamatan: '',
      kelurahan: '',
      kabupaten: '',
      alamatJalan: '',
    },
    plan: 'free',        // free | pro | basic
    billingCycle: 'yearly',
    paymentStatus: 'paid', // paid | unpaid | pending_verification
    status: 'pending',   // pending | active | rejected | suspended
    isLoaded: false,
    _unsubscribe: null,
  }),

  getters: {
    isActive: (state) => state.status === 'active',
    isPending: (state) => state.status === 'pending',
    isRejected: (state) => state.status === 'rejected',
    isSuspended: (state) => state.status === 'suspended',
    logoUrl: (state) => state.schoolInfo.logoUrl || '',
    schoolName: (state) => state.schoolInfo.nama || 'Sekolah',
  },

  actions: {
    /**
     * Memuat data tenant dari Firestore dan listen real-time.
     */
    async loadTenant(tenantId) {
      // Cleanup listener lama
      this.cleanup()

      if (!tenantId) {
        this.reset()
        return
      }

      this.tenantId = tenantId

      try {
        // Initial load
        const snap = await getDoc(doc(db, 'tenants', tenantId))
        if (snap.exists()) {
          this._applyTenantData(snap.data())
        }
        this.isLoaded = true

        // Real-time listener untuk update dari admin
        this._unsubscribe = onSnapshot(doc(db, 'tenants', tenantId), (snap) => {
          if (snap.exists()) {
            this._applyTenantData(snap.data())
          }
        })
      } catch (error) {
        console.error('Error loading tenant:', error)
        this.isLoaded = true
      }
    },

    _applyTenantData(data) {
      this.tenantData = data
      this.status = data.status || 'pending'
      this.plan = data.plan || 'free'
      this.billingCycle = data.billingCycle || 'yearly'
      this.paymentStatus = data.paymentStatus || 'paid'

      // Merge school info
      const info = data.schoolInfo || data
      this.schoolInfo = {
        nama: info.nama || info.namaSekolah || '',
        alamat: info.alamat || info.alamatJalan || '',
        npsn: info.npsn || '',
        email: info.email || '',
        website: info.website || '',
        kepalaSekolah: info.kepalaSekolah || info.namaKepsek || '',
        nipKepsek: info.nipKepsek || '',
        logoUrl: info.logoUrl || '',
        headerBaris1: info.headerBaris1 || '',
        headerBaris2: info.headerBaris2 || '',
        kotaTtd: info.kotaTtd || '',
        provinsi: info.provinsi || '',
        kecamatan: info.kecamatan || '',
        kelurahan: info.kelurahan || '',
        kabupaten: info.kabupaten || '',
        alamatJalan: info.alamatJalan || info.alamat || '',
      }
    },

    cleanup() {
      if (this._unsubscribe) {
        this._unsubscribe()
        this._unsubscribe = null
      }
    },

    reset() {
      this.cleanup()
      this.tenantId = null
      this.tenantData = null
      this.status = 'pending'
      this.plan = 'free'
      this.billingCycle = 'yearly'
      this.paymentStatus = 'paid'
      this.isLoaded = false
      this.schoolInfo = {
        nama: '', alamat: '', npsn: '', email: '', website: '',
        kepalaSekolah: '', nipKepsek: '', logoUrl: '',
        headerBaris1: '', headerBaris2: '', kotaTtd: '',
        provinsi: '', kecamatan: '', kelurahan: '', kabupaten: '', alamatJalan: '',
      }
    },
  }
})

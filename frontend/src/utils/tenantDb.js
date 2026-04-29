/**
 * tenantDb.js — Helper untuk akses Firestore subcollection per tenant.
 *
 * Penggunaan:
 *   import { tenantCol, tenantDoc } from '@/utils/tenantDb'
 *   const q = query(tenantCol('students'), where('kelasId', '==', id))
 *   const docRef = tenantDoc('settings', 'school_info')
 */
import { collection, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuthStore } from '../stores/auth'

/**
 * Mendapatkan tenantId aktif dari auth store.
 * Throw error jika belum tersedia (safeguard).
 */
const getActiveTenantId = () => {
  const authStore = useAuthStore()
  const tid = authStore.tenantId
  if (!tid) {
    throw new Error('tenantId belum tersedia. Pastikan user sudah login dan tenant aktif.')
  }
  return tid
}

/**
 * Mendapatkan referensi collection di bawah tenant aktif.
 * Contoh: tenantCol('students') → collection(db, 'tenants/{tenantId}/students')
 */
export const tenantCol = (collectionName) => {
  const tid = getActiveTenantId()
  return collection(db, `tenants/${tid}/${collectionName}`)
}

/**
 * Mendapatkan referensi dokumen di bawah tenant aktif.
 * Contoh: tenantDoc('settings', 'school_info') → doc(db, 'tenants/{tenantId}/settings/school_info')
 */
export const tenantDoc = (collectionName, docId) => {
  const tid = getActiveTenantId()
  return doc(db, `tenants/${tid}/${collectionName}`, docId)
}

/**
 * Mendapatkan referensi dokumen tenant itu sendiri.
 * Contoh: tenantRootDoc() → doc(db, 'tenants/{tenantId}')
 */
export const tenantRootDoc = () => {
  const tid = getActiveTenantId()
  return doc(db, 'tenants', tid)
}

/**
 * Mendapatkan tenantId tanpa throw (untuk kondisi cek awal).
 */
export const getTenantId = () => {
  const authStore = useAuthStore()
  return authStore.tenantId || null
}

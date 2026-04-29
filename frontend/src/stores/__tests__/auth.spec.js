import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../auth'
import { useTenantStore } from '../tenant'
import { getDoc, getDocs } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

describe('Auth Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default values', () => {
    const store = useAuthStore()
    expect(store.user).toBe(null)
    expect(store.isInitialized).toBe(false)
  })

  it('clears auth correctly', () => {
    const store = useAuthStore()
    store.user = { uid: '123' }
    store.role = 'admin'
    
    store.clearAuth()
    
    expect(store.user).toBe(null)
    expect(store.role).toBe(null)
    expect(store.isInitialized).toBe(true)
  })

  it('fetches user profile and sets roles correctly (Admin)', async () => {
    const store = useAuthStore()
    const mockFirebaseUser = { uid: 'user-123', email: 'test@school.id' }
    const mockUserDoc = {
      exists: () => true,
      data: () => ({
        nama: 'Admin Test',
        role: 'admin',
        tenantId: 'tenant-123'
      })
    }

    vi.mocked(getDoc).mockResolvedValueOnce(mockUserDoc)
    // Mock getDocs for wali kelas check (empty)
    vi.mocked(getDocs).mockResolvedValueOnce({ empty: true })

    await store.fetchUserProfile(mockFirebaseUser)

    expect(store.user).toEqual(mockFirebaseUser)
    expect(store.role).toBe('admin')
    expect(store.isAdmin).toBe(true)
    expect(store.isSuperAdmin).toBe(false)
    expect(store.tenantId).toBe('tenant-123')
  })

  it('identifies SuperAdmin correctly', async () => {
    const store = useAuthStore()
    const mockFirebaseUser = { uid: 'sa-123', email: 'superadmin@smk.id' }
    const mockUserDoc = {
      exists: () => true,
      data: () => ({
        nama: 'Super Admin',
        role: 'superadmin'
      })
    }

    vi.mocked(getDoc).mockResolvedValueOnce(mockUserDoc)

    await store.fetchUserProfile(mockFirebaseUser)

    expect(store.isSuperAdmin).toBe(true)
    expect(store.isAdmin).toBe(true)
  })

  it('handles non-existent user doc', async () => {
    const store = useAuthStore()
    const mockFirebaseUser = { uid: 'unknown' }

    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false })

    await store.fetchUserProfile(mockFirebaseUser)

    expect(store.role).toBe(null)
    expect(store.isAdmin).toBe(false)
    expect(store.userName).toBe('Unknown User')
  })
})

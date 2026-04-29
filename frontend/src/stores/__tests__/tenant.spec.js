import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTenantStore } from '../tenant'
import { getDoc } from 'firebase/firestore'

describe('Tenant Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default values', () => {
    const store = useTenantStore()
    expect(store.tenantId).toBe(null)
    expect(store.status).toBe('pending')
    expect(store.plan).toBe('free')
    expect(store.isLoaded).toBe(false)
  })

  it('sets status correctly via getters', () => {
    const store = useTenantStore()
    store.status = 'active'
    expect(store.isActive).toBe(true)
    expect(store.isPending).toBe(false)
    
    store.status = 'pending'
    expect(store.isActive).toBe(false)
    expect(store.isPending).toBe(true)
  })

  it('loads tenant data correctly', async () => {
    const store = useTenantStore()
    const mockData = {
      status: 'active',
      plan: 'pro',
      schoolInfo: {
        nama: 'SMA Test',
        alamat: 'Jl. Test No. 1'
      }
    }

    // Mock getDoc to return our mockData
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => mockData
    })

    await store.loadTenant('tenant-123')

    expect(store.tenantId).toBe('tenant-123')
    expect(store.status).toBe('active')
    expect(store.plan).toBe('pro')
    expect(store.schoolInfo.nama).toBe('SMA Test')
    expect(store.isLoaded).toBe(true)
  })

  it('handles non-existent tenant', async () => {
    const store = useTenantStore()
    
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false
    })

    await store.loadTenant('non-existent')
    
    expect(store.tenantId).toBe('non-existent')
    expect(store.isLoaded).toBe(true)
    // Should still have default values if not found (or as implemented in store)
    expect(store.status).toBe('pending')
  })

  it('resets state correctly', () => {
    const store = useTenantStore()
    store.tenantId = 'some-id'
    store.status = 'active'
    
    store.reset()
    
    expect(store.tenantId).toBe(null)
    expect(store.status).toBe('pending')
    expect(store.isLoaded).toBe(false)
  })
})

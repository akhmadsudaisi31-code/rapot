import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import MasterSiswa from '../MasterSiswa.vue'
import { onSnapshot, addDoc, setDoc, deleteDoc, collection, query, where, orderBy, doc, writeBatch } from 'firebase/firestore'
import { createTestingPinia } from '@pinia/testing'
import { useAuthStore } from '../../stores/auth'

// Mock Firestore functions locally to ensure they are available in scope
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn((q) => q),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    cb({ docs: [] })
    return vi.fn()
  }),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue({}),
  })),
}))

// Mock tenantDb utils
vi.mock('../../utils/tenantDb', () => ({
  tenantCol: vi.fn((name) => ({ id: `mock-col-${name}`, path: name })),
  tenantDoc: vi.fn((name, id) => ({ id: `mock-doc-${name}-${id}`, path: `${name}/${id}` })),
}))

// Mock Lucide icons
vi.mock('lucide-vue-next', () => ({
  Trash2: { render: () => h('span', 'Trash2') },
  UserPlus: { render: () => h('span', 'UserPlus') },
  Users: { render: () => h('span', 'Users') },
  Search: { render: () => h('span', 'Search') },
  Upload: { render: () => h('span', 'Upload') },
  Download: { render: () => h('span', 'Download') },
  Pencil: { render: () => h('span', 'Pencil') },
}))

describe('MasterSiswa.vue', () => {
  let pinia;

  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false,
    })
    
    const authStore = useAuthStore()
    authStore.tenantId = 'test-tenant'
  })

  it('renders correctly and shows class selection', async () => {
    const wrapper = mount(MasterSiswa, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Data Siswa')
    expect(wrapper.find('.class-select').exists()).toBe(true)
  })

  it('loads students when class is selected', async () => {
    vi.mocked(onSnapshot).mockImplementation((q, cb) => {
      if (q && q.id === 'mock-col-classes') {
        cb({
          docs: [{ id: 'class-1', data: () => ({ nama: '7A' }) }]
        })
      } else if (q && q.id === 'mock-col-students') {
        cb({
          docs: [{ id: 'student-1', data: () => ({ nama: 'Budi', nis: '123' }) }]
        })
      }
      return vi.fn()
    })

    const wrapper = mount(MasterSiswa, {
      global: {
        plugins: [pinia],
      }
    })
    
    await flushPromises() // Initial mount
    await flushPromises() // Watcher trigger

    expect(wrapper.text()).toContain('Budi')
    expect(wrapper.text()).toContain('123')
  })

  it('opens modal and adds new student', async () => {
    vi.mocked(onSnapshot).mockImplementation((q, cb) => {
      if (q && q.id === 'mock-col-classes') {
        cb({ docs: [{ id: 'class-1', data: () => ({ nama: '7A' }) }] })
      }
      return vi.fn()
    })

    const wrapper = mount(MasterSiswa, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.find('.modal-card').exists()).toBe(true)

    await wrapper.find('input[required]').setValue('Siswa Baru')
    
    vi.mocked(addDoc).mockResolvedValueOnce({ id: 'new-id' })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(addDoc).toHaveBeenCalled()
    expect(wrapper.find('.modal-card').exists()).toBe(false)
  })

  it('handles student deletion', async () => {
    vi.mocked(onSnapshot).mockImplementation((q, cb) => {
      if (q && q.id === 'mock-col-classes') {
        cb({ docs: [{ id: 'class-1', data: () => ({ nama: '7A' }) }] })
      } else if (q && q.id === 'mock-col-students') {
        cb({ docs: [{ id: 'student-1', data: () => ({ nama: 'Budi' }) }] })
      }
      return vi.fn()
    })
    
    vi.stubGlobal('confirm', () => true)

    const wrapper = mount(MasterSiswa, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()
    await flushPromises()

    const deleteBtn = wrapper.find('.btn-icon.danger')
    await deleteBtn.trigger('click')

    expect(deleteDoc).toHaveBeenCalled()
  })
})

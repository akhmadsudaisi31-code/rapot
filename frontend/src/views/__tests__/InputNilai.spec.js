import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import InputNilai from '../InputNilai.vue'
import { getDocs, getDoc, writeBatch, collection, query, where, orderBy, doc, setDoc } from 'firebase/firestore'
import { createTestingPinia } from '@pinia/testing'
import { useAuthStore } from '../../stores/auth'
import * as gradeSync from '../../utils/gradeSync'

// Mock Firestore locally
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn((q) => q),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], forEach: () => {} })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(),
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

// Mock gradeSync utils
vi.mock('../../utils/gradeSync', () => ({
  createGradeDocMap: vi.fn(() => ({})),
  listenToClassSubjectGrades: vi.fn((db, c, s, cb) => {
    cb([]) 
    return vi.fn() 
  }),
  normalizeGradeRecord: vi.fn((g) => ({
    knowledge: { ph: g.ph || 0, pts: g.pts || 0, pas: g.pas || 0 },
    skill: { praktik: g.praktik || 0, proyek: g.proyek || 0, produk: g.produk || 0 },
    knowledge_score: 0,
    skill_score: 0,
    final_score: 0,
  })),
}))

// Mock Lucide icons
vi.mock('lucide-vue-next', () => ({
  Save: { render: () => h('span', 'Save') },
  Search: { render: () => h('span', 'Search') },
  Calculator: { render: () => h('span', 'Calculator') },
  FileCheck: { render: () => h('span', 'FileCheck') },
}))

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

describe('InputNilai.vue', () => {
  let pinia;

  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false,
    })
    
    const authStore = useAuthStore()
    authStore.role = 'admin'
    authStore.tenantId = 'test-tenant'
  })

  const mockSnapshot = (docs = []) => ({
    docs,
    forEach: (cb) => docs.forEach(cb),
    empty: docs.length === 0,
    size: docs.length,
  })

  it('renders correctly and shows selection bar', async () => {
    vi.mocked(getDocs).mockImplementation((q) => {
      let docs = []
      if (q.id === 'mock-col-classes') {
        docs = [{ id: 'class-1', data: () => ({ nama: '7A' }) }]
      } else if (q.id === 'mock-col-subjects') {
        docs = [{ id: 'subject-1', data: () => ({ nama: 'Matematika' }) }]
      }
      return Promise.resolve(mockSnapshot(docs))
    })

    const wrapper = mount(InputNilai, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Input Nilai')
    expect(wrapper.find('select').exists()).toBe(true)
  })

  it('loads students and shows grade table when selection is complete', async () => {
    vi.mocked(getDocs).mockImplementation((q) => {
      let docs = []
      if (q.id === 'mock-col-classes') {
        docs = [{ id: 'class-1', data: () => ({ nama: '7A' }) }]
      } else if (q.id === 'mock-col-subjects') {
        docs = [{ id: 'subject-1', data: () => ({ nama: 'Matematika' }) }]
      } else if (q.id === 'mock-col-students') {
        docs = [{ id: 'std-1', data: () => ({ nama: 'Budi' }) }]
      }
      return Promise.resolve(mockSnapshot(docs))
    })

    const wrapper = mount(InputNilai, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    await wrapper.findAll('select')[0].setValue('class-1')
    await wrapper.findAll('select')[1].setValue('subject-1')

    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('Budi')
    expect(wrapper.find('.data-table').exists()).toBe(true)
  })

  it('calculates final score correctly on input', async () => {
    vi.mocked(getDocs).mockImplementation((q) => {
      let docs = []
      if (q.id === 'mock-col-classes') {
        docs = [{ id: 'class-1', data: () => ({ nama: '7A' }) }]
      } else if (q.id === 'mock-col-subjects') {
        docs = [{ id: 'subject-1', data: () => ({ nama: 'Matematika' }) }]
      } else if (q.id === 'mock-col-students') {
        docs = [{ id: 'std-1', data: () => ({ nama: 'Budi' }) }]
      }
      return Promise.resolve(mockSnapshot(docs))
    })

    const wrapper = mount(InputNilai, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()
    
    await wrapper.findAll('select')[0].setValue('class-1')
    await wrapper.findAll('select')[1].setValue('subject-1')
    await flushPromises()
    await flushPromises()

    const inputs = wrapper.findAll('.grade-input')
    await inputs[0].setValue(90) // PH
    await inputs[1].setValue(90) // PTS
    await inputs[2].setValue(90) // PAS
    
    // The component calculates NA automatically
    expect(wrapper.text()).toContain('90') 
  })

  it('saves grades correctly', async () => {
    vi.mocked(getDocs).mockImplementation((q) => {
      let docs = []
      if (q.id === 'mock-col-classes') {
        docs = [{ id: 'class-1', data: () => ({ nama: '7A' }) }]
      } else if (q.id === 'mock-col-subjects') {
        docs = [{ id: 'subject-1', data: () => ({ nama: 'Matematika' }) }]
      } else if (q.id === 'mock-col-students') {
        docs = [{ id: 'std-1', data: () => ({ nama: 'Budi' }) }]
      }
      return Promise.resolve(mockSnapshot(docs))
    })

    const wrapper = mount(InputNilai, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()
    
    await wrapper.findAll('select')[0].setValue('class-1')
    await wrapper.findAll('select')[1].setValue('subject-1')
    await flushPromises()
    await flushPromises() 
    await flushPromises() // Extra tick for internal state updates

    const saveBtn = wrapper.find('.btn-primary')
    if (!saveBtn.exists()) {
       // Debug: print text if failed
       console.log('Wrapper text:', wrapper.text())
    }
    await saveBtn.trigger('click')
    await flushPromises()

    expect(writeBatch).toHaveBeenCalled()
  })
})

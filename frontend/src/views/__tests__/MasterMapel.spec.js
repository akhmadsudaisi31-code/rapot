import { flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import MasterMapel from '../MasterMapel.vue'
import { onSnapshot, addDoc } from 'firebase/firestore'
import { createTestingPinia } from '@pinia/testing'
import { useAuthStore } from '../../stores/auth'

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q, cb) => {
    cb({ docs: [] })
    return vi.fn()
  }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
}))

// Mock tenantDb utils
vi.mock('../../utils/tenantDb', () => ({
  tenantCol: vi.fn(() => ({ id: 'mock-col' })),
  tenantDoc: vi.fn(() => ({ id: 'mock-doc' })),
}))

// Mock Lucide icons
vi.mock('lucide-vue-next', () => ({
  Trash2: { render: () => h('span', 'Trash2') },
  Plus: { render: () => h('span', 'Plus') },
  BookOpen: { render: () => h('span', 'BookOpen') },
  Bookmark: { render: () => h('span', 'Bookmark') },
}))

describe('MasterMapel.vue', () => {
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

  it('renders correctly and shows empty state', async () => {
    const wrapper = mount(MasterMapel, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Mata Pelajaran')
    expect(wrapper.text()).toContain('Belum ada mata pelajaran')
  })

  it('shows modal when "Tambah Mapel" is clicked', async () => {
    const wrapper = mount(MasterMapel, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    await wrapper.find('.btn-primary').trigger('click')
    expect(wrapper.find('.modal-card').exists()).toBe(true)
  })

  it('submits form correctly', async () => {
    const wrapper = mount(MasterMapel, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    // Open modal
    await wrapper.find('.btn-primary').trigger('click')

    // Fill form
    await wrapper.find('input[placeholder="MTK"]').setValue('MAT')
    await wrapper.find('input[placeholder="Matematika"]').setValue('Matematika Dasar')
    await wrapper.find('select').setValue('A')
    await wrapper.find('input[type="number"]').setValue(80)

    // Mock addDoc to succeed
    vi.mocked(addDoc).mockResolvedValueOnce({ id: 'new-id' })

    // Submit
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(addDoc).toHaveBeenCalled()
    const callArgs = vi.mocked(addDoc).mock.calls[0][1]
    expect(callArgs.nama).toBe('Matematika Dasar')
    expect(callArgs.kode).toBe('MAT')

    // Modal should be closed
    expect(wrapper.find('.modal-card').exists()).toBe(false)
  })

  it('displays subjects list from firestore', async () => {
    // Mock onSnapshot to return some data
    vi.mocked(onSnapshot).mockImplementationOnce((q, cb) => {
      cb({
        docs: [
          {
            id: '1',
            data: () => ({ kode: 'IPA', nama: 'IPA Terpadu', kelompok: 'A', kkm: 75 })
          }
        ]
      })
      return vi.fn()
    })

    const wrapper = mount(MasterMapel, {
      global: {
        plugins: [pinia],
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('IPA Terpadu')
    expect(wrapper.text()).toContain('IPA')
  })
})

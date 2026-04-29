import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach } from 'vitest'

// Setup Pinia for all tests
beforeEach(() => {
  const pinia = createPinia()
  setActivePinia(pinia)
})

// Mock Firebase Globally
vi.mock('../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-123' },
    onAuthStateChanged: vi.fn(),
  },
  storage: {},
  firebaseConfig: {},
}))

// Mock Firestore functions
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue({}),
  })),
}))

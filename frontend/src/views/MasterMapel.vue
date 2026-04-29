<script setup>
import { ref, onMounted } from "vue";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { Trash2, Plus, BookOpen, Bookmark } from "lucide-vue-next";

const subjects = ref([]);
const isLoading = ref(true);
const showModal = ref(false);

const form = ref({
  nama: "",
  kode: "",
  kelompok: "A",
  kkm: 75,
});

const isSubmitting = ref(false);

onMounted(() => {
  const q = query(tenantCol("subjects"), orderBy("kode"));
  onSnapshot(q, (snapshot) => {
    subjects.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    isLoading.value = false;
  });
});

const handleSubmit = async () => {
  if (!form.value.nama || !form.value.kode) return;

  isSubmitting.value = true;
  try {
    await addDoc(tenantCol("subjects"), {
      nama: form.value.nama,
      kode: form.value.kode.toUpperCase(),
      kelompok: form.value.kelompok,
      kkm: parseInt(form.value.kkm),
      createdAt: new Date(),
    });

    // Reset & Close
    form.value = { nama: "", kode: "", kelompok: "A", kkm: 75 };
    showModal.value = false;
  } catch (error) {
    console.error("Error adding subject: ", error);
    alert("Gagal menambah mapel");
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async (id) => {
  if (!confirm("Hapus mata pelajaran ini?")) return;
  try {
    await deleteDoc(tenantDoc("subjects", id));
  } catch (error) {
    console.error("Error removing subject: ", error);
  }
};

const getKelompokLabel = (k) => {
  const map = {
    A: "Muatan Nasional",
    B: "Muatan Kewilayahan",
    C: "Muatan Peminatan Kejuruan",
  };
  return map[k] || k;
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Mata Pelajaran</h2>
        <p class="text-muted">Daftar mata pelajaran aktif dan KKM.</p>
      </div>
      <button @click="showModal = true" class="btn btn-primary">
        <Plus :size="18" /> Tambah Mapel
      </button>
    </div>

    <!-- Data Table -->
    <div v-if="!isLoading" class="card table-card animate-fade-in">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama Mata Pelajaran</th>
              <th>Kelompok</th>
              <th>KKM</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="subjects.length === 0">
              <td colspan="5" class="empty-state">
                <BookOpen :size="48" class="text-muted" />
                <p>Belum ada mata pelajaran.</p>
              </td>
            </tr>
            <tr v-for="sub in subjects" :key="sub.id">
              <td class="font-mono">{{ sub.kode }}</td>
              <td class="font-medium">{{ sub.nama }}</td>
              <td>
                <span
                  class="badge"
                  :class="'group-' + sub.kelompok.toLowerCase()"
                >
                  {{ getKelompokLabel(sub.kelompok) }}
                </span>
              </td>
              <td class="font-bold">{{ sub.kkm }}</td>
              <td>
                <button
                  @click="handleDelete(sub.id)"
                  class="btn-icon danger"
                  title="Hapus"
                >
                  <Trash2 :size="18" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Form -->
    <div
      v-if="showModal"
      class="modal-backdrop"
      @click.self="showModal = false"
    >
      <div class="modal-card animate-fade-in">
        <div class="modal-header">
          <h3>Tambah Mapel Baru</h3>
          <button @click="showModal = false" class="btn-close">×</button>
        </div>
        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <div class="input-row">
              <div class="input-group" style="flex: 0 0 30%">
                <label class="input-label">Kode</label>
                <input
                  v-model="form.kode"
                  class="form-input"
                  placeholder="MTK"
                  required
                />
              </div>
              <div class="input-group" style="flex: 1">
                <label class="input-label">Nama Mapel</label>
                <input
                  v-model="form.nama"
                  class="form-input"
                  placeholder="Matematika"
                  required
                />
              </div>
            </div>

            <div class="input-row">
              <div class="input-group" style="flex: 1">
                <label class="input-label">Kelompok</label>
                <select v-model="form.kelompok" class="form-input">
                  <option value="A">A - Nasional</option>
                  <option value="B">B - Kewilayahan</option>
                  <option value="C">C - Kejuruan</option>
                </select>
              </div>
              <div class="input-group" style="flex: 0 0 30%">
                <label class="input-label">KKM</label>
                <input
                  v-model="form.kkm"
                  type="number"
                  class="form-input"
                  required
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              @click="showModal = false"
              class="btn btn-ghost"
            >
              Batal
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? "Menyimpan..." : "Simpan Mapel" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reuse styles from MasterKelas for consistency */
.page-container {
  max-width: 1000px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.table-card {
  padding: 0;
  overflow: hidden;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 1rem 1.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}
.data-table th {
  background: var(--bg-body);
  font-weight: 600;
  color: var(--text-muted);
  font-size: 0.875rem;
}
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted);
}
.empty-state svg {
  margin-bottom: 0.5rem;
  opacity: 0.5;
}
.font-mono {
  font-family: monospace;
  font-weight: 600;
  color: var(--text-muted);
}
.font-bold {
  font-weight: 700;
  color: var(--text-main);
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.group-a {
  background: #fee2e2;
  color: #991b1b;
} /* Redish */
.group-b {
  background: #fef3c7;
  color: #92400e;
} /* Yellowish */
.group-c {
  background: #dbf4ff;
  color: #075985;
} /* Blueish */

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.modal-card {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-body {
  padding: 1.5rem;
}
.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-muted);
}
.input-row {
  display: flex;
  gap: 1rem;
}
</style>

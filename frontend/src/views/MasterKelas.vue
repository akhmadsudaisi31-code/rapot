<script setup>
import { ref, onMounted } from "vue";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
import { Trash2, Plus, Users, Pencil, CheckSquare } from "lucide-vue-next";

const classes = ref([]);
const teachers = ref([]); // Candidates for Wali Kelas
const isLoading = ref(true);
const showModal = ref(false);
const isEditing = ref(false);
const editId = ref(null);

const form = ref({
  nama: "",
  jurusan: "",
  waliKelasId: "", // New Field
});

const isSubmitting = ref(false);

onMounted(async () => {
  // 1. Listen Classes
  const q = query(tenantCol("classes"), orderBy("nama"));
  onSnapshot(q, (snapshot) => {
    classes.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    isLoading.value = false;
  });

  // 2. Fetch Potential Wali Kelas (Users with role='walikelas' atau 'guru')
  try {
    const authStore = useAuthStore();
    const qTeachers = query(
      collection(db, "users"),
      where("tenantId", "==", authStore.tenantId),
      where("role", "==", "walikelas")
    );
    const tSnap = await getDocs(qTeachers);
    teachers.value = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error fetching teachers", e);
  }
});

const handleSubmit = async () => {
  if (!form.value.nama) return;

  isSubmitting.value = true;
  try {
    let waliKelasNama = "-";
    if (form.value.waliKelasId) {
      const t = teachers.value.find((x) => x.id === form.value.waliKelasId);
      if (t) waliKelasNama = t.nama;
    }

    const payload = {
      nama: form.value.nama,
      jurusan: form.value.jurusan || "-",
      waliKelasId: form.value.waliKelasId || "",
      waliKelasNama: waliKelasNama,
      createdAt: new Date(),
    };

    if (isEditing.value && editId.value) {
      await updateDoc(tenantDoc("classes", editId.value), payload);
    } else {
      await addDoc(tenantCol("classes"), payload);
    }

    // Reset
    closeModal();
  } catch (error) {
    console.error("Error saving class: ", error);
    alert("Gagal menyimpan data kelas");
  } finally {
    isSubmitting.value = false;
  }
};

const handleEdit = (item) => {
  isEditing.value = true;
  editId.value = item.id;
  form.value = {
    nama: item.nama,
    jurusan: item.jurusan,
    waliKelasId: item.waliKelasId || "",
  };
  showModal.value = true;
};

const handleDelete = async (id) => {
  if (
    !confirm(
      "Hapus kelas ini? Data siswa di dalamnya mungkin akan kehilangan referensi kelas."
    )
  )
    return;
  try {
    await deleteDoc(tenantDoc("classes", id));
  } catch (error) {
    console.error("Error removing class: ", error);
  }
};

const closeModal = () => {
  showModal.value = false;
  isEditing.value = false;
  editId.value = null;
  form.value = { nama: "", jurusan: "", waliKelasId: "" };
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Data Kelas</h2>
        <p class="text-muted">Kelola daftar kelas dan wali kelas.</p>
      </div>
      <button @click="showModal = true" class="btn btn-primary">
        <Plus :size="18" /> Tambah Kelas
      </button>
    </div>

    <!-- Data Table -->
    <div v-if="!isLoading" class="card table-card animate-fade-in">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nama Kelas</th>
              <th>Kompetensi Keahlian</th>
              <th>Wali Kelas</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="classes.length === 0">
              <td colspan="4" class="empty-state">
                <Users :size="48" class="text-muted" />
                <p>Belum ada data kelas.</p>
              </td>
            </tr>
            <tr v-for="cls in classes" :key="cls.id">
              <td class="font-bold">{{ cls.nama }}</td>
              <td>{{ cls.jurusan }}</td>
              <td>
                <span
                  v-if="cls.waliKelasNama && cls.waliKelasNama !== '-'"
                  class="text-primary font-medium"
                >
                  {{ cls.waliKelasNama }}
                </span>
                <span v-else class="text-muted italic">Belum diset</span>
              </td>
              <td class="action-cell">
                <button @click="handleEdit(cls)" class="btn-icon" title="Edit">
                  <Pencil :size="18" />
                </button>
                <button
                  @click="handleDelete(cls.id)"
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
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal-card animate-fade-in">
        <div class="modal-header">
          <h3>{{ isEditing ? "Edit Kelas" : "Tambah Kelas Baru" }}</h3>
          <button @click="closeModal" class="btn-close">×</button>
        </div>
        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <div class="input-group">
              <label class="input-label">Nama Kelas</label>
              <input
                v-model="form.nama"
                class="form-input"
                placeholder="X RPL 1"
                required
              />
            </div>

            <div class="input-group">
              <label class="input-label">Kompetensi Keahlian (Jurusan)</label>
              <input
                v-model="form.jurusan"
                class="form-input"
                placeholder="Rekayasa Perangkat Lunak"
              />
            </div>

            <div class="input-group">
              <label class="input-label">Wali Kelas</label>
              <select v-model="form.waliKelasId" class="form-input">
                <option value="">-- Pilih Wali Kelas --</option>
                <option v-for="t in teachers" :key="t.id" :value="t.id">
                  {{ t.nama }} ({{ t.nip || "No NIP" }})
                </option>
              </select>
              <small class="text-muted" v-if="teachers.length === 0"
                >Belum ada data Guru dengan role 'walikelas'.</small
              >
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" @click="closeModal" class="btn btn-ghost">
              Batal
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? "Menyimpan..." : "Simpan Kelas" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reuse styles */
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
.font-bold {
  font-weight: 600;
  color: var(--text-main);
}
.text-primary {
  color: var(--color-primary);
}
.italic {
  font-style: italic;
}
.action-cell {
  display: flex;
  gap: 0.5rem;
}

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
  max-width: 450px;
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
</style>

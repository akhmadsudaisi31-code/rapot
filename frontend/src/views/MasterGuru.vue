<script setup>
import { ref, onMounted } from "vue";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  where,
  setDoc,
  orderBy,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  signOut,
} from "firebase/auth";
import { db } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
import {
  Trash2,
  UserPlus,
  Users,
  Key,
  Briefcase,
  Mail,
  Pencil,
  BookOpen
} from "lucide-vue-next";

/* 
  IMPORTANT: We need the original firebase config here to init a secondary app
  for creating users without logging out the admin.
*/
// You might want to import this from a validated config file in real app
import { firebaseConfig } from "../firebase";

const authStore = useAuthStore();

const teachers = ref([]);
const subjects = ref([]); // Available subjects
const classes = ref([]);
const isLoading = ref(true);
const showModal = ref(false);
const isSubmitting = ref(false);

const form = ref({
  nama: "",
  nip: "",
  email: "",
  password: "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  leadClassIds: [],
  role: "guru", // guru | walikelas
  assignedMapelIds: [] // Array of subject IDs
});

// Fetch Data (Users with role guru/walikelas)
onMounted(async () => {
  // 1. Fetch Teachers belonging to this tenant
  const authStore = useAuthStore();
  const q = query(
    collection(db, "users"),
    where("tenantId", "==", authStore.tenantId),
    where("role", "in", ["guru", "walikelas"])
  );

  onSnapshot(q, (snapshot) => {
    teachers.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    isLoading.value = false;
  });

  // 2. Fetch Subjects for Assignment
  try {
      const subSnap = await getDocs(query(tenantCol("subjects"), orderBy("nama")));
      subjects.value = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const classSnap = await getDocs(query(tenantCol("classes"), orderBy("nama")));
      classes.value = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch(e) {
      console.error("Error fetching subjects", e);
  }
});

const getSecondaryApp = () => {
  // Create a unique name for the secondary app to avoid conflicts
  return initializeApp(firebaseConfig, "SecondaryApp");
};

const isEditing = ref(false);
const editId = ref(null);
const showEditPassword = ref({
  current: false,
  next: false,
  confirm: false,
});

const handleSubmit = async () => {
  if (!form.value.email && !isEditing.value) return; // Email required for new
  if (!form.value.nama) return;

  isSubmitting.value = true;
  let secondaryApp = null;

  try {
    const userData = {
        nama: form.value.nama,
        nip: form.value.nip,
        role: form.value.role,
        leadClassIds: form.value.role === "walikelas" ? (form.value.leadClassIds || []) : [],
        leadClassId:
          form.value.role === "walikelas" && (form.value.leadClassIds || []).length > 0
            ? form.value.leadClassIds[0]
            : "",
        assignedMapelIds: form.value.assignedMapelIds || [] 
    };

    if (isEditing.value && editId.value) {
      const wantsPasswordChange =
        !!form.value.currentPassword ||
        !!form.value.newPassword ||
        !!form.value.confirmPassword;

      if (wantsPasswordChange) {
        if (!form.value.currentPassword || !form.value.newPassword || !form.value.confirmPassword) {
          alert("Lengkapi Password Lama, Password Baru, dan Konfirmasi Password Baru.");
          return;
        }
        if (form.value.newPassword.length < 6) {
          alert("Password baru minimal 6 karakter.");
          return;
        }
        if (form.value.newPassword !== form.value.confirmPassword) {
          alert("Konfirmasi password baru tidak cocok.");
          return;
        }
      }

      // Update profile
      await setDoc(
        doc(db, "users", editId.value),
        userData,
        { merge: true }
      );

      // Sync kelas yang dipimpin (waliKelasId) only on edit
      const batch = writeBatch(db);
      classes.value.forEach((kls) => {
        if (kls.waliKelasId === editId.value) {
           batch.set(
            tenantDoc("classes", kls.id),
            { waliKelasId: "", waliKelasName: "" },
            { merge: true }
          );
        }
      });
      if (form.value.role === "walikelas" && (form.value.leadClassIds || []).length > 0) {
        form.value.leadClassIds.forEach((classId) => {
          batch.set(
            tenantDoc("classes", classId),
            { waliKelasId: editId.value, waliKelasName: form.value.nama || "" },
            { merge: true }
          );
        });
      }
      await batch.commit();

      // Optional password change (requires old password for re-auth)
      if (wantsPasswordChange) {
        secondaryApp = getSecondaryApp();
        const secondaryAuth = getAuth(secondaryApp);
        await signInWithEmailAndPassword(
          secondaryAuth,
          form.value.email,
          form.value.currentPassword
        );
        if (!secondaryAuth.currentUser) {
          throw new Error("Akun guru tidak ditemukan saat update password.");
        }
        await updatePassword(secondaryAuth.currentUser, form.value.newPassword);
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
        secondaryApp = null;
        alert("Data guru dan password berhasil diperbarui.");
      } else {
        alert("Data guru berhasil diperbarui.");
      }
    } else {
      // Create New (Existing Logic)
      if (!form.value.password) {
        alert("Password wajib untuk guru baru");
        return;
      }

      secondaryApp = getSecondaryApp();
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        form.value.email,
        form.value.password
      );
      const newUser = userCredential.user;

      await setDoc(doc(db, "users", newUser.uid), {
        uid: newUser.uid,
        email: form.value.email,
        tenantId: authStore.tenantId,
        createdAt: new Date(),
        ...userData
      });

      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
      alert(`Berhasil membuat akun guru: ${form.value.nama}`);
    }

    // Reset
    closeModal();
  } catch (error) {
    console.error("Error saving teacher:", error);
    alert("Gagal menyimpan: " + error.message);
    if (secondaryApp) await deleteApp(secondaryApp).catch(() => {});
  } finally {
    isSubmitting.value = false;
  }
};

const handleEdit = (item) => {
  isEditing.value = true;
  editId.value = item.id;
  const ledClasses = classes.value.filter((c) => c.waliKelasId === item.id);
  const leadClassIdsFromDoc = Array.isArray(item.leadClassIds)
    ? item.leadClassIds
    : item.leadClassId
      ? [item.leadClassId]
      : [];
  const leadClassIds = leadClassIdsFromDoc.length > 0
    ? leadClassIdsFromDoc
    : ledClasses.map((c) => c.id);
  form.value = {
    nama: item.nama,
    nip: item.nip,
    email: item.email,
    password: "", // Leave blank
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    leadClassIds,
    role: item.role || "guru",
    assignedMapelIds: item.assignedMapelIds || []
  };
  showModal.value = true;
};

const openCreateModal = () => {
  closeModal();
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  isEditing.value = false;
  editId.value = null;
  showEditPassword.value = { current: false, next: false, confirm: false };
  form.value = {
    nama: "",
    nip: "",
    email: "",
    password: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    leadClassIds: [],
    role: "guru",
    assignedMapelIds: []
  };
};

const handleDelete = async (id) => {
  if (
    !confirm(
      "Hapus data guru dari database? (Akun login tidak otomatis terhapus di Client-SDK limitation)"
    )
  )
    return;

  // Note: Client SDK cannot delete Auth User easily without Admin SDK.
  // We will only delete Firestore data here.
  try {
    await deleteDoc(doc(db, "users", id));
  } catch (error) {
    console.error("Error deleting teacher data:", error);
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Manajemen Guru & Wali Kelas</h2>
        <p class="text-muted">Buat akun login dan tetapkan mapel pengampu.</p>
      </div>
      <button @click="openCreateModal" class="btn btn-primary">
        <UserPlus :size="18" /> Tambah Guru
      </button>
    </div>

    <!-- Tables -->
    <div v-if="!isLoading" class="card table-card animate-fade-in">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nama Lengkap & NIP</th>
              <th>Email (Username)</th>
              <th>Jabatan</th>
              <th>Mapel Diampu</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="teachers.length === 0">
              <td colspan="5" class="empty-state">
                <Users :size="48" class="text-muted" />
                <p>Belum ada data guru.</p>
              </td>
            </tr>
            <tr v-for="t in teachers" :key="t.id">
              <td>
                <div class="font-medium">{{ t.nama }}</div>
                <div class="text-xs text-muted">{{ t.nip }}</div>
              </td>
              <td>
                <div class="flex-center">
                  <Mail :size="14" class="mr-1" /> {{ t.email }}
                </div>
              </td>
              <td>
                <span
                  class="badge"
                  :class="t.role === 'walikelas' ? 'badge-blue' : 'badge-gray'"
                >
                  {{ t.role === "walikelas" ? "Wali Kelas" : "Guru Mapel" }}
                </span>
              </td>
              <td>
                  <div v-if="t.assignedMapelIds && t.assignedMapelIds.length > 0" class="mapel-tags">
                      <span v-for="mid in t.assignedMapelIds" :key="mid" class="tag">
                          {{ subjects.find(s => s.id === mid)?.nama || 'Deleted' }}
                      </span>
                  </div>
                  <span v-else class="text-muted text-xs">-</span>
              </td>
              <td>
                <button
                  @click="handleEdit(t)"
                  class="btn-icon"
                  title="Edit Profil"
                >
                  <Pencil :size="18" />
                </button>
                <button
                  @click="handleDelete(t.id)"
                  class="btn-icon danger"
                  title="Hapus Data"
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
      @click.self="closeModal"
    >
      <div class="modal-card animate-fade-in">
        <div class="modal-header">
          <h3>{{ isEditing ? 'Edit Guru' : 'Registrasi Guru Baru' }}</h3>
          <button @click="closeModal" class="btn-close">×</button>
        </div>
        <form @submit.prevent="handleSubmit">
          <div class="modal-body">
            <div class="grid-2">
                <div class="input-group">
                <label class="input-label">Nama Lengkap</label>
                <input
                    v-model="form.nama"
                    class="form-input"
                    placeholder="Nama Guru"
                    required
                />
                </div>

                <div class="input-group">
                <label class="input-label">NIP / NUPTK</label>
                <input
                    v-model="form.nip"
                    class="form-input"
                    placeholder="Nomor Induk"
                />
                </div>
            </div>

            <div class="input-group">
              <label class="input-label">Role / Jabatan</label>
              <select v-model="form.role" class="form-input">
                <option value="guru">Guru Mata Pelajaran</option>
                <option value="walikelas">Wali Kelas</option>
              </select>
            </div>

            <div class="input-group" v-if="isEditing && form.role === 'walikelas'">
              <label class="input-label">Kelas yang Dipimpin</label>
              <div class="subject-checklist">
                <label v-for="c in classes" :key="c.id" class="checkbox-label">
                  <input
                    type="checkbox"
                    :value="c.id"
                    v-model="form.leadClassIds"
                  >
                  {{ c.nama }}
                </label>
              </div>
              <small class="hint">Bisa pilih lebih dari satu kelas.</small>
            </div>

            <!-- Subject Assignment Checklist -->
            <div class="input-group">
                <label class="input-label">Mapel yang Diampu</label>
                <div class="subject-checklist">
                    <div v-if="subjects.length === 0" class="text-muted text-sm">Belum ada data mapel.</div>
                    <label v-for="sub in subjects" :key="sub.id" class="checkbox-label">
                        <input 
                            type="checkbox" 
                            :value="sub.id" 
                            v-model="form.assignedMapelIds"
                        >
                        {{ sub.nama }}
                    </label>
                </div>
                <small class="hint">Centang mapel yang boleh dinilai oleh guru ini.</small>
            </div>

            <div class="divider">Akun Login</div>

            <div class="input-group">
              <label class="input-label">Email (Username)</label>
              <input
                v-model="form.email"
                type="email"
                class="form-input"
                placeholder="guru@sekolah.id"
                required
                :disabled="isEditing" 
              />
              <small class="hint">Digunakan untuk login aplikasi</small>
            </div>

            <div class="input-group" v-if="!isEditing">
              <label class="input-label">Password</label>
              <input
                v-model="form.password"
                type="text"
                class="form-input"
                placeholder="Minimal 6 karakter"
                required
                minlength="6"
              />
            </div>
            <template v-else>
              <div class="divider">Ubah Password (Opsional)</div>
              <div class="input-group">
                <label class="input-label">Password Lama</label>
                <div class="password-wrap">
                  <input
                    v-model="form.currentPassword"
                    :type="showEditPassword.current ? 'text' : 'password'"
                    class="form-input"
                    placeholder="Isi jika ingin ganti password"
                  />
                  <button type="button" class="btn-toggle-pass" @click="showEditPassword.current = !showEditPassword.current">
                    {{ showEditPassword.current ? "Sembunyikan" : "Lihat" }}
                  </button>
                </div>
              </div>
              <div class="grid-2">
                <div class="input-group">
                  <label class="input-label">Password Baru</label>
                  <div class="password-wrap">
                    <input
                      v-model="form.newPassword"
                      :type="showEditPassword.next ? 'text' : 'password'"
                      class="form-input"
                      placeholder="Minimal 6 karakter"
                      minlength="6"
                    />
                    <button type="button" class="btn-toggle-pass" @click="showEditPassword.next = !showEditPassword.next">
                      {{ showEditPassword.next ? "Sembunyikan" : "Lihat" }}
                    </button>
                  </div>
                </div>
                <div class="input-group">
                  <label class="input-label">Konfirmasi Password Baru</label>
                  <div class="password-wrap">
                    <input
                      v-model="form.confirmPassword"
                      :type="showEditPassword.confirm ? 'text' : 'password'"
                      class="form-input"
                      placeholder="Ulangi password baru"
                      minlength="6"
                    />
                    <button type="button" class="btn-toggle-pass" @click="showEditPassword.confirm = !showEditPassword.confirm">
                      {{ showEditPassword.confirm ? "Sembunyikan" : "Lihat" }}
                    </button>
                  </div>
                </div>
              </div>
              <small class="hint">Kosongkan semua field password jika tidak ingin mengubah password.</small>
            </template>
            
          </div>
          <div class="modal-footer">
            <button
              type="button"
              @click="closeModal"
              class="btn btn-ghost"
            >
              Batal
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? "Menyimpan..." : "Simpan Data" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reuse common styles */
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
  vertical-align: top; /* Align to top for multiline tags */
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
.font-medium {
  font-weight: 600;
}
.text-xs {
  font-size: 0.75rem;
}
.flex-center {
  display: flex;
  align-items: center;
}
.mr-1 {
  margin-right: 0.25rem;
}

.badge {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.badge-blue {
  background: #dbeafe;
  color: #1e40af;
}
.badge-gray {
  background: #f3f4f6;
  color: #4b5563;
}

.mapel-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}
.tag {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--text-main);
    border: 1px solid var(--border-color);
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
  max-height: 70vh;
  overflow-y: auto;
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

.divider {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1.5rem 0 1rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.25rem;
}
.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.password-wrap {
  position: relative;
}
.password-wrap .form-input {
  padding-right: 6rem;
}
.btn-toggle-pass {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

/* Checklist Styles */
.subject-checklist {
    max-height: 150px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 0.5rem;
    background: var(--bg-body);
}
.checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    font-size: 0.9rem;
    cursor: pointer;
}
.checkbox-label:hover {
    color: var(--color-primary);
}
</style>

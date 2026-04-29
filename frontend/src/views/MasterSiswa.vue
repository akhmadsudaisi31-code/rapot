<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import {
  Trash2,
  UserPlus,
  Users,
  Search,
  Upload,
  Download,
  Pencil,
} from "lucide-vue-next";
// XLSX loaded on-demand via dynamic import()

const students = ref([]);
const classes = ref([]);
const isLoading = ref(false);
const showModal = ref(false);
const isImporting = ref(false);
const fileInput = ref(null);

// Filter
const selectedClass = ref("");

// Mode
const isEditing = ref(false);
const editId = ref(null);

// Form Data (Expanded)
const form = ref({
  nama: "",
  nis: "",
  nisn: "",
  // Biodata
  tempatLahir: "",
  tanggalLahir: "",
  kelamin: "L",
  agama: "Islam",
  alamat: "",
  // Orang Tua
  namaAyah: "",
  pekerjaanAyah: "",
  namaIbu: "",
  pekerjaanIbu: "",
  alamatOrangTua: "",
  // Wali
  waliNama: "",
  waliPekerjaan: "",
  waliAlamat: "",
});

const isSubmitting = ref(false);

// Fetch Classes for Dropdown
let unsubClasses = null;
let unsubStudents = null;

onMounted(() => {
  const qClass = query(tenantCol("classes"), orderBy("nama"));
  unsubClasses = onSnapshot(qClass, (snapshot) => {
    classes.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Auto select first class if exists
    if (classes.value.length > 0 && !selectedClass.value) {
      selectedClass.value = classes.value[0].id;
    }
  });
});

// Fetch Students when Class Changes
watch(selectedClass, (newClassId) => {
  // Cleanup previous listener to prevent memory leak
  if (unsubStudents) {
    unsubStudents();
    unsubStudents = null;
  }

  if (!newClassId) return;

  isLoading.value = true;
  const qStudent = query(
    tenantCol("students"),
    where("kelasId", "==", newClassId)
  );

  unsubStudents = onSnapshot(
    qStudent,
    (snapshot) => {
      const rawData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Client-side sort
      students.value = rawData.sort((a, b) => a.nama.localeCompare(b.nama));
      isLoading.value = false;
    },
    (error) => {
      console.error("Error fetching students:", error);
      isLoading.value = false;
    }
  );
});

onUnmounted(() => {
  if (unsubClasses) unsubClasses();
  if (unsubStudents) unsubStudents();
});

const openModal = (student = null) => {
  if (student) {
    isEditing.value = true;
    editId.value = student.id;
    form.value = {
      nama: student.nama || "",
      nis: student.nis || "",
      nisn: student.nisn || "",
      tempatLahir: student.tempatLahir || "",
      tanggalLahir: student.tanggalLahir || "",
      kelamin: student.kelamin || "L",
      agama: student.agama || "Islam",
      alamat: student.alamat || "",
      namaAyah: student.namaAyah || "",
      pekerjaanAyah: student.pekerjaanAyah || "",
      namaIbu: student.namaIbu || "",
      pekerjaanIbu: student.pekerjaanIbu || "",
      alamatOrangTua: student.alamatOrangTua || "",
      waliNama: student.waliNama || "",
      waliPekerjaan: student.waliPekerjaan || "",
      waliAlamat: student.waliAlamat || "",
    };
  } else {
    isEditing.value = false;
    editId.value = null;
    form.value = {
        nama: "", nis: "", nisn: "",
        tempatLahir: "", tanggalLahir: "", kelamin: "L", agama: "Islam", alamat: "",
        namaAyah: "", pekerjaanAyah: "", namaIbu: "", pekerjaanIbu: "", alamatOrangTua: "",
        waliNama: "", waliPekerjaan: "", waliAlamat: ""
    };
  }
  showModal.value = true;
};

const handleSubmit = async () => {
  if (!form.value.nama || !selectedClass.value) return;

  isSubmitting.value = true;
  try {
    const currentClass = classes.value.find(
      (c) => c.id === selectedClass.value
    );

    const dataToSave = {
      ...form.value,
      kelasId: selectedClass.value,
      kelasNama: currentClass ? currentClass.nama : "Unknown",
      updatedAt: new Date(),
    };

    if (isEditing.value && editId.value) {
       // Update
       await setDoc(tenantDoc("students", editId.value), dataToSave, { merge: true });
    } else {
       // Create
       await addDoc(tenantCol("students"), {
         ...dataToSave,
         createdAt: new Date()
       });
    }

    showModal.value = false;
  } catch (error) {
    console.error("Error saving student: ", error);
    alert("Gagal menyimpan siswa: " + error.message);
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async (id) => {
  if (!confirm("Hapus data siswa ini?")) return;
  try {
    await deleteDoc(tenantDoc("students", id));
  } catch (error) {
    console.error("Error deleting student: ", error);
  }
};

const handleRemoveDuplicates = async () => {
  if (!selectedClass.value || students.value.length === 0) return;
  if (!confirm("Hapus data siswa yang memiliki NAMA SAMA persis?")) return;

  isSubmitting.value = true;
  try {
    const seen = new Map();
    const duplicates = [];

    students.value.forEach((s) => {
      const key = s.nama.toLowerCase().trim();
      if (seen.has(key)) {
        duplicates.push(s.id);
      } else {
        seen.set(key, true);
      }
    });

    if (duplicates.length === 0) {
      alert("Tidak ditemukan data duplikat.");
      return;
    }

    const batch = writeBatch(db);
    duplicates.forEach((id) => {
      batch.delete(tenantDoc("students", id));
    });

    await batch.commit();
    alert(`Berhasil menghapus ${duplicates.length} data duplikat.`);
  } catch (error) {
    console.error("Error removing duplicates:", error);
  } finally {
    isSubmitting.value = false;
  }
};

// Excel Import Logic
const triggerFileInput = () => {
  if (!selectedClass.value) {
    alert("Pilih kelas terlebih dahulu.");
    return;
  }
  fileInput.value.click();
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  isImporting.value = true;
  try {
    const data = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(data);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      alert("File Excel kosong.");
      return;
    }

    const currentClass = classes.value.find((c) => c.id === selectedClass.value);
    const batch = writeBatch(db);
    let opsCount = 0;

    jsonData.forEach((row) => {
      const nama = row["Nama"] || row["nama"] || row["NAMA"];
      if (nama) {
        const newDocRef = doc(tenantCol("students"));
        batch.set(newDocRef, {
          nama: String(nama),
          nis: String(row["NIS"] || ""),
          nisn: String(row["NISN"] || ""),
          tempatLahir: String(row["Tempat Lahir"] || ""),
          tanggalLahir: String(row["Tanggal Lahir"] || ""), // Raw string, user may need to format
          kelamin: String(row["L/P"] || "L"),
          agama: String(row["Agama"] || "Islam"),
          alamat: String(row["Alamat"] || ""),
          namaAyah: String(row["Nama Ayah"] || ""),
          pekerjaanAyah: String(row["Pekerjaan Ayah"] || ""),
          namaIbu: String(row["Nama Ibu"] || ""),
          pekerjaanIbu: String(row["Pekerjaan Ibu"] || ""),
          alamatOrangTua: String(row["Alamat Orang Tua"] || ""),
          waliNama: String(row["Nama Wali"] || ""),
          waliPekerjaan: String(row["Pekerjaan Wali"] || ""),
          waliAlamat: String(row["Alamat Wali"] || ""),
          
          kelasId: selectedClass.value,
          kelasNama: currentClass ? currentClass.nama : "Unknown",
          createdAt: new Date(),
        });
        opsCount++;
      }
    });

    if (opsCount > 0) {
      await batch.commit();
      alert(`Berhasil mengimport ${opsCount} siswa.`);
    } else {
      alert("Tidak ada data valid.");
    }
  } catch (error) {
    console.error("Import error:", error);
    alert("Gagal mengimport Excel.");
  } finally {
    isImporting.value = false;
    event.target.value = "";
  }
};

const downloadTemplate = async () => {
    // Comprehensive Template
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet([
    { 
        "Nama": "Contoh Siswa 1", 
        "NIS": "12345", 
        "NISN": "0012345678",
        "Tempat Lahir": "Surabaya",
        "Tanggal Lahir": "2008-01-15",
        "L/P": "L",
        "Agama": "Islam",
        "Alamat": "Jl. Mawar No. 1",
        "Nama Ayah": "Ayah Budi",
        "Pekerjaan Ayah": "Wiraswasta",
        "Nama Ibu": "Ibu Ani",
        "Pekerjaan Ibu": "Ibu Rumah Tangga",
        "Alamat Orang Tua": "Jl. Mawar No. 1",
        "Nama Wali": "",
        "Pekerjaan Wali": "",
        "Alamat Wali": ""
    },
     { 
        "Nama": "Contoh Siswi 2", 
        "NIS": "12346", 
        "NISN": "0012345679",
        "Tempat Lahir": "Bangkalan",
        "Tanggal Lahir": "2008-05-20",
        "L/P": "P",
        "Agama": "Islam",
        "Alamat": "Jl. Melati No. 5"
    }
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template_Lengkap");
  XLSX.writeFile(wb, "Template_Import_Siswa_Lengkap.xlsx");
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Data Siswa</h2>
        <p class="text-muted">Kelola biodata, orang tua, dan wali siswa.</p>
      </div>
      <div class="header-actions">
        <!-- Hidden Input -->
        <input
          type="file"
          ref="fileInput"
          class="hidden-input"
          accept=".xlsx, .xls"
          @change="handleFileUpload"
        />
        
        <button
          @click="downloadTemplate"
          class="btn btn-ghost"
          title="Download Template Excel Lengkap"
        >
          <Download :size="18" /> Template
        </button>
        
        <button
          @click="handleRemoveDuplicates"
          class="btn btn-outline danger-outline"
          :disabled="!selectedClass || students.length === 0"
          title="Hapus Nama Ganda"
        >
          <Trash2 :size="18" /> Hapus Duplikat
        </button>
        
        <button
          @click="triggerFileInput"
          class="btn btn-outline"
          :disabled="!selectedClass || isImporting"
        >
          <Upload :size="18" /> {{ isImporting ? "Mengimport..." : "Import Excel" }}
        </button>
        
        <button
          @click="openModal()"
          class="btn btn-primary"
          :disabled="!selectedClass"
        >
          <UserPlus :size="18" /> Tambah Siswa
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar card">
      <div class="filter-group">
        <label>Pilih Kelas:</label>
        <select v-model="selectedClass" class="form-input class-select">
          <option value="" disabled>-- Pilih Kelas --</option>
          <option v-for="cls in classes" :key="cls.id" :value="cls.id">
            {{ cls.nama }}
          </option>
        </select>
      </div>
      <div class="filter-info" v-if="selectedClass">
        <span>Menampilkan {{ students.length }} siswa</span>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <!-- Data Table -->
    <div v-else class="card table-card animate-fade-in">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nama Siswa</th>
              <th>NIS / NISN</th>
              <th>L/P</th>
              <th>Nama Ayah</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="students.length === 0">
              <td colspan="5" class="empty-state">
                <Users :size="48" class="text-muted" />
                <p v-if="!selectedClass">Silakan pilih kelas.</p>
                <p v-else>Belum ada siswa.</p>
              </td>
            </tr>
            <tr v-for="student in students" :key="student.id">
              <td class="font-medium">
                {{ student.nama }}
              </td>
              <td class="text-muted">
                {{ student.nis }} <span v-if="student.nisn">/ {{ student.nisn }}</span>
              </td>
              <td class="text-center">{{ student.kelamin || '-' }}</td>
              <td class="text-muted">{{ student.namaAyah || '-' }}</td>
              <td>
                <button
                  @click="openModal(student)"
                  class="btn-icon"
                  title="Edit Biodata"
                >
                  <Pencil :size="18" />
                </button>
                <button
                  @click="handleDelete(student.id)"
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

    <!-- Modal Form (Expanded) -->
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
      <div class="modal-card animate-fade-in large-modal">
        <div class="modal-header">
          <h3>{{ isEditing ? 'Edit Biodata Siswa' : 'Tambah Siswa Baru' }}</h3>
          <button @click="showModal = false" class="btn-close">×</button>
        </div>
        <form @submit.prevent="handleSubmit" class="modal-form">
          <div class="modal-body scrollable-body">
            <!-- Section 1: Identitas -->
            <div class="form-section">
                <h4>Identitas Peserta Didik</h4>
                <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Nama Lengkap</label>
                        <input v-model="form.nama" class="form-input" required />
                    </div>
                     <div class="input-group">
                        <label class="input-label">Jenis Kelamin</label>
                        <select v-model="form.kelamin" class="form-input">
                            <option value="L">Laki-laki</option>
                            <option value="P">Perempuan</option>
                        </select>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">NIS</label>
                        <input v-model="form.nis" class="form-input" />
                    </div>
                     <div class="input-group">
                        <label class="input-label">NISN</label>
                        <input v-model="form.nisn" class="form-input" />
                    </div>
                </div>
                 <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Tempat Lahir</label>
                        <input v-model="form.tempatLahir" class="form-input" />
                    </div>
                     <div class="input-group">
                        <label class="input-label">Tanggal Lahir</label>
                        <input type="date" v-model="form.tanggalLahir" class="form-input" />
                    </div>
                </div>
                <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Agama</label>
                        <select v-model="form.agama" class="form-input">
                            <option value="Islam">Islam</option>
                            <option value="Kristen">Kristen</option>
                            <option value="Katolik">Katolik</option>
                            <option value="Hindu">Hindu</option>
                            <option value="Buddha">Buddha</option>
                            <option value="Konghucu">Konghucu</option>
                        </select>
                    </div>
                     <div class="input-group">
                        <label class="input-label">Alamat Siswa</label>
                        <input v-model="form.alamat" class="form-input" placeholder="Alamat Lengkap" />
                    </div>
                </div>
            </div>

            <!-- Section 2: Orang Tua -->
             <div class="form-section">
                <h4>Data Orang Tua</h4>
                <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Nama Ayah</label>
                        <input v-model="form.namaAyah" class="form-input" />
                    </div>
                     <div class="input-group">
                        <label class="input-label">Pekerjaan Ayah</label>
                        <input v-model="form.pekerjaanAyah" class="form-input" />
                    </div>
                </div>
                <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Nama Ibu</label>
                        <input v-model="form.namaIbu" class="form-input" />
                    </div>
                     <div class="input-group">
                        <label class="input-label">Pekerjaan Ibu</label>
                        <input v-model="form.pekerjaanIbu" class="form-input" />
                    </div>
                </div>
                <div class="input-group">
                    <label class="input-label">Alamat Orang Tua</label>
                     <input v-model="form.alamatOrangTua" class="form-input" />
                </div>
            </div>

            <!-- Section 3: Wali -->
             <div class="form-section">
                <h4>Data Wali (Opsional)</h4>
                 <div class="grid-2">
                    <div class="input-group">
                        <label class="input-label">Nama Wali</label>
                        <input v-model="form.waliNama" class="form-input" />
                    </div>
                     <div class="input-group">
                        <label class="input-label">Pekerjaan Wali</label>
                        <input v-model="form.waliPekerjaan" class="form-input" />
                    </div>
                </div>
                 <div class="input-group">
                    <label class="input-label">Alamat Wali</label>
                     <input v-model="form.waliAlamat" class="form-input" />
                </div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" @click="showModal = false" class="btn btn-ghost">Batal</button>
            <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
              {{ isSubmitting ? "Menyimpan..." : "Simpan Data" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2.5rem;
  gap: 1.5rem;
}

.page-header h2 {
  font-size: 2rem;
  margin: 0 0 0.5rem 0;
  color: var(--text-main);
  letter-spacing: -0.02em;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
  background: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  margin-bottom: 2rem;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-group label {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.9rem;
}

.class-select {
  min-width: 240px;
  background-color: var(--color-surface-muted);
}

.filter-info {
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 0.5rem 1rem;
  border-radius: 100px;
  font-size: 0.85rem;
  font-weight: 700;
}

.table-card {
  padding: 0;
  overflow: hidden;
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-premium);
  border: 1px solid var(--border-color);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--color-surface-muted);
  font-weight: 700;
  text-align: left;
  padding: 1.25rem 1.5rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.data-table td {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-main);
  font-size: 0.95rem;
}

.data-table tr:hover td {
  background: var(--color-primary-light);
}

.font-medium {
  font-weight: 600;
}

.btn-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--color-surface-muted);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: none;
  cursor: pointer;
}

.btn-icon:hover {
  background: var(--color-primary);
  color: white;
  transform: translateY(-2px);
}

.btn-icon.danger:hover {
  background: var(--color-danger);
}

.empty-state {
  text-align: center;
  padding: 5rem 2rem;
  color: var(--text-muted);
}

.empty-state p {
  margin-top: 1rem;
  font-weight: 500;
}

/* Modal Styling */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-card {
  background: white;
  width: 100%;
  max-width: 900px;
  border-radius: var(--radius-xl);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 2rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
}

.modal-body {
  padding: 2rem;
  overflow-y: auto;
  flex: 1;
}

.form-section {
  margin-bottom: 3rem;
}

.form-section h4 {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 1.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--color-primary-light);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.modal-footer {
  padding: 1.5rem 2rem;
  border-top: 1px solid var(--border-color);
  background: var(--color-surface-muted);
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  border-radius: 0 0 var(--radius-xl) var(--radius-xl);
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--color-surface-muted);
  color: var(--text-muted);
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-outline {
  background: white;
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius-md);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.btn-outline.danger-outline {
  color: var(--color-danger);
  border-color: #fecdd3;
}
.btn-outline.danger-outline:hover:not(:disabled) {
  background: #fff1f2;
  border-color: var(--color-danger);
}

.hidden-input {
  display: none;
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .data-table th:first-child,
  .data-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 20;
    background: white;
    box-shadow: 2px 0 5px rgba(0,0,0,0.05);
    min-width: 140px;
  }

  .data-table th:first-child {
    background: var(--color-surface-muted);
  }
  
  .filter-bar {
    padding: 1.25rem;
  }
  
  .class-select {
    min-width: 100%;
  }
}
</style>

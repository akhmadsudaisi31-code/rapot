<script setup>
import { ref, onMounted } from "vue";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  writeBatch,
  getDoc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../stores/auth";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { 
  Database, 
  Download, 
  Upload, 
  RefreshCw, 
  AlertTriangle,
  FileJson,
  Trash2,
  CheckCircle,
  Clock,
  Users
} from "lucide-vue-next";

const authStore = useAuthStore();
const isExporting = ref(false);
const isImporting = ref(false);
const importFile = ref(null);
const fileInput = ref(null);

const stats = ref({
  students: 0,
  classes: 0,
  subjects: 0,
  grades: 0,
  users: 0,
});

const loadStats = async () => {
  try {
    const [stdSnap, clsSnap, sbjSnap, userSnap] = await Promise.all([
      getDocs(tenantCol("students")),
      getDocs(tenantCol("classes")),
      getDocs(tenantCol("subjects")),
      getDocs(query(collection(db, "users"), where("tenantId", "==", authStore.tenantId)))
    ]);

    stats.value.students = stdSnap.size;
    stats.value.classes = clsSnap.size;
    stats.value.subjects = sbjSnap.size;
    stats.value.users = userSnap.size;

    // Grades are a bit harder to count globally without tenantId field
    // We'll skip precise grade count for now or estimate
    stats.value.grades = "---";
  } catch (error) {
    console.error("Error loading stats", error);
  }
};

onMounted(loadStats);

const exportData = async () => {
  if (!confirm("Konfirmasi Ekspor Data: Seluruh data sekolah Anda akan dikemas dalam satu file JSON. Lanjutkan?")) return;
  
  isExporting.value = true;
  try {
    const tid = authStore.tenantId;
    const data = {
      tenantId: tid,
      exportedAt: new Date().toISOString(),
      version: "2.0",
      collections: {}
    };

    const collectionsToExport = [
      "students",
      "classes",
      "subjects",
      "settings",
      "student_rapor_content",
    ];

    for (const colName of collectionsToExport) {
      const snap = await getDocs(tenantCol(colName));
      data.collections[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Users
    const userSnap = await getDocs(query(collection(db, "users"), where("tenantId", "==", tid)));
    data.collections["users"] = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Grades (Need to fetch by classId)
    const allGrades = [];
    const classIds = data.collections["classes"].map(c => c.id);
    
    for (const classId of classIds) {
      const gSnap = await getDocs(query(collection(db, "grades"), where("kelasId", "==", classId)));
      gSnap.docs.forEach(d => allGrades.push({ id: d.id, ...d.data() }));
    }
    data.collections["grades"] = allGrades;

    // Create download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_rapot_${authStore.tenantId}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    alert("Ekspor berhasil! Simpan file JSON tersebut di tempat yang aman.");
  } catch (error) {
    console.error("Export failed", error);
    alert("Gagal melakukan ekspor data: " + error.message);
  } finally {
    isExporting.value = false;
  }
};

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    importFile.value = file;
  }
};

const importData = async () => {
  if (!importFile.value) return;
  if (!confirm("PERINGATAN KRITIS: Restore data akan menimpa data yang ada jika ID sama. Sangat disarankan untuk melakukan BACKUP terlebih dahulu sebelum restore. Lanjutkan?")) return;

  isImporting.value = true;
  try {
    const content = await importFile.value.text();
    const data = JSON.parse(content);

    if (data.tenantId !== authStore.tenantId) {
      if (!confirm("ID Sekolah dalam file backup tidak cocok dengan akun Anda saat ini. Ini mungkin data dari sekolah lain. Tetap paksa restore?")) {
        isImporting.value = false;
        return;
      }
    }

    let batch = writeBatch(db);
    let count = 0;

    const commitBatch = async () => {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    };

    // Helper to add to batch and auto-commit if reaches 500
    const addToBatch = async (ref, docData) => {
      batch.set(ref, docData, { merge: true });
      count++;
      if (count >= 450) {
        await commitBatch();
      }
    };

    // Restore Collections
    for (const [colName, docs] of Object.entries(data.collections)) {
      if (colName === "users" || colName === "grades") continue;
      
      for (const d of docs) {
        const { id, ...payload } = d;
        await addToBatch(tenantDoc(colName, id), payload);
      }
    }

    // Restore Grades (Top level)
    if (data.collections.grades) {
      for (const d of data.collections.grades) {
        const { id, ...payload } = d;
        await addToBatch(doc(db, "grades", id), payload);
      }
    }

    // Restore Users (Top level)
    if (data.collections.users) {
      for (const d of data.collections.users) {
        const { id, ...payload } = d;
        await addToBatch(doc(db, "users", id), payload);
      }
    }

    await commitBatch(); // Final commit
    
    alert("Restore data berhasil diselesaikan!");
    importFile.value = null;
    if (fileInput.value) fileInput.value.value = "";
    loadStats();
  } catch (error) {
    console.error("Import failed", error);
    alert("Gagal melakukan restore data: " + error.message);
  } finally {
    isImporting.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Pemeliharaan Sistem</h2>
        <p class="text-muted">Kelola cadangan data dan pembersihan sistem untuk menjaga performa.</p>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="stats-grid">
      <div class="stat-card card">
        <div class="stat-icon students"><Users :size="24" /></div>
        <div class="stat-info">
          <span class="value">{{ stats.students }}</span>
          <span class="label">Siswa</span>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon classes"><Database :size="24" /></div>
        <div class="stat-info">
          <span class="value">{{ stats.classes }}</span>
          <span class="label">Kelas</span>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon subjects"><FileJson :size="24" /></div>
        <div class="stat-info">
          <span class="value">{{ stats.subjects }}</span>
          <span class="label">Mapel</span>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon users"><RefreshCw :size="24" /></div>
        <div class="stat-info">
          <span class="value">{{ stats.users }}</span>
          <span class="label">Akun Pengguna</span>
        </div>
      </div>
    </div>

    <div class="tools-grid">
      <!-- Backup Section -->
      <div class="card tool-card">
        <div class="tool-header">
          <div class="tool-title">
            <Download class="icon-primary" />
            <h3>Backup Data</h3>
          </div>
          <p>Unduh seluruh data sekolah Anda ke dalam file JSON tunggal. Gunakan file ini sebagai cadangan berkala.</p>
        </div>
        <div class="tool-action">
          <button class="btn btn-primary btn-block" @click="exportData" :disabled="isExporting">
            <RefreshCw v-if="isExporting" class="spin" />
            <Download v-else />
            {{ isExporting ? 'Mengekspor...' : 'Ekspor ke JSON' }}
          </button>
        </div>
        <div class="tool-note">
          <Clock :size="14" /> Terakhir diupdate: Otomatis
        </div>
      </div>

      <!-- Restore Section -->
      <div class="card tool-card">
        <div class="tool-header">
          <div class="tool-title">
            <Upload class="icon-warning" />
            <h3>Restore Data</h3>
          </div>
          <p>Unggah file backup (.json) untuk memulihkan data. Hati-hati, ini dapat menimpa data yang ada.</p>
        </div>
        <div class="tool-action">
          <div class="file-upload-zone">
            <input 
              type="file" 
              ref="fileInput"
              accept=".json" 
              @change="handleFileChange"
              class="hidden-input"
              id="restore-file"
            />
            <label for="restore-file" class="file-label">
              <FileJson v-if="!importFile" />
              <span>{{ importFile ? importFile.name : 'Pilih file backup...' }}</span>
            </label>
          </div>
          <button 
            class="btn btn-warning btn-block" 
            @click="importData" 
            :disabled="isImporting || !importFile"
          >
            <RefreshCw v-if="isImporting" class="spin" />
            <Upload v-else />
            {{ isImporting ? 'Memulihkan...' : 'Mulai Restore' }}
          </button>
        </div>
        <div class="tool-warning">
          <AlertTriangle :size="14" /> Risiko: Data yang ada akan tertimpa.
        </div>
      </div>

      <!-- Info Card -->
      <div class="card info-card full-width">
        <div class="info-content">
          <div class="info-icon"><AlertTriangle :size="32" /></div>
          <div class="info-text">
            <h4>Panduan Pemeliharaan</h4>
            <ul>
              <li>Lakukan backup setidaknya seminggu sekali atau setelah perubahan data besar.</li>
              <li>Jangan mengubah isi file JSON secara manual karena dapat merusak struktur data saat restore.</li>
              <li>Pastikan koneksi internet stabil saat melakukan restore data dalam jumlah besar.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.students { background: #eff6ff; color: #3b82f6; }
.stat-icon.classes { background: #f0fdf4; color: #22c55e; }
.stat-icon.subjects { background: #faf5ff; color: #a855f7; }
.stat-icon.users { background: #fff7ed; color: #f97316; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-info .value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary-dark);
}

.stat-info .label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.tool-card {
  display: flex;
  flex-direction: column;
  padding: 2rem;
}

.tool-header {
  flex: 1;
  margin-bottom: 1.5rem;
}

.tool-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.tool-title h3 {
  margin: 0;
  font-size: 1.25rem;
}

.icon-primary { color: var(--color-primary); }
.icon-warning { color: #f59e0b; }

.tool-header p {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.tool-action {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.btn-block {
  width: 100%;
  justify-content: center;
  padding: 0.8rem;
}

.file-upload-zone {
  border: 2px dashed #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.file-upload-zone:hover {
  border-color: #f59e0b;
  background: #fffcf0;
}

.hidden-input {
  display: none;
}

.file-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: #64748b;
}

.tool-note, .tool-warning {
  margin-top: 1rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tool-note { color: var(--text-muted); }
.tool-warning { color: #b45309; font-weight: 500; }

.full-width {
  grid-column: 1 / -1;
}

.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 1.5rem;
}

.info-content {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.info-icon {
  color: #64748b;
  padding-top: 0.5rem;
}

.info-text h4 {
  margin: 0 0 0.75rem 0;
  color: var(--color-primary-dark);
}

.info-text ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #475569;
  font-size: 0.9rem;
}

.info-text li {
  margin-bottom: 0.4rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>

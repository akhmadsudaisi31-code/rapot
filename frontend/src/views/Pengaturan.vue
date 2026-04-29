<script setup>
import { ref, onMounted } from "vue";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { tenantDoc } from "../utils/tenantDb";
import { Save, School, Percent, ImagePlus, X } from "lucide-vue-next";

const isSaving = ref(false);
// Info Sekolah
const schoolInfo = ref({
  nama: "SMK Negeri 1 Contoh",
  alamat: "Jl. Pendidikan No. 1",
  kepalaSekolah: "Drs. H. Kepala Sekolah",
  nipKepsek: "19800101 200501 1 001",
  logoBase64: "",
});

// Bobot Nilai
const gradingWeights = ref({
  tugas: 30,
  uts: 20,
  uas: 50,
});

onMounted(async () => {
  // Load Settings
  const infoDoc = await getDoc(tenantDoc("settings", "school_info"));
  if (infoDoc.exists()) schoolInfo.value = infoDoc.data();

  const weightDoc = await getDoc(tenantDoc("settings", "grading_weights"));
  if (weightDoc.exists()) gradingWeights.value = weightDoc.data();
});

const handleLogoUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > 500 * 1024) {
    alert("Ukuran file logo terlalu besar. Maksimal 500KB.");
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (ev) => {
    schoolInfo.value.logoBase64 = ev.target.result;
  };
  reader.readAsDataURL(file);
};

const saveSchoolInfo = async () => {
  isSaving.value = true;
  try {
    await setDoc(tenantDoc("settings", "school_info"), schoolInfo.value, { merge: true });
    alert("Info sekolah disimpan!");
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan info sekolah");
  } finally {
    isSaving.value = false;
  }
};

const saveWeights = async () => {
  // Validate 100%
  const total =
    parseInt(gradingWeights.value.tugas) +
    parseInt(gradingWeights.value.uts) +
    parseInt(gradingWeights.value.uas);
  if (total !== 100) {
    alert(`Total bobot harus 100%. Saat ini: ${total}%`);
    return;
  }

  isSaving.value = true;
  try {
    await setDoc(tenantDoc("settings", "grading_weights"), {
      tugas: parseInt(gradingWeights.value.tugas),
      uts: parseInt(gradingWeights.value.uts),
      uas: parseInt(gradingWeights.value.uas),
    });
    alert("Bobot nilai disimpan!");
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan bobot");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>Pengaturan Aplikasi</h2>
    </div>

    <div class="settings-grid">
      <!-- School Info Card -->
      <div class="card settings-card">
        <div class="card-header">
          <School :size="24" class="text-primary" />
          <h3>Identitas Sekolah</h3>
        </div>
        <form @submit.prevent="saveSchoolInfo">
          <!-- Logo Upload -->
          <div class="input-group">
            <label class="input-label">Logo Sekolah (Maks 500KB)</label>
            <div class="logo-upload-wrapper">
              <div v-if="schoolInfo.logoBase64" class="logo-preview">
                <img :src="schoolInfo.logoBase64" alt="Logo Preview" />
                <button type="button" class="btn-remove-logo" @click="schoolInfo.logoBase64 = ''">
                  <X :size="14" />
                </button>
              </div>
              <div v-else class="logo-placeholder">
                <ImagePlus :size="24" class="text-muted" />
                <span>Pilih Gambar</span>
              </div>
              <input type="file" accept="image/png, image/jpeg" @change="handleLogoUpload" class="file-input" />
            </div>
          </div>

          <div class="input-group">
            <label class="input-label">Nama Sekolah</label>
            <input v-model="schoolInfo.nama" class="form-input" required />
          </div>
          <div class="input-group">
            <label class="input-label">Alamat Lengkap</label>
            <textarea
              v-model="schoolInfo.alamat"
              class="form-input"
              rows="3"
            ></textarea>
          </div>
          <div class="input-group">
            <label class="input-label">Nama Kepala Sekolah</label>
            <input
              v-model="schoolInfo.kepalaSekolah"
              class="form-input"
              required
            />
          </div>
          <div class="input-group">
            <label class="input-label">NIP Kepala Sekolah</label>
            <input v-model="schoolInfo.nipKepsek" class="form-input" required />
          </div>
          <button
            type="submit"
            class="btn btn-primary btn-full"
            :disabled="isSaving"
          >
            Simpan Identitas
          </button>
        </form>
      </div>

      <!-- Grading Weights Card -->
      <div class="card settings-card">
        <div class="card-header">
          <Percent :size="24" class="text-accent" />
          <h3>Bobot Penilaian</h3>
        </div>
        <p class="text-muted mb-4">Atur persentase komponen nilai rapor.</p>
        <form @submit.prevent="saveWeights">
          <div class="input-group">
            <div class="weight-control">
              <label>Tugas / Harian</label>
              <div class="input-wrapper">
                <input
                  type="number"
                  v-model="gradingWeights.tugas"
                  class="form-input"
                  min="0"
                  max="100"
                />
                <span class="suffix">%</span>
              </div>
            </div>
          </div>
          <div class="input-group">
            <div class="weight-control">
              <label>UTS (Tengah Semester)</label>
              <div class="input-wrapper">
                <input
                  type="number"
                  v-model="gradingWeights.uts"
                  class="form-input"
                  min="0"
                  max="100"
                />
                <span class="suffix">%</span>
              </div>
            </div>
          </div>
          <div class="input-group">
            <div class="weight-control">
              <label>UAS (Akhir Semester)</label>
              <div class="input-wrapper">
                <input
                  type="number"
                  v-model="gradingWeights.uas"
                  class="form-input"
                  min="0"
                  max="100"
                />
                <span class="suffix">%</span>
              </div>
            </div>
          </div>

          <div
            class="total-bar"
            :class="{
              valid:
                parseInt(gradingWeights.tugas) +
                  parseInt(gradingWeights.uts) +
                  parseInt(gradingWeights.uas) ===
                100,
            }"
          >
            Total:
            {{
              parseInt(gradingWeights.tugas) +
              parseInt(gradingWeights.uts) +
              parseInt(gradingWeights.uas)
            }}%
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-full"
            :disabled="isSaving"
          >
            Simpan Bobot
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1000px;
  margin: 0 auto;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.settings-card {
  padding: 2rem;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.card-header h3 {
  margin: 0;
  font-size: 1.25rem;
}
.text-primary {
  color: var(--color-primary);
}
.text-accent {
  color: var(--color-accent);
}
.text-muted {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
.btn-full {
  width: 100%;
  margin-top: 1rem;
}

.weight-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.weight-control .input-wrapper {
  position: relative;
}
.weight-control .form-input {
  padding-right: 2rem;
}
.weight-control .suffix {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-weight: 600;
  pointer-events: none;
}

/* Logo Upload */
.logo-upload-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-color);
  background: var(--bg-body);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
}
.logo-upload-wrapper:hover {
  border-color: var(--color-primary);
}
.logo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}
.logo-preview {
  width: 100%;
  height: 100%;
  position: relative;
}
.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 0.25rem;
}
.btn-remove-logo {
  position: absolute;
  top: 0;
  right: 0;
  background: var(--color-danger);
  color: white;
  border: none;
  border-bottom-left-radius: var(--radius-md);
  padding: 0.25rem;
  cursor: pointer;
}
.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 10;
}

.total-bar {
  padding: 0.75rem;
  background: #fef2f2;
  color: var(--color-danger);
  border-radius: var(--radius-md);
  text-align: center;
  font-weight: 600;
  margin-bottom: 1rem;
}
.total-bar.valid {
  background: #dcfce7;
  color: var(--color-success);
}
</style>

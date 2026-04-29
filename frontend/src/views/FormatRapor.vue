<script setup>
import { ref, onMounted } from "vue";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { tenantDoc } from "../utils/tenantDb";
import { Save, Settings, FileText } from "lucide-vue-next";

const isSaving = ref(false);
const config = ref({
  // Identitas Sekolah
  namaSekolah: "SMK SURAMADU",
  npsn: "20551909",
  email: "smksuramadu@gmail.com",
  website: "-",
  
  // Alamat
  alamatJalan: "Jl. Blega-Konang",
  kelurahan: "Karang Nangkah",
  kecamatan: "Blega",
  kabupaten: "Bangkalan",
  provinsi: "Jawa Timur",

  // Header Surat
  headerBaris1: "PEMERINTAH PROVINSI JAWA TIMUR",
  headerBaris2: "DINAS PENDIDIKAN",

  // Tanda Tangan
  kotaTtd: "Bangkalan",
  namaKepsek: "MUTALSAM SHOLEH, ST",
  nipKepsek: "-",
  
  // Lainnya
  logoUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_Tut_Wuri_Handayani.png"
});

onMounted(async () => {
  try {
    const schoolInfoSnap = await getDoc(tenantDoc("settings", "school_info"));
    if (schoolInfoSnap.exists()) {
      const info = schoolInfoSnap.data();
      config.value = {
        ...config.value,
        namaSekolah: info.nama || config.value.namaSekolah,
        npsn: info.npsn || config.value.npsn,
        email: info.email || config.value.email,
        website: info.website || config.value.website,
        alamatJalan: info.alamat || config.value.alamatJalan,
        kabupaten: info.kota || config.value.kabupaten,
        provinsi: info.provinsi || config.value.provinsi,
        namaKepsek: info.kepalaSekolah || config.value.namaKepsek,
        nipKepsek: info.nipKepsek || config.value.nipKepsek,
        logoUrl: info.logoBase64 || info.logoUrl || config.value.logoUrl,
      };
    }

    const docSnap = await getDoc(tenantDoc("settings", "rapor_config"));
    if (docSnap.exists()) {
      config.value = { ...config.value, ...docSnap.data() };
    }
  } catch (e) {
    console.error("Error loading config", e);
  }
});

const saveConfig = async () => {
  isSaving.value = true;
  try {
    await setDoc(tenantDoc("settings", "rapor_config"), config.value);
    alert("Pengaturan Format Rapor berhasil disimpan!");
  } catch (e) {
    console.error("Error saving config", e);
    alert("Gagal menyimpan pengaturan.");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Format Rapor</h2>
        <p class="text-muted">Atur format identitas sekolah dan kop surat pada rapor.</p>
      </div>
    </div>

    <form @submit.prevent="saveConfig" class="config-form">
      <div class="grid-layout">
        
        <!-- Identitas Sekolah -->
        <div class="card">
          <div class="card-header">
            <h3>Identitas Sekolah</h3>
          </div>
          <div class="form-group">
            <label>Nama Sekolah</label>
            <input v-model="config.namaSekolah" class="form-input" required />
          </div>
          <div class="form-group">
            <label>NPSN</label>
            <input v-model="config.npsn" class="form-input" />
          </div>
          <div class="form-group">
             <label>Email</label>
             <input v-model="config.email" class="form-input" />
          </div>
          <div class="form-group">
             <label>Website</label>
             <input v-model="config.website" class="form-input" />
          </div>
           <div class="form-group">
             <label>Logo URL</label>
             <input v-model="config.logoUrl" class="form-input" placeholder="https://..." />
             <p class="text-xs text-muted mt-1">Masukkan URL gambar logo (transparan lebih baik).</p>
          </div>
        </div>

        <!-- Alamat -->
        <div class="card">
           <div class="card-header">
            <h3>Alamat Lengkap</h3>
          </div>
           <div class="form-group">
             <label>Jalan / Alamat</label>
             <input v-model="config.alamatJalan" class="form-input" />
          </div>
           <div class="form-group">
             <label>Kelurahan / Desa</label>
             <input v-model="config.kelurahan" class="form-input" />
          </div>
          <div class="form-group">
             <label>Kecamatan</label>
             <input v-model="config.kecamatan" class="form-input" />
          </div>
          <div class="form-group">
             <label>Kabupaten / Kota</label>
             <input v-model="config.kabupaten" class="form-input" />
          </div>
          <div class="form-group">
             <label>Provinsi</label>
             <input v-model="config.provinsi" class="form-input" />
          </div>
        </div>

        <!-- Kop & Tanda Tangan -->
        <div class="card">
           <div class="card-header">
            <h3>Kop & Tanda Tangan</h3>
          </div>
           <div class="form-group">
             <label>Header Baris 1</label>
             <input v-model="config.headerBaris1" class="form-input" placeholder="PEMERINTAH PROVINSI..." />
          </div>
           <div class="form-group">
             <label>Header Baris 2</label>
             <input v-model="config.headerBaris2" class="form-input" placeholder="DINAS PENDIDIKAN" />
          </div>
          <div class="divider"></div>
           <div class="form-group">
             <label>Kota Tanda Tangan</label>
             <input v-model="config.kotaTtd" class="form-input" placeholder="Misal: Bangkalan" />
          </div>
           <div class="form-group">
             <label>Nama Kepala Sekolah</label>
             <input v-model="config.namaKepsek" class="form-input" />
          </div>
           <div class="form-group">
             <label>NIP Kepala Sekolah</label>
             <input v-model="config.nipKepsek" class="form-input" placeholder="Isi '-' jika tidak ada" />
          </div>
        </div>

      </div>

      <div class="action-bar">
        <button type="submit" class="btn btn-primary" :disabled="isSaving">
            <Save :size="18" /> {{ isSaving ? 'Menyimpan...' : 'Simpan Pengaturan' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1000px;
  margin: 0 auto;
  padding-bottom: 5rem;
}
.page-header {
  margin-bottom: 2rem;
}

.grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1.5rem;
}

.card-header h3 {
    margin: 0 0 1.5rem 0;
    font-size: 1.1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #eee;
}

.form-group {
    margin-bottom: 1rem;
}
.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
}

.divider {
    height: 1px;
    background: #eee;
    margin: 1.5rem 0;
}

.action-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    padding: 1rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    padding-right: 2rem;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
    z-index: 100;
}

@media (min-width: 768px) {
    .action-bar {
        padding-right: 3rem; /* Adjust based on sidebar */
    }
}
</style>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { School, ArrowLeft, UserPlus } from "lucide-vue-next";

const router = useRouter();
const isLoading = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const form = ref({
  namaSekolah: "",
  npsn: "",
  alamat: "",
  email: "",
  password: "",
  confirmPassword: "",
  namaAdmin: "",
  noTelp: "",
  plan: "basic",
  billingCycle: "yearly",
});

const handleRegister = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  // Validasi
  if (!form.value.namaSekolah || !form.value.email || !form.value.password || !form.value.namaAdmin) {
    errorMessage.value = "Lengkapi semua field yang wajib diisi.";
    return;
  }
  if (form.value.password.length < 6) {
    errorMessage.value = "Password minimal 6 karakter.";
    return;
  }
  if (form.value.password !== form.value.confirmPassword) {
    errorMessage.value = "Konfirmasi password tidak cocok.";
    return;
  }

  isLoading.value = true;

  try {
    const auth = getAuth();

    // 1. Buat akun Firebase Auth
    const credential = await createUserWithEmailAndPassword(
      auth,
      form.value.email.trim().toLowerCase(),
      form.value.password
    );
    const uid = credential.user.uid;

    const tenantId = uid;
    const paymentStatus = "unpaid"; // Semua paket sekarang berbayar
    await setDoc(doc(db, "tenants", tenantId), {
      ownerUid: uid,
      status: "pending",
      plan: form.value.plan,
      billingCycle: form.value.billingCycle,
      paymentStatus: paymentStatus,
      createdAt: new Date().toISOString(),
      schoolInfo: {
        nama: form.value.namaSekolah,
        npsn: form.value.npsn,
        alamat: form.value.alamat,
        email: form.value.email.trim().toLowerCase(),
        noTelp: form.value.noTelp,
        kepalaSekolah: "",
        nipKepsek: "",
        logoUrl: "",
        headerBaris1: "",
        headerBaris2: "",
        kotaTtd: "",
        provinsi: "",
        kabupaten: "",
        kecamatan: "",
        kelurahan: "",
        alamatJalan: form.value.alamat,
      },
    });

    // 3. Buat user document di koleksi global users
    await setDoc(doc(db, "users", uid), {
      uid: uid,
      email: form.value.email.trim().toLowerCase(),
      nama: form.value.namaAdmin,
      role: "admin",
      tenantId: tenantId,
      tenantStatus: "pending",
      noTelp: form.value.noTelp,
      createdAt: new Date().toISOString(),
    });

    successMessage.value = "Pendaftaran berhasil! Akun Anda sedang menunggu konfirmasi administrator.";

    // Redirect setelah 2 detik
    setTimeout(() => {
      router.push("/konfirmasi-pembayaran");
    }, 2000);
  } catch (error) {
    console.error("Register Error:", error);
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMessage.value = "Email sudah terdaftar. Silakan gunakan email lain atau login.";
        break;
      case "auth/invalid-email":
        errorMessage.value = "Format email tidak valid.";
        break;
      case "auth/weak-password":
        errorMessage.value = "Password terlalu lemah. Gunakan minimal 6 karakter.";
        break;
      default:
        errorMessage.value = "Terjadi kesalahan: " + error.message;
    }
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="register-page">
    <div class="register-card animate-fade-in">
      <div class="register-header">
        <div class="logo-icon">
          <School :size="32" />
        </div>
        <h1>Daftar Sekolah Baru</h1>
        <p>Daftarkan sekolah Anda untuk menggunakan SI-RAPOR</p>
      </div>

      <!-- Success Message -->
      <div v-if="successMessage" class="alert alert-success">
        {{ successMessage }}
      </div>

      <!-- Error Message -->
      <div v-if="errorMessage" class="alert alert-error">
        {{ errorMessage }}
      </div>

      <form @submit.prevent="handleRegister" class="register-form">
        <div class="section-label">Identitas Sekolah</div>

        <div class="input-group">
          <label class="input-label">Nama Sekolah <span class="required">*</span></label>
          <input
            v-model="form.namaSekolah"
            class="form-input"
            placeholder="SMK Negeri 1 Contoh"
            required
          />
        </div>

        <div class="grid-2">
          <div class="input-group">
            <label class="input-label">NPSN</label>
            <input
              v-model="form.npsn"
              class="form-input"
              placeholder="20551909"
            />
          </div>
          <div class="input-group">
            <label class="input-label">No. Telepon</label>
            <input
              v-model="form.noTelp"
              class="form-input"
              placeholder="08xxxxxxxxxx"
            />
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">Alamat Sekolah</label>
          <textarea
            v-model="form.alamat"
            class="form-input"
            rows="2"
            placeholder="Jl. Pendidikan No. 1, Kota..."
          ></textarea>
        </div>

        <div class="section-label">Akun Administrator</div>

        <div class="input-group">
          <label class="input-label">Nama Lengkap Admin <span class="required">*</span></label>
          <input
            v-model="form.namaAdmin"
            class="form-input"
            placeholder="Nama penanggung jawab"
            required
          />
        </div>

        <div class="input-group">
          <label class="input-label">Email <span class="required">*</span></label>
          <input
            v-model="form.email"
            type="email"
            class="form-input"
            placeholder="admin@sekolah.id"
            required
          />
          <small class="hint">Digunakan untuk login ke aplikasi</small>
        </div>

        <div class="grid-2">
          <div class="input-group">
            <label class="input-label">Password <span class="required">*</span></label>
            <input
              v-model="form.password"
              type="password"
              class="form-input"
              placeholder="Minimal 6 karakter"
              required
              minlength="6"
            />
          </div>
          <div class="input-group">
            <label class="input-label">Konfirmasi Password <span class="required">*</span></label>
            <input
              v-model="form.confirmPassword"
              type="password"
              class="form-input"
              placeholder="Ulangi password"
              required
            />
          </div>
        </div>

        <div class="section-label" style="margin-top: 1rem;">Pilih Paket Langganan</div>
        
        <div class="billing-toggle">
          <button type="button" class="toggle-btn" :class="{ active: form.billingCycle === 'monthly' }" @click="form.billingCycle = 'monthly'">Bulanan</button>
          <button type="button" class="toggle-btn" :class="{ active: form.billingCycle === 'yearly' }" @click="form.billingCycle = 'yearly'">Tahunan (Hemat 20%)</button>
        </div>

        <div class="pricing-cards">
          <div class="pricing-card" :class="{ active: form.plan === 'basic' }" @click="form.plan = 'basic'">
            <div class="card-header">
              <h3>Basic</h3>
              <div class="price">{{ form.billingCycle === 'monthly' ? 'Rp 55.000' : 'Rp 528.000' }}<span>/{{ form.billingCycle === 'monthly' ? 'bln' : 'thn' }}</span></div>
            </div>
            <ul class="features">
              <li>Maks. 100 Siswa</li>
              <li>Fitur Penilaian Standar</li>
              <li>Cetak Rapor Dasar</li>
            </ul>
          </div>
          
          <div class="pricing-card" :class="{ active: form.plan === 'pro' }" @click="form.plan = 'pro'">
            <div class="badge-popular">Populer</div>
            <div class="card-header">
              <h3>Pro</h3>
              <div class="price">{{ form.billingCycle === 'monthly' ? 'Rp 100.000' : 'Rp 960.000' }}<span>/{{ form.billingCycle === 'monthly' ? 'bln' : 'thn' }}</span></div>
            </div>
            <ul class="features">
              <li>Siswa Tak Terbatas</li>
              <li>Cetak PDF Otomatis</li>
              <li>Kustomisasi Logo & Identitas</li>
              <li>Dukungan Prioritas</li>
            </ul>
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-full" :disabled="isLoading" style="margin-top: 1.5rem;">
          <UserPlus :size="18" />
          {{ isLoading ? "Mendaftar..." : "Daftar Sekarang" }}
        </button>
      </form>

      <div class="register-footer">
        <router-link to="/login" class="back-link">
          <ArrowLeft :size="16" /> Sudah punya akun? Login
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary-dark) 0%, #0f172a 100%);
  padding: 3rem 1.5rem;
}

.register-card {
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 600px;
  padding: 3.5rem;
}

.register-header {
  text-align: center;
  margin-bottom: 3rem;
}

.logo-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  box-shadow: 0 8px 24px rgba(30, 64, 175, 0.2);
}

.register-header h1 {
  font-size: 2.25rem;
  margin-bottom: 0.5rem;
  color: var(--text-main);
  letter-spacing: -0.03em;
  font-weight: 800;
}

.register-header p {
  color: var(--text-muted);
  font-size: 1.05rem;
}

.section-label {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 2.5rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--color-primary-light);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.required {
  color: var(--color-danger);
}

.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.4rem;
  display: block;
}

.alert {
  padding: 1rem 1.25rem;
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
  font-weight: 500;
}
.alert-success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.alert-error {
  background: #fff1f2;
  color: #9f1239;
  border: 1px solid #fecdd3;
}

.btn-full {
  width: 100%;
  margin-top: 2rem;
  padding: 1.125rem;
  font-size: 1.1rem;
  border-radius: var(--radius-md);
}

.register-footer {
  text-align: center;
  margin-top: 2.5rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 700;
  font-size: 1rem;
  transition: opacity 0.2s;
}

.back-link:hover {
  opacity: 0.8;
}

@media (max-width: 640px) {
  .register-card {
    padding: 2.5rem 1.5rem;
  }
  .grid-2 {
    grid-template-columns: 1fr;
  }
  .pricing-cards {
    grid-template-columns: 1fr !important;
  }
}

/* Pricing UI */
.billing-toggle {
  display: flex;
  background: var(--color-surface-muted);
  border-radius: 12px;
  padding: 6px;
  margin-bottom: 2rem;
  border: 1px solid var(--border-color);
}
.toggle-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.75rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.toggle-btn.active {
  background: white;
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}
.pricing-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin-bottom: 1rem;
}
.pricing-card {
  border: 2px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
  cursor: pointer;
  position: relative;
  transition: all 0.25s;
  background: white;
  text-align: left;
}
.pricing-card:hover {
  border-color: var(--color-primary-light);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.pricing-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.card-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-main);
}
.price {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-primary);
  margin-top: 0.5rem;
}
.price span {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}
.features {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  font-size: 0.85rem;
  color: var(--text-main);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.features li {
  padding-left: 1.5rem;
  position: relative;
  font-weight: 500;
}
.features li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--color-accent);
  font-weight: 800;
}
.badge-popular {
  position: absolute;
  top: -12px;
  right: 20px;
  background: var(--color-warning);
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 4px 12px;
  border-radius: 100px;
  text-transform: uppercase;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
</style>

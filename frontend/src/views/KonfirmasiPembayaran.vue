<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTenantStore } from '../stores/tenant';
import { useAuthStore } from '../stores/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { ArrowLeft, Upload, CheckCircle, AlertCircle } from 'lucide-vue-next';

const router = useRouter();
const tenantStore = useTenantStore();
const authStore = useAuthStore();

const isInitializing = ref(true);

onMounted(async () => {
  if (!authStore.isInitialized) {
    await authStore.initAuth();
  }
  
  if (!tenantStore.tenantId && authStore.tenantId) {
    await tenantStore.loadTenant(authStore.tenantId);
  }
  
  isInitializing.value = false;
});

const paymentAmount = computed(() => {
  if (tenantStore.plan === 'basic') {
    return tenantStore.billingCycle === 'monthly' ? 'Rp 55.000' : 'Rp 528.000';
  }
  return tenantStore.billingCycle === 'monthly' ? 'Rp 100.000' : 'Rp 960.000';
});
</script>

<template>
  <div class="payment-page">
    <div v-if="isInitializing" class="loading-state" style="text-align: center; padding: 5rem;">
      <div class="spinner"></div>
      <p>Memvalidasi sesi...</p>
    </div>

    <div v-else class="payment-card">
      <div class="header">
        <button @click="router.push('/pending-activation')" class="btn-back">
          <ArrowLeft :size="20" />
        </button>
        <h2>Konfirmasi Pembayaran</h2>
      </div>

      <div class="instruction-box">
        <p>Silakan transfer senilai <strong>{{ paymentAmount }}</strong> ke salah satu rekening berikut:</p>
        <div class="bank-list">
          <div class="bank-details">
            <div class="bank-name">BRI</div>
            <div class="account-number">6102 0103 2852 508</div>
            <div class="account-name">a.n. AKHMAD SUDAISI</div>
          </div>
          <div class="bank-details">
            <div class="bank-name">Bank Jatim</div>
            <div class="account-number">1456 085 969</div>
            <div class="account-name">a.n. AKHMAD SUDAISI</div>
          </div>
          <div class="bank-details">
            <div class="bank-name">Jago</div>
            <div class="account-number">1052 9512 9701</div>
            <div class="account-name">a.n. AKHMAD SUDAISI</div>
          </div>
        </div>
        
        <div style="margin-top: 3.5rem; border-top: 1px dashed var(--border-color); padding-top: 3rem; text-align: center;">
          <p style="margin-bottom: 2rem; color: var(--text-muted); font-size: 1.1rem; line-height: 1.6;">
            Sudah melakukan transfer? Akun Anda akan aktif otomatis setelah verifikasi oleh tim kami.<br>
            Klik tombol di bawah untuk mengecek status aktivasi secara berkala.
          </p>
          
          <div style="display: flex; flex-direction: column; align-items: center; gap: 1.25rem;">
            <button @click="router.push('/pending-activation')" class="btn btn-primary" style="width: 100%; max-width: 440px; padding: 1.25rem; font-size: 1.15rem; font-weight: 800;">
              <CheckCircle :size="20" /> Cek Status Aktivasi
            </button>
            
            <a href="https://wa.me/6282333017615" target="_blank" class="btn-wa" style="width: 100%; max-width: 440px; justify-content: center; padding: 1.1rem;">
              Konfirmasi Cepat via WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.payment-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-body) 0%, #e2e8f0 100%);
  padding: 4rem 2rem;
}

.payment-card {
  background: white;
  width: 100%;
  max-width: 1000px;
  border-radius: var(--radius-xl);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.1);
  padding: 4rem;
}

.header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 3.5rem;
}

.btn-back {
  background: var(--color-primary-light);
  border: none;
  cursor: pointer;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border-radius: 14px;
  transition: all 0.25s;
}

.btn-back:hover {
  background: var(--color-primary);
  color: white;
  transform: translateX(-4px);
}

h2 {
  margin: 0;
  font-size: 2.25rem;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: -0.03em;
}

.instruction-box {
  background: var(--color-primary-light);
  border: 1px solid rgba(30, 64, 175, 0.1);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  margin-bottom: 3.5rem;
  text-align: center;
}

.instruction-box > p {
  margin: 0 0 2rem 0;
  color: var(--color-primary);
  font-size: 1.15rem;
  font-weight: 600;
}

.bank-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 1rem;
}

.bank-details {
  background: white;
  padding: 1.75rem;
  border-radius: var(--radius-lg);
  text-align: left;
  border: 1px solid var(--border-color);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-sm);
}

.bank-details:hover {
  border-color: var(--color-primary);
  transform: translateY(-5px);
  box-shadow: var(--shadow-lg);
}

.bank-name {
  font-weight: 800;
  color: var(--color-primary);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 0.75rem;
  display: block;
}

.account-number {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-main);
  letter-spacing: 1px;
  margin: 0.5rem 0;
  font-family: var(--font-display);
}

.account-name {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 600;
  margin-top: 0.5rem;
}

.btn-wa {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  background: #128c7e;
  color: white;
  padding: 1rem 2rem;
  border-radius: 12px;
  text-decoration: none;
  font-weight: 750;
  transition: all 0.25s;
  box-shadow: 0 10px 20px rgba(18, 140, 126, 0.15);
  font-size: 0.95rem;
}

.btn-wa:hover {
  background: #075e54;
  transform: translateY(-2px);
  box-shadow: 0 15px 30px rgba(18, 140, 126, 0.25);
}

.payment-form {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.input-group label {
  display: block;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--text-main);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-input {
  width: 100%;
  padding: 1rem 1.25rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 1rem;
  background: var(--bg-body);
  transition: all 0.25s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  background: white;
  box-shadow: 0 0 0 4px var(--color-primary-light);
}

.upload-area {
  position: relative;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-body);
  overflow: hidden;
  transition: all 0.25s;
}

.upload-area:hover {
  border-color: var(--color-primary);
  background: white;
}

.upload-area.has-file {
  border-style: solid;
  border-color: var(--color-primary);
}

.file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 10;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: var(--text-muted);
}

.upload-placeholder span {
  font-weight: 700;
  font-size: 1.1rem;
}

.preview-container {
  width: 100%;
  height: 300px;
  position: relative;
}

.preview-container img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.btn-submit {
  margin-top: 1rem;
  padding: 1.25rem;
  font-size: 1.15rem;
  font-weight: 800;
  border-radius: var(--radius-md);
}

@media (max-width: 900px) {
  .bank-list {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .payment-card {
    padding: 2.5rem 1.5rem;
  }
  .header h2 {
    font-size: 1.5rem;
  }
  .account-number {
    font-size: 1.25rem;
  }
}
</style>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { getAuth, signOut } from "firebase/auth";
import { useAuthStore } from "../stores/auth";
import { useTenantStore } from "../stores/tenant";
import { Clock, LogOut, Mail, CreditCard, Upload } from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();
const tenantStore = useTenantStore();

const schoolName = computed(() => tenantStore.schoolInfo.nama || "Sekolah Anda");
const statusText = computed(() => {
  if (tenantStore.isRejected) return "Pendaftaran Ditolak";
  if (tenantStore.isSuspended) return "Akun Dinonaktifkan";
  return "Menunggu Aktivasi";
});
const statusDesc = computed(() => {
  if (tenantStore.isRejected)
    return "Maaf, pendaftaran sekolah Anda ditolak oleh administrator. Silakan hubungi kami untuk informasi lebih lanjut.";
  if (tenantStore.isSuspended)
  if (tenantStore.isSuspended)
    return "Akun sekolah Anda telah dinonaktifkan. Silakan hubungi administrator platform.";
  if (tenantStore.paymentStatus === 'unpaid')
    return "Silakan selesaikan pembayaran dan unggah bukti transfer untuk mengaktifkan layanan ini.";
  if (tenantStore.paymentStatus === 'pending_verification')
    return "Pembayaran sedang diverifikasi oleh admin. Anda akan mendapat akses penuh setelah disetujui.";
  return "Akun sekolah Anda sedang dalam proses verifikasi oleh administrator. Anda akan mendapat akses penuh setelah dikonfirmasi.";
});

const planName = computed(() => tenantStore.plan === 'pro' ? 'Paket Pro' : 'Paket Basic');
const billingText = computed(() => tenantStore.billingCycle === 'monthly' ? 'Bulanan' : 'Tahunan');
const paymentAmount = computed(() => {
  if (tenantStore.plan === 'basic') {
    return tenantStore.billingCycle === 'monthly' ? 'Rp 55.000' : 'Rp 528.000';
  }
  return tenantStore.billingCycle === 'monthly' ? 'Rp 100.000' : 'Rp 960.000';
});
const needsPayment = computed(() => tenantStore.paymentStatus === 'unpaid');

const handleLogout = async () => {
  const auth = getAuth();
  try {
    await signOut(auth);
    authStore.clearAuth();
    router.push("/login");
  } catch (error) {
    console.error("Logout failed", error);
  }
};
</script>

<template>
  <div class="pending-page">
    <div class="pending-card animate-fade-in">
      <div class="status-icon" :class="{ rejected: tenantStore.isRejected, suspended: tenantStore.isSuspended }">
        <Clock :size="48" />
      </div>

      <h1>{{ statusText }}</h1>
      <h2>{{ schoolName }}</h2>
      <p class="desc">{{ statusDesc }}</p>

      <div class="subscription-info" v-if="tenantStore.plan">
        <div class="info-row">
          <span class="label">Paket Pilihan:</span>
          <span class="value">{{ planName }} ({{ billingText }})</span>
        </div>
        <div class="info-row">
          <span class="label">Total Tagihan:</span>
          <span class="value highlight">{{ paymentAmount }}</span>
        </div>
        <div class="info-row">
          <span class="label">Status:</span>
          <span class="badge" :class="tenantStore.paymentStatus === 'paid' ? 'badge-success' : 'badge-warning'">
            {{ tenantStore.paymentStatus === 'paid' ? 'Lunas' : (tenantStore.paymentStatus === 'pending_verification' ? 'Menunggu Verifikasi' : 'Belum Dibayar') }}
          </span>
        </div>
      </div>

      <div class="info-box">
        <Mail :size="16" />
        <span>Login sebagai: <strong>{{ authStore.user?.email }}</strong></span>
      </div>

      <div class="actions">
        <router-link v-if="needsPayment" to="/konfirmasi-pembayaran" class="btn btn-primary">
          <Upload :size="18" /> Konfirmasi Pembayaran
        </router-link>
        <button @click="handleLogout" class="btn btn-outline">
          <LogOut :size="18" /> Keluar
        </button>
      </div>

      <p class="note">
        Halaman ini akan otomatis terupdate saat administrator mengkonfirmasi akun Anda.
      </p>
    </div>
  </div>
</template>

<style scoped>
.pending-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  padding: 2rem;
}

.pending-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 480px;
  padding: 3rem;
  text-align: center;
}

.status-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fef3c7;
  color: #d97706;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  animation: pulse 2s infinite;
}

.status-icon.rejected {
  background: #fef2f2;
  color: #dc2626;
  animation: none;
}

.status-icon.suspended {
  background: #f1f5f9;
  color: #64748b;
  animation: none;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

h1 {
  font-size: 1.5rem;
  color: #1e293b;
  margin-bottom: 0.25rem;
}

h2 {
  font-size: 1.1rem;
  color: #6366f1;
  margin-bottom: 1rem;
  font-weight: 600;
}

.desc {
  color: #64748b;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.info-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #475569;
  margin-bottom: 1.5rem;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-primary {
  background: #6366f1;
  border: 1px solid #6366f1;
  color: white;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
  text-decoration: none;
}
.btn-primary:hover {
  background: #4f46e5;
}

.subscription-info {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  text-align: left;
}
.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.info-row:last-child {
  margin-bottom: 0;
}
.label {
  color: #64748b;
}
.value {
  font-weight: 600;
  color: #1e293b;
}
.highlight {
  color: #3b82f6;
  font-size: 1rem;
}
.badge {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}
.badge-warning { background: #fef3c7; color: #d97706; }
.badge-success { background: #dcfce7; color: #166534; }

.btn-outline {
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}
.btn-outline:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.note {
  margin-top: 1.5rem;
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
}
</style>

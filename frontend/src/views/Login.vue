<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../stores/auth";
import { School } from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();
const email = ref("");
const password = ref("");
const showPassword = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = "Mohon isi email dan password.";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";

  const auth = getAuth();
  const normalizedEmail = email.value.trim().toLowerCase();

  try {
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password.value);

    // Refresh store profile eagerly, then route by role
    await authStore.fetchUserProfile(credential.user);

    // Cek apakah superadmin
    if (authStore.isSuperAdmin) {
      router.replace("/superadmin");
      return;
    }

    // Cek status tenant
    if (authStore.tenantStatus !== 'active') {
      router.replace("/pending-activation");
      return;
    }

    let target = "/nilai"; // default non-admin
    const userSnap = await getDoc(doc(db, "users", credential.user.uid));
    if (userSnap.exists()) {
      const role = String(userSnap.data()?.role || "").toLowerCase();
      if (role === "admin") {
        target = "/";
      } else if (role.includes("wali")) {
        target = "/rapor";
      }
    }

    router.replace(target);
  } catch (error) {
    console.error("Login Error:", error.code);
    switch (error.code) {
      case "auth/invalid-email":
        errorMessage.value = "Format email tidak valid.";
        break;
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        errorMessage.value = "Email atau password salah.";
        break;
      case "auth/too-many-requests":
        errorMessage.value = "Terlalu banyak percobaan. Coba lagi nanti.";
        break;
      default:
        errorMessage.value = "Terjadi kesalahan sistem. (" + error.code + ")";
    }
  } finally {
    isLoading.value = false;
  }
};

const handleForgotPassword = async () => {
  if (!email.value) {
    errorMessage.value = "Mohon masukkan email Anda terlebih dahulu untuk mereset password.";
    return;
  }
  
  const auth = getAuth();
  try {
    await sendPasswordResetEmail(auth, email.value.trim().toLowerCase());
    alert("Tautan reset password telah dikirim ke email Anda. Silakan cek kotak masuk atau folder spam.");
  } catch (error) {
    console.error("Reset Password Error:", error.code);
    if (error.code === 'auth/user-not-found') {
      errorMessage.value = "Email tersebut tidak terdaftar di sistem kami.";
    } else if (error.code === 'auth/invalid-email') {
      errorMessage.value = "Format email tidak valid.";
    } else {
      errorMessage.value = "Gagal mengirim email reset password. Coba lagi nanti.";
    }
  }
};
</script>

<template>
  <div class="login-wrapper">
    <!-- Left Side: Brand/Visual -->
    <div class="login-visual">
      <div class="visual-content animate-slide-up">
        <div class="brand-logo">
          <div class="logo-icon">S</div>
          <span>SI-RAPOR SMK</span>
        </div>
        <div class="visual-text">
          <h1>
            Redefining <br />
            <span class="text-highlight">Digital Reporting</span>
          </h1>
          <p>
            Platform manajemen penilaian siswa modern, cepat, dan terintegrasi
            untuk masa depan pendidikan yang lebih baik.
          </p>
        </div>

        <div class="feature-pills">
          <div class="pill">🚀 Real-time Grading</div>
          <div class="pill">📄 Auto PDF</div>
          <div class="pill">🔒 Secure Data</div>
        </div>

        <div class="visual-footer">
          <p>© 2026 SIPENA MERDEKA - Si Rapor SMK</p>
        </div>
      </div>
    </div>

    <!-- Right Side: Login Form -->
    <div class="login-form-container">
      <div class="login-card glass-card animate-fade-in">
        <div class="form-header">
          <h2>Welcome Back</h2>
          <p>Sign in to access your dashboard.</p>
        </div>

        <form @submit.prevent="handleLogin">
          <div class="input-group">
            <label for="email" class="input-label">Email Address</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="form-input"
              placeholder="nama@sekolah.sch.id"
              required
            />
          </div>

          <div class="input-group">
            <label for="password" class="input-label">Password</label>
            <div class="password-input-wrap">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="form-input"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                class="toggle-password-btn"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? "Sembunyikan" : "Lihat" }}
              </button>
            </div>
          </div>

          <div v-if="errorMessage" class="alert-error">
            {{ errorMessage }}
          </div>

          <div class="forgot-password-link">
            <button type="button" @click="handleForgotPassword" class="btn-text">
              Lupa Password?
            </button>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-full"
            :disabled="isLoading"
          >
            <span v-if="isLoading">Processing...</span>
            <span v-else>Masuk</span>
          </button>
        </form>

        <div class="register-link">
          <p>Belum punya akun?</p>
          <router-link to="/register" class="register-btn">
            <School :size="16" /> Daftarkan Sekolah Anda
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  display: flex;
  min-height: 100vh;
  width: 100%;
  background-color: var(--bg-body);
}

.login-visual {
  flex: 1.2;
  background: linear-gradient(145deg, var(--color-primary-dark) 0%, #0f172a 100%);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 5rem;
  position: relative;
  overflow: hidden;
}

.login-visual::after {
  content: "";
  position: absolute;
  top: -10%;
  right: -10%;
  width: 40%;
  height: 40%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.visual-content {
  position: relative;
  z-index: 10;
  max-width: 540px;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.75rem;
  font-weight: 700;
  font-family: var(--font-display);
  margin-bottom: 4rem;
  letter-spacing: -0.02em;
}

.logo-icon {
  width: 52px;
  height: 52px;
  background: white;
  color: var(--color-primary-dark);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.visual-text h1 {
  font-size: 4rem;
  line-height: 1.05;
  margin-bottom: 1.5rem;
  color: white;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.text-highlight {
  color: var(--color-accent);
}

.visual-text p {
  font-size: 1.2rem;
  opacity: 0.8;
  line-height: 1.6;
  font-weight: 400;
  margin-bottom: 3rem;
  color: var(--color-primary-light);
}

.feature-pills {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.pill {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  padding: 0.6rem 1.25rem;
  border-radius: 100px;
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
}
.pill:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.visual-footer {
  margin-top: auto;
  padding-top: 5rem;
  opacity: 0.5;
  font-size: 0.85rem;
}

.login-form-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.login-card {
  width: 100%;
  max-width: 440px;
  padding: 3rem;
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-premium);
}

.form-header {
  margin-bottom: 2.5rem;
}

.form-header h2 {
  font-size: 2.25rem;
  margin-bottom: 0.5rem;
  color: var(--text-main);
  letter-spacing: -0.03em;
}

.form-header p {
  color: var(--text-muted);
  font-size: 1.05rem;
}

.password-input-wrap {
  position: relative;
}

.password-input-wrap .form-input {
  padding-right: 6.5rem;
}

.toggle-password-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.75rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.toggle-password-btn:hover {
  background: var(--color-primary);
  color: white;
}

.forgot-password-link {
  text-align: right;
  margin-bottom: 1.5rem;
}
.btn-text {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s;
}
.btn-text:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.btn-full {
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  border-radius: var(--radius-md);
}

.alert-error {
  background: #fff1f2;
  color: var(--color-danger);
  padding: 0.875rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
  border: 1px solid #fecdd3;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.register-link {
  text-align: center;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border-color);
}
.register-link p {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}
.register-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary-light);
  background: var(--color-primary-light);
  transition: all 0.25s;
}
.register-btn:hover {
  background: white;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

@media (max-width: 1024px) {
  .login-visual {
    display: none;
  }
  .login-card {
    padding: 2rem;
    box-shadow: none;
    border: none;
    max-width: 100%;
  }
}
</style>

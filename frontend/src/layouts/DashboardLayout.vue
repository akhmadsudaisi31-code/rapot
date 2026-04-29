<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { getAuth, signOut } from "firebase/auth";
import { useAuthStore } from "../stores/auth";
import { useTenantStore } from "../stores/tenant";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Settings,
  LogOut,
  Menu,
  School,
  Briefcase,
  PenTool,
  ChevronRight,
  User,
  Database,
} from "lucide-vue-next";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const tenantStore = useTenantStore();

const roleName = computed(() => {
  const role = String(authStore.userData?.role || "").toLowerCase();
  if (role.includes("admin")) return "Administrator";
  if (role.includes("wali")) return "Wali Kelas";
  if (role.includes("guru")) return "Guru Mapel";
  return "Staff";
});

const planName = computed(() => {
  return tenantStore.plan === 'pro' ? 'Paket PRO' : 'Paket Basic';
});

const isSidebarOpen = ref(true); // Desktop: Open by default
const isMobileOpen = ref(false); // Mobile: Closed by default

const userEmail = computed(() => authStore.user?.email || "Loading...");
const userInitial = computed(() => authStore.user?.email?.charAt(0).toUpperCase() || "U");
const isAdmin = computed(() => authStore.isAdmin);
const isWaliKelas = computed(() => authStore.isWaliKelas);
const isGuruMapel = computed(() => authStore.isGuruMapel);
const isWaliOnly = computed(() => isWaliKelas.value && !isAdmin.value);
const userName = computed(() => authStore.userName);
const userRole = computed(() => {
  if (authStore.isAdmin) return "Administrator";
  if (authStore.isWaliKelas) return "Wali Kelas";
  if (authStore.isGuruMapel) return "Guru Mapel";
  return "Guru / Staff";
});
// Guru Mapel murni: punya mapel tapi bukan admin dan bukan wali kelas
const isGuruMapelOnly = computed(() => isGuruMapel.value && !isAdmin.value && !isWaliKelas.value);

const handleResize = () => {
  if (window.innerWidth < 1024) {
    isSidebarOpen.value = false;
  } else {
    isSidebarOpen.value = true;
    isMobileOpen.value = false; // Close mobile overlay if resizing back to desktop
  }
};

onMounted(() => {
  handleResize();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

const toggleSidebar = () => {
  if (window.innerWidth < 1024) {
    isMobileOpen.value = !isMobileOpen.value;
  } else {
    isSidebarOpen.value = !isSidebarOpen.value;
  }
};

const closeMobileSidebar = () => {
  isMobileOpen.value = false;
};

const handleLogout = async () => {
  const auth = getAuth();
  try {
    // Clear local state first to trigger UI changes and stop some listeners
    authStore.clearAuth();
    
    // Sign out from Firebase
    await signOut(auth);
    
    // Redirect to login
    router.push("/login");
  } catch (error) {
    console.error("Logout failed", error);
    // Even if it fails, try to redirect
    router.push("/login");
  }
};

const isActive = (path) => route.path === path;

const enforceRootAccess = () => {
  if (route.path !== "/") return;
  if (isAdmin.value) return;

  if (isWaliKelas.value) {
    router.replace("/rapor");
    return;
  }
  if (isGuruMapel.value) {
    router.replace("/nilai");
    return;
  }
  router.replace("/login");
};

watch(
  () => [route.path, isAdmin.value, isWaliKelas.value, isGuruMapel.value, authStore.isInitialized],
  () => {
    if (!authStore.isInitialized) return;
    enforceRootAccess();
  },
  { immediate: true }
);
</script>

<template>
  <div class="dashboard-layout">
    <!-- Mobile Backdrop -->
    <div
      v-if="isMobileOpen"
      class="mobile-backdrop"
      @click="closeMobileSidebar"
    ></div>

    <!-- Sidebar -->
    <aside
      class="sidebar"
      :class="{
        'sidebar-collapsed': !isSidebarOpen,
        'mobile-open': isMobileOpen,
      }"
    >
      <div class="sidebar-header">
        <div class="logo">
          <div class="logo-icon">S</div>
          <span class="logo-text">SI-RAPOR</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <!-- Dashboard: Tersembunyi untuk Guru Mapel Murni -->
        <router-link
          v-if="!isGuruMapelOnly && !isWaliOnly"
          to="/"
          class="nav-item"
          :class="{ active: isActive('/') }"
          @click="closeMobileSidebar"
        >
          <LayoutDashboard :size="20" />
          <span class="nav-label">Dashboard</span>
          <ChevronRight
            v-show="isActive('/')"
            :size="16"
            class="ml-auto opacity-50 chevron-icon"
          />
        </router-link>

        <div class="nav-section-label" v-show="isAdmin">
          MASTER DATA
        </div>

        <router-link
          to="/guru"
          class="nav-item"
          :class="{ active: isActive('/guru') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <Briefcase :size="20" />
          <span class="nav-label">Data Guru</span>
        </router-link>

        <router-link
          to="/kelas"
          class="nav-item"
          :class="{ active: isActive('/kelas') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <School :size="20" />
          <span class="nav-label">Data Kelas</span>
        </router-link>

        <router-link
          to="/siswa"
          class="nav-item"
          :class="{ active: isActive('/siswa') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <Users :size="20" />
          <span class="nav-label">Data Siswa</span>
        </router-link>

        <router-link
          to="/mapel"
          class="nav-item"
          :class="{ active: isActive('/mapel') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <BookOpen :size="20" />
          <span class="nav-label">Mata Pelajaran</span>
        </router-link>

        <div class="nav-section-label">AKADEMIK</div>

        <router-link
          to="/nilai"
          class="nav-item"
          :class="{ active: isActive('/nilai') }"
          v-if="isGuruMapel || isAdmin || isWaliKelas"
          @click="closeMobileSidebar"
        >
          <PenTool :size="20" />
          <span class="nav-label">Input Nilai</span>
        </router-link>

        <router-link
          to="/rapor"
          class="nav-item"
          :class="{ active: isActive('/rapor') }"
          v-if="isWaliKelas || isAdmin"
          @click="closeMobileSidebar"
        >
          <FileText :size="20" />
          <span class="nav-label">Kelola Rapor</span>
        </router-link>

        <router-link
          to="/absensi-siswa"
          class="nav-item"
          :class="{ active: isActive('/absensi-siswa') }"
          v-if="isWaliKelas || isAdmin || isGuruMapel"
          @click="closeMobileSidebar"
        >
          <FileText :size="20" />
          <span class="nav-label">Absensi Siswa</span>
        </router-link>

        <router-link
          to="/daftar-nilai"
          class="nav-item"
          :class="{ active: isActive('/daftar-nilai') }"
          v-if="isWaliKelas || isAdmin"
          @click="closeMobileSidebar"
        >
          <BookOpen :size="20" />
          <span class="nav-label">Daftar Nilai</span>
        </router-link>

        <router-link
          to="/leger"
          class="nav-item"
          :class="{ active: isActive('/leger') }"
          v-if="(isWaliKelas || isAdmin) && tenantStore.plan === 'pro'"
          @click="closeMobileSidebar"
        >
          <BookOpen :size="20" />
          <span class="nav-label">Leger Nilai</span>
          <span class="badge badge-pro">PRO</span>
        </router-link>

        <div class="nav-spacer"></div>
        <div class="nav-divider" v-if="isAdmin"></div>

        <router-link
          to="/maintenance"
          class="nav-item"
          :class="{ active: isActive('/maintenance') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <Database :size="20" />
          <span class="nav-label">Pemeliharaan</span>
        </router-link>

        <router-link
          to="/pengaturan"
          class="nav-item"
          :class="{ active: isActive('/pengaturan') }"
          v-if="isAdmin"
          @click="closeMobileSidebar"
        >
          <Settings :size="20" />
          <span class="nav-label">Pengaturan</span>
        </router-link>

      </nav>

      <div class="sidebar-footer">
        <div class="user-info-card" v-show="isSidebarOpen || isMobileOpen">
          <div class="user-main">
            <div class="avatar-sm">{{ userInitial }}</div>
            <div class="user-details">
              <span class="user-name">{{ authStore.user?.displayName || 'User' }}</span>
              <span class="user-role">{{ roleName }}</span>
            </div>
          </div>
          <div class="plan-badge-container">
            <span class="plan-badge" :class="'plan-' + (tenantStore.plan || 'basic')">
              {{ planName }}
            </span>
          </div>
        </div>
        <button @click="handleLogout" class="nav-item btn-logout">
          <LogOut :size="20" />
          <span class="nav-label">Keluar</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content" :class="{ 'content-expanded': !isSidebarOpen }">
      <header class="topbar glass-panel">
        <div class="topbar-left">
          <button @click="toggleSidebar" class="btn-icon" aria-label="Buka atau tutup sidebar">
            <Menu :size="24" />
          </button>
          <div class="breadcrumb">
            <span class="text-muted">App</span>
            <span class="separator">/</span>
            <h2 class="page-title">{{ route.name || "Dashboard" }}</h2>
          </div>
        </div>
        <div class="topbar-right">
          <div class="user-profile">
            <div class="avatar">
              <span v-if="userInitial">{{ userInitial }}</span>
              <User v-else :size="18" />
            </div>
            <div class="user-info hidden-mobile">
              <span class="name">{{ userName }}</span>
              <span class="role">{{ userRole }}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="content-area container">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-body);
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: var(--color-primary-dark);
  border-right: none;
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
}

.sidebar-collapsed {
  width: 80px;
}

.sidebar-header {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 700;
  font-family: var(--font-display);
  color: white;
  font-size: 1.25rem;
}

.logo-icon {
  width: 36px;
  height: 36px;
  background: white;
  color: var(--color-primary-dark);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.sidebar-nav {
  padding: 2rem 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
}

.nav-section-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
  margin: 1.5rem 0 0.5rem 1rem;
  letter-spacing: 0.1em;
}

.sidebar-collapsed:not(.mobile-open) .nav-item {
  justify-content: center;
  padding: 0.75rem 0;
}
.sidebar-collapsed:not(.mobile-open) .logo-text,
.sidebar-collapsed:not(.mobile-open) .nav-section-label,
.sidebar-collapsed:not(.mobile-open) .nav-label,
.sidebar-collapsed:not(.mobile-open) .chevron-icon {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1rem;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
  white-space: nowrap;
  font-weight: 500;
  position: relative;
}

.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-info-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-lg);
  padding: 1rem;
  margin-bottom: 0.5rem;
}

.user-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.avatar-sm {
  width: 32px;
  height: 32px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-name {
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
}

.plan-badge-container {
  display: flex;
}

.plan-badge {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.plan-basic {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.plan-pro {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.btn-logout {
  width: 100%;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
  transform: translateX(4px);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.nav-item.active::after {
  content: '';
  position: absolute;
  right: 1rem;
  width: 6px;
  height: 6px;
  background: var(--color-accent);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--color-accent);
}

.ml-auto {
  margin-left: auto;
}
.nav-spacer {
  flex: 1;
}

.nav-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
  margin: 1rem 0;
}

.btn-logout {
  width: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #fb7185; /* Rose 400 */
  justify-content: flex-start;
  margin-top: auto;
}
.sidebar-collapsed .btn-logout {
  justify-content: center;
}

.btn-logout:hover {
  background: rgba(251, 113, 133, 0.1);
}

/* Main Content */
.main-content {
  flex: 1;
  margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  min-height: 100vh;
}

.content-expanded {
  margin-left: 80px;
}

/* Sticky Header with Glassmorphism */
.topbar {
  height: 80px;
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2.5rem;
  background: rgba(248, 250, 252, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
}
.separator {
  color: var(--text-muted);
  opacity: 0.3;
}

.page-title {
  font-size: 1.25rem;
  margin: 0;
  font-weight: 700;
  color: var(--text-main);
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
  border-radius: 100px;
  background: white;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.avatar {
  width: 36px;
  height: 36px;
  background: var(--color-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  padding-right: 0.75rem;
}
.user-info .name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
}
.user-info .role {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 500;
}

.content-area {
  padding: 2.5rem;
}

/* Route Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Mobile Responsive */
@media (max-width: 1024px) {
  .sidebar {
    position: fixed;
    transform: translateX(-100%);
    width: 280px;
    box-shadow: 8px 0 32px rgba(0, 0, 0, 0.15);
  }

  .sidebar-collapsed {
    width: 280px;
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 0 !important;
  }

  .content-expanded {
    margin-left: 0;
  }

  .mobile-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 45;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .topbar {
    padding: 0 1.5rem;
  }

  .hidden-mobile {
    display: none;
  }
  .content-area {
    padding: 1.5rem;
  }
}
</style>

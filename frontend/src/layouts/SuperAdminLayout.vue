<script setup>
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { getAuth, signOut } from "firebase/auth";
import { useAuthStore } from "../stores/auth";
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Menu,
  Shield,
  X,
} from "lucide-vue-next";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isMobileOpen = ref(false);

const menuItems = [
  { path: "/superadmin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/superadmin/tenants", label: "Kelola Sekolah", icon: Building2 },
];

const isActive = (path) => route.path === path;

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
  <div class="sa-layout">
    <!-- Mobile Header -->
    <div class="sa-mobile-header">
      <button @click="isMobileOpen = !isMobileOpen" class="burger-btn">
        <Menu :size="24" />
      </button>
      <span class="sa-title"><Shield :size="18" /> Super Admin</span>
    </div>

    <!-- Sidebar -->
    <aside class="sa-sidebar" :class="{ open: isMobileOpen }">
      <div class="sa-sidebar-header">
        <div class="sa-logo">
          <Shield :size="24" />
          <span>SI-RAPOR Admin</span>
        </div>
        <button class="close-btn" @click="isMobileOpen = false">
          <X :size="20" />
        </button>
      </div>

      <nav class="sa-nav">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="sa-nav-item"
          :class="{ active: isActive(item.path) }"
          @click="isMobileOpen = false"
        >
          <component :is="item.icon" :size="20" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sa-sidebar-footer">
        <div class="sa-user-info">
          <div class="sa-user-avatar">SA</div>
          <div class="sa-user-text">
            <span class="sa-user-name">{{ authStore.userName }}</span>
            <span class="sa-user-role">Super Admin</span>
          </div>
        </div>
        <button @click="handleLogout" class="sa-logout-btn">
          <LogOut :size="18" /> Keluar
        </button>
      </div>
    </aside>

    <!-- Backdrop -->
    <div v-if="isMobileOpen" class="sa-backdrop" @click="isMobileOpen = false"></div>

    <!-- Main Content -->
    <main class="sa-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.sa-layout {
  display: flex;
  min-height: 100vh;
  background: #f8fafc;
}

.sa-mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: #1e1b4b;
  color: white;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  z-index: 100;
}

.burger-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0.25rem;
}

.sa-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.sa-sidebar {
  width: 260px;
  background: #1e1b4b;
  color: white;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
}

.sa-sidebar-header {
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.close-btn {
  display: none;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
}

.sa-logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 700;
  font-size: 1.1rem;
}

.sa-nav {
  flex: 1;
  padding: 0 0.75rem;
}

.sa-nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #c7d2fe;
  text-decoration: none;
  font-weight: 500;
  margin-bottom: 0.25rem;
  transition: all 0.2s;
}

.sa-nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.sa-nav-item.active {
  background: #4338ca;
  color: white;
}

.sa-sidebar-footer {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sa-user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.sa-user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #4338ca;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.sa-user-text {
  display: flex;
  flex-direction: column;
}

.sa-user-name {
  font-weight: 600;
  font-size: 0.85rem;
}

.sa-user-role {
  font-size: 0.75rem;
  color: #a5b4fc;
}

.sa-logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #c7d2fe;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.sa-logout-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}

.sa-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 150;
}

.sa-main {
  flex: 1;
  margin-left: 260px;
  padding: 2rem;
}

@media (max-width: 768px) {
  .sa-mobile-header {
    display: flex;
  }
  .sa-sidebar {
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }
  .sa-sidebar.open {
    transform: translateX(0);
  }
  .close-btn {
    display: block;
  }
  .sa-backdrop {
    display: block;
  }
  .sa-main {
    margin-left: 0;
    padding: 1rem;
    padding-top: 72px;
  }
}
</style>

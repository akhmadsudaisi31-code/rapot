<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Users, FileText, CheckCircle, AlertCircle } from "lucide-vue-next";
import { collection, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { tenantCol } from "../utils/tenantDb";
import { onAuthStateChanged } from "firebase/auth";
import { useAuthStore } from "../stores/auth";
import { useTenantStore } from "../stores/tenant";

const router = useRouter();
const authStore = useAuthStore();
const tenantStore = useTenantStore();

const userName = ref("Admin");
const greeting = ref("Selamat Pagi");

const stats = ref([
  {
    label: "Total Siswa",
    value: "...",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  {
    label: "Nilai Masuk",
    value: "...",
    icon: FileText,
    color: "text-green-600",
    bg: "bg-green-100",
  },
  {
    label: "Sudah Validasi",
    value: "...",
    icon: CheckCircle,
    color: "text-purple-600",
    bg: "bg-purple-100",
  },
  {
    label: "Belum Lengkap",
    value: "...",
    icon: AlertCircle,
    color: "text-orange-600",
    bg: "bg-orange-100",
  },
]);

const updateTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) greeting.value = "Selamat Pagi";
  else if (hour < 15) greeting.value = "Selamat Siang";
  else if (hour < 18) greeting.value = "Selamat Sore";
  else greeting.value = "Selamat Malam";
};

onMounted(async () => {
  if (!authStore.isInitialized) {
    await authStore.initAuth();
  }

  // Hard lock at page level: dashboard content only for admin.
  if (!authStore.isAdmin) {
    if (authStore.isWaliKelas) {
      router.replace("/rapor");
    } else if (authStore.isGuruMapel) {
      router.replace("/nilai");
    } else {
      router.replace("/login");
    }
    return;
  }

  updateTimeGreeting();
  
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userName.value = user.displayName || user.email?.split('@')[0] || "User";
    }
  });

  try {
    // Parallel Fetch
    const [stdSnap, gradeSnap, subjectSnap] = await Promise.all([
      getDocs(tenantCol("students")),
      getDocs(tenantCol("grades")),
      getDocs(tenantCol("subjects"))
    ]);

    const totalStudents = stdSnap.size;
    const totalGrades = gradeSnap.size;
    const totalSubjects = subjectSnap.size;

    // Approximate 'Sudah Validasi' as 'Lulus' (na >= 75)
    // We iterate grades to count
    let validatedCount = 0;
    gradeSnap.forEach(doc => {
        if (doc.data().na >= 75) validatedCount++;
    });

    // Approximate 'Belum Lengkap'
    // Total Expected Grades = Total Students * Total Subjects (Ideal)
    // Note: This is a rough estimation for the dashboard
    const expectedGrades = totalStudents * totalSubjects;
    const remaining = Math.max(0, expectedGrades - totalGrades);

    stats.value[0].value = totalStudents.toString();
    stats.value[1].value = totalGrades.toString();
    stats.value[2].value = validatedCount.toString();
    stats.value[3].value = remaining.toString();

  } catch (e) {
    console.error("Error loading dashboard stats", e);
    stats.value.forEach(s => s.value = "0");
  }
});

const navigateTo = (path) => {
  router.push(path);
};

const handleProAction = (path) => {
  if (tenantStore.plan === 'pro') {
    router.push(path);
  } else {
    alert("Fitur ini hanya tersedia untuk paket PRO. Silakan upgrade paket Anda untuk menikmati fitur Leger Nilai & Ranking Otomatis.");
  }
};
</script>

<template>
  <div v-if="authStore.isAdmin" class="dashboard-home animate-fade-in">
    <div class="welcome-banner">
      <h1>{{ greeting }}, {{ userName }}! 👋</h1>
      <p>Berikut adalah ringkasan aktivitas akademik SMK hari ini.</p>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid grid-stats">
      <div v-for="(stat, index) in stats" :key="index" class="card stat-card">
        <div class="stat-icon" :class="stat.bg">
          <component :is="stat.icon" :class="stat.color" :size="24" />
        </div>
        <div class="stat-info">
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="section-title">
      <h3>Aksi Cepat</h3>
    </div>
    <div class="actions-grid grid-actions">
      <div class="card action-card" @click="navigateTo('/nilai')">
        <h4>Input Nilai Massal</h4>
        <p>Kelola nilai harian & ujian</p>
      </div>
      <div class="card action-card" @click="navigateTo('/rapor')">
        <h4>Cetak Rapor</h4>
        <p>Generate PDF semester ini</p>
      </div>
      <div class="card action-card" :class="{ 'locked': tenantStore.plan !== 'pro' }" @click="handleProAction('/leger')">
        <div class="action-header">
          <h4>Leger Nilai</h4>
          <span v-if="tenantStore.plan !== 'pro'" class="pro-badge">PRO</span>
        </div>
        <p>Rekap nilai seluruh mapel</p>
      </div>
      <div class="card action-card" @click="navigateTo('/siswa')">
        <h4>Data Siswa</h4>
        <p>Tambah/Edit data siswa</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-home {
  max-width: 1200px;
  margin: 0 auto;
}

.welcome-banner {
  margin-bottom: 3rem;
  background: white;
  padding: 2.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

.welcome-banner::after {
  content: '';
  position: absolute;
  top: -20%;
  right: -5%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, var(--color-primary-light) 0%, transparent 70%);
  border-radius: 50%;
  opacity: 0.5;
}

.welcome-banner h1 {
  font-size: 2.25rem;
  margin-bottom: 0.75rem;
  color: var(--text-main);
  letter-spacing: -0.02em;
}

.welcome-banner p {
  color: var(--text-muted);
  font-size: 1.1rem;
  max-width: 600px;
}

.stats-grid {
  display: grid;
  gap: 1.5rem;
  margin-bottom: 4rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.75rem;
  background: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-premium);
  border-color: var(--color-primary);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.stat-card:hover .stat-icon {
  transform: scale(1.1);
}

.bg-blue-100 { background: #eff6ff; }
.text-blue-600 { color: #1e40af; }
.bg-green-100 { background: #ecfdf5; }
.text-green-600 { color: #059669; }
.bg-purple-100 { background: #f5f3ff; }
.text-purple-600 { color: #7c3aed; }
.bg-orange-100 { background: #fff7ed; }
.text-orange-600 { color: #d97706; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.85rem;
  font-weight: 800;
  font-family: var(--font-display);
  line-height: 1;
  color: var(--text-main);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-title {
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.section-title h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-main);
}
.section-title::before {
  content: '';
  width: 4px;
  height: 24px;
  background: var(--color-accent);
  border-radius: 4px;
}

.actions-grid {
  display: grid;
  gap: 1.5rem;
}

.action-card {
  cursor: pointer;
  background: white;
  padding: 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  transition: all 0.25s;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-card:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(30, 64, 175, 0.2);
}

.action-card h4 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-main);
  font-weight: 700;
  transition: color 0.2s;
}

.action-card p {
  font-size: 0.95rem;
  color: var(--text-muted);
  margin: 0;
  transition: color 0.2s;
}

.action-card:hover h4,
.action-card:hover p {
  color: white;
}
.action-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
}

.pro-badge {
  background: var(--color-accent);
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

.action-card.locked {
  opacity: 0.7;
  cursor: pointer;
  border-left: 4px solid var(--color-accent);
}

.action-card.locked:hover {
  background: #f8fafc;
  transform: none;
  box-shadow: none;
}
</style>

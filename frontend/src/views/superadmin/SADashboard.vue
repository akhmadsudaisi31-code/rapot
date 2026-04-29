<script setup>
import { ref, onMounted } from "vue";
import { collection, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { Building2, UserCheck, Clock, XCircle, Database } from "lucide-vue-next";

const stats = ref({
  total: 0,
  active: 0,
  pending: 0,
  rejected: 0,
});
const isLoading = ref(true);
const recentTenants = ref([]);
const isMigrating = ref(false);
const migrateLog = ref("");

const fetchTenants = async () => {
  try {
    const snap = await getDocs(collection(db, "tenants"));
    const tenants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    stats.value.total = tenants.length;
    stats.value.active = tenants.filter((t) => t.status === "active").length;
    stats.value.pending = tenants.filter((t) => t.status === "pending").length;
    stats.value.rejected = tenants.filter(
      (t) => t.status === "rejected" || t.status === "suspended"
    ).length;

    recentTenants.value = tenants
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 5);
  } catch (e) {
    console.error("Error loading SA dashboard:", e);
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchTenants);

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const statusLabel = (s) => {
  if (s === "active") return "Aktif";
  if (s === "pending") return "Menunggu";
  if (s === "rejected") return "Ditolak";
  if (s === "suspended") return "Nonaktif";
  return s;
};

const migrateLegacyData = async () => {
  if (!confirm('Apakah Anda yakin ingin memigrasikan semua data sekolah lama (single-tenant) ke dalam Tenant khusus (Legacy)?')) return;
  
  isMigrating.value = true
  migrateLog.value = 'Memulai migrasi data...\n'
  try {
    const usersSnap = await getDocs(collection(db, 'users'))
    const legacyAdmins = []
    usersSnap.forEach(d => {
      const data = d.data()
      if (data.role === 'admin' && !data.tenantId) {
        legacyAdmins.push({ id: d.id, ...data })
      }
    })

    const legacyTenantId = legacyAdmins.length > 0 ? legacyAdmins[0].id : 'legacy-school-1'
    migrateLog.value += `Mempersiapkan Tenant ID: ${legacyTenantId}\n`

    await updateDoc(doc(db, 'tenants', legacyTenantId), {
      ownerUid: legacyTenantId,
      status: 'active',
      plan: 'pro',
      schoolInfo: {
        nama: 'Sekolah Migrasi (Legacy)',
        email: legacyAdmins.length > 0 ? legacyAdmins[0].email : 'legacy@sekolah.id',
      }
    }).catch(async () => {
      await setDoc(doc(db, 'tenants', legacyTenantId), {
        ownerUid: legacyTenantId,
        status: 'active',
        plan: 'pro',
        createdAt: new Date().toISOString(),
        schoolInfo: {
          nama: 'Sekolah Migrasi (Legacy)',
          email: legacyAdmins.length > 0 ? legacyAdmins[0].email : 'legacy@sekolah.id',
        }
      })
    })

    let countUsers = 0
    for (const d of usersSnap.docs) {
      const data = d.data()
      if (!data.tenantId && data.role !== 'superadmin' && d.id !== 'superadmin') {
        await updateDoc(doc(db, 'users', d.id), { tenantId: legacyTenantId, tenantStatus: 'active' })
        countUsers++
      }
    }
    migrateLog.value += `Berhasil menghubungkan ${countUsers} user lama ke tenant.\n`

    const collectionsToMove = ['classes', 'subjects', 'students', 'grades', 'student_rapor_content']
    for (const col of collectionsToMove) {
      migrateLog.value += `Memigrasikan koleksi ${col}...\n`
      const snap = await getDocs(collection(db, col))
      let count = 0
      for (const d of snap.docs) {
        await setDoc(doc(db, `tenants/${legacyTenantId}/${col}`, d.id), d.data())
        count++
      }
      migrateLog.value += `- ${count} dokumen dipindahkan.\n`
    }

    migrateLog.value += `Memigrasikan pengaturan sekolah...\n`
    const settingsSnap = await getDocs(collection(db, 'settings'))
    for (const d of settingsSnap.docs) {
      await setDoc(doc(db, `tenants/${legacyTenantId}/settings`, d.id), d.data())
    }

    migrateLog.value += `\nMIGRASI SELESAI!`
    alert('Migrasi berhasil!')
    fetchTenants()
  } catch (e) {
    console.error(e)
    migrateLog.value += `\nError: ${e.message}`
  } finally {
    isMigrating.value = false
  }
}
</script>

<template>
  <div class="sa-dashboard">
    <div class="sa-page-header">
      <h1>Dashboard Super Admin</h1>
      <p>Ringkasan seluruh tenant di platform SI-RAPOR</p>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon bg-blue"><Building2 :size="24" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.total }}</span>
            <span class="stat-label">Total Sekolah</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon bg-green"><UserCheck :size="24" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.active }}</span>
            <span class="stat-label">Aktif</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon bg-amber"><Clock :size="24" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.pending }}</span>
            <span class="stat-label">Menunggu Aktivasi</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon bg-red"><XCircle :size="24" /></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.rejected }}</span>
            <span class="stat-label">Ditolak / Nonaktif</span>
          </div>
        </div>
      </div>

      <div class="migration-banner">
        <div class="banner-content">
          <div class="banner-icon"><Database :size="24" /></div>
          <div>
            <h3>Migrasi Data Sekolah Lama</h3>
            <p>Pindahkan data aplikasi sebelum update ke dalam Tenant Terisolasi.</p>
          </div>
        </div>
        <button @click="migrateLegacyData" :disabled="isMigrating" class="btn btn-warning">
          {{ isMigrating ? 'Memproses...' : 'Mulai Migrasi' }}
        </button>
      </div>
      <div v-if="migrateLog" class="migration-log">
        <pre>{{ migrateLog }}</pre>
      </div>

      <div class="card">
        <h3>Pendaftaran Terbaru</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nama Sekolah</th>
                <th>Status</th>
                <th>Tanggal Daftar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="recentTenants.length === 0">
                <td colspan="3" class="empty-state">Belum ada pendaftaran.</td>
              </tr>
              <tr v-for="t in recentTenants" :key="t.id">
                <td class="font-medium">{{ t.schoolInfo?.nama || "—" }}</td>
                <td>
                  <span
                    class="badge"
                    :class="{
                      'badge-green': t.status === 'active',
                      'badge-amber': t.status === 'pending',
                      'badge-red': t.status === 'rejected' || t.status === 'suspended',
                    }"
                  >
                    {{ statusLabel(t.status) }}
                  </span>
                </td>
                <td class="text-muted">{{ formatDate(t.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sa-page-header { margin-bottom: 2rem; }
.sa-page-header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.sa-page-header p { color: #64748b; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; display: flex; align-items: center; gap: 1rem; }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; }
.bg-blue { background: #3b82f6; }
.bg-green { background: #22c55e; }
.bg-amber { background: #f59e0b; }
.bg-red { background: #ef4444; }
.stat-info { display: flex; flex-direction: column; }
.stat-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 0.8rem; color: #64748b; }
.card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; }
.card h3 { margin: 0 0 1rem; font-size: 1.1rem; }
.table-responsive { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
.data-table th { font-size: 0.8rem; color: #64748b; font-weight: 600; text-transform: uppercase; }
.font-medium { font-weight: 600; }
.text-muted { color: #64748b; }
.empty-state { text-align: center; padding: 2rem; color: #94a3b8; }
.badge { padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-amber { background: #fef3c7; color: #92400e; }
.badge-red { background: #fef2f2; color: #991b1b; }

.migration-banner { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; }
.banner-content { display: flex; align-items: center; gap: 1rem; }
.banner-icon { background: white; padding: 0.75rem; border-radius: 50%; color: #d97706; }
.banner-content h3 { color: #92400e; margin: 0 0 0.25rem; }
.banner-content p { color: #b45309; font-size: 0.9rem; margin: 0; }
.btn-warning { background: #d97706; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; }
.btn-warning:disabled { opacity: 0.6; cursor: not-allowed; }
.migration-log { background: #1e293b; color: #10b981; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; font-family: monospace; font-size: 0.85rem; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
</style>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Building2,
  Check,
  X,
  Trash2,
  Eye,
  Search,
  Pause,
  Play,
  Edit,
  LogIn,
  FileText
} from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();

const tenants = ref([]);
const isLoading = ref(true);
const searchQuery = ref("");
const filterStatus = ref("all");
const actionLoading = ref(null); // tenant id being acted upon
const editingTenant = ref(null);

onMounted(async () => {
  await loadTenants();
});

const loadTenants = async () => {
  isLoading.value = true;
  try {
    const snap = await getDocs(
      query(collection(db, "tenants"), orderBy("createdAt", "desc"))
    );
    tenants.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error loading tenants:", e);
  } finally {
    isLoading.value = false;
  }
};

const filteredTenants = computed(() => {
  let list = tenants.value;
  if (filterStatus.value !== "all") {
    list = list.filter((t) => t.status === filterStatus.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (t) =>
        (t.schoolInfo?.nama || "").toLowerCase().includes(q) ||
        (t.schoolInfo?.email || "").toLowerCase().includes(q) ||
        (t.schoolInfo?.npsn || "").includes(q)
    );
  }
  return list;
});

const pendingCount = computed(
  () => tenants.value.filter((t) => t.status === "pending").length
);

const updateStatus = async (tenantId, newStatus) => {
  if (!confirm(`Ubah status tenant menjadi "${newStatus}"?`)) return;
  actionLoading.value = tenantId;
  try {
    const payload = {
      status: newStatus,
      [`${newStatus}At`]: new Date().toISOString(),
    };
    if (newStatus === "active") {
      payload.paymentStatus = "paid";
    }

    await updateDoc(doc(db, "tenants", tenantId), payload);

    // Update juga status di users collection (owner)
    const tenant = tenants.value.find((t) => t.id === tenantId);
    if (tenant?.ownerUid) {
      await updateDoc(doc(db, "users", tenant.ownerUid), {
        tenantStatus: newStatus,
      });
    }

    // Refresh list
    const idx = tenants.value.findIndex((t) => t.id === tenantId);
    if (idx >= 0) {
      tenants.value[idx].status = newStatus;
      if (newStatus === "active") tenants.value[idx].paymentStatus = "paid";
    }
  } catch (e) {
    console.error("Error updating tenant status:", e);
    alert("Gagal mengubah status: " + e.message);
  } finally {
    actionLoading.value = null;
  }
};

const deleteTenant = async (tenantId) => {
  if (
    !confirm(
      "HAPUS tenant ini? Semua data sekolah akan hilang permanen. Lanjutkan?"
    )
  )
    return;
  if (!confirm("Anda YAKIN? Tindakan ini TIDAK BISA dibatalkan.")) return;

  actionLoading.value = tenantId;
  try {
    await deleteDoc(doc(db, "tenants", tenantId));
    tenants.value = tenants.value.filter((t) => t.id !== tenantId);
  } catch (e) {
    console.error("Error deleting tenant:", e);
    alert("Gagal menghapus: " + e.message);
  } finally {
    actionLoading.value = null;
  }
};

const formatDate = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (s) => {
  if (s === "active") return "Aktif";
  if (s === "pending") return "Menunggu";
  if (s === "rejected") return "Ditolak";
  if (s === "suspended") return "Nonaktif";
  return s;
};

const planLabel = (p) => {
  if (p === "pro") return "PRO";
  return "FREE";
};

const handleImpersonate = async (tenant) => {
  const name = tenant.schoolInfo?.nama || tenant.id;
  if (!confirm(`Login sebagai Admin di ${name}?`)) return;
  
  actionLoading.value = tenant.id;
  try {
    const success = await authStore.impersonateTenant(tenant.id, name);
    if (success) {
      router.push('/');
    } else {
      alert("Gagal impersonate. Anda bukan Super Admin.");
    }
  } finally {
    actionLoading.value = null;
  }
};

const openEdit = (tenant) => {
  editingTenant.value = JSON.parse(JSON.stringify(tenant));
  if (!editingTenant.value.schoolInfo) editingTenant.value.schoolInfo = {};
};

const saveEdit = async () => {
  if (!editingTenant.value) return;
  actionLoading.value = editingTenant.value.id;
  try {
    const payload = {
      plan: editingTenant.value.plan,
      billingCycle: editingTenant.value.billingCycle || 'yearly',
      paymentStatus: editingTenant.value.paymentStatus || 'unpaid',
      status: editingTenant.value.status,
      "schoolInfo.nama": editingTenant.value.schoolInfo.nama || '',
    };
    await updateDoc(doc(db, "tenants", editingTenant.value.id), payload);
    
    if (editingTenant.value.ownerUid) {
      await updateDoc(doc(db, "users", editingTenant.value.ownerUid), {
        tenantStatus: editingTenant.value.status,
      });
    }

    const idx = tenants.value.findIndex((t) => t.id === editingTenant.value.id);
    if (idx >= 0) {
      tenants.value[idx] = { ...tenants.value[idx], ...editingTenant.value };
    }
    editingTenant.value = null;
  } catch (e) {
    alert("Gagal menyimpan: " + e.message);
  } finally {
    actionLoading.value = null;
  }
};
</script>

<template>
  <div class="tenant-list-page">
    <div class="sa-page-header">
      <div>
        <h1>Kelola Sekolah</h1>
        <p>
          {{ tenants.length }} sekolah terdaftar
          <span v-if="pendingCount > 0" class="pending-badge">
            {{ pendingCount }} menunggu aktivasi
          </span>
        </p>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="search-box">
        <Search :size="18" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari nama sekolah, email, NPSN..."
          class="form-input"
        />
      </div>
      <div class="filter-tabs">
        <button
          v-for="tab in [
            { value: 'all', label: 'Semua' },
            { value: 'pending', label: 'Menunggu' },
            { value: 'active', label: 'Aktif' },
            { value: 'rejected', label: 'Ditolak' },
            { value: 'suspended', label: 'Nonaktif' },
          ]"
          :key="tab.value"
          class="tab-btn"
          :class="{ active: filterStatus === tab.value }"
          @click="filterStatus = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <!-- Table -->
    <div v-else class="card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Sekolah</th>
              <th>NPSN</th>
              <th>Status</th>
              <th>Pembayaran</th>
              <th>Paket</th>
              <th>Tanggal Daftar</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredTenants.length === 0">
              <td colspan="6" class="empty-state">
                <Building2 :size="40" style="opacity: 0.3" />
                <p>Tidak ada data yang cocok.</p>
              </td>
            </tr>
            <tr v-for="t in filteredTenants" :key="t.id">
              <td>
                <div class="school-cell">
                  <div class="school-name">{{ t.schoolInfo?.nama || "—" }}</div>
                  <div class="school-email">{{ t.schoolInfo?.email || "" }}</div>
                </div>
              </td>
              <td class="text-muted">{{ t.schoolInfo?.npsn || "-" }}</td>
              <td>
                <span
                  class="badge"
                  :class="{
                    'badge-green': t.status === 'active',
                    'badge-amber': t.status === 'pending',
                    'badge-red':
                      t.status === 'rejected' || t.status === 'suspended',
                  }"
                >
                  {{ statusLabel(t.status) }}
                </span>
              </td>
              <td>
                <div v-if="t.paymentStatus === 'pending_verification'" style="display:flex; flex-direction:column; gap:4px;">
                  <span class="badge badge-amber">Menunggu Verifikasi</span>
                  <a v-if="t.paymentDetails?.buktiUrl" :href="t.paymentDetails.buktiUrl" target="_blank" class="text-sm" style="color:#3b82f6; display:flex; align-items:center; gap:2px;"><FileText :size="12" /> Bukti</a>
                </div>
                <span v-else-if="t.paymentStatus === 'paid'" class="badge badge-green">Lunas</span>
                <span v-else class="badge badge-gray">Belum Lunas</span>
              </td>
              <td>
                <span
                  class="badge"
                  :class="{
                    'badge-purple': t.plan === 'pro',
                    'badge-gray': t.plan !== 'pro',
                  }"
                >
                  {{ planLabel(t.plan) }}
                </span>
                <div v-if="t.billingCycle" class="text-xs text-muted" style="margin-top:2px;">{{ t.billingCycle === 'monthly' ? 'Bulanan' : 'Tahunan' }}</div>
              </td>
              <td class="text-muted text-sm">{{ formatDate(t.createdAt) }}</td>
              <td>
                <div class="action-btns">
                  <!-- Impersonate -->
                  <button
                    class="btn-icon" style="color: #6366f1"
                    title="Login Sebagai"
                    :disabled="actionLoading === t.id"
                    @click="handleImpersonate(t)"
                  >
                    <LogIn :size="16" />
                  </button>

                  <!-- Edit -->
                  <button
                    class="btn-icon" style="color: #64748b"
                    title="Edit Data"
                    :disabled="actionLoading === t.id"
                    @click="openEdit(t)"
                  >
                    <Edit :size="16" />
                  </button>

                  <!-- Approve -->
                  <button
                    v-if="t.status === 'pending'"
                    class="btn-icon success"
                    title="Aktifkan"
                    :disabled="actionLoading === t.id"
                    @click="updateStatus(t.id, 'active')"
                  >
                    <Check :size="16" />
                  </button>

                  <!-- Reject -->
                  <button
                    v-if="t.status === 'pending'"
                    class="btn-icon danger"
                    title="Tolak"
                    :disabled="actionLoading === t.id"
                    @click="updateStatus(t.id, 'rejected')"
                  >
                    <X :size="16" />
                  </button>

                  <!-- Suspend -->
                  <button
                    v-if="t.status === 'active'"
                    class="btn-icon warning"
                    title="Nonaktifkan"
                    :disabled="actionLoading === t.id"
                    @click="updateStatus(t.id, 'suspended')"
                  >
                    <Pause :size="16" />
                  </button>

                  <!-- Reactivate -->
                  <button
                    v-if="
                      t.status === 'suspended' || t.status === 'rejected'
                    "
                    class="btn-icon success"
                    title="Aktifkan Kembali"
                    :disabled="actionLoading === t.id"
                    @click="updateStatus(t.id, 'active')"
                  >
                    <Play :size="16" />
                  </button>

                  <!-- Delete -->
                  <button
                    class="btn-icon danger"
                    title="Hapus Permanen"
                    :disabled="actionLoading === t.id"
                    @click="deleteTenant(t.id)"
                  >
                    <Trash2 :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editingTenant" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Edit Sekolah</h3>
          <button class="btn-close" @click="editingTenant = null"><X :size="18" /></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nama Sekolah</label>
            <input v-model="editingTenant.schoolInfo.nama" class="form-input" />
          </div>
          <div class="form-group">
            <label>Status Akun</label>
            <select v-model="editingTenant.status" class="form-input">
              <option value="pending">Menunggu Aktivasi (Pending)</option>
              <option value="active">Aktif</option>
              <option value="suspended">Nonaktif (Suspended)</option>
              <option value="rejected">Ditolak (Rejected)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Paket Langganan</label>
            <select v-model="editingTenant.plan" class="form-input">
              <option value="basic">Basic (Gratis)</option>
              <option value="pro">Pro (Berbayar)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Siklus Tagihan</label>
            <select v-model="editingTenant.billingCycle" class="form-input">
              <option value="monthly">Bulanan</option>
              <option value="yearly">Tahunan</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status Pembayaran</label>
            <select v-model="editingTenant.paymentStatus" class="form-input">
              <option value="unpaid">Belum Lunas (Unpaid)</option>
              <option value="pending_verification">Menunggu Verifikasi (Pending)</option>
              <option value="paid">Lunas (Paid)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="editingTenant = null">Batal</button>
          <button class="btn btn-primary" @click="saveEdit" :disabled="actionLoading">Simpan Perubahan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sa-page-header { margin-bottom: 1.5rem; }
.sa-page-header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
.sa-page-header p { color: #64748b; }
.pending-badge {
  background: #fef3c7;
  color: #92400e;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: center;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 0.75rem;
  flex: 1;
  min-width: 250px;
}
.search-box .form-input {
  border: none;
  box-shadow: none;
  padding: 0.625rem 0;
  flex: 1;
}
.search-box .form-input:focus {
  outline: none;
}
.filter-tabs {
  display: flex;
  gap: 0.25rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.25rem;
}
.tab-btn {
  padding: 0.5rem 0.75rem;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s;
}
.tab-btn:hover { background: #f1f5f9; }
.tab-btn.active { background: #4338ca; color: white; }

.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.table-responsive { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 0.875rem 1rem;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}
.data-table th {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  background: #f8fafc;
}
.school-cell { display: flex; flex-direction: column; }
.school-name { font-weight: 600; color: #1e293b; }
.school-email { font-size: 0.75rem; color: #94a3b8; }
.text-muted { color: #64748b; }
.text-sm { font-size: 0.8rem; }
.empty-state { text-align: center; padding: 3rem; color: #94a3b8; }

.badge { padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-amber { background: #fef3c7; color: #92400e; }
.badge-red { background: #fef2f2; color: #991b1b; }
.badge-purple { background: #f3e8ff; color: #7c3aed; }
.badge-gray { background: #f1f5f9; color: #64748b; }

.action-btns { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: white;
  transition: all 0.2s;
}
.btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-icon:hover:not(:disabled) { background: #f1f5f9; }
.btn-icon.success { color: #16a34a; }
.btn-icon.success:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; }
.btn-icon.danger { color: #dc2626; }
.btn-icon.danger:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; }
.btn-icon.warning { color: #d97706; }
.btn-icon.warning:hover:not(:disabled) { background: #fef3c7; border-color: #fcd34d; }

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.modal-content {
  background: white; width: 100%; max-width: 500px;
  border-radius: 12px; overflow: hidden;
}
.modal-header {
  padding: 1rem 1.5rem; border-bottom: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-header h3 { margin: 0; font-size: 1.25rem; }
.btn-close { background: none; border: none; cursor: pointer; color: #64748b; }
.modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.9rem; }
.form-input { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; }
.modal-footer {
  padding: 1rem 1.5rem; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: flex-end; gap: 1rem;
}
.btn { padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500; cursor: pointer; border: none; }
.btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-primary { background: #6366f1; color: white; }

@media (max-width: 768px) {
  .filter-bar { flex-direction: column; }
  .filter-tabs { overflow-x: auto; }
}
</style>

<script setup>
import { ref, onMounted, watch, computed, onUnmounted } from "vue";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { tenantCol } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
import { useTenantStore } from "../stores/tenant";
import { Search, BookOpen, ChevronDown, ChevronUp } from "lucide-vue-next";
import { getPredikat } from "../utils/grading";
import {
  createGradeDocMap,
  isGradeFilled,
  listenToClassSubjectGrades,
} from "../utils/gradeSync";

// State
const tenantStore = useTenantStore();
const classes = ref([]);
const subjects = ref([]);
const students = ref([]);
const grades = ref({}); // key: studentId_subjectId -> grade data
const isLoading = ref(false);

const selectedClassId = ref("");
const selectedSubjectId = ref("");
const expandedRows = ref(new Set());
const userUid = ref("");
const userRole = ref("");
const leadClassIds = ref([]);
const isWaliRole = computed(() => String(userRole.value || "").toLowerCase().includes("wali"));
let stopGradeSync = null;

onMounted(async () => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    userUid.value = currentUser.uid;
    try {
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        userRole.value = String(data.role || "").toLowerCase();
        if (Array.isArray(data.leadClassIds) && data.leadClassIds.length > 0) {
          leadClassIds.value = data.leadClassIds;
        } else if (data.leadClassId) {
          leadClassIds.value = [data.leadClassId];
        } else {
          leadClassIds.value = [];
        }
      }
    } catch (e) {
      console.error("Error reading current user for Daftar Nilai:", e);
    }
  }

  const [classSnap, subjectSnap] = await Promise.all([
    getDocs(query(tenantCol("classes"), orderBy("nama"))),
    getDocs(query(tenantCol("subjects"), orderBy("nama"))),
  ]);
  const allClasses = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (isWaliRole.value) {
    const filtered = allClasses.filter(
      (c) => leadClassIds.value.includes(c.id) || c.waliKelasId === userUid.value
    );
    classes.value = filtered;
    if (filtered.length > 0) {
      selectedClassId.value = filtered[0].id;
    }
  } else {
    classes.value = allClasses;
  }
  subjects.value = subjectSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
});

const loadData = async () => {
  if (!selectedClassId.value || !selectedSubjectId.value) {
    students.value = [];
    grades.value = {};
    if (stopGradeSync) {
      stopGradeSync();
      stopGradeSync = null;
    }
    return;
  }
  isLoading.value = true;
  students.value = [];
  grades.value = {};
  try {
    // 1. Load Students
    const qStudents = query(
      tenantCol("students"),
      where("kelasId", "==", selectedClassId.value),
      orderBy("nama")
    );
    const stdSnap = await getDocs(qStudents);
    students.value = stdSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (stopGradeSync) {
      stopGradeSync();
      stopGradeSync = null;
    }
    stopGradeSync = listenToClassSubjectGrades(
      db,
      selectedClassId.value,
      selectedSubjectId.value,
      (gradeList) => {
        const gradeMap = createGradeDocMap(gradeList);
        const nextGrades = {};
        students.value.forEach((student) => {
          const normalized = gradeMap[`${student.id}_${selectedSubjectId.value}`];
          if (normalized) nextGrades[student.id] = normalized;
        });
        grades.value = nextGrades;
      },
      (error, source) => {
        console.error(`Error syncing daftar nilai (${source})`, error);
      },
    );

  } catch (e) {
    console.error("Error loading daftar nilai:", e);
  } finally {
    isLoading.value = false;
  }
};

watch([selectedClassId, selectedSubjectId], loadData);
onUnmounted(() => {
  if (stopGradeSync) stopGradeSync();
});

const selectedSubjectName = computed(() => {
  return subjects.value.find(s => s.id === selectedSubjectId.value)?.nama || "";
});
const selectedClassName = computed(() => {
  return classes.value.find(c => c.id === selectedClassId.value)?.nama || "";
});

const getGradeData = (studentId) => {
  return grades.value[studentId] || null;
};

const gradedCount = computed(() => {
  return students.value.reduce((count, student) => (
    isGradeFilled(getGradeData(student.id)) ? count + 1 : count
  ), 0);
});

const getFinalScore = (g) => {
  if (!g) return 0;
  return g.final_score || g.na || g.nilai_akhir || 0;
};

const toggleRow = (studentId) => {
  if (expandedRows.value.has(studentId)) {
    expandedRows.value.delete(studentId);
  } else {
    expandedRows.value.add(studentId);
  }
};

const getStudentOrder = (student) => {
  const raw =
    student?.noUrut ??
    student?.no_urut ??
    student?.nomorUrut ??
    student?.nomor_urut ??
    student?.nomorAbsen ??
    student?.noAbsen ??
    null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

const getDisplayOrder = (student, idx) => {
  const value = getStudentOrder(student);
  return value === Number.MAX_SAFE_INTEGER ? idx + 1 : value;
};

// Keep student list order by no. urut (not by score)
const orderedStudents = computed(() => {
  return [...students.value].sort((a, b) => {
    const byOrder = getStudentOrder(a) - getStudentOrder(b);
    if (byOrder !== 0) return byOrder;
    return String(a.nama || "").localeCompare(String(b.nama || ""), "id");
  });
});

const getScoreClass = (score) => {
  if (score >= 90) return "score-a";
  if (score >= 80) return "score-b";
  if (score >= 70) return "score-c";
  return "score-d";
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Daftar Nilai</h2>
        <p class="text-muted">Lihat nilai siswa berdasarkan kelas dan mata pelajaran.</p>
      </div>
    </div>

    <!-- Filter -->
    <div class="filter-bar card">
      <div class="filter-group">
        <label>Kelas:</label>
        <select v-model="selectedClassId" class="form-input">
          <option value="" disabled>-- Pilih Kelas --</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.nama }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>Mata Pelajaran:</label>
        <select v-model="selectedSubjectId" class="form-input">
          <option value="" disabled>-- Pilih Mapel --</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.nama }}</option>
        </select>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!selectedClassId || !selectedSubjectId" class="empty-placeholder">
      <Search :size="48" class="text-muted" />
      <p>Pilih Kelas dan Mata Pelajaran untuk melihat daftar nilai.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Memuat data nilai...</p>
    </div>

    <!-- Content -->
    <div v-else class="card table-card animate-fade-in">
      <!-- Header Info -->
      <div class="card-header">
        <div class="header-info">
          <BookOpen :size="18" class="icon-primary" />
          <div>
            <span class="mapel-title">{{ selectedSubjectName }}</span>
            <span class="kelas-tag">{{ selectedClassName }}</span>
          </div>
        </div>
        <div class="summary-pills">
          <span class="pill pill-total">{{ students.length }} Siswa</span>
          <span class="pill pill-filled">{{ gradedCount }} Ternilai</span>
        </div>
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th width="40">No</th>
              <th>Nama Siswa</th>
              <th class="text-center" width="80">Pengetahuan</th>
              <th class="text-center" width="80">Keterampilan</th>
              <th class="text-center" width="90">Nilai Akhir</th>
              <th class="text-center" width="70">Predikat</th>
              <th class="text-center" width="50">Detail</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(student, idx) in orderedStudents" :key="student.id">
              <tr :class="{ 'row-expanded': expandedRows.has(student.id) }">
                <td class="text-center">{{ getDisplayOrder(student, idx) }}</td>
                <td class="font-medium">{{ student.nama }}</td>
                <template v-if="getGradeData(student.id)">
                  <td class="text-center">
                    <span class="score-badge" :class="getScoreClass(getGradeData(student.id).knowledge_score || 0)">
                      {{ getGradeData(student.id).knowledge_score || 0 }}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="score-badge" :class="getScoreClass(getGradeData(student.id).skill_score || 0)">
                      {{ getGradeData(student.id).skill_score || 0 }}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="final-score" :class="getScoreClass(getFinalScore(getGradeData(student.id)))">
                      {{ getFinalScore(getGradeData(student.id)) }}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="predikat-badge" :class="getScoreClass(getFinalScore(getGradeData(student.id)))">
                      {{ getPredikat(getFinalScore(getGradeData(student.id))) }}
                    </span>
                  </td>
                </template>
                <template v-else>
                  <td class="text-center text-muted">-</td>
                  <td class="text-center text-muted">-</td>
                  <td class="text-center text-muted">Belum dinilai</td>
                  <td class="text-center">-</td>
                </template>
                <td class="text-center">
                  <button
                    v-if="getGradeData(student.id) && tenantStore.plan === 'pro'"
                    @click="toggleRow(student.id)"
                    class="btn-icon btn-detail"
                    :title="expandedRows.has(student.id) ? 'Sembunyikan' : 'Lihat Detail'"
                  >
                    <ChevronDown :size="16" v-if="!expandedRows.has(student.id)" />
                    <ChevronUp :size="16" v-else />
                  </button>
                  <span v-else-if="getGradeData(student.id)" class="text-muted" title="Fitur PRO">🔒</span>
                </td>
              </tr>
              <!-- Detail Row -->
              <tr v-if="expandedRows.has(student.id) && getGradeData(student.id)" class="detail-row">
                <td colspan="7">
                  <div class="detail-grid">
                    <div class="detail-block">
                      <h5>📚 Pengetahuan</h5>
                      <div class="detail-items">
                        <div class="detail-item">
                          <span class="di-label">PH (Penilaian Harian)</span>
                          <span class="di-val">{{ getGradeData(student.id).knowledge?.ph || 0 }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="di-label">PTS</span>
                          <span class="di-val">{{ getGradeData(student.id).knowledge?.pts || 0 }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="di-label">PAS</span>
                          <span class="di-val">{{ getGradeData(student.id).knowledge?.pas || 0 }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="detail-block">
                      <h5>🛠️ Keterampilan</h5>
                      <div class="detail-items">
                        <div class="detail-item">
                          <span class="di-label">Praktik</span>
                          <span class="di-val">{{ getGradeData(student.id).skill?.praktik || 0 }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="di-label">Proyek</span>
                          <span class="di-val">{{ getGradeData(student.id).skill?.proyek || 0 }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="di-label">Produk</span>
                          <span class="di-val">{{ getGradeData(student.id).skill?.produk || 0 }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1100px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.filter-bar {
  display: flex;
  gap: 2rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}
.empty-placeholder {
  text-align: center;
  padding: 4rem;
  color: var(--text-muted);
}
.empty-placeholder svg {
  margin-bottom: 1rem;
  opacity: 0.5;
}
.loading-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}
.table-card {
  padding: 0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--color-surface-muted);
}
.header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.icon-primary {
  color: var(--color-primary);
}
.mapel-title {
  font-weight: 700;
  font-size: 1rem;
  display: block;
}
.kelas-tag {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.summary-pills {
  display: flex;
  gap: 0.5rem;
}
.pill {
  padding: 0.25rem 0.75rem;
  border-radius: 50px;
  font-size: 0.78rem;
  font-weight: 600;
}
.pill-total { background: var(--color-primary-light); color: var(--color-primary); }
.pill-filled { background: #d1fae5; color: #065f46; }

.score-badge {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}
.final-score {
  font-size: 1rem;
  font-weight: 700;
}
.predikat-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 700;
}
.score-a { background: #d1fae5; color: #065f46; }
.score-b { background: #dbeafe; color: #1e40af; }
.score-c { background: #fef9c3; color: #854d0e; }
.score-d { background: #fee2e2; color: #991b1b; }

.btn-detail {
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}
.btn-detail:hover {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.row-expanded > td {
  background: #f8faff;
  border-bottom: none !important;
}
.detail-row td {
  background: #f0f4ff;
  border-top: none;
  padding: 0.75rem 1.5rem 1.25rem !important;
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
.detail-block h5 {
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--color-primary-dark);
}
.detail-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.83rem;
  padding: 0.2rem 0;
  border-bottom: 1px dashed #e2e8f0;
}
.di-label { color: var(--text-muted); }
.di-val { font-weight: 600; color: var(--text-main); }
</style>

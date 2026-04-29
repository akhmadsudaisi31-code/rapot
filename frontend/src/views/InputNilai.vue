<script setup>
import { ref, onMounted, watch, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  query,
  where,
  orderBy,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
const authStore = useAuthStore();
import { Save, Search, Calculator, FileCheck } from "lucide-vue-next";
import {
  createGradeDocMap,
  listenToClassSubjectGrades,
  normalizeGradeRecord,
} from "../utils/gradeSync";

const router = useRouter();

// State
const classes = ref([]);
const allSubjects = ref([]); // Store all master subjects
const students = ref([]);
const grades = ref({}); // Map studentId -> grade info
const kdText = ref(""); // New: KD / Materi text
const isLoading = ref(false);
const isSaving = ref(false);

// Selections
const selectedClass = ref("");
const selectedSubject = ref("");
const semester = ref("1"); // Hardcoded for now aka Ganjil
const tahunAjaran = ref("2024/2025"); // Hardcoded

// Grading Weights (Default, overridden by settings later for K-MERDEKA)
const weights = ref({ knowledge: 50, skill: 50 });

// User Context
const userRole = ref("");
const userUid = ref("");
const assignedMapelIds = ref([]);
const leadClassIds = ref([]);
const normalizedRole = computed(() => String(userRole.value || "").toLowerCase());
const isWaliRole = computed(() => normalizedRole.value.includes("wali"));
let stopGradeSync = null;

const waitForAuthUser = async () => {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

const normalizeAssignedMapelIds = (data) => {
  const rawValues = [
    data?.assignedMapelIds,
    data?.assignedSubjectIds,
    data?.mapelIds,
    data?.subjectIds,
    data?.mapelId,
    data?.subjectId,
  ];

  const normalized = rawValues.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value.includes(",") ? value.split(",") : [value];
    }
    return [];
  });

  return [...new Set(normalized.map((id) => String(id).trim()).filter(Boolean))];
};

const normalizeAssignedTokens = (data) => {
  const rawValues = [
    data?.assignedMapelIds,
    data?.assignedSubjectIds,
    data?.mapelIds,
    data?.subjectIds,
    data?.mapelId,
    data?.subjectId,
    data?.assignedMapels,
    data?.mapel,
    data?.subjects,
    data?.subject,
  ];

  const extracted = rawValues.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.includes(",") ? value.split(",") : [value];
    if (value && typeof value === "object") return [value];
    return [];
  }).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") {
      return [
        value.id,
        value.mapelId,
        value.subjectId,
        value.kode,
        value.code,
        value.nama,
        value.name,
      ].filter(Boolean);
    }
    return [];
  });

  return [...new Set(extracted.map((v) => String(v).trim().toLowerCase()).filter(Boolean))];
};

const initializePage = async () => {
  const currentUser = await waitForAuthUser();
  if (!currentUser) return; // Should act guarded by router
  userUid.value = currentUser.uid;

  // 1. Get User Role & Assignments
  try {
    const userSnap = await getDoc(doc(db, "users", currentUser.uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      userRole.value = String(data.role || "").toLowerCase();
      assignedMapelIds.value = normalizeAssignedMapelIds(data);
      assignedMapelTokens.value = normalizeAssignedTokens(data);
      if (Array.isArray(data.leadClassIds) && data.leadClassIds.length > 0) {
        leadClassIds.value = data.leadClassIds;
      } else if (data.leadClassId) {
        leadClassIds.value = [data.leadClassId];
      } else {
        leadClassIds.value = [];
      }
    } else {
      userRole.value = "admin"; // Fallback
    }
  } catch (e) {
    console.error("Error checking role", e);
    userRole.value = "admin";
  }

  // 2. Parallel Fetch Master Data
  const [classSnap, subjectSnap, settingsSnap] = await Promise.all([
    getDocs(query(tenantCol("classes"), orderBy("nama"))),
    getDocs(query(tenantCol("subjects"), orderBy("nama"))),
    getDocs(tenantCol("settings")), 
  ]);

  const allClasses = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (isWaliRole.value) {
    const filtered = allClasses.filter(
      (c) => leadClassIds.value.includes(c.id) || c.waliKelasId === userUid.value
    );
    classes.value = filtered;
    if (filtered.length > 0) {
      selectedClass.value = filtered[0].id;
    }
  } else {
    classes.value = allClasses;
  }

  allSubjects.value = subjectSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Old filtering logic removed; now handled by computed 'subjects'

  // Load weights if exist
  settingsSnap.forEach((doc) => {
    if (doc.id === "grading_weights") {
      weights.value = doc.data();
    }
  });
};

const assignedMapelTokens = ref([]);

onMounted(async () => {
  await initializePage();
});

// Fetch Students & Existing Grades
const fetchData = async () => {
  if (!selectedClass.value || !selectedSubject.value) {
    students.value = [];
    grades.value = {};
    kdText.value = "";
    if (stopGradeSync) {
      stopGradeSync();
      stopGradeSync = null;
    }
    return;
  }

  isLoading.value = true;
  students.value = [];
  grades.value = {};
  kdText.value = "";

  try {
    // 1. Get Students
    const qStd = query(
      tenantCol("students"),
      where("kelasId", "==", selectedClass.value),
      orderBy("nama")
    );
    const stdSnap = await getDocs(qStd);
    students.value = stdSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (stopGradeSync) {
      stopGradeSync();
      stopGradeSync = null;
    }

    // 2. Sync existing grades in real-time for this class + subject
    stopGradeSync = listenToClassSubjectGrades(
      db,
      selectedClass.value,
      selectedSubject.value,
      (gradeList) => {
        const nextGrades = {};
        const gradeMap = createGradeDocMap(gradeList);

        students.value.forEach((student) => {
          const normalized = normalizeGradeRecord(
            gradeMap[`${student.id}_${selectedSubject.value}`] || {},
          );
          nextGrades[student.id] = {
            ph: normalized.knowledge.ph,
            pts: normalized.knowledge.pts,
            pas: normalized.knowledge.pas,
            praktik: normalized.skill.praktik,
            proyek: normalized.skill.proyek,
            produk: normalized.skill.produk,
            knowledge_score: normalized.knowledge_score,
            skill_score: normalized.skill_score,
            na: normalized.final_score,
          };
        });

        grades.value = nextGrades;
      },
      (error, source) => {
        console.error(`Error syncing input grades (${source})`, error);
      },
    );

    // Init empty grades for students who don't have them
    students.value.forEach((s) => {
      if (!grades.value[s.id]) {
        grades.value[s.id] = { ph: 0, pts: 0, pas: 0, praktik: 0, proyek: 0, produk: 0, knowledge_score: 0, skill_score: 0, na: 0 };
      }
    });

    // 3. Get KD Text (if exists)
    const compDoc = await getDoc(doc(db, `tenants/${authStore.tenantId}/classes`, selectedClass.value, "settings", "competencies"));
    if (compDoc.exists()) {
        const comps = compDoc.data();
        kdText.value = comps[selectedSubject.value] || "";
    }

  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    isLoading.value = false;
  }
};

watch([selectedClass, selectedSubject], fetchData);
onUnmounted(() => {
  if (stopGradeSync) stopGradeSync();
});

// Calculation Logic (Kurikulum Merdeka)
const calculateFinal = (studentId) => {
  const g = grades.value[studentId];
  
  // Pengetahuan Items
  const ph = parseFloat(g.ph) || 0;
  const pts = parseFloat(g.pts) || 0;
  const pas = parseFloat(g.pas) || 0;

  // Keterampilan Items
  const praktik = parseFloat(g.praktik) || 0;
  const proyek = parseFloat(g.proyek) || 0;
  const produk = parseFloat(g.produk) || 0;

  // Calculate Sub-Scores (Simple average inside components for now, could be weighted)
  g.knowledge_score = parseFloat(((ph + pts + pas) / 3).toFixed(1));
  g.skill_score = parseFloat(((praktik + proyek + produk) / 3).toFixed(1));

  // Determine Final Score based on formulas (knowledge + skill) / 2
  const finalScore = (g.knowledge_score + g.skill_score) / 2;
  
  g.na = parseFloat(finalScore.toFixed(1));
};

const currentClassData = computed(() => {
  return classes.value.find((c) => c.id === selectedClass.value);
});

const isWaliKelasOfSelected = computed(() => {
  if (!currentClassData.value) return false;
  return currentClassData.value.waliKelasId === userUid.value;
});


// Computed Available Subjects
const subjects = computed(() => {
    // 1. Admin gets all
    if (normalizedRole.value === 'admin') return allSubjects.value;

    // 2. Wali Kelas gets all subjects for input/fix grade
    if (isWaliRole.value) return allSubjects.value;
    
    // 3. Wali Kelas of SELECTED class gets all (backward compatibility)
    if (isWaliKelasOfSelected.value) {
        return allSubjects.value;
    }

    // 4. Subject Teacher (Guru Mapel) gets only assigned
    if (assignedMapelIds.value.length > 0) {
        return allSubjects.value.filter((s) => {
          const sid = String(s.id || "").trim();
          const skode = String(s.kode || "").trim();
          const snama = String(s.nama || "").trim();
          return (
            assignedMapelIds.value.includes(sid) ||
            assignedMapelTokens.value.includes(sid.toLowerCase()) ||
            assignedMapelTokens.value.includes(skode.toLowerCase()) ||
            assignedMapelTokens.value.includes(snama.toLowerCase())
          );
        });
    }

    // 4b. Legacy assignment that stores mapel by name/kode/object only
    if (assignedMapelTokens.value.length > 0) {
      return allSubjects.value.filter((s) => {
        const sid = String(s.id || "").trim().toLowerCase();
        const skode = String(s.kode || "").trim().toLowerCase();
        const snama = String(s.nama || "").trim().toLowerCase();
        return (
          assignedMapelTokens.value.includes(sid) ||
          assignedMapelTokens.value.includes(skode) ||
          assignedMapelTokens.value.includes(snama)
        );
      });
    }

    // 5. Default: No access if NO assignments and NOT Wali Kelas
    return [];
});

watch(subjects, (availableSubjects) => {
  const stillValid = availableSubjects.some((s) => s.id === selectedSubject.value);
  if (!stillValid) {
    selectedSubject.value = availableSubjects[0]?.id || "";
  }
});

const handleSendToRapor = async () => {
  await handleSave();
  // Navigate to Rapor Dashboard
  router.push("/rapor");
};

const handleSave = async () => {
  if (!selectedClass.value || !selectedSubject.value) return;
  isSaving.value = true;
  try {
    const batch = writeBatch(db);

    // Save grades
    students.value.forEach((s) => {
      const g = grades.value[s.id] || {};

      const gradeRef = doc(
        db,
        "grades",
        `${s.id}_${selectedSubject.value}_${semester.value}`
      );
      batch.set(
        gradeRef,
        {
          student_id: s.id,
          studentId: s.id,
          siswaId: s.id,
          kelasId: selectedClass.value,
          class_id: selectedClass.value,
          mapelId: selectedSubject.value,
          subject_id: selectedSubject.value,
          teacher_id: userUid.value,
          semester: semester.value,
          year: tahunAjaran.value,
          knowledge: {
            ph: g.ph,
            pts: g.pts,
            pas: g.pas,
          },
          skill: {
            praktik: g.praktik,
            proyek: g.proyek,
            produk: g.produk,
          },
          knowledge_score: g.knowledge_score,
          skill_score: g.skill_score,
          na: g.na,
          final_score: g.na,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    });

    await batch.commit();

    // Save KD Text
    // We can't batch 'update' on a doc that might not exist easily with set merge for a map field key.
    // Easier to just read-modify-write for this settings doc or set merge.
    if (selectedClass.value && selectedSubject.value) {
        const compRef = doc(db, `tenants/${authStore.tenantId}/classes`, selectedClass.value, "settings", "competencies");
        await setDoc(compRef, { [selectedSubject.value]: kdText.value }, { merge: true });
    }

    alert("Nilai dan KD berhasil disimpan!");
  } catch (error) {
    console.error("Error saving grades:", error);
    alert("Gagal menyimpan nilai");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Input Nilai</h2>
        <p class="text-muted">Masukkan nilai harian, UTS, dan UAS siswa.</p>
      </div>
      <div>
        <span class="badge info"
          >Bobot Kurikulum Merdeka: Pengetahuan={{ weights.knowledge }}% Keterampilan={{ weights.skill }}%</span
        >
      </div>
    </div>

    <!-- Selection Bar -->
    <div class="filter-bar card">
      <div class="filter-group">
        <label>Kelas:</label>
        <select v-model="selectedClass" class="form-input">
          <option value="" disabled>-- Pilih Kelas --</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">
            {{ c.nama }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>Mapel:</label>
        <select v-model="selectedSubject" class="form-input">
          <option value="" disabled>-- Pilih Mapel --</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">
            {{ s.nama }}
          </option>
        </select>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!selectedClass || !selectedSubject" class="empty-placeholder">
      <Search :size="48" class="text-muted" />
      <p>Silakan pilih Kelas dan Mata Pelajaran untuk mulai input nilai.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Memuat data siswa...</p>
    </div>

    <!-- Data Table -->
    <div v-else class="card table-card animate-fade-in">
      <div
        class="action-bar"
        v-if="selectedClass && selectedSubject && students.length > 0"
      >
        <div class="stats text-muted text-sm">
          Terisi:
          {{ students.filter((s) => grades[s.id]?.na).length }} /
          {{ students.length }} Siswa
        </div>
        
        <!-- KD Input Area -->
        <div class="kd-input-wrapper">
             <input v-model="kdText" placeholder="Topik / KD (misal: Aljabar)" class="form-input kd-field" />
        </div>

        <div class="flex gap-2" style="display: flex; gap: 0.5rem">
          <button
            v-if="isWaliKelasOfSelected"
            @click="handleSendToRapor"
            class="btn btn-outline"
            :disabled="isSaving"
            title="Simpan dan Buka Dashboard Rapor"
          >
            <FileCheck :size="18" /> Simpan & Cek Rapor
          </button>
          <button
            @click="handleSave"
            class="btn btn-primary"
            :disabled="isSaving"
          >
            <Save :size="18" /> {{ isSaving ? "Menyimpan..." : "Simpan Nilai" }}
          </button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align: middle;">Nama Siswa</th>
              <th colspan="3" class="text-center">Pengetahuan (Knowledge)</th>
              <th rowspan="2" width="60" class="text-center bg-light" style="vertical-align: middle;">Rerata (P)</th>
              <th colspan="3" class="text-center">Keterampilan (Skill)</th>
              <th rowspan="2" width="60" class="text-center bg-light" style="vertical-align: middle;">Rerata (K)</th>
              <th rowspan="2" width="80" style="vertical-align: middle;">Nilai Akhir</th>
            </tr>
            <tr>
                <th width="60" class="text-center">PH</th>
                <th width="60" class="text-center">PTS</th>
                <th width="60" class="text-center">PAS</th>
                <th width="60" class="text-center">Praktik</th>
                <th width="60" class="text-center">Proyek</th>
                <th width="60" class="text-center">Produk</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="std in students" :key="std.id">
              <td class="font-medium">{{ std.nama }}</td>
              
              <!-- Knowledge -->
              <td><input type="number" v-model="grades[std.id].ph" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td><input type="number" v-model="grades[std.id].pts" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td><input type="number" v-model="grades[std.id].pas" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td class="text-center bg-gray-100 font-bold">
                  {{ grades[std.id].knowledge_score }}
              </td>

              <!-- Skill -->
              <td><input type="number" v-model="grades[std.id].praktik" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td><input type="number" v-model="grades[std.id].proyek" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td><input type="number" v-model="grades[std.id].produk" @input="calculateFinal(std.id)" class="form-input grade-input" min="0" max="100" /></td>
              <td class="text-center bg-gray-100 font-bold">
                  {{ grades[std.id].skill_score }}
              </td>

              <!-- Final Score -->
              <td>
                <span class="final-score" :class="{ pass: grades[std.id].na >= 75, fail: grades[std.id].na < 75 }">
                  {{ grades[std.id].na }}
                </span>
                <div class="text-xs text-center" :class="{'text-green-600': grades[std.id].na >= 90, 'text-blue-600': grades[std.id].na >= 80 && grades[std.id].na < 90, 'text-yellow-600': grades[std.id].na >= 70 && grades[std.id].na < 80, 'text-red-600': grades[std.id].na < 70}">
                  {{ grades[std.id].na >= 90 ? 'A' : (grades[std.id].na >= 80 ? 'B' : (grades[std.id].na >= 70 ? 'C' : 'D')) }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2.5rem;
}

.page-header h2 {
  font-size: 2rem;
  margin: 0 0 0.5rem 0;
  color: var(--text-main);
  letter-spacing: -0.02em;
}

.badge.info {
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.75rem 1.25rem;
  border-radius: 100px;
  border: 1px solid rgba(30, 64, 175, 0.1);
}

.filter-bar {
  display: flex;
  gap: 2rem;
  padding: 1.5rem 2rem;
  background: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  margin-bottom: 2.5rem;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.filter-group label {
  font-weight: 700;
  color: var(--text-main);
  font-size: 0.9rem;
}

.empty-placeholder {
  text-align: center;
  padding: 6rem 2rem;
  color: var(--text-muted);
  background: white;
  border-radius: var(--radius-xl);
  border: 2px dashed var(--border-color);
}

.empty-placeholder p {
  font-size: 1.1rem;
  margin-top: 1.5rem;
}

.loading-state {
  text-align: center;
  padding: 5rem;
}

.table-card {
  padding: 0;
  background: white;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-premium);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.action-bar {
  padding: 1.5rem 2rem;
  background: var(--color-surface-muted);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.kd-input-wrapper {
  flex: 1;
}

.kd-field {
  width: 100%;
  background: white;
  border-color: var(--border-color);
  padding: 0.875rem 1.25rem;
}

.kd-field:focus {
  border-color: var(--color-primary);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--color-surface-muted);
  font-weight: 700;
  text-align: center;
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--border-color);
}

.data-table td {
  padding: 1rem;
  border: 1px solid var(--border-color);
  vertical-align: middle;
}

.data-table tr:hover td {
  background: var(--color-primary-light);
}

.grade-input {
  width: 70px;
  text-align: center;
  padding: 0.6rem;
  border-radius: 8px;
  background: white;
  border: 1px solid var(--border-color);
  font-weight: 700;
  font-size: 1rem;
  margin: 0 auto;
}

.grade-input:focus {
  border-color: var(--color-primary);
  background: white;
}

.final-score {
  font-weight: 800;
  font-size: 1.25rem;
  display: block;
  text-align: center;
}

.final-score.pass { color: var(--color-success); }
.final-score.fail { color: var(--color-danger); }

.bg-light { background-color: var(--color-surface-muted); }

.text-center { text-align: center; }

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .data-table th:first-child,
  .data-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 20;
    background: white;
    box-shadow: 2px 0 5px rgba(0,0,0,0.05);
    min-width: 140px;
  }

  .data-table th:first-child {
    background: var(--color-surface-muted);
  }

  .grade-input {
    width: 60px;
    padding: 0.5rem;
    font-size: 0.9rem;
  }
  
  .badge.info {
    font-size: 0.75rem;
    padding: 0.5rem 1rem;
    width: 100%;
    text-align: center;
  }
}
</style>

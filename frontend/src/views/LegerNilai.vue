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
// html2pdf loaded on-demand via dynamic import()
import { db, auth } from "../firebase";
import { tenantCol } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
import { Printer, Download, Search, Eye } from "lucide-vue-next";
import { getPredikat } from "../utils/grading";
import { createGradeDocMap, listenToClassGrades } from "../utils/gradeSync";

// State
const classes = ref([]);
const selectedClassId = ref("");
const students = ref([]);
const subjects = ref([]);
const competencies = ref({});
const grades = ref({}); // keys: studentId_subjectId -> normalized grade object
const isLoading = ref(false);
const isWaliKelas = ref(false);
const legerSheetRef = ref(null);

const userRole = ref("");
const userUid = ref("");
const leadClassIds = ref([]);
const isWaliRole = computed(() => String(userRole.value || "").toLowerCase().includes("wali"));
let stopGradeSync = null;

const stopGradeListeners = () => {
  if (stopGradeSync) {
    stopGradeSync();
    stopGradeSync = null;
  }
};

const startGradeListeners = (classId) => {
  stopGradeListeners();
  if (!classId) return;
  stopGradeSync = listenToClassGrades(
    db,
    classId,
    (gradeList) => {
      const gradeMap = createGradeDocMap(gradeList);
      const nextGrades = {};
      Object.entries(gradeMap).forEach(([key, grade]) => {
        nextGrades[key] = {
          finalScore: grade.final_score,
          knowledge: grade.knowledge,
          skill: grade.skill,
        };
      });
      grades.value = nextGrades;
    },
    (error, source) => {
      console.error(`Error listening grades (${source})`, error);
    },
  );
};

onMounted(async () => {
  const user = auth.currentUser;
  if (!user) return;
  userUid.value = user.uid;

  // 1. Get User Role
  const userSnap = await getDoc(doc(db, "users", user.uid));
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
  } else {
    userRole.value = "admin"; // Default fallback
  }

  // 2. Load Classes
  const qClasses = query(tenantCol("classes"), orderBy("nama"));
  const clsSnap = await getDocs(qClasses);
  const allClasses = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (isWaliRole.value) {
    isWaliKelas.value = true;
    const filtered = allClasses.filter(
      (c) => leadClassIds.value.includes(c.id) || c.waliKelasId === userUid.value
    );
    classes.value = filtered;
    if (filtered.length > 0) selectedClassId.value = filtered[0].id;
  } else {
    classes.value = allClasses;
  }
});

const loadData = async () => {
  if (!selectedClassId.value) {
    grades.value = {};
    stopGradeListeners();
    return;
  }
  isLoading.value = true;
  students.value = [];
  subjects.value = [];
  grades.value = {};
  competencies.value = {};

  try {
    // 1. Load Students
    const qStudents = query(
      tenantCol("students"),
      where("kelasId", "==", selectedClassId.value),
      orderBy("nama")
    );
    const stdSnap = await getDocs(qStudents);
    students.value = stdSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 2. Load Subjects
    const qSubjects = query(tenantCol("subjects"), orderBy("nama"));
    const subSnap = await getDocs(qSubjects);
    subjects.value = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 3. Listen grades in real-time (sync with Daftar/Input Nilai)
    startGradeListeners(selectedClassId.value);

    // 4. Load Competencies (KD)
    const authStore = useAuthStore();
    const compDoc = await getDoc(doc(db, `tenants/${authStore.tenantId}/classes`, selectedClassId.value, "settings", "competencies"));
    if (compDoc.exists()) {
        competencies.value = compDoc.data();
    }

  } catch (e) {
    console.error("Error loading leger data", e);
  } finally {
    isLoading.value = false;
  }
};

watch(selectedClassId, loadData);
onUnmounted(() => {
  stopGradeListeners();
});

const getGrade = (studentId, subjectId) => {
  const key = `${studentId}_${subjectId}`;
  return grades.value[key] || null;
};

const getStudentName = (studentId) => {
  return students.value.find((s) => s.id === studentId)?.nama || "Siswa";
};

const getCellData = (studentId, subject) => {
    const grade = getGrade(studentId, subject.id);
    if (!grade) return null;
    const studentName = getStudentName(studentId);
    const compText = normalizeCompetencyText(
      competencies.value?.[subject.id],
      subject.nama
    );
    const numericVal = Number(grade.finalScore) || 0;
    const kkm = Number(subject?.kkm) || 75;

    const knowledgeComponents = [
      { key: "ph", label: "kegiatan belajar harian", value: Number(grade.knowledge?.ph || 0) },
      { key: "pts", label: "ujian tengah semester", value: Number(grade.knowledge?.pts || 0) },
      { key: "pas", label: "ujian akhir semester", value: Number(grade.knowledge?.pas || 0) },
    ];
    const skillComponents = [
      { key: "praktik", label: "latihan praktik", value: Number(grade.skill?.praktik || 0) },
      { key: "proyek", label: "tugas proyek", value: Number(grade.skill?.proyek || 0) },
      { key: "produk", label: "hasil karya", value: Number(grade.skill?.produk || 0) },
    ];

    const hasAnyScore = [...knowledgeComponents, ...skillComponents]
      .some((item) => item.value > 0) || numericVal > 0;

    if (!hasAnyScore) {
      const narasi = `${studentName} masih belum menunjukkan hasil yang cukup pada pelajaran ${subject.nama}. Perlu pendampingan tambahan di rumah dan di sekolah agar pemahaman tentang ${compText} semakin baik.`;
      return {
        nilai: numericVal,
        predikat: getPredikat(numericVal),
        kkm,
        isAboveKkm: false,
        narasi,
      };
    }

    const bestKnowledge = knowledgeComponents.reduce(
      (best, current) => (current.value > best.value ? current : best),
      knowledgeComponents[0],
    );
    const bestSkill = skillComponents.reduce(
      (best, current) => (current.value > best.value ? current : best),
      skillComponents[0],
    );

    const guidanceCandidates = knowledgeComponents.filter((c) => c.key === "pts" || c.key === "pas");
    const weakestGuidance = guidanceCandidates.reduce(
      (weakest, current) => (current.value < weakest.value ? current : weakest),
      guidanceCandidates[0],
    );

    const narasi = `${studentName} menunjukkan kemampuan yang baik pada ${compText}, terutama saat ${bestKnowledge.label}, dan juga baik pada ${bestSkill.label}. Perlu latihan tambahan pada ${compText}, khususnya pada bagian ${weakestGuidance.label}, agar hasil belajarnya lebih stabil.`;

    return {
        nilai: numericVal,
        predikat: getPredikat(numericVal),
        kkm,
        isAboveKkm: numericVal >= kkm,
        narasi,
    };
};

const normalizeCompetencyText = (raw, fallbackSubjectName) => {
  if (typeof raw === "string") {
    const cleaned = raw.trim();
    return cleaned || `materi ${fallbackSubjectName}`;
  }
  if (Array.isArray(raw)) {
    const joined = raw
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(", ");
    return joined || `materi ${fallbackSubjectName}`;
  }
  if (raw && typeof raw === "object") {
    const keys = ["text", "kd", "materi", "description", "desc", "name", "nama"];
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return `materi ${fallbackSubjectName}`;
};

// Calculate Average per Student
const getAverage = (studentId) => {
  let total = 0;
  let count = 0;
  subjects.value.forEach((sub) => {
    const val = grades.value[`${studentId}_${sub.id}`]?.finalScore;
    if (val && val !== "-") {
      total += parseFloat(val);
      count++;
    }
  });
  return count > 0 ? (total / count).toFixed(1) : 0;
};

// Calculate Rank (Simple)
// Note: This is client side ranking based on loaded data
const getRank = (studentId) => {
    // Calculate all averages first
    const avgs = students.value.map(s => ({id: s.id, avg: parseFloat(getAverage(s.id))}));
    // Sort desc
    avgs.sort((a,b) => b.avg - a.avg);
    // Find index
    const idx = avgs.findIndex(x => x.id === studentId);
    return idx + 1;
}

const printLeger = () => {
  window.print();
};

const downloadLegerPDF = async () => {
  if (!selectedClassId.value || !legerSheetRef.value) return;

  const selectedClassName = classes.value.find(
    (c) => c.id === selectedClassId.value,
  )?.nama || "Kelas";

  const opt = {
    margin: 8,
    filename: `Leger_${selectedClassName.replace(/\s+/g, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
    pagebreak: { mode: ["css", "legacy"] },
  };

  let pdfSource = null;
  let mount = null;
  try {
    const sourceWidth = Math.ceil(legerSheetRef.value.scrollWidth || legerSheetRef.value.offsetWidth || 1200);
    const sourceHeight = Math.ceil(legerSheetRef.value.scrollHeight || legerSheetRef.value.offsetHeight || 900);

    // Use `.paper-sheet` as the single source area for PDF.
    pdfSource = legerSheetRef.value.cloneNode(true);
    pdfSource.style.width = `${sourceWidth}px`;
    pdfSource.style.maxWidth = "none";
    pdfSource.style.margin = "0";
    pdfSource.style.boxShadow = "none";
    pdfSource.style.border = "none";
    pdfSource.style.overflow = "visible";
    pdfSource.style.background = "#fff";
    pdfSource.style.display = "block";

    // Ensure full table is captured (no viewport clipping).
    pdfSource.querySelectorAll(".table-responsive").forEach((el) => {
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
      el.style.border = "none";
      el.style.width = "auto";
    });
    pdfSource.querySelectorAll(".leger-table").forEach((el) => {
      el.style.width = "auto";
      el.style.minWidth = "100%";
      el.style.tableLayout = "auto";
    });
    pdfSource.querySelectorAll(".leger-table th, .leger-table td").forEach((el) => {
      el.style.whiteSpace = "normal";
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.verticalAlign = "top";
    });
    pdfSource.querySelectorAll(".cell-desc").forEach((el) => {
      el.style.whiteSpace = "normal";
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.fontSize = "10px";
      el.style.lineHeight = "1.3";
      el.style.marginTop = "2px";
    });
    // Keep "Rata2" and "Rank" columns readable in PDF
    pdfSource.querySelectorAll(".leger-table tr").forEach((row) => {
      const cells = row.querySelectorAll("th, td");
      const total = cells.length;
      if (total >= 2) {
        const avgCell = cells[total - 2];
        const rankCell = cells[total - 1];
        [avgCell, rankCell].forEach((cell) => {
          cell.style.whiteSpace = "nowrap";
          cell.style.wordBreak = "normal";
          cell.style.overflowWrap = "normal";
          cell.style.textAlign = "center";
          cell.style.verticalAlign = "middle";
          cell.style.minWidth = "56px";
          cell.style.width = "56px";
          cell.style.fontSize = "12px";
          cell.style.fontWeight = "700";
        });
      }
    });
    pdfSource.querySelectorAll(".sticky-col").forEach((el) => {
      el.style.position = "static";
      el.style.left = "auto";
      el.style.zIndex = "auto";
    });

    mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "0";
    mount.style.top = "0";
    mount.style.width = `${sourceWidth}px`;
    mount.style.height = "auto";
    mount.style.overflow = "visible";
    mount.style.background = "#fff";
    mount.style.opacity = "0";
    mount.style.pointerEvents = "none";
    mount.style.zIndex = "-1";
    mount.appendChild(pdfSource);
    document.body.appendChild(mount);

    // Measure AFTER mounting and style overrides, so we capture full content.
    const contentWidth = Math.ceil(
      Math.max(
        pdfSource.scrollWidth || 0,
        pdfSource.offsetWidth || 0,
        mount.scrollWidth || 0,
        sourceWidth,
      ),
    );
    const contentHeight = Math.ceil(
      Math.max(
        pdfSource.scrollHeight || 0,
        pdfSource.offsetHeight || 0,
        mount.scrollHeight || 0,
        sourceHeight,
      ),
    );

    mount.style.width = `${Math.max(contentWidth, sourceWidth)}px`;

    const exportOpt = {
      ...opt,
      html2canvas: {
        ...opt.html2canvas,
        width: Math.max(contentWidth, sourceWidth),
        windowWidth: Math.max(contentWidth, sourceWidth),
        height: Math.max(contentHeight, sourceHeight),
        windowHeight: Math.max(contentHeight, sourceHeight),
        scrollX: 0,
        scrollY: 0,
      },
    };

    const { default: html2pdf } = await import("html2pdf.js");
    await html2pdf().set(exportOpt).from(pdfSource).save();
  } catch (error) {
    console.error("Gagal membuat PDF leger:", error);
    alert("Gagal mengunduh PDF leger.");
  } finally {
    if (mount && mount.parentNode === document.body) {
      document.body.removeChild(mount);
    }
  }
};
</script>

<template>
  <div class="page-container">
    <div class="page-header no-print">
      <div>
        <h2>Leger Nilai</h2>
        <p class="text-muted">Rekapan nilai seluruh siswa dalam satu kelas.</p>
      </div>
      <div class="header-actions">
        <button @click="downloadLegerPDF" class="btn btn-primary" :disabled="!selectedClassId">
          <Download :size="18" /> Download PDF
        </button>
        <button @click="printLeger" class="btn btn-outline" :disabled="!selectedClassId">
          <Printer :size="18" /> Cetak / PDF
        </button>
      </div>
    </div>

    <!-- Filter -->
    <div class="filter-bar card no-print">
      <div class="filter-group">
        <label>Pilih Kelas:</label>
        <select v-model="selectedClassId" class="form-input">
          <option value="" disabled>-- Pilih Kelas --</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">
            {{ c.nama }}
          </option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!selectedClassId" class="empty-state">
      <Search :size="48" class="text-muted opacity-50 mb-2" />
      <p class="text-muted">Silakan pilih kelas untuk melihat Leger.</p>
    </div>

    <!-- Content -->
    <div v-else class="leger-content">
      <div ref="legerSheetRef" class="paper-sheet">
         <div class="print-header">
            <h3>LEGER NILAI KELAS {{ classes.find(c => c.id === selectedClassId)?.nama }}</h3>
            <p>Tahun Ajaran 2024/2025 - Semester Ganjil</p>
         </div>

         <div class="table-responsive">
            <table class="leger-table">
                <thead>
                    <tr>
                        <th rowspan="2" width="30">No</th>
                        <th rowspan="2" class="sticky-col">Nama Siswa</th>
                        <th :colspan="subjects.length" class="text-center">Mata Pelajaran</th>
                        <th rowspan="2" width="50">Rata2</th>
                        <th rowspan="2" width="50">Rank</th>
                    </tr>
                    <tr>
                        <th v-for="sub in subjects" :key="sub.id" class="subject-header">
                            {{ sub.nama }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(student, idx) in students" :key="student.id">
                        <td class="text-center">{{ idx + 1 }}</td>
                        <td class="sticky-col name-col">{{ student.nama }}</td>
                        <td v-for="sub in subjects" :key="sub.id" class="text-center rich-cell">
                            <template v-if="getCellData(student.id, sub)">
                                <div class="cell-top">
                                    <span class="cell-nilai">{{ getCellData(student.id, sub).nilai }}</span>
                                    <span class="cell-predikat badge">{{ getCellData(student.id, sub).predikat }}</span>
                                </div>
                                <div class="cell-desc">{{ getCellData(student.id, sub).narasi }}</div>
                            </template>
                            <span v-else>-</span>
                        </td>
                        <td class="text-center font-bold">{{ getAverage(student.id) }}</td>
                        <td class="text-center">{{ getRank(student.id) }}</td>
                    </tr>
                </tbody>
            </table>
         </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
    max-width: 100%;
    padding: 0 1rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.filter-bar {
  padding: 1.5rem;
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
}
.filter-group {
    display: flex;
    align-items: center;
    gap: 1rem;
}

/* Leger Specifics */
.paper-sheet {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    overflow: hidden;
}

.table-responsive {
    overflow-x: auto;
    max-height: 80vh; /* Scrollable height */
    overflow-y: auto;
}

.leger-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}
.name-main {
    font-weight: 700;
    margin-bottom: 0.25rem;
}
.narrative-wrap {
    margin-top: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}
.narrative-line {
    font-size: 0.68rem;
    line-height: 1.25;
    color: #475569;
    white-space: normal;
    max-width: 300px;
}

.leger-table th, .leger-table td {
    border: 1px solid #ddd;
    padding: 4px 8px;
}

.leger-table th {
    background: #f9f9f9;
    font-weight: 600;
}

/* Subject Headers */
.subject-header {
    white-space: normal;
    padding: 8px;
    vertical-align: middle;
    text-align: center;
    min-width: 250px; /* Match rich-cell width */
}

/* Sticky first column */
.sticky-col {
    position: sticky;
    left: 0;
    background: white;
    z-index: 2;
    border-right: 2px solid #ddd;
}
.name-col {
    font-weight: 500;
    min-width: 200px;
}

.print-header {
    display: none;
    text-align: center;
    margin-bottom: 1rem;
}

@media print {
    .no-print { display: none !important; }
    .page-container { padding: 0 !important; max-width: none !important; width: 100% !important; }
    .paper-sheet { border: none !important; padding: 0 !important; width: 100% !important; box-shadow: none !important; }
    .print-header { display: block !important; margin-bottom: 1rem !important; }
    
    .table-responsive { 
        overflow: visible !important; 
        max-height: none !important; 
        border: none !important; 
        /* Pastikan cetakan mengecil jika kolom terlalu banyak */
        zoom: 0.75;
        transform: scale(0.9);
        transform-origin: top left;
        width: 100% !important;
    }
    
    .sticky-col { position: static !important; border-right: 1px solid #ddd !important; }
    
    /* Perkecil lebar sel untuk membantu auto-scale browser */
    .rich-cell {
        min-width: 120px !important;
    }
    .subject-header {
        min-width: 120px !important;
    }
    .leger-table th, .leger-table td {
        padding: 4px !important;
        font-size: 0.75rem !important;
    }
    
    @page { size: landscape; margin: 0.5cm; }
}

.rich-cell {
    min-width: 250px;
    vertical-align: top;
    text-align: left !important;
}
.cell-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
}
.cell-nilai {
    font-weight: bold;
    font-size: 1rem;
}
.cell-predikat {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
}
.cell-desc {
    font-size: 0.75rem;
    color: #666;
    white-space: normal;
    line-height: 1.3;
}
</style>

<style>
/* Unscoped Print Styles khusus untuk Isolasi Area Cetak Leger Nilai */
@media print {
    /* Sembunyikan elemen layout yang tidak perlu */
    .sidebar, .topbar, .mobile-backdrop {
        display: none !important;
    }
    
    /* Lepas batasan lebar layout utama, izinkan rendering melebihi viewport (nanti di-skala ulag di origin) */
    .dashboard-layout, .main-content, .content-area, .page-container, body, html {
        display: block !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
    }
}
</style>

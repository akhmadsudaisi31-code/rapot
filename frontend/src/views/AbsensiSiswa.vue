<script setup>
import { ref, onMounted, watch, computed } from "vue";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { Users, Save, ClipboardList } from "lucide-vue-next";

const classes = ref([]);
const students = ref([]);
const selectedClassId = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const hasUnsavedChanges = ref(false);
const userRole = ref("");

const filters = ref({
  month: String(new Date().getMonth() + 1).padStart(2, "0"),
  year: String(new Date().getFullYear()),
});

// studentId -> [{ id, date, status, notes }]
const attendanceByStudent = ref({});

const canEditAttendance = computed(() => {
  const role = String(userRole.value || "").toLowerCase();
  return role.includes("admin") || role.includes("wali") || role.includes("guru");
});

const daysInSelectedMonth = computed(() => {
  const year = Number(filters.value.year || 0);
  const month = Number(filters.value.month || 1);
  if (!year || month < 1 || month > 12) return 31;
  return new Date(year, month, 0).getDate();
});

const dayColumns = computed(() =>
  Array.from({ length: daysInSelectedMonth.value }, (_, i) => i + 1),
);

const dateFromDay = (day) => {
  const d = String(day).padStart(2, "0");
  return `${filters.value.year}-${filters.value.month}-${d}`;
};

const sortedStudents = computed(() => {
  return [...students.value].sort((a, b) =>
    String(a.nama || "").localeCompare(String(b.nama || ""), "id"),
  );
});

const countStatus = (studentId, status) => {
  const rows = Array.isArray(attendanceByStudent.value[studentId])
    ? attendanceByStudent.value[studentId]
    : [];
  const monthRows = rows.filter((item) => {
    if (!item?.date) return false;
    const [y, m] = String(item.date).split("-");
    return y === filters.value.year && m === filters.value.month;
  });
  return monthRows.reduce((acc, item) => (item.status === status ? acc + 1 : acc), 0);
};

const countAllStatus = (rows, status) =>
  rows.reduce((acc, item) => (item?.status === status ? acc + 1 : acc), 0);

const getCellStatus = (studentId, day) => {
  const date = dateFromDay(day);
  const rows = Array.isArray(attendanceByStudent.value[studentId])
    ? attendanceByStudent.value[studentId]
    : [];
  const found = rows.find((item) => item.date === date);
  return found?.status || "";
};

const setCellStatus = (studentId, day, status) => {
  if (!canEditAttendance.value) return;
  const date = dateFromDay(day);
  const rows = Array.isArray(attendanceByStudent.value[studentId])
    ? [...attendanceByStudent.value[studentId]]
    : [];
  const idx = rows.findIndex((item) => item.date === date);

  // Default "-" berarti belum diisi -> hapus record pada tanggal itu.
  if (!status) {
    if (idx >= 0) rows.splice(idx, 1);
  } else {
    const payload = {
      id: idx >= 0 ? rows[idx].id : `att_${Date.now()}_${studentId}_${day}`,
      date,
      status,
      notes: idx >= 0 ? rows[idx].notes || "" : "",
    };
    if (idx >= 0) rows.splice(idx, 1, payload);
    else rows.push(payload);
  }

  attendanceByStudent.value = {
    ...attendanceByStudent.value,
    [studentId]: rows,
  };
  hasUnsavedChanges.value = true;
};

const getStatusCellClass = (status) => {
  if (!status) return "st-empty";
  if (status === "hadir") return "st-h";
  if (status === "sakit") return "st-s";
  if (status === "izin") return "st-i";
  if (status === "alpa") return "st-a";
  return "st-empty";
};

const loadInitialData = async () => {
  const currentUser = auth.currentUser;
  const [classSnap, userSnap] = await Promise.all([
    getDocs(query(tenantCol("classes"), orderBy("nama"))),
    currentUser ? getDoc(doc(db, "users", currentUser.uid)) : Promise.resolve(null),
  ]);

  classes.value = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (classes.value.length > 0) selectedClassId.value = classes.value[0].id;

  if (userSnap?.exists?.()) {
    userRole.value = String(userSnap.data().role || "");
  }
};

const loadClassData = async () => {
  if (!selectedClassId.value) {
    students.value = [];
    attendanceByStudent.value = {};
    return;
  }

  isLoading.value = true;
  try {
    const [stdSnap, attSnap] = await Promise.all([
      getDocs(query(tenantCol("students"), where("kelasId", "==", selectedClassId.value))),
      getDocs(query(tenantCol("student_rapor_content"), where("classId", "==", selectedClassId.value))),
    ]);

    students.value = stdSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const map = {};
    attSnap.docs.forEach((d) => {
      const data = d.data();
      const sid = data.studentId;
      if (!sid) return;
      map[sid] = Array.isArray(data.attendanceRecords)
        ? data.attendanceRecords.map((item, idx) => ({
            id: item?.id || `${item?.date || "no-date"}_${idx}`,
            date: item?.date || "",
            status: item?.status || "hadir",
            notes: item?.notes || "",
          }))
        : [];
    });

    // Pastikan semua siswa punya key.
    students.value.forEach((s) => {
      if (!map[s.id]) map[s.id] = [];
    });

    attendanceByStudent.value = map;
    hasUnsavedChanges.value = false;
  } catch (error) {
    console.error("Error loading absensi kelas:", error);
  } finally {
    isLoading.value = false;
  }
};

const saveAll = async () => {
  if (!canEditAttendance.value) {
    alert("Anda tidak memiliki izin untuk mengubah absensi.");
    return;
  }
  if (!selectedClassId.value || students.value.length === 0) return;

  isSaving.value = true;
  try {
    const uid = auth.currentUser?.uid || "";

    for (const student of students.value) {
      const rows = Array.isArray(attendanceByStudent.value[student.id])
        ? [...attendanceByStudent.value[student.id]]
        : [];

      rows.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

      const payload = {
        classId: selectedClassId.value,
        studentId: student.id,
        studentName: student.nama || "",
        attendanceRecords: rows,
        attendanceItems: [
          { label: "Sakit", value: `${countAllStatus(rows, "sakit")} hari` },
          { label: "Izin", value: `${countAllStatus(rows, "izin")} hari` },
          { label: "Tanpa Keterangan", value: `${countAllStatus(rows, "alpa")} hari` },
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      };

      await setDoc(tenantDoc("student_rapor_content", `${selectedClassId.value}_${student.id}`), payload, {
        merge: true,
      });
    }

    hasUnsavedChanges.value = false;
    alert("Absensi semua siswa berhasil disimpan.");
  } catch (error) {
    console.error("Error saving attendance table:", error);
    alert("Gagal menyimpan absensi.");
  } finally {
    isSaving.value = false;
  }
};

watch(selectedClassId, async () => {
  await loadClassData();
});

onMounted(async () => {
  await loadInitialData();
  await loadClassData();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>Absensi Siswa</h2>
        <p class="text-muted">Tabel per bulan untuk semua siswa dalam satu kelas. Isi status tanggal via dropdown.</p>
      </div>
    </div>

    <div class="card filter-card">
      <div class="filter-grid">
        <div class="input-group">
          <label class="input-label">Kelas</label>
          <select v-model="selectedClassId" class="form-input">
            <option value="" disabled>-- Pilih Kelas --</option>
            <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.nama }}</option>
          </select>
        </div>

        <div class="input-group">
          <label class="input-label">Bulan</label>
          <select v-model="filters.month" class="form-input">
            <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
            <option value="04">Apr</option><option value="05">Mei</option><option value="06">Jun</option>
            <option value="07">Jul</option><option value="08">Agu</option><option value="09">Sep</option>
            <option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option>
          </select>
        </div>

        <div class="input-group">
          <label class="input-label">Tahun</label>
          <input v-model="filters.year" class="form-input" placeholder="2026" />
        </div>
      </div>
    </div>

    <div v-if="!canEditAttendance" class="card readonly-alert">
      Mode baca saja. Anda tidak punya izin edit absensi.
    </div>

    <div v-if="isLoading" class="card empty-state">
      <p>Memuat data siswa...</p>
    </div>

    <div v-else-if="students.length === 0" class="card empty-state">
      <Users :size="40" class="muted-icon" />
      <p>Belum ada siswa di kelas ini.</p>
    </div>

    <div v-else class="card form-card">
      <div class="table-head">
        <div class="table-title"><ClipboardList :size="18" /> Rekap Absensi Kelas</div>
        <button class="btn btn-primary" :disabled="isSaving || !canEditAttendance" @click="saveAll">
          <Save :size="16" /> {{ isSaving ? "Menyimpan..." : "Simpan Semua" }}
        </button>
      </div>

      <div v-if="hasUnsavedChanges" class="dirty-hint">Perubahan belum disimpan.</div>

      <div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="sticky-col no-col">No</th>
              <th class="sticky-col name-col">Nama Siswa</th>
              <th v-for="day in dayColumns" :key="`hd-${day}`">{{ day }}</th>
              <th class="summary-col">Sakit</th>
              <th class="summary-col">Izin</th>
              <th class="summary-col">Alpa</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(student, idx) in sortedStudents" :key="student.id">
              <td class="sticky-col no-col">{{ idx + 1 }}</td>
              <td class="sticky-col name-col">{{ student.nama }}</td>
              <td v-for="day in dayColumns" :key="`cell-${student.id}-${day}`" class="cell-att">
                <select
                  :class="['cell-select', getStatusCellClass(getCellStatus(student.id, day))]"
                  :value="getCellStatus(student.id, day)"
                  :disabled="!canEditAttendance"
                  @change="setCellStatus(student.id, day, $event.target.value)"
                >
                  <option value="">-</option>
                  <option value="hadir">H</option>
                  <option value="sakit">S</option>
                  <option value="izin">I</option>
                  <option value="alpa">A</option>
                </select>
              </td>
              <td class="summary-col">{{ countStatus(student.id, 'sakit') }}</td>
              <td class="summary-col">{{ countStatus(student.id, 'izin') }}</td>
              <td class="summary-col">{{ countStatus(student.id, 'alpa') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="table-note">Kode dropdown: - = belum diisi, H = Hadir, S = Sakit, I = Izin, A = Alpa.</p>
    </div>
  </div>
</template>

<style scoped>
.page-container { max-width: 1280px; margin: 0 auto; }
.page-header { margin-bottom: 1.2rem; }

.filter-card { margin-bottom: 0.9rem; padding: 1rem; }
.filter-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 0.8rem;
}

.readonly-alert {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  margin-bottom: 0.8rem;
  font-size: 0.84rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}
.muted-icon { opacity: 0.5; margin-bottom: 0.5rem; }

.form-card { padding: 0.9rem; }
.table-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
  gap: 0.8rem;
}
.table-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 700;
}
.dirty-hint {
  font-size: 0.8rem;
  color: #92400e;
  margin-bottom: 0.45rem;
}

.matrix-wrap {
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.matrix-table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-size: 0.78rem;
}
.matrix-table th,
.matrix-table td {
  border: 1px solid var(--border-color);
  padding: 0.25rem 0.35rem;
  text-align: center;
  white-space: nowrap;
}
.matrix-table th {
  background: #f8fafc;
  font-weight: 700;
}
.sticky-col {
  position: sticky;
  background: #fff;
  z-index: 2;
}
.no-col {
  left: 0;
  min-width: 48px;
  max-width: 48px;
}
.name-col {
  left: 48px;
  min-width: 210px;
  text-align: left !important;
  z-index: 3;
}
.cell-att {
  min-width: 44px;
}
.cell-select {
  width: 42px;
  min-width: 42px;
  padding: 2px 4px;
  font-size: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-weight: 700;
}
.cell-select.st-empty {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #64748b;
}
.cell-select.st-h {
  background: #ecfdf5;
  border-color: #86efac;
  color: #166534;
}
.cell-select.st-s {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}
.cell-select.st-i {
  background: #e0e7ff;
  border-color: #a5b4fc;
  color: #3730a3;
}
.cell-select.st-a {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}
.summary-col {
  min-width: 58px;
  font-weight: 700;
}
.table-note {
  margin-top: 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>

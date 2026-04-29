<script setup>
import { ref, onMounted, watch, computed, nextTick, onUnmounted } from "vue";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  getDoc,
  setDoc,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref as firebaseStorageRef, uploadBytes } from "firebase/storage";
import { db, auth, storage } from "../firebase";
import { tenantCol, tenantDoc } from "../utils/tenantDb";
import { useAuthStore } from "../stores/auth";
import {
  Search,
  FileText,
  Save,
  Plus,
  Trash2,
  Settings2,
} from "lucide-vue-next";
// Heavy libs loaded on-demand via dynamic import()
// html2pdf, html2canvas, jsPDF, Previewer (pagedjs), ExcelJS
import { saveAs } from "file-saver";
import { getPredikat, getDeskripsi } from "../utils/grading";
import { isGradeFilled, listenToClassGrades, normalizeGradeRecord, toId } from "../utils/gradeSync";

const loading = ref(true);
const classes = ref([]);
const selectedClassId = ref("");
const myClass = ref(null);
const students = ref([]);
const subjects = ref([]);
const grades = ref([]);
const competencies = ref({});
const userUid = ref("");
const userRole = ref("");
const leadClassIds = ref([]);
let stopGradeSync = null;
let subjectSnapshotUnsub = null;
const canViewWaliSections = computed(() => {
  const role = String(userRole.value || "").toLowerCase();
  return role.includes("admin") || role.includes("wali");
});

const stopGradeListeners = () => {
  if (stopGradeSync) {
    stopGradeSync();
    stopGradeSync = null;
  }
};

const stopSubjectListener = () => {
  if (subjectSnapshotUnsub) {
    subjectSnapshotUnsub();
    subjectSnapshotUnsub = null;
  }
};

const gradeMatches = (grade, studentId, subjectId) => {
  const gStudent = toId(grade.student_id || grade.studentId || grade.siswaId);
  const gSubject = toId(grade.subject_id || grade.subjectId || grade.mapelId);
  return gStudent === toId(studentId) && gSubject === toId(subjectId);
};

const findGrade = (studentId, subjectId) => {
  return grades.value.find((g) => gradeMatches(g, studentId, subjectId));
};

const expectedSubjectIds = computed(() => {
  const activeSubjectIds = new Set(
    subjects.value.map((s) => toId(s.id)).filter(Boolean),
  );

  // Source of truth: mapel aktif saat ini.
  // Ini membuat progres tetap benar ketika mapel ditambah/dihapus di masa depan.
  if (activeSubjectIds.size > 0) return activeSubjectIds;

  // Fallback saat daftar mapel belum sempat termuat.
  const fallbackIds = new Set();
  grades.value.forEach((g) => {
    const sid = toId(g.subject_id || g.subjectId || g.mapelId);
    if (sid) fallbackIds.add(sid);
  });
  Object.keys(competencies.value || {}).forEach((sid) => {
    const normalized = toId(sid);
    if (normalized) fallbackIds.add(normalized);
  });
  return fallbackIds;
});

const filledGradeMap = computed(() => {
  const filledMap = new Map();
  grades.value.forEach((g) => {
    if (!isGradeFilled(g)) return;
    const studentId = toId(g.student_id || g.studentId || g.siswaId);
    const subjectId = toId(g.subject_id || g.subjectId || g.mapelId);
    if (!studentId || !subjectId) return;
    filledMap.set(`${studentId}__${subjectId}`, true);
  });
  return filledMap;
});

const expectedSubjectCount = computed(() => expectedSubjectIds.value.size);

const getStudentFilledCount = (siswaId) => {
  if (expectedSubjectCount.value === 0) return 0;
  let filled = 0;
  expectedSubjectIds.value.forEach((subjectId) => {
    if (filledGradeMap.value.get(`${toId(siswaId)}__${subjectId}`)) filled++;
  });
  return filled;
};

const startGradeListeners = (classId) => {
  stopGradeListeners();
  if (!classId) return;
  stopGradeSync = listenToClassGrades(
    db,
    classId,
    (gradeList) => {
      grades.value = gradeList.map(normalizeGradeRecord);
    },
    (error, source) => {
      console.error(`Error listening grades (${source})`, error);
    },
  );
};

const startSubjectListener = () => {
  stopSubjectListener();
  subjectSnapshotUnsub = onSnapshot(
    query(tenantCol("subjects"), orderBy("nama")),
    (snap) => {
      subjects.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    (error) => {
      // Ignore permission-denied errors during logout
      if (error.code === "permission-denied") return;
      console.error("Error listening subjects", error);
    },
  );
};

// Preview Modal State
const showPreview = ref(false);
const selectedStudent = ref(null);
const currentRaporPage = ref(0);

// Preview 4 tabs
const activePreviewTab = ref('sampul');
const previewTabs = [
  { id: 'sampul', label: '1. Sampul Rapor' },
  { id: 'sekolah', label: '2. Data Sekolah' },
  { id: 'biodata', label: '3. Biodata Siswa' },
  { id: 'raport', label: '4. Rapor Nilai' },
];

// Rapor Config (Dynamic)
const raporConfig = ref({
  namaSekolah: "SMK SURAMADU",
  npsn: "20551909",
  email: "smksuramadu@gmail.com",
  website: "-",
  alamatJalan: "Jl. Blega-Konang",
  kelurahan: "Karang Nangkah",
  kecamatan: "Blega",
  kabupaten: "Bangkalan",
  provinsi: "Jawa Timur",
  headerBaris1: "PEMERINTAH PROVINSI JAWA TIMUR",
  headerBaris2: "DINAS PENDIDIKAN",
  kotaTtd: "Bangkalan",
  namaKepsek: "MUTALSAM SHOLEH, ST",
  nipKepsek: "-",
  logoUrl:
    "https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_Tut_Wuri_Handayani.png",
});

const createExtracurricularItem = () => ({ kegiatan: "", keterangan: "" });
const createAchievementItem = () => ({ jenis: "", keterangan: "" });
const raporCms = ref({
  reportTitle: "LAPORAN CAPAIAN HASIL BELAJAR",
  reportSubtitle: "",
  tahunAjaran: "",
  semesterLabel: "",
  reportDate: "",
  sectionTitleExtracurricular: "C. Ekstrakurikuler",
  sectionTitleAchievement: "D. Prestasi",
  sectionTitleAttendance: "E. Ketidakhadiran",
  sectionTitleHomeroomNote: "F. Catatan Wali Kelas",
  homeroomNoteDefault:
    "Terus pertahankan semangat belajar, disiplin, dan sikap positif dalam kegiatan pembelajaran.",
  extracurricularItems: [
    createExtracurricularItem(),
    createExtracurricularItem(),
    createExtracurricularItem(),
  ],
  achievementItems: [createAchievementItem(), createAchievementItem()],
  attendanceItems: [
    { label: "Sakit", value: "" },
    { label: "Izin", value: "" },
    { label: "Tanpa Keterangan", value: "" },
  ],
  previewText: {},
});

const academicPeriod = ref({
  tahunAjaran: "",
  semesterLabel: "",
  reportDate: "",
});

const studentRaporContent = ref(null);

const mapSchoolInfoToRaporConfig = (schoolInfo = {}) => ({
  namaSekolah: schoolInfo.nama || "",
  npsn: schoolInfo.npsn || "",
  email: schoolInfo.email || "",
  website: schoolInfo.website || "",
  alamatJalan: schoolInfo.alamat || "",
  telepon: schoolInfo.telepon || "",
  kodePos: schoolInfo.kodePos || "",
  kelurahan: schoolInfo.kelurahan || "",
  kecamatan: schoolInfo.kecamatan || "",
  kabupaten: schoolInfo.kota || "",
  provinsi: schoolInfo.provinsi || "",
  namaKepsek: schoolInfo.kepalaSekolah || "",
  nipKepsek: schoolInfo.nipKepsek || "",
  logoUrl: schoolInfo.logoBase64 || schoolInfo.logoUrl || "",
});

const normalizeReportDateValue = (value) => {
  if (!value) return "";
  const v = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return "";
};

const loadRaporSettings = async () => {
  const configSnap = await getDoc(tenantDoc("settings", "rapor_config"));
  if (configSnap.exists()) {
    raporConfig.value = { ...raporConfig.value, ...configSnap.data() };
  }

  const schoolInfoSnap = await getDoc(tenantDoc("settings", "school_info"));
  if (schoolInfoSnap.exists()) {
    const mapped = mapSchoolInfoToRaporConfig(schoolInfoSnap.data());
    raporConfig.value = {
      ...raporConfig.value,
      ...Object.fromEntries(
        Object.entries(mapped).filter(([, value]) => value !== ""),
      ),
    };
  }

  const cmsSnap = await getDoc(tenantDoc("settings", "rapor_content_cms"));
  if (cmsSnap.exists()) {
    const cmsData = cmsSnap.data();
    raporCms.value = {
      ...raporCms.value,
      ...cmsData,
      reportDate: normalizeReportDateValue(cmsData.reportDate) || raporCms.value.reportDate,
      previewText:
        cmsData.previewText && typeof cmsData.previewText === "object"
          ? cmsData.previewText
          : raporCms.value.previewText,
      extracurricularItems:
        Array.isArray(cmsData.extracurricularItems) && cmsData.extracurricularItems.length
          ? cmsData.extracurricularItems
          : raporCms.value.extracurricularItems,
      achievementItems:
        Array.isArray(cmsData.achievementItems) && cmsData.achievementItems.length
          ? cmsData.achievementItems
          : raporCms.value.achievementItems,
      attendanceItems:
        Array.isArray(cmsData.attendanceItems) && cmsData.attendanceItems.length
          ? cmsData.attendanceItems
          : raporCms.value.attendanceItems,
    };
    academicPeriod.value = {
      ...academicPeriod.value,
      tahunAjaran: cmsData.tahunAjaran || academicPeriod.value.tahunAjaran,
      semesterLabel: cmsData.semesterLabel || academicPeriod.value.semesterLabel,
      reportDate:
        normalizeReportDateValue(cmsData.reportDate) ||
        normalizeReportDateValue(academicPeriod.value.reportDate),
    };
  }

  const periodSnap = await getDoc(tenantDoc("settings", "academic_period"));
  if (periodSnap.exists()) {
    const legacy = periodSnap.data();
    academicPeriod.value = {
      ...academicPeriod.value,
      tahunAjaran: academicPeriod.value.tahunAjaran || legacy.tahunAjaran || "",
      semesterLabel: academicPeriod.value.semesterLabel || legacy.semesterLabel || "",
      reportDate:
        normalizeReportDateValue(academicPeriod.value.reportDate) ||
        normalizeReportDateValue(legacy.reportDate) ||
        "",
    };
  }

  raporCms.value.tahunAjaran = raporCms.value.tahunAjaran || academicPeriod.value.tahunAjaran || "";
  raporCms.value.semesterLabel = raporCms.value.semesterLabel || academicPeriod.value.semesterLabel || "";
  raporCms.value.reportDate =
    normalizeReportDateValue(raporCms.value.reportDate) ||
    normalizeReportDateValue(academicPeriod.value.reportDate) ||
    "";
};

onMounted(async () => {
  const user = auth.currentUser;
  if (!user) return;
  userUid.value = user.uid;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      userRole.value = String(userData.role || "").toLowerCase();
      if (Array.isArray(userData.leadClassIds) && userData.leadClassIds.length > 0) {
        leadClassIds.value = userData.leadClassIds;
      } else if (userData.leadClassId) {
        leadClassIds.value = [userData.leadClassId];
      } else {
        leadClassIds.value = [];
      }
    }

    const qClasses = query(tenantCol("classes"), orderBy("nama"));
    const clsSnap = await getDocs(qClasses);
    const allClasses = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (String(userRole.value || "").toLowerCase().includes("wali")) {
      classes.value = allClasses.filter(
        (c) => leadClassIds.value.includes(c.id) || c.waliKelasId === userUid.value
      );
    } else {
      classes.value = allClasses;
    }

    if (classes.value.length > 0) {
      selectedClassId.value = classes.value[0].id;
    }

    await loadRaporSettings();

    // Load Class Competencies
    if (selectedClassId.value) {
      const _authStore = useAuthStore();
      const compDoc = await getDoc(
        doc(db, `tenants/${_authStore.tenantId}/classes`, selectedClassId.value, "settings", "competencies"),
      );
      if (compDoc.exists()) {
        competencies.value = compDoc.data();
      }
    }

    // Listen subjects in real-time so progress adapts when subjects are added/removed.
    startSubjectListener();

    loading.value = false;
  } catch (e) {
    console.error("Error loading rapor dashboard", e);
    loading.value = false;
  }
});

const loadClassData = async () => {
  if (!selectedClassId.value) {
    myClass.value = null;
    students.value = [];
    grades.value = [];
    selectedStudent.value = null;
    studentRaporContent.value = null;
    stopGradeListeners();
    return;
  }

  loading.value = true;
  try {
    myClass.value = classes.value.find((c) => c.id === selectedClassId.value);

    const qStudents = query(
      tenantCol("students"),
      where("kelasId", "==", selectedClassId.value),
    );
    const stdSnap = await getDocs(qStudents);
    const rawStds = stdSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    students.value = rawStds.sort((a, b) => a.nama.localeCompare(b.nama));

    // Listen grades in real-time (sync with Daftar/Input Nilai)
    startGradeListeners(selectedClassId.value);

    const _authStore2 = useAuthStore();
    const compDoc = await getDoc(
      doc(db, `tenants/${_authStore2.tenantId}/classes`, selectedClassId.value, "settings", "competencies"),
    );
    competencies.value = compDoc.exists() ? compDoc.data() : {};
  } catch (e) {
    console.error("Error fetching class data", e);
  } finally {
    loading.value = false;
  }
};

watch(selectedClassId, loadClassData);
onUnmounted(() => {
  stopGradeListeners();
  stopSubjectListener();
  clearLogoFileSelection();
});

const getStudentProgress = (siswaId) => {
  const totalExpected = expectedSubjectCount.value;
  if (totalExpected === 0) return 0;
  const filled = getStudentFilledCount(siswaId);
  return Math.round((filled / totalExpected) * 100);
};

const classProgress = computed(() => {
  const totalStudents = students.value.length;
  const totalExpectedSubjects = expectedSubjectCount.value;
  if (totalStudents === 0 || totalExpectedSubjects === 0) return 0;

  const totalPairs = totalStudents * totalExpectedSubjects;
  let filledPairs = 0;
  students.value.forEach((student) => {
    filledPairs += getStudentFilledCount(student.id);
  });
  return Math.round((filledPairs / totalPairs) * 100);
});

const shouldContinueIncompleteExport = () => {
  if (classProgress.value >= 100) return true;
  const incompleteStudents = students.value.filter(
    (student) => getStudentProgress(student.id) < 100,
  ).length;
  return confirm(
    `Progres input kelas saat ini ${classProgress.value}%.\n` +
      `${incompleteStudents} siswa masih belum lengkap.\n\n` +
      "Lanjutkan unduh massal?"
  );
};

const openPreview = async (student) => {
  if (!student) {
    alert("Error: Student data is missing!");
    return;
  }

  await loadRaporSettings();
  selectedStudent.value = student;
  studentRaporContent.value = normalizeStudentRaporContent();
  await loadStudentRaporContent(student.id);
  activePreviewTab.value = "sampul";
  currentRaporPage.value = 0;
  showPreview.value = true;
};

const getGradeForStudent = (studentId, subjectId) => {
  const grade = findGrade(studentId, subjectId);
  return grade ? grade.final_score || 0 : 0;
};

const getDescriptionForStudent = (studentId, subjectId) => {
  const grade = findGrade(studentId, subjectId);
  if (!grade) return "-";

  const nilai = grade.final_score || 0;
  const subject = subjects.value.find((s) => s.id === subjectId);
  const kdText = competencies.value?.[subjectId] ?? null;

  return getDeskripsi(nilai, subject?.nama || "Mata Pelajaran", kdText);
};

const getKeterangan = (predikat) => {
  const keterangan = {
    A: "Sangat Baik",
    B: "Baik",
    C: "Cukup",
    D: "Kurang",
    E: "Sangat Kurang",
  };
  return keterangan[predikat] || "-";
};

const formatReportDate = (isoDate) => {
  const normalized = normalizeReportDateValue(isoDate);
  if (!normalized) return "-";
  const dt = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return String(isoDate || "-");
  return dt.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const currentTahunAjaran = computed(
  () => academicPeriod.value.tahunAjaran || myClass.value?.tahunAjaran || "2023-2024",
);

const currentSemesterLabel = computed(
  () => academicPeriod.value.semesterLabel || myClass.value?.semester || "1 (Satu)",
);

const currentReportDateLabel = computed(() => formatReportDate(academicPeriod.value.reportDate));

const cmsOpen = ref(false);
const cmsSaving = ref(false);
const logoUploadFile = ref(null);
const logoFileInputRef = ref(null);
const localLogoPreviewUrl = ref("");

const defaultPreviewText = {
  coverMainTitleLine1: "RAPOR PESERTA DIDIK",
  coverMainTitleLine2: "SEKOLAH MENENGAH KEJURUAN",
  coverStudentNameLabel: "Nama Peserta Didik:",
  coverStudentIdLabel: "NIPD/NIPDN:",
  schoolPageTitleLine1: "RAPOR PESERTA DIDIK",
  schoolPageTitleLine2: "SEKOLAH MENENGAH KEJURUAN",
  schoolPageTitleLine3: "(SMK)",
  biodataPageTitle: "KETERANGAN TENTANG DIRI PESERTA DIDIK",
  reportMainTableTitle: "MATA PELAJARAN",
  reportMainTableScoreTitle: "NILAI",
  reportMainTableDescriptionTitle: "DESKRIPSI CAPAIAN KOMPETENSI",
  biodataSignatureRole: "Kepala Sekolah,",
  signatureParentLabel: "Mengetahui,\nOrang Tua/Wali",
  signatureHomeroomLabel: "Wali Kelas,",
  signaturePrincipalLabel: "Mengetahui,\nKepala Sekolah",
};

const cmsPreviewTextFields = [
  { key: "coverMainTitleLine1", label: "Sampul - Judul Baris 1" },
  { key: "coverMainTitleLine2", label: "Sampul - Judul Baris 2" },
  { key: "coverStudentNameLabel", label: "Sampul - Label Nama Siswa" },
  { key: "coverStudentIdLabel", label: "Sampul - Label NIPD/NIPDN" },
  { key: "schoolPageTitleLine1", label: "Halaman Sekolah - Judul Baris 1" },
  { key: "schoolPageTitleLine2", label: "Halaman Sekolah - Judul Baris 2" },
  { key: "schoolPageTitleLine3", label: "Halaman Sekolah - Judul Baris 3" },
  { key: "biodataPageTitle", label: "Halaman Biodata - Judul" },
  { key: "reportMainTableTitle", label: "Rapor Nilai - Header Kolom Mapel" },
  { key: "reportMainTableScoreTitle", label: "Rapor Nilai - Header Kolom Nilai" },
  { key: "reportMainTableDescriptionTitle", label: "Rapor Nilai - Header Kolom Deskripsi" },
  { key: "biodataSignatureRole", label: "Biodata - Jabatan Penandatangan" },
  { key: "signatureParentLabel", label: "TTD - Blok Orang Tua/Wali", multiline: true },
  { key: "signatureHomeroomLabel", label: "TTD - Blok Wali Kelas", multiline: true },
  { key: "signaturePrincipalLabel", label: "TTD - Blok Kepala Sekolah", multiline: true },
];

const previewText = computed(() => ({
  ...defaultPreviewText,
  ...(raporCms.value.previewText || {}),
}));

const t = (key, fallback = "") => {
  return previewText.value[key] || fallback;
};

const addExtracurricularRow = () => {
  if (!Array.isArray(raporCms.value.extracurricularItems)) {
    raporCms.value.extracurricularItems = [];
  }
  raporCms.value.extracurricularItems.push(createExtracurricularItem());
};

const removeExtracurricularRow = (index) => {
  if (!Array.isArray(raporCms.value.extracurricularItems)) return;
  raporCms.value.extracurricularItems.splice(index, 1);
};

const addAchievementRow = () => {
  if (!Array.isArray(raporCms.value.achievementItems)) {
    raporCms.value.achievementItems = [];
  }
  raporCms.value.achievementItems.push(createAchievementItem());
};

const removeAchievementRow = (index) => {
  if (!Array.isArray(raporCms.value.achievementItems)) return;
  raporCms.value.achievementItems.splice(index, 1);
};

const addAttendanceRow = () => {
  if (!Array.isArray(raporCms.value.attendanceItems)) {
    raporCms.value.attendanceItems = [];
  }
  raporCms.value.attendanceItems.push({ label: "", value: "" });
};

const removeAttendanceRow = (index) => {
  if (!Array.isArray(raporCms.value.attendanceItems)) return;
  raporCms.value.attendanceItems.splice(index, 1);
};

const handleLogoFileChange = (event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("File logo harus berupa gambar.");
    event.target.value = "";
    return;
  }
  if (file.size > 500 * 1024) {
    alert("Ukuran file logo terlalu besar. Maksimal 500KB.");
    event.target.value = "";
    return;
  }

  logoUploadFile.value = file;

  const reader = new FileReader();
  reader.onload = (ev) => {
    raporConfig.value.logoBase64 = ev.target.result;
    localLogoPreviewUrl.value = ev.target.result;
  };
  reader.readAsDataURL(file);
};

const clearLogoFileSelection = () => {
  logoUploadFile.value = null;
  if (logoFileInputRef.value) {
    logoFileInputRef.value.value = "";
  }
  if (localLogoPreviewUrl.value) {
    URL.revokeObjectURL(localLogoPreviewUrl.value);
    localLogoPreviewUrl.value = "";
  }
};

const buildSchoolInfoPayloadFromRaporConfig = () => ({
  npsn: raporConfig.value.npsn || "",
  nama: raporConfig.value.namaSekolah || "",
  alamat: raporConfig.value.alamatJalan || "",
  kota: raporConfig.value.kabupaten || "",
  provinsi: raporConfig.value.provinsi || "",
  telepon: raporConfig.value.telepon || "",
  email: raporConfig.value.email || "",
  website: raporConfig.value.website || "",
  kepalaSekolah: raporConfig.value.namaKepsek || "",
  nipKepsek: raporConfig.value.nipKepsek || "",
  kelurahan: raporConfig.value.kelurahan || "",
  kecamatan: raporConfig.value.kecamatan || "",
  kodePos: raporConfig.value.kodePos || "",
  logoUrl: raporConfig.value.logoUrl || "",
});

const savePreviewCms = async () => {
  cmsSaving.value = true;
  try {
    const normalizedReportDate = normalizeReportDateValue(
      raporCms.value.reportDate || academicPeriod.value.reportDate,
    );
    if (!normalizedReportDate) {
      alert("Tanggal rapor wajib diisi dengan format tanggal yang valid.");
      return;
    }

    // Menggunakan Base64, tidak perlu upload ke Firebase Storage lagi.
    if (logoUploadFile.value) {
      clearLogoFileSelection();
    }

    const cmsPayload = {
      ...raporCms.value,
      reportDate: normalizedReportDate,
      previewText: { ...defaultPreviewText, ...(raporCms.value.previewText || {}) },
      extracurricularItems: Array.isArray(raporCms.value.extracurricularItems)
        ? raporCms.value.extracurricularItems.map((item) => ({
            kegiatan: item?.kegiatan || "",
            keterangan: item?.keterangan || "",
          }))
        : [],
      achievementItems: Array.isArray(raporCms.value.achievementItems)
        ? raporCms.value.achievementItems.map((item) => ({
            jenis: item?.jenis || "",
            keterangan: item?.keterangan || "",
          }))
        : [],
      attendanceItems: Array.isArray(raporCms.value.attendanceItems)
        ? raporCms.value.attendanceItems.map((item) => ({
            label: item?.label || "",
            value: item?.value || "",
          }))
        : [],
    };

    await setDoc(tenantDoc("settings", "rapor_content_cms"), cmsPayload, { merge: true });
    await setDoc(tenantDoc("settings", "rapor_config"), { ...raporConfig.value }, { merge: true });
    await setDoc(
      tenantDoc("settings", "school_info"),
      buildSchoolInfoPayloadFromRaporConfig(),
      { merge: true },
    );

    raporCms.value = { ...raporCms.value, ...cmsPayload };
    academicPeriod.value = {
      ...academicPeriod.value,
      tahunAjaran: cmsPayload.tahunAjaran || "",
      semesterLabel: cmsPayload.semesterLabel || "",
      reportDate: cmsPayload.reportDate,
    };
    alert("CMS preview rapor berhasil disimpan.");
  } catch (error) {
    console.error("Error saving CMS preview rapor:", error);
    alert("Gagal menyimpan CMS preview rapor.");
  } finally {
    cmsSaving.value = false;
  }
};

const cmsExtracurricularRows = computed(() => {
  const rows = Array.isArray(raporCms.value.extracurricularItems)
    ? raporCms.value.extracurricularItems
    : [];
  const filtered = rows.filter((item) => item?.kegiatan || item?.keterangan);
  if (filtered.length > 0) return filtered;
  return [
    { kegiatan: "-", keterangan: "-" },
    { kegiatan: "-", keterangan: "-" },
    { kegiatan: "-", keterangan: "-" },
  ];
});

const buildDefaultStudentRaporContent = () => ({
  extracurricularItems: cmsExtracurricularRows.value.map((item) => ({
    kegiatan: item?.kegiatan || "",
    keterangan: item?.keterangan || "",
  })),
  achievementItems: cmsAchievementRows.value.map((item) => ({
    jenis: item?.jenis || "",
    keterangan: item?.keterangan || "",
  })),
  attendanceItems: cmsAttendanceRows.value.map((item) => ({
    label: item?.label || "",
    value: item?.value || "",
  })),
  homeroomNote: raporCms.value.homeroomNoteDefault || "",
});

const normalizeStudentRaporContent = (raw = {}) => {
  const defaults = buildDefaultStudentRaporContent();
  return {
    ...defaults,
    ...raw,
    extracurricularItems:
      Array.isArray(raw.extracurricularItems) && raw.extracurricularItems.length
        ? raw.extracurricularItems.map((item) => ({
            kegiatan: item?.kegiatan || "",
            keterangan: item?.keterangan || "",
          }))
        : defaults.extracurricularItems,
    achievementItems:
      Array.isArray(raw.achievementItems) && raw.achievementItems.length
        ? raw.achievementItems.map((item) => ({
            jenis: item?.jenis || "",
            keterangan: item?.keterangan || "",
          }))
        : defaults.achievementItems,
    attendanceItems:
      Array.isArray(raw.attendanceItems) && raw.attendanceItems.length
        ? raw.attendanceItems.map((item) => ({
            label: item?.label || "",
            value: item?.value || "",
          }))
        : defaults.attendanceItems,
    homeroomNote: raw.homeroomNote ?? defaults.homeroomNote,
  };
};

const renderedExtracurricularRows = computed(() => {
  if (!studentRaporContent.value) return cmsExtracurricularRows.value;
  const rows = Array.isArray(studentRaporContent.value.extracurricularItems)
    ? studentRaporContent.value.extracurricularItems
    : [];
  const filtered = rows.filter((item) => item?.kegiatan || item?.keterangan);
  return filtered.length ? filtered : cmsExtracurricularRows.value;
});

const renderedAchievementRows = computed(() => {
  if (!studentRaporContent.value) return cmsAchievementRows.value;
  const rows = Array.isArray(studentRaporContent.value.achievementItems)
    ? studentRaporContent.value.achievementItems
    : [];
  const filtered = rows.filter((item) => item?.jenis || item?.keterangan);
  return filtered.length ? filtered : cmsAchievementRows.value;
});

const renderedAttendanceRows = computed(() => {
  if (!studentRaporContent.value) return cmsAttendanceRows.value;
  const rows = Array.isArray(studentRaporContent.value.attendanceItems)
    ? studentRaporContent.value.attendanceItems
    : [];
  const filtered = rows.filter((item) => item?.label);
  return filtered.length ? filtered : cmsAttendanceRows.value;
});

const renderedHomeroomNote = computed(() => {
  if (studentRaporContent.value?.homeroomNote?.trim()) {
    return studentRaporContent.value.homeroomNote;
  }
  return raporCms.value.homeroomNoteDefault || "-";
});

const loadStudentRaporContent = async (studentId) => {
  if (!selectedClassId.value || !studentId) {
    studentRaporContent.value = normalizeStudentRaporContent();
    return;
  }
  try {
    const docId = `${selectedClassId.value}_${studentId}`;
    const snap = await getDoc(tenantDoc("student_rapor_content", docId));
    studentRaporContent.value = snap.exists()
      ? normalizeStudentRaporContent(snap.data())
      : normalizeStudentRaporContent();
  } catch (error) {
    console.error("Error loading student rapor content:", error);
    studentRaporContent.value = normalizeStudentRaporContent();
  }
};

const cmsAchievementRows = computed(() => {
  const rows = Array.isArray(raporCms.value.achievementItems)
    ? raporCms.value.achievementItems
    : [];
  const filtered = rows.filter((item) => item?.jenis || item?.keterangan);
  if (filtered.length > 0) return filtered;
  return [
    { jenis: "-", keterangan: "-" },
    { jenis: "-", keterangan: "-" },
  ];
});

const cmsAttendanceRows = computed(() => {
  const rows = Array.isArray(raporCms.value.attendanceItems)
    ? raporCms.value.attendanceItems
    : [];
  const filtered = rows.filter((item) => item?.label);
  if (filtered.length > 0) return filtered;
  return [
    { label: "Sakit", value: "" },
    { label: "Izin", value: "" },
    { label: "Tanpa Keterangan", value: "" },
  ];
});

/**
 * Membagi daftar mapel menjadi "pages" untuk ditampilkan per halaman A4.
 * Halaman pertama: header identitas siswa + mapel (baris lebih sedikit karena header memakai tempat)
 * Halaman berikutnya: lanjutan mapel saja
 * Halaman terakhir: sisa mapel + ekskul + prestasi + ketidakhadiran + TTD
 *
 * Estimasi kapasitas:
 *  - Header identitas: ~45mm → sisa  ≈ 218mm
 *  - Tiap baris mapel: ~12mm
 *  - Halaman 1 muat: ~18 baris mapel
 *  - Halaman berikutnya (full): ~22 baris mapel
 *  - Footer TTD + ekskul + prestasi + ketidakhadiran: ~90mm → ≈ 7-8 baris mapel harus disimpan untuk footer
 */
const ROWS_PAGE1 = 17; // kapasitas unit halaman pertama (ada header)
const ROWS_NEXT  = 24; // kapasitas unit halaman berikutnya
const FOOTER_BLOCKS = computed(() => {
  const base = [{ id: "ketidakhadiran", units: 3 }, { id: "signature", units: 6 }];
  if (!canViewWaliSections.value) return base;
  return [
    { id: "extracurricular", units: 4 },
    { id: "prestasi", units: 3 },
    ...base,
    { id: "catatan", units: 2 },
  ];
});

const raporPages = computed(() => {
  if (!selectedStudent.value || subjects.value.length === 0) return [];

  const allSubjects = subjects.value.map(sub => {
    const grade = findGrade(selectedStudent.value.id, sub.id);
    return {
      ...sub,
      na: grade?.final_score || 0,
      deskripsi: getDescriptionForStudent(selectedStudent.value.id, sub.id),
      kelompok: (sub.kelompok || 'A').toUpperCase(),
    };
  });

  // Kelompokkan
  const grouped = [];
  const groups = [
    { key: ['A','UMUM',''],  label: 'A. KELOMPOK MATA PELAJARAN UMUM :' },
    { key: ['B','KEJURUAN'], label: 'B. KELOMPOK MATA PELAJARAN KEJURUAN :' },
    { key: ['C','LOKAL'],    label: 'C. MUATAN LOKAL :' },
  ];
  groups.forEach(g => {
    const list = allSubjects.filter(s => g.key.includes(s.kelompok));
    if (list.length > 0) grouped.push({ label: g.label, items: list });
  });

  // Flatten menjadi "slot" entries
  const slots = [];
  grouped.forEach(grp => {
    slots.push({ type: 'header', label: grp.label, unit: 1 });
    grp.items.forEach((sub, i) => {
      const descriptionUnit = Math.max(
        1,
        Math.ceil((sub.deskripsi || "").length / 120),
      );
      slots.push({ type: 'row', sub, idx: i, unit: descriptionUnit });
    });
  });

  // Pecah mapel ke halaman
  const pages = [];
  let currentPage = {
    isFirst: false,
    slots: [],
    footerBlocks: [],
    usedUnits: 0,
    footerUnits: 0,
  };
  let used = 0;
  let isFirst = true;

  const limit = () => {
    if (isFirst) return ROWS_PAGE1;
    return ROWS_NEXT;
  };

  slots.forEach(slot => {
    if (used + slot.unit > limit() && currentPage.slots.length > 0) {
      currentPage.usedUnits = used;
      pages.push(currentPage);
      currentPage = {
        isFirst: false,
        slots: [],
        footerBlocks: [],
        usedUnits: 0,
        footerUnits: 0,
      };
      used = 0;
      isFirst = false;
    }
    currentPage.slots.push(slot);
    used += slot.unit;
  });

  if (pages.length === 0) currentPage.isFirst = true;
  currentPage.usedUnits = used;
  pages.push(currentPage);
  if (pages.length > 0) pages[0].isFirst = true;
  
  // Distribusi blok footer: pakai sisa ruang halaman terakhir dahulu.
  let footerPage = pages[pages.length - 1];
  let footerPageCapacity = footerPage.isFirst ? ROWS_PAGE1 : ROWS_NEXT;
  let footerUsed = footerPage.usedUnits;

  FOOTER_BLOCKS.value.forEach((block) => {
    if (footerUsed + block.units > footerPageCapacity) {
      footerPage = {
        isFirst: false,
        slots: [],
        footerBlocks: [],
        usedUnits: 0,
        footerUnits: 0,
      };
      pages.push(footerPage);
      footerPageCapacity = ROWS_NEXT;
      footerUsed = 0;
    }
    footerPage.footerBlocks.push(block.id);
    footerPage.footerUnits += block.units;
    footerUsed += block.units;
  });

  return pages;
});

const hasFooterBlock = (page, blockId) =>
  Array.isArray(page?.footerBlocks) && page.footerBlocks.includes(blockId);

const visibleRaporPage = computed(
  () => raporPages.value[currentRaporPage.value] || null,
);

const goToPrevRaporPage = () => {
  if (currentRaporPage.value > 0) currentRaporPage.value--;
};

const goToNextRaporPage = () => {
  if (currentRaporPage.value < raporPages.value.length - 1) {
    currentRaporPage.value++;
  }
};

const selectPreviewTab = (tabId) => {
  activePreviewTab.value = tabId;
  if (tabId === "raport") currentRaporPage.value = 0;
};

watch(raporPages, (pages) => {
  if (pages.length === 0) {
    currentRaporPage.value = 0;
    return;
  }
  if (currentRaporPage.value > pages.length - 1) {
    currentRaporPage.value = pages.length - 1;
  }
});

const downloadPDF = async (student) => {
  if (!student) return;
  const element = document.getElementById('full-report-print');
  if (!element) {
    alert("Elemen cetak tidak ditemukan.");
    return;
  }
  let mount = null;

  try {
    element.style.display = 'block';

    // PDF hanya berisi halaman rapor-paper.
    const papers = Array.from(element.querySelectorAll('.rapor-paper'));
    if (papers.length === 0) {
      element.style.display = 'none';
      alert("Konten rapor tidak ditemukan.");
      return;
    }

    const meaningfulPages = papers.filter((paper) => {
      const hasRealContent = paper.querySelector(
        "img, .field-box, .data-row, .report-header-info, .main-table tbody tr, .report-subtitle, .sig-container",
      );
      const compactText = (paper.textContent || "").replace(/\s+/g, "").trim();
      return Boolean(hasRealContent) || compactText.length > 20;
    });

    if (meaningfulPages.length === 0) {
      element.style.display = 'none';
      alert("Konten rapor kosong.");
      return;
    }

    mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "-99999px";
    mount.style.top = "0";
    mount.style.width = "210mm";
    mount.style.background = "#fff";
    document.body.appendChild(mount);

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    for (let idx = 0; idx < meaningfulPages.length; idx++) {
      const paper = meaningfulPages[idx];
      const clone = paper.cloneNode(true);
      clone.style.width = "210mm";
      clone.style.maxWidth = "210mm";
      clone.style.height = "297mm";
      clone.style.minHeight = "297mm";
      clone.style.maxHeight = "297mm";
      clone.style.margin = "0";
      clone.style.padding = "14mm 16mm";
      clone.style.boxSizing = "border-box";
      clone.style.overflow = "hidden";
      clone.style.background = "#fff";
      clone.style.border = "none";
      clone.style.boxShadow = "none";

      mount.appendChild(clone);
      await nextTick();

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      if (idx > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      mount.removeChild(clone);
    }

    pdf.save(`Rapor_${student.nama.replace(/\s+/g, '_')}_${myClass.value?.nama || 'Kelas'}.pdf`);

    element.style.display = 'none';
  } catch (err) {
    console.error('PDF error:', err);
    element.style.display = 'none';
    alert('Gagal membuat PDF. Silakan coba lagi.');
  } finally {
    if (mount?.parentNode) document.body.removeChild(mount);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeSheetName = (name, used = null) => {
  const base = (name || "Sheet")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
  if (!used) return base;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (true) {
    const suffix = `_${i}`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    i++;
  }
};

const downloadAllPDF = async () => {
  if (!students.value.length || !myClass.value) {
    alert("Tidak ada data siswa untuk diunduh.");
    return;
  }
  if (!shouldContinueIncompleteExport()) return;

  const previousStudent = selectedStudent.value;
  const previousPreview = showPreview.value;
  const previousTab = activePreviewTab.value;
  let pdfSource = null;

  try {
    const opt = {
      margin: 0,
      filename: `Rapor_SemuaSiswa_${(myClass.value.nama || "Kelas").replace(/\s+/g, "_")}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["legacy", "css"] },
    };

    pdfSource = document.createElement("div");
    pdfSource.style.width = "210mm";
    pdfSource.style.margin = "0";
    pdfSource.style.padding = "0";
    pdfSource.style.background = "#fff";

    const allClones = [];
    for (const student of students.value) {
      selectedStudent.value = student;
      await nextTick();
      await sleep(500);

      const source = document.getElementById("full-report-print");
      if (!source) continue;
      source.style.display = "block";

      const papers = Array.from(source.querySelectorAll(".rapor-paper"));
      // Include all papers, don't filter by content
      papers.forEach((paper) => {
        const clone = paper.cloneNode(true);
        clone.style.width = "210mm";
        clone.style.maxWidth = "210mm";
        clone.style.boxSizing = "border-box";
        clone.style.margin = "0";
        clone.style.padding = "14mm 16mm";
        clone.style.background = "#fff";
        clone.style.height = "297mm";
        clone.style.minHeight = "297mm";
        clone.style.maxHeight = "297mm";
        clone.style.overflow = "visible";
        clone.style.border = "none";
        clone.style.boxShadow = "none";
        clone.style.pageBreakInside = "avoid";
        clone.style.breakInside = "avoid-page";
        allClones.push(clone);
      });

      source.style.display = "none";
    }

    if (!allClones.length) {
      alert("Konten rapor kosong.");
      return;
    }

    allClones.forEach((clone, idx) => {
      clone.style.setProperty("page-break-after", "always", "important");
      clone.style.setProperty("break-after", "page", "important");
      pdfSource.appendChild(clone);
      if (idx === allClones.length - 1) {
        clone.style.setProperty("page-break-after", "auto", "important");
        clone.style.setProperty("break-after", "auto", "important");
      }
    });

    document.body.appendChild(pdfSource);
    const { default: html2pdf } = await import("html2pdf.js");
    await html2pdf().set(opt).from(pdfSource).save();
  } catch (error) {
    console.error("Error generating all PDF:", error);
    alert("Terjadi kesalahan saat membuat PDF semua siswa.");
  } finally {
    if (pdfSource?.parentNode) document.body.removeChild(pdfSource);
    selectedStudent.value = previousStudent;
    showPreview.value = previousPreview;
    activePreviewTab.value = previousTab;
    await nextTick();
    const restoredSource = document.getElementById("full-report-print");
    if (restoredSource) restoredSource.style.display = "none";
  }
};

const handlePrint = (student) => {
  if (!student) return;
  const source = document.getElementById("full-report-print");
  if (!source) {
    alert("Elemen cetak tidak ditemukan.");
    return;
  }

  const papers = Array.from(source.querySelectorAll(".rapor-paper"));
  if (papers.length === 0) {
    alert("Konten rapor tidak ditemukan.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=1000,height=900");
  if (!printWindow) {
    alert("Popup cetak diblokir browser. Izinkan popup lalu coba lagi.");
    return;
  }

  const inheritedStyles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )
    .map((node) => node.outerHTML)
    .join("\n");

  const printStyles = `
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        font-family: "Times New Roman", Times, serif;
      }
      #print-root {
        width: 210mm;
        margin: 0 auto;
        padding: 0;
      }
      .rapor-paper {
        width: 210mm !important;
        min-width: 210mm !important;
        max-width: 210mm !important;
        min-height: 297mm !important;
        margin: 0 !important;
        padding: 14mm 16mm !important;
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
        font-family: "Times New Roman", Times, serif !important;
      }
      .rapor-paper:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .rapor-paper:not(.rapor-nilai-paper) {
        height: 297mm !important;
        max-height: 297mm !important;
        overflow: hidden !important;
      }
      .rapor-paper.rapor-nilai-paper {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .rapor-paper * {
        font-family: "Times New Roman", Times, serif !important;
      }
      .report-section,
      .report-header-info,
      .sig-container,
      .main-table {
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
      }
    </style>
  `;

  const cloned = papers.map((paper) => paper.cloneNode(true));
  const html = `
    <html>
      <head>
        <title>Cetak Rapor</title>
        ${inheritedStyles}
        ${printStyles}
      </head>
      <body>
        <div id="print-root">
          ${cloned.map((node) => node.outerHTML).join("")}
        </div>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
};

const downloadExcel = async (
  student,
  options = { targetWorkbook: null, sheetPrefix: "", autoSave: true, usedSheetNames: null },
) => {
  if (!student || !myClass.value) return;

  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = options.targetWorkbook || new ExcelJS.Workbook();
    const sheetPrefix = options.sheetPrefix ? `${options.sheetPrefix} - ` : "";
    const usedSheetNames = options.usedSheetNames instanceof Set ? options.usedSheetNames : new Set();
    const autoSave = options.autoSave !== false;

    // Helper function to set common styles
    const setCellStyles = (cell, font, alignment, border, fill) => {
      if (font) cell.font = font;
      if (alignment) cell.alignment = alignment;
      if (border) cell.border = border;
      if (fill) cell.fill = fill;
    };

    // Common font
    const timesNewRoman10 = { name: "Times New Roman", size: 10 };
    const timesNewRoman9 = { name: "Times New Roman", size: 9 };
    const timesNewRoman11 = { name: "Times New Roman", size: 11 };
    const timesNewRoman12 = { name: "Times New Roman", size: 12 };
    const timesNewRoman14 = { name: "Times New Roman", size: 14 };
    const timesNewRoman16 = { name: "Times New Roman", size: 16 };

    // Common alignment
    const alignCenter = { horizontal: "center", vertical: "middle" };
    const alignLeft = { horizontal: "left", vertical: "middle" };
    const alignTopLeft = { horizontal: "left", vertical: "top", wrapText: true };
    const alignTopCenter = { horizontal: "center", vertical: "top", wrapText: true };

    // Common border
    const thinBorder = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    const mediumBorder = {
      top: { style: "medium" },
      left: { style: "medium" },
      bottom: { style: "medium" },
      right: { style: "medium" },
    };

    // --- Sheet 1: Sampul ---
    const sheetSampul = workbook.addWorksheet(
      sanitizeSheetName(`${sheetPrefix}Sampul`, usedSheetNames),
      {
      pageSetup: {
        paperSize: 9, // A4
        orientation: "portrait",
        fitToPage: true,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 },
      },
    });
    sheetSampul.properties.defaultRowHeight = 20;
    sheetSampul.getColumn(1).width = 10; // A
    sheetSampul.getColumn(2).width = 10; // B
    sheetSampul.getColumn(3).width = 10; // C
    sheetSampul.getColumn(4).width = 10; // D
    sheetSampul.getColumn(5).width = 10; // E

    let currentRowSampul = 1;

    sheetSampul.mergeCells(`A${currentRowSampul}:E${currentRowSampul}`);
    setCellStyles(sheetSampul.getCell(`A${currentRowSampul}`), { ...timesNewRoman14, bold: true }, alignCenter, null, null);
    sheetSampul.getCell(`A${currentRowSampul}`).value = "RAPOR PESERTA DIDIK";
    currentRowSampul += 1;

    sheetSampul.mergeCells(`A${currentRowSampul}:E${currentRowSampul}`);
    setCellStyles(sheetSampul.getCell(`A${currentRowSampul}`), { ...timesNewRoman12, bold: true }, alignCenter, null, null);
    sheetSampul.getCell(`A${currentRowSampul}`).value = "SEKOLAH MENENGAH KEJURUAN (SMK)";
    currentRowSampul += 3;

    sheetSampul.mergeCells(`A${currentRowSampul}:E${currentRowSampul}`);
    setCellStyles(sheetSampul.getCell(`A${currentRowSampul}`), { ...timesNewRoman16, bold: true }, alignCenter, null, null);
    sheetSampul.getCell(`A${currentRowSampul}`).value = raporConfig.value.namaSekolah || "SMK SURAMADU";
    currentRowSampul += 2;

    sheetSampul.mergeCells(`B${currentRowSampul}:D${currentRowSampul}`);
    const nameBoxSampul = sheetSampul.getCell(`B${currentRowSampul}`);
    nameBoxSampul.value = `Nama Peserta Didik:\n${student.nama}`;
    setCellStyles(nameBoxSampul, { ...timesNewRoman12, bold: true }, { ...alignCenter, wrapText: true }, mediumBorder, null);
    sheetSampul.getRow(currentRowSampul).height = 40;
    currentRowSampul += 2;

    sheetSampul.mergeCells(`B${currentRowSampul}:D${currentRowSampul}`);
    const nisBoxSampul = sheetSampul.getCell(`B${currentRowSampul}`);
    nisBoxSampul.value = `NIS/NISN:\n${student.nis || student.nisn}`;
    setCellStyles(nisBoxSampul, timesNewRoman11, { ...alignCenter, wrapText: true }, mediumBorder, null);
    sheetSampul.getRow(currentRowSampul).height = 35;
    currentRowSampul += 3;

    sheetSampul.mergeCells(`A${currentRowSampul}:E${currentRowSampul}`);
    setCellStyles(sheetSampul.getCell(`A${currentRowSampul}`), { ...timesNewRoman11, bold: true }, { ...alignCenter, wrapText: true }, null, null);
    sheetSampul.getCell(`A${currentRowSampul}`).value = `${raporConfig.value.headerBaris1}\n${raporConfig.value.headerBaris2}`;
    currentRowSampul += 5;

    // --- Sheet 2: Data Sekolah ---
    const sheetDataSekolah = workbook.addWorksheet(
      sanitizeSheetName(`${sheetPrefix}Data Sekolah`, usedSheetNames),
      {
      pageSetup: {
        paperSize: 9, // A4
        orientation: "portrait",
        fitToPage: true,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 },
      },
    });
    sheetDataSekolah.properties.defaultRowHeight = 20;
    sheetDataSekolah.getColumn(1).width = 5; // A
    sheetDataSekolah.getColumn(2).width = 25; // B
    sheetDataSekolah.getColumn(3).width = 5; // C
    sheetDataSekolah.getColumn(4).width = 40; // D

    let currentRowSekolah = 1;

    sheetDataSekolah.mergeCells(`A${currentRowSekolah}:D${currentRowSekolah}`);
    setCellStyles(sheetDataSekolah.getCell(`A${currentRowSekolah}`), { ...timesNewRoman14, bold: true, underline: true }, alignCenter, null, null);
    sheetDataSekolah.getCell(`A${currentRowSekolah}`).value = "KETERANGAN TENTANG DIRI PESERTA DIDIK";
    currentRowSekolah += 2;

    const schoolData = [
      ["Nama Sekolah", raporConfig.value.namaSekolah],
      ["NPSN", raporConfig.value.npsn],
      ["Alamat", `${raporConfig.value.alamatJalan}, Kel. ${raporConfig.value.kelurahan}, Kec. ${raporConfig.value.kecamatan}, Kab. ${raporConfig.value.kabupaten}, Prov. ${raporConfig.value.provinsi}`],
      ["Kode Pos", "-"], // Assuming no kode pos in config
      ["Telepon", "-"], // Assuming no telepon in config
      ["Faksimili", "-"], // Assuming no faksimili in config
      ["Email", raporConfig.value.email],
      ["Website", raporConfig.value.website],
    ];

    schoolData.forEach((data, index) => {
      sheetDataSekolah.getCell(`B${currentRowSekolah + index}`).value = `${index + 1}. ${data[0]}`;
      sheetDataSekolah.getCell(`D${currentRowSekolah + index}`).value = data[1];
      setCellStyles(sheetDataSekolah.getCell(`B${currentRowSekolah + index}`), timesNewRoman11, alignLeft, null, null);
      setCellStyles(sheetDataSekolah.getCell(`D${currentRowSekolah + index}`), timesNewRoman11, alignLeft, null, null);
    });
    currentRowSekolah += schoolData.length + 2;

    // --- Sheet 3: Biodata Siswa ---
    const sheetBiodata = workbook.addWorksheet(
      sanitizeSheetName(`${sheetPrefix}Biodata`, usedSheetNames),
      {
      pageSetup: {
        paperSize: 9, // A4
        orientation: "portrait",
        fitToPage: true,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 },
      },
    });
    sheetBiodata.properties.defaultRowHeight = 20;
    sheetBiodata.getColumn(1).width = 5; // A
    sheetBiodata.getColumn(2).width = 25; // B
    sheetBiodata.getColumn(3).width = 5; // C
    sheetBiodata.getColumn(4).width = 40; // D

    let currentRowBiodata = 1;

    sheetBiodata.mergeCells(`A${currentRowBiodata}:D${currentRowBiodata}`);
    setCellStyles(sheetBiodata.getCell(`A${currentRowBiodata}`), { ...timesNewRoman14, bold: true, underline: true }, alignCenter, null, null);
    sheetBiodata.getCell(`A${currentRowBiodata}`).value = "KETERANGAN TENTANG DIRI PESERTA DIDIK";
    currentRowBiodata += 2;

    const studentData = [
      ["Nama Peserta Didik (Lengkap)", student.nama],
      ["Nomor Induk Siswa Nasional (NISN)", student.nisn],
      ["Nomor Induk Siswa (NIS)", student.nis],
      ["Tempat, Tanggal Lahir", `${student.tempatLahir}, ${student.tanggalLahir}`],
      ["Jenis Kelamin", student.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'],
      ["Agama", student.agama],
      ["Status dalam Keluarga", student.statusKeluarga],
      ["Anak Ke", student.anakKe],
      ["Alamat Peserta Didik", student.alamat],
      ["Nomor Telepon Rumah", student.noTelp],
      ["Sekolah Asal", student.sekolahAsal],
      ["Diterima di sekolah ini", ""], // Placeholder
      ["Di kelas", myClass.value.nama],
      ["Pada tanggal", student.tanggalDiterima],
      ["Nama Orang Tua", ""], // Placeholder
      ["a. Ayah", student.namaAyah],
      ["b. Ibu", student.namaIbu],
      ["Alamat Orang Tua", student.alamatOrtu],
      ["Nomor Telepon Rumah", student.noTelpOrtu],
      ["Pekerjaan Orang Tua", ""], // Placeholder
      ["a. Ayah", student.pekerjaanAyah],
      ["b. Ibu", student.pekerjaanIbu],
      ["Nama Wali", student.namaWali],
      ["Alamat Wali", student.alamatWali],
      ["Nomor Telepon Wali", student.noTelpWali],
      ["Pekerjaan Wali", student.pekerjaanWali],
    ];

    studentData.forEach((data, index) => {
      sheetBiodata.getCell(`B${currentRowBiodata + index}`).value = `${index + 1}. ${data[0]}`;
      sheetBiodata.getCell(`D${currentRowBiodata + index}`).value = data[1];
      setCellStyles(sheetBiodata.getCell(`B${currentRowBiodata + index}`), timesNewRoman11, alignLeft, null, null);
      setCellStyles(sheetBiodata.getCell(`D${currentRowBiodata + index}`), timesNewRoman11, alignLeft, null, null);
    });
    currentRowBiodata += studentData.length + 2;

    // --- Sheet 4: Rapor Nilai ---
    const sheetRapor = workbook.addWorksheet(
      sanitizeSheetName(`${sheetPrefix}Rapor`, usedSheetNames),
      {
      pageSetup: {
        paperSize: 9, // A4
        orientation: "portrait",
        fitToPage: true,
        margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 },
      },
    });
    sheetRapor.properties.defaultRowHeight = 20;
    sheetRapor.getColumn("A").width = 2;
    sheetRapor.getColumn("B").width = 5;
    sheetRapor.getColumn("C").width = 30;
    sheetRapor.getColumn("D").width = 12;
    sheetRapor.getColumn("E").width = 12;
    sheetRapor.getColumn("F").width = 10;
    sheetRapor.getColumn("G").width = 10;
    sheetRapor.getColumn("H").width = 40; // Deskripsi

    let currentRowRapor = 1;

    sheetRapor.mergeCells(`A${currentRowRapor}:H${currentRowRapor}`);
    setCellStyles(sheetRapor.getCell(`A${currentRowRapor}`), { ...timesNewRoman14, bold: true, underline: true }, alignCenter, null, null);
    sheetRapor.getCell(`A${currentRowRapor}`).value =
      raporCms.value.reportTitle || "CAPAIAN HASIL BELAJAR";
    currentRowRapor += 2;

    sheetRapor.getRow(currentRowRapor).values = [
      "",
      `Nama Sekolah: ${raporConfig.value.namaSekolah}`,
      "",
      "",
      `Kelas: ${myClass.value.nama}`,
    ];
    setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), timesNewRoman11, alignLeft, null, null);
    setCellStyles(sheetRapor.getCell(`E${currentRowRapor}`), timesNewRoman11, alignLeft, null, null);
    currentRowRapor++;

    sheetRapor.getRow(currentRowRapor).values = [
      "",
      `Nama: ${student.nama}`,
      "",
      "",
      `Semester: ${currentSemesterLabel.value}`,
    ];
    setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), timesNewRoman11, alignLeft, null, null);
    setCellStyles(sheetRapor.getCell(`E${currentRowRapor}`), timesNewRoman11, alignLeft, null, null);
    currentRowRapor += 2;

    // Table header
    const headerRowRapor = sheetRapor.getRow(currentRowRapor);
    headerRowRapor.values = [
      "",
      "No",
      "Mata Pelajaran",
      "Pengetahuan",
      "Keterampilan",
      "Nilai Akhir",
      "Predikat",
      "Deskripsi",
    ];
    headerRowRapor.eachCell((cell) => {
      setCellStyles(cell, { ...timesNewRoman10, bold: true }, alignCenter, thinBorder, { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3D3D3" } });
    });
    currentRowRapor++;

    // Prepare student grades data
    const studentGradesData = {};
    subjects.value.forEach((sub) => {
      const foundGrade = findGrade(student.id, sub.id);
      const finalScore = foundGrade?.final_score || 0;
      const predikat = getPredikat(finalScore);
      const deskripsi = getDeskripsi(finalScore, sub.nama, competencies.value?.[sub.id] ?? null);

      studentGradesData[sub.id] = {
        knowledge: foundGrade?.knowledge_score || 0,
        skill: foundGrade?.skill_score || 0,
        na: finalScore,
        predikat: predikat,
        deskripsi: deskripsi,
      };
    });

    const mapelA = subjects.value.filter(
      (s) => (s.kelompok || "A").toUpperCase() === "A",
    );
    const mapelB = subjects.value.filter(
      (s) => (s.kelompok || "A").toUpperCase() === "B",
    );
    const mapelC = subjects.value.filter(
      (s) => (s.kelompok || "A").toUpperCase() === "C",
    );

    const groups = [
      ["A", mapelA, "Muatan Nasional"],
      ["B", mapelB, "Muatan Kewilayahan"],
      ["C", mapelC, "Muatan Peminatan Kejuruan"],
    ];

    groups.forEach(([letter, subjectList, groupName]) => {
      sheetRapor.mergeCells(`B${currentRowRapor}:H${currentRowRapor}`);
      const groupCell = sheetRapor.getCell(`B${currentRowRapor}`);
      groupCell.value = `${letter}. ${groupName}`;
      setCellStyles(groupCell, { ...timesNewRoman10, bold: true }, alignLeft, thinBorder, { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } });
      currentRowRapor++;

      subjectList.forEach((subject, idx) => {
        const grade = studentGradesData[subject.id];
        if (grade) {
          const row = sheetRapor.getRow(currentRowRapor);
          row.values = [
            "",
            idx + 1,
            subject.nama,
            grade.knowledge,
            grade.skill,
            grade.na,
            grade.predikat,
            grade.deskripsi,
          ];
          row.eachCell((cell) => {
            setCellStyles(cell, timesNewRoman9, alignTopLeft, thinBorder, null);
          });

          setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), null, alignTopCenter, null, null);
          setCellStyles(sheetRapor.getCell(`D${currentRowRapor}`), null, alignTopCenter, null, null);
          setCellStyles(sheetRapor.getCell(`E${currentRowRapor}`), null, alignTopCenter, null, null);
          setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), { ...timesNewRoman9, bold: true }, alignTopCenter, null, null);
          setCellStyles(sheetRapor.getCell(`G${currentRowRapor}`), null, alignTopCenter, null, null);

          currentRowRapor++;
        }
      });
    });

    // Tanda Tangan
    currentRowRapor += 2;
    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = `${raporConfig.value.kotaTtd}, ${currentReportDateLabel.value}`;
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor++;

    sheetRapor.mergeCells(`B${currentRowRapor}:D${currentRowRapor}`);
    sheetRapor.getCell(`B${currentRowRapor}`).value = "Orang Tua/Wali";
    setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = "Wali Kelas";
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor += 4;

    sheetRapor.mergeCells(`B${currentRowRapor}:D${currentRowRapor}`);
    sheetRapor.getCell(`B${currentRowRapor}`).value = "(....................................)";
    setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = `(${myClass.value.waliKelasNama || 'Nama Wali Kelas'})`;
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor += 2;

    sheetRapor.mergeCells(`B${currentRowRapor}:D${currentRowRapor}`);
    sheetRapor.getCell(`B${currentRowRapor}`).value = ""; // Placeholder for NIP Orang Tua/Wali
    setCellStyles(sheetRapor.getCell(`B${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = `NIP. ${myClass.value.waliKelasNip || '-'}`;
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor += 2;

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = "Kepala Sekolah";
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor += 4;

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = `(${raporConfig.value.namaKepsek})`;
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);
    currentRowRapor++;

    sheetRapor.mergeCells(`F${currentRowRapor}:H${currentRowRapor}`);
    sheetRapor.getCell(`F${currentRowRapor}`).value = `NIP. ${raporConfig.value.nipKepsek}`;
    setCellStyles(sheetRapor.getCell(`F${currentRowRapor}`), timesNewRoman11, alignCenter, null, null);


    // Generate and download
    if (autoSave) {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const studentName = student.nama.replace(/\s+/g, "_");
      const className = myClass.value.nama.replace(/\s+/g, "_");
      saveAs(blob, `Rapor_${studentName}_${className}_Semester1.xlsx`);
    }

    return workbook;
  } catch (error) {
    console.error("Error generating Excel:", error);
    if (options.autoSave !== false) {
      alert("Terjadi kesalahan saat membuat Excel: " + error.message);
    }
    throw error;
  }
};

const downloadAllExcel = async () => {
  if (!students.value.length || !myClass.value) {
    alert("Tidak ada data siswa untuk diunduh.");
    return;
  }
  if (!shouldContinueIncompleteExport()) return;

  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set();

    for (const [idx, student] of students.value.entries()) {
      try {
        await downloadExcel(student, {
          targetWorkbook: workbook,
          sheetPrefix: `${idx + 1}. ${student.nama}`,
          autoSave: false,
          usedSheetNames: usedSheetNames,
        });
      } catch (studentError) {
        console.error(`Error processing student ${student.nama}:`, studentError);
        // Continue with next student instead of stopping
      }
    }

    if (workbook.worksheets.length === 0) {
      alert("Tidak ada data untuk diekspor.");
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const className = (myClass.value.nama || "Kelas").replace(/\s+/g, "_");
    saveAs(blob, `Rapor_SemuaSiswa_${className}.xlsx`);
  } catch (error) {
    console.error("Error generating all Excel:", error);
    alert("Terjadi kesalahan saat membuat Excel semua siswa: " + error.message);
  }
};
</script>

<template>
  <div class="wali-kelas-rapor-root">
    <div class="page-container no-print">
      <div class="page-header animate-slide-up">
        <div>
          <h2>Kelola Rapor</h2>
          <p class="text-muted">Pantau progres dan cetak rapor siswa.</p>
        </div>
      </div>

      <div
        class="filter-bar card animate-fade-in"
        style="animation-delay: 0.1s"
      >
        <div class="filter-group">
          <label class="font-bold">Pilih Kelas:</label>
          <select v-model="selectedClassId" class="form-select class-select">
            <option value="" disabled>-- Pilih Kelas --</option>
            <option v-for="c in classes" :key="c.id" :value="c.id">
              {{ c.nama }}
              <span v-if="c.waliKelasId === auth.currentUser?.uid"
                >(Kelas Saya)</span
              >
            </option>
          </select>
          <button
            class="btn btn-outline btn-batch-action"
            :disabled="!selectedClassId || students.length === 0"
            @click="downloadAllPDF"
          >
            Download Semua PDF
          </button>
          <button
            class="btn btn-outline btn-batch-action"
            :disabled="!selectedClassId || students.length === 0"
            @click="downloadAllExcel"
          >
            Download Semua Excel
          </button>
          <button class="btn btn-outline btn-batch-action" @click="cmsOpen = !cmsOpen">
            <Settings2 :size="16" />
            {{ cmsOpen ? "Tutup CMS Preview" : "Buka CMS Preview" }}
          </button>
        </div>
      </div>

      <div v-if="cmsOpen" class="card cms-editor animate-fade-in">
        <div class="cms-editor-head">
          <h3>CMS Lengkap Preview Rapor</h3>
          <button class="btn btn-primary" @click="savePreviewCms" :disabled="cmsSaving">
            <Save :size="16" />
            {{ cmsSaving ? "Menyimpan..." : "Simpan CMS" }}
          </button>
        </div>

        <div class="cms-grid-2">
          <div class="cms-block">
            <h4>Data Sekolah & Penandatangan</h4>
            <div class="cms-grid-2">
              <label class="cms-field"><span>Nama Sekolah</span><input v-model="raporConfig.namaSekolah" class="form-input" /></label>
              <label class="cms-field"><span>NPSN</span><input v-model="raporConfig.npsn" class="form-input" /></label>
              <label class="cms-field"><span>Alamat Jalan</span><input v-model="raporConfig.alamatJalan" class="form-input" /></label>
              <label class="cms-field"><span>Kelurahan</span><input v-model="raporConfig.kelurahan" class="form-input" /></label>
              <label class="cms-field"><span>Kecamatan</span><input v-model="raporConfig.kecamatan" class="form-input" /></label>
              <label class="cms-field"><span>Kabupaten/Kota</span><input v-model="raporConfig.kabupaten" class="form-input" /></label>
              <label class="cms-field"><span>Provinsi</span><input v-model="raporConfig.provinsi" class="form-input" /></label>
              <label class="cms-field"><span>Kode Pos</span><input v-model="raporConfig.kodePos" class="form-input" /></label>
              <label class="cms-field"><span>Telepon</span><input v-model="raporConfig.telepon" class="form-input" /></label>
              <label class="cms-field"><span>Email</span><input v-model="raporConfig.email" class="form-input" /></label>
              <label class="cms-field"><span>Website</span><input v-model="raporConfig.website" class="form-input" /></label>
              <label class="cms-field"><span>Kota TTD</span><input v-model="raporConfig.kotaTtd" class="form-input" /></label>
              <label class="cms-field"><span>Nama Kepala Sekolah</span><input v-model="raporConfig.namaKepsek" class="form-input" /></label>
              <label class="cms-field"><span>NIP Kepala Sekolah</span><input v-model="raporConfig.nipKepsek" class="form-input" /></label>
              <label class="cms-field"><span>Teks Footer Baris 1</span><input v-model="raporConfig.headerBaris1" class="form-input" /></label>
              <label class="cms-field"><span>Teks Footer Baris 2</span><input v-model="raporConfig.headerBaris2" class="form-input" /></label>
              <div class="cms-field cms-span2">
                <span>Upload Logo Sekolah</span>
                <div class="cms-logo-upload">
                  <img
                    :src="localLogoPreviewUrl || raporConfig.logoBase64 || raporConfig.logoUrl || '/logo_rapor.png'"
                    alt="Preview Logo"
                    class="cms-logo-preview"
                  />
                  <div class="cms-logo-actions">
                    <input
                      ref="logoFileInputRef"
                      type="file"
                      accept="image/*"
                      class="form-input"
                      @change="handleLogoFileChange"
                    />
                    <small class="text-muted">Pilih JPG/PNG/SVG. Logo akan diupload saat klik Simpan CMS.</small>
                    <button
                      v-if="logoUploadFile"
                      type="button"
                      class="btn btn-outline btn-mini"
                      @click="clearLogoFileSelection"
                    >
                      Batal Upload
                    </button>
                  </div>
                </div>
              </div>
              <label class="cms-field cms-span2"><span>URL Logo (opsional, manual)</span><input v-model="raporConfig.logoUrl" class="form-input" /></label>
            </div>
          </div>

          <div class="cms-block">
            <h4>Periode & Judul Rapor</h4>
            <div class="cms-grid-2">
              <label class="cms-field"><span>Tahun Ajaran</span><input v-model="raporCms.tahunAjaran" class="form-input" /></label>
              <label class="cms-field"><span>Semester</span><input v-model="raporCms.semesterLabel" class="form-input" /></label>
              <label class="cms-field"><span>Tanggal Rapor</span><input v-model="raporCms.reportDate" type="date" class="form-input" /></label>
              <label class="cms-field cms-span2"><span>Judul Halaman Nilai</span><input v-model="raporCms.reportTitle" class="form-input" /></label>
              <label class="cms-field cms-span2"><span>Subjudul Halaman Nilai</span><textarea v-model="raporCms.reportSubtitle" rows="2" class="form-input"></textarea></label>
              <label class="cms-field"><span>Judul Ekstrakurikuler</span><input v-model="raporCms.sectionTitleExtracurricular" class="form-input" /></label>
              <label class="cms-field"><span>Judul Prestasi</span><input v-model="raporCms.sectionTitleAchievement" class="form-input" /></label>
              <label class="cms-field"><span>Judul Ketidakhadiran</span><input v-model="raporCms.sectionTitleAttendance" class="form-input" /></label>
              <label class="cms-field"><span>Judul Catatan Wali Kelas</span><input v-model="raporCms.sectionTitleHomeroomNote" class="form-input" /></label>
              <label class="cms-field cms-span2"><span>Catatan Wali Kelas Default</span><textarea v-model="raporCms.homeroomNoteDefault" rows="3" class="form-input"></textarea></label>
            </div>
          </div>
        </div>

        <div class="cms-block">
          <h4>Teks Statis di Preview</h4>
          <div class="cms-grid-2">
            <template v-for="field in cmsPreviewTextFields" :key="field.key">
              <label class="cms-field">
                <span>{{ field.label }}</span>
                <textarea
                  v-if="field.multiline"
                  v-model="raporCms.previewText[field.key]"
                  rows="2"
                  class="form-input"
                ></textarea>
                <input
                  v-else
                  v-model="raporCms.previewText[field.key]"
                  class="form-input"
                />
              </label>
            </template>
          </div>
        </div>

        <div class="cms-grid-3">
          <div class="cms-block">
            <div class="cms-block-head">
              <h4>Ekstrakurikuler</h4>
              <button class="btn btn-outline btn-mini" @click="addExtracurricularRow"><Plus :size="14" /> Tambah</button>
            </div>
            <div v-for="(item, idx) in raporCms.extracurricularItems" :key="`cms-ext-${idx}`" class="cms-row">
              <input v-model="item.kegiatan" class="form-input" placeholder="Kegiatan" />
              <input v-model="item.keterangan" class="form-input" placeholder="Keterangan" />
              <button class="btn btn-danger btn-mini" @click="removeExtracurricularRow(idx)"><Trash2 :size="14" /></button>
            </div>
          </div>

          <div class="cms-block">
            <div class="cms-block-head">
              <h4>Prestasi</h4>
              <button class="btn btn-outline btn-mini" @click="addAchievementRow"><Plus :size="14" /> Tambah</button>
            </div>
            <div v-for="(item, idx) in raporCms.achievementItems" :key="`cms-ach-${idx}`" class="cms-row">
              <input v-model="item.jenis" class="form-input" placeholder="Jenis Prestasi" />
              <input v-model="item.keterangan" class="form-input" placeholder="Keterangan" />
              <button class="btn btn-danger btn-mini" @click="removeAchievementRow(idx)"><Trash2 :size="14" /></button>
            </div>
          </div>

          <div class="cms-block">
            <div class="cms-block-head">
              <h4>Ketidakhadiran</h4>
              <button class="btn btn-outline btn-mini" @click="addAttendanceRow"><Plus :size="14" /> Tambah</button>
            </div>
            <div v-for="(item, idx) in raporCms.attendanceItems" :key="`cms-att-${idx}`" class="cms-row">
              <input v-model="item.label" class="form-input" placeholder="Label" />
              <input v-model="item.value" class="form-input" placeholder="Nilai (hari)" />
              <button class="btn btn-danger btn-mini" @click="removeAttendanceRow(idx)"><Trash2 :size="14" /></button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedClassId && !loading" class="card progress-summary animate-fade-in">
        <div class="progress-summary-head">
          <span class="font-bold">Progres Input Kelas</span>
          <span class="font-bold">{{ classProgress }}%</span>
        </div>
        <div class="progress-track progress-track-wide">
          <div
            class="progress-fill"
            :style="{ width: classProgress + '%' }"
            :class="classProgress === 100 ? 'bg-success' : ''"
          ></div>
        </div>
        <small class="text-muted">
          Dihitung dari pengisian semua mapel pada semua siswa.
        </small>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
      </div>

      <div
        v-else-if="!selectedClassId"
        class="empty-state card animate-fade-in"
      >
        <div class="text-center py-10">
          <div class="icon-circle mb-4">
            <Search :size="32" class="text-muted" />
          </div>
          <h3 class="text-lg font-bold mb-2">Belum Memilih Kelas</h3>
          <p class="text-muted">
            Silakan pilih kelas terlebih dahulu untuk melihat data siswa.
          </p>
        </div>
      </div>

      <div
        v-else
        class="content-wrapper animate-fade-in"
        style="animation-delay: 0.2s"
      >
        <!-- Desktop Table View -->
        <div class="card table-card table-view">
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="min-width: 250px">Nama Siswa</th>
                  <th class="text-center">Progres Input</th>
                  <th class="text-center" width="150">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="students.length === 0">
                  <td colspan="3" class="text-center py-8">
                    <p class="text-muted">Belum ada siswa di kelas ini.</p>
                  </td>
                </tr>
                <tr v-for="s in students" :key="s.id" class="hover-row">
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="student-avatar">{{ s.nama.charAt(0) }}</div>
                      <div>
                        <div class="font-medium">{{ s.nama }}</div>
                        <div class="text-xs text-muted">
                          {{ s.nis }} / {{ s.nisn }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-col items-center gap-1">
                      <div class="progress-track">
                        <div
                          class="progress-fill"
                          :style="{ width: getStudentProgress(s.id) + '%' }"
                          :class="
                            getStudentProgress(s.id) === 100 ? 'bg-success' : ''
                          "
                        ></div>
                      </div>
                      <span class="text-xs font-medium"
                        >{{ getStudentProgress(s.id) }}%</span
                      >
                      <span class="text-xs text-muted">
                        {{ getStudentFilledCount(s.id) }}/{{ expectedSubjectCount }} mapel
                      </span>
                    </div>
                  </td>
                  <td class="text-center">
                    <button
                      @click="openPreview(s)"
                      class="btn btn-primary small btn-glow"
                      title="Preview Rapor"
                    >
                      <FileText :size="16" /> Preview
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Mobile Card View -->
        <div class="mobile-list-view">
          <div v-if="students.length === 0" class="empty-state card">
            <p>Belum ada siswa.</p>
          </div>
          <div v-for="s in students" :key="s.id" class="student-card card">
            <div class="student-card-header">
              <div class="flex items-center gap-3">
                <div class="student-avatar small">{{ s.nama.charAt(0) }}</div>
                <div>
                  <div class="font-bold text-sm">{{ s.nama }}</div>
                  <div class="text-xs text-muted">{{ s.nis }}</div>
                </div>
              </div>
              <button
                @click="openPreview(s)"
                class="btn-icon bg-primary-light"
                title="Preview"
              >
                <FileText :size="18" class="text-primary" />
              </button>
            </div>
            <div class="student-card-body">
              <div class="flex justify-between text-xs mb-1">
                <span class="text-muted">Kelengkapan</span>
                <span class="font-bold">
                  {{ getStudentProgress(s.id) }}% ({{ getStudentFilledCount(s.id) }}/{{ expectedSubjectCount }})
                </span>
              </div>
              <div class="progress-track small">
                <div
                  class="progress-fill"
                  :style="{ width: getStudentProgress(s.id) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Modal — 4 Tab Preview -->
    <div
      v-if="showPreview && selectedStudent"
      class="preview-modal-overlay"
      @click.self="showPreview = false"
    >
      <div class="preview-modal-container">
        <!-- Modal Header -->
        <div class="preview-modal-header">
          <div>
            <h3>Preview Rapor</h3>
            <p class="preview-subtitle">{{ selectedStudent.nama }} — {{ myClass?.nama }}</p>
          </div>
          <div class="preview-actions">
            <button @click="downloadExcel(selectedStudent)" class="btn-excel">Download Excel</button>
            <button @click="downloadPDF(selectedStudent)" class="btn-pdf">Download PDF</button>
            <button @click="handlePrint(selectedStudent)" class="btn-print">Cetak</button>
            <button @click="showPreview = false" class="btn-close" aria-label="Tutup preview">✕</button>
          </div>
        </div>

        <!-- Tab Halaman -->
        <div class="prev-tabs">
          <button v-for="t in previewTabs" :key="t.id" class="prev-tab-btn" :class="{ active: activePreviewTab === t.id }" @click="selectPreviewTab(t.id)">
            {{ t.label }}
          </button>
        </div>

        <!-- ========================= HALAMAN 1: SAMPUL ========================= -->
        <div v-if="activePreviewTab === 'sampul'" class="preview-modal-content">
          <div class="preview-sheet-wrap">
            <div class="rapor-paper rapor-sampul">
              <div class="header-cover">
                  <h1>{{ t("coverMainTitleLine1", "RAPOR PESERTA DIDIK") }}<br>{{ t("coverMainTitleLine2", "SEKOLAH MENENGAH KEJURUAN") }}</h1>
              </div>

              <div class="logo-section">
                <img :src="raporConfig.logoBase64 || raporConfig.logoUrl || '/logo_rapor.png'" class="logo-img" alt="Logo Sekolah" />
              </div>

              <div class="school-info-cover">
                  <div class="school-name-cover">{{ raporConfig.namaSekolah }}</div>
                  <div class="school-address-cover">{{ raporConfig.alamatJalan }} {{ raporConfig.kelurahan }} {{ raporConfig.kecamatan }} {{ raporConfig.kabupaten }}</div>
              </div>

              <div class="form-section">
                  <div class="field-group">
                      <span class="field-label">{{ t("coverStudentNameLabel", "Nama Peserta Didik:") }}</span>
                      <div class="field-box">{{ selectedStudent.nama }}</div>
                  </div>
                  <div class="field-group">
                      <span class="field-label">{{ t("coverStudentIdLabel", "NIPD/NIPDN:") }}</span>
                      <div class="field-box">{{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</div>
                  </div>
              </div>

              <div class="footer-cover">
                  <p>{{ raporConfig.headerBaris1 }}</p>
                  <p>{{ raporConfig.headerBaris2 }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================= HALAMAN 2: IDENTITAS SEKOLAH ========================= -->
        <div v-if="activePreviewTab === 'sekolah'" class="preview-modal-content">
          <div class="preview-sheet-wrap">
            <div class="rapor-paper rapor-fit-paper school-fit-paper">
              <div class="page-title school-page-title">
                  {{ t("schoolPageTitleLine1", "RAPOR PESERTA DIDIK") }}<br>{{ t("schoolPageTitleLine2", "SEKOLAH MENENGAH KEJURUAN") }}<br>{{ t("schoolPageTitleLine3", "(SMK)") }}
              </div>

              <div class="data-card school-data-card">
                  <div class="data-row"><div class="data-label">Nama Sekolah</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.namaSekolah }}</div></div>
                  <div class="data-row"><div class="data-label">NPSN</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.npsn }}</div></div>
                  <div class="data-row"><div class="data-label">NIS/NSS/NDS</div><div class="data-sep">:</div><div class="data-value">-</div></div>
                  <div class="data-row"><div class="data-label">Alamat Sekolah</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.alamatJalan }}</div></div>
                  <div class="data-row"><div class="data-label">Kode pos</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kodePos || '-' }}</div></div>
                  <div class="data-row"><div class="data-label">Telepon</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.telepon || '-' }}</div></div>
                  <div class="data-row"><div class="data-label">Kelurahan</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kelurahan }}</div></div>
                  <div class="data-row"><div class="data-label">Kecamatan</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kecamatan }}</div></div>
                  <div class="data-row"><div class="data-label">Kabupaten</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kabupaten }}</div></div>
                  <div class="data-row"><div class="data-label">Provinsi</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.provinsi }}</div></div>
                  <div class="data-row"><div class="data-label">Website</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.website || '-' }}</div></div>
                  <div class="data-row"><div class="data-label">E-mail</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.email }}</div></div>
                </div>
            </div>
          </div>
        </div>

        <!-- ========================= HALAMAN 3: IDENTITAS PESERTA DIDIK ========================= -->
        <div v-if="activePreviewTab === 'biodata'" class="preview-modal-content">
          <div class="preview-sheet-wrap">
            <div class="rapor-paper rapor-fit-paper">
              <div class="page-title biodata-page-title">
                  {{ t("biodataPageTitle", "KETERANGAN TENTANG DIRI PESERTA DIDIK") }}
              </div>

              <div class="data-card biodata-data-card">
                <div class="data-row"><div class="data-num">1.</div><div class="data-label">Nama Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.nama }}</div></div>
                <div class="data-row"><div class="data-num">2.</div><div class="data-label">NIPD / NIPDN</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</div></div>
                <div class="data-row"><div class="data-num">3.</div><div class="data-label">Tempat, Tanggal Lahir</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.tempatLahir || '-' }}{{ selectedStudent.tanggalLahir ? ', ' + selectedStudent.tanggalLahir : '' }}</div></div>
                <div class="data-row"><div class="data-num">4.</div><div class="data-label">Jenis Kelamin</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.jenisKelamin || '-' }}</div></div>
                <div class="data-row"><div class="data-num">5.</div><div class="data-label">Agama</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.agama || '-' }}</div></div>
                <div class="data-row"><div class="data-num">6.</div><div class="data-label">Status dalam keluarga</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.statusKeluarga || '-' }}</div></div>
                <div class="data-row"><div class="data-num">7.</div><div class="data-label">Anak ke -</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.anakKe || '-' }}</div></div>
                <div class="data-row"><div class="data-num">8.</div><div class="data-label">Alamat Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamat || '-' }}</div></div>
                <div class="data-row"><div class="data-num">9.</div><div class="data-label">Nomor Telepon Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.telepon || '-' }}</div></div>
                <div class="data-row"><div class="data-num">10.</div><div class="data-label">Sekolah Asal</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.sekolahAsal || '-' }}</div></div>
                <div class="data-row"><div class="data-num">11.</div><div class="data-label" style="width: auto;">Diterima di sekolah ini</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">Di Kelas</div><div class="data-sep">:</div><div class="data-value">{{ myClass?.nama || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">Pada Tanggal</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.tanggalDiterima || '-' }}</div></div>
                <div class="data-row"><div class="data-num">12.</div><div class="data-label" style="width: auto;">Nama Orang Tua</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">a. Ayah</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaAyah || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">b. Ibu</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaIbu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">13.</div><div class="data-label">Alamat Orang Tua</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamatOrtu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">14.</div><div class="data-label">Nomor Telepon Orang Tua</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.teleponOrtu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">15.</div><div class="data-label" style="width: auto;">Pekerjaan Orang Tua</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">a. Ayah</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanAyah || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">b. Ibu</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanIbu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">16.</div><div class="data-label">Nama Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">17.</div><div class="data-label">Alamat Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamatWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">18.</div><div class="data-label">Nomor Telepon Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.teleponWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">19.</div><div class="data-label">Pekerjaan Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanWali || '-' }}</div></div>
              </div>

              <div class="footer-sign-area">
                <div class="photo-box">
                    <br>pas foto<br><br>3 x 4
                </div>
                <div class="signature-right-bio">
                    {{ raporConfig.kotaTtd }}, {{ currentReportDateLabel }}<br>{{ t("biodataSignatureRole", "Kepala Sekolah,") }}<br><br><br><br>
                    <div class="signature-name-bio">{{ raporConfig.namaKepsek }}</div>
                    <div>NIP. {{ raporConfig.nipKepsek }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================= RAPORT NILAI — MULTI HALAMAN A4 ========================= -->
        <div v-if="activePreviewTab === 'raport'" class="preview-modal-content rapor-preview-content">
          <div class="rapor-pagination-bar">
            <button
              class="rapor-page-btn"
              :disabled="currentRaporPage === 0"
              @click="goToPrevRaporPage"
            >
              Sebelumnya
            </button>
            <span class="rapor-page-indicator">
              Halaman {{ raporPages.length ? currentRaporPage + 1 : 0 }} / {{ raporPages.length }}
            </span>
            <button
              class="rapor-page-btn"
              :disabled="currentRaporPage >= raporPages.length - 1"
              @click="goToNextRaporPage"
            >
              Berikutnya
            </button>
          </div>
          <div class="rapor-pages-container">

            <div
              v-if="visibleRaporPage"
              :key="'page-' + currentRaporPage"
              class="rapor-paper rapor-nilai-paper"
            >
              <template v-for="(page, pageIdx) in [visibleRaporPage]" :key="'visible-page-' + pageIdx">
              <!-- ── HEADER IDENTITAS: hanya di halaman pertama ── -->
              <!-- --- HEADER INFO (Halaman Pertama Saja) --- -->
              <template v-if="page.isFirst">
                <div class="page-title" style="margin-bottom: 20px; font-size: 14pt;">
                    {{ raporCms.reportTitle || "LAPORAN CAPAIAN HASIL BELAJAR" }}
                </div>
                <div v-if="raporCms.reportSubtitle" class="report-cms-subtitle">
                  {{ raporCms.reportSubtitle }}
                </div>
                <div class="report-header-info">
                    <table>
                        <tbody>
                          <tr><td>Nama Sekolah</td><td>: {{ raporConfig.namaSekolah }}</td></tr>
                          <tr><td>Alamat</td><td>: {{ raporConfig.alamatJalan }}</td></tr>
                          <tr><td>Nama Siswa</td><td>: {{ selectedStudent.nama }}</td></tr>
                          <tr><td>NIPD/NIPDN</td><td>: {{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</td></tr>
                        </tbody>
                    </table>
                    <table>
                        <tbody>
                          <tr><td>Kelas</td><td>: {{ myClass?.nama || '-' }}</td></tr>
                          <tr><td>Fase</td><td>: {{ myClass?.fase || 'E' }}</td></tr>
                          <tr><td>Semester</td><td>: {{ currentSemesterLabel }}</td></tr>
                          <tr><td>Tahun Ajaran</td><td>: {{ currentTahunAjaran }}</td></tr>
                          <tr><td>Konsentrasi Keahlian</td><td>: {{ myClass?.konsentrasiKeahlian || myClass?.jurusan || '-' }}</td></tr>
                        </tbody>
                    </table>
                </div>
              </template>

              <!-- --- TABLE CAPAIAN BELAJAR --- -->
              <table v-if="page.slots.length" class="main-table">
                  <thead>
                      <tr>
                          <th style="width: 30px;">NO</th>
                          <th style="width: 180px;">{{ t("reportMainTableTitle", "MATA PELAJARAN") }}</th>
                          <th style="width: 50px;">{{ t("reportMainTableScoreTitle", "NILAI") }}</th>
                          <th>{{ t("reportMainTableDescriptionTitle", "DESKRIPSI CAPAIAN KOMPETENSI") }}</th>
                      </tr>
                  </thead>
                  <tbody>
                      <template v-for="(slot, si) in page.slots" :key="'s'+pageIdx+'-'+si">
                        <tr v-if="slot.type === 'header'" class="kelompok-row">
                          <td colspan="4"><strong>{{ slot.label }}</strong></td>
                        </tr>
                        <tr v-else-if="slot.type === 'blank'" class="blank-row">
                          <td class="center">&nbsp;</td>
                          <td>&nbsp;</td>
                          <td class="center">&nbsp;</td>
                          <td>&nbsp;</td>
                        </tr>
                        <tr v-else>
                          <td class="center">{{ slot.idx + 1 }}</td>
                          <td>{{ slot.sub.nama }}</td>
                          <td class="center"><strong>{{ slot.sub.na || '-' }}</strong></td>
                          <td style="font-size: 8.5pt; line-height: 1.3;">{{ slot.sub.deskripsi }}</td>
                        </tr>
                      </template>
                  </tbody>
              </table>

              <!-- --- FOOTER BLOK (dipaginasi otomatis) --- -->
              <template v-if="page.footerBlocks?.length">
                <!-- Ekstrakurikuler -->
                <div v-if="canViewWaliSections && hasFooterBlock(page, 'extracurricular')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleExtracurricular || "C. Ekstrakurikuler" }}</div>
                    <table class="main-table sub-table">
                        <thead><tr><th style="width: 40px;">No</th><th>Kegiatan Ekstrakurikuler</th><th>Keterangan</th></tr></thead>
                        <tbody>
                          <tr v-for="(item, idx) in renderedExtracurricularRows" :key="`pv-ext-${idx}`">
                            <td class="center">{{ idx + 1 }}</td>
                            <td>{{ item.kegiatan || "-" }}</td>
                            <td>{{ item.keterangan || "-" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="canViewWaliSections && hasFooterBlock(page, 'prestasi')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleAchievement || "D. Prestasi" }}</div>
                    <table class="main-table sub-table">
                        <thead><tr><th style="width: 40px;">No</th><th>Jenis Prestasi</th><th>Keterangan</th></tr></thead>
                        <tbody>
                          <tr v-for="(item, idx) in renderedAchievementRows" :key="`pv-ach-${idx}`">
                            <td class="center">{{ idx + 1 }}</td>
                            <td>{{ item.jenis || "-" }}</td>
                            <td>{{ item.keterangan || "-" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="hasFooterBlock(page, 'ketidakhadiran')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleAttendance || "E. Ketidakhadiran" }}</div>
                    <table class="attendance-table compact-attendance">
                        <tbody>
                          <tr v-for="(item, idx) in renderedAttendanceRows" :key="`pv-att-${idx}`">
                            <td style="width: 60%;">{{ item.label || "-" }}</td>
                            <td class="center">{{ item.value ? item.value : " hari" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="canViewWaliSections && hasFooterBlock(page, 'catatan')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleHomeroomNote || "F. Catatan Wali Kelas" }}</div>
                    <div class="note-box">{{ renderedHomeroomNote }}</div>
                </div>

                <!-- Signatures Grid -->
                <div v-if="hasFooterBlock(page, 'signature')" class="sig-container report-signatures">
                    <div class="sig-box">
                        <span class="cms-multiline">{{ t("signatureParentLabel", "Mengetahui,\nOrang Tua/Wali") }}</span><br><br><br><br>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-box">
                        {{ raporConfig.kotaTtd }}, {{ currentReportDateLabel }}<br><span class="cms-multiline">{{ t("signatureHomeroomLabel", "Wali Kelas,") }}</span><br><br><br><br>
                        <div class="sig-line">{{ myClass?.waliKelasNama || '___________' }}</div>
                        <div style="font-size: 9pt;">NIP. -</div>
                    </div>
                    <div class="sig-box center-full">
                        <span class="cms-multiline">{{ t("signaturePrincipalLabel", "Mengetahui,\nKepala Sekolah") }}</span><br><br><br><br>
                        <div class="sig-line">{{ raporConfig.namaKepsek }}</div>
                        <div style="font-size: 9pt;">NIP. {{ raporConfig.nipKepsek }}</div>
                    </div>
                </div>
              </template>

              <!-- Nomor halaman -->
              <div class="rapor-page-number">
                Hal. {{ currentRaporPage + 1 }} / {{ raporPages.length }}
              </div>
              </template>
            </div><!-- /.rapor-paper -->

          </div><!-- /.rapor-pages-container -->
        </div>
      </div>
    </div>

    <!-- Hidden Printable Container for Full PDF & Print -->
    <div id="full-report-print" v-if="selectedStudent">
        <!-- Page 1: Sampul -->
        <div class="rapor-paper rapor-sampul">
            <div class="header-cover">
                <h1>{{ t("coverMainTitleLine1", "RAPOR PESERTA DIDIK") }}<br>{{ t("coverMainTitleLine2", "SEKOLAH MENENGAH KEJURUAN") }}</h1>
            </div>
            <div class="logo-section"><img :src="raporConfig.logoBase64 || raporConfig.logoUrl || '/logo_rapor.png'" class="logo-img" /></div>
            <div class="school-info-cover">
                <div class="school-name-cover">{{ raporConfig.namaSekolah }}</div>
                <div class="school-address-cover">{{ raporConfig.alamatJalan }} {{ raporConfig.kelurahan }} {{ raporConfig.kecamatan }} {{ raporConfig.kabupaten }}</div>
            </div>
            <div class="form-section">
                <div class="field-group"><span class="field-label">{{ t("coverStudentNameLabel", "Nama Peserta Didik:") }}</span><div class="field-box">{{ selectedStudent.nama }}</div></div>
                <div class="field-group"><span class="field-label">{{ t("coverStudentIdLabel", "NIPD/NIPDN:") }}</span><div class="field-box">{{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</div></div>
            </div>
            <div class="footer-cover">
                <p>{{ raporConfig.headerBaris1 }}</p>
                <p>{{ raporConfig.headerBaris2 }}</p>
            </div>
        </div>

        <!-- Page 2: Identitas Sekolah -->
        <div class="rapor-paper rapor-fit-paper school-fit-paper">
            <div class="page-title school-page-title">{{ t("schoolPageTitleLine1", "RAPOR PESERTA DIDIK") }}<br>{{ t("schoolPageTitleLine2", "SEKOLAH MENENGAH KEJURUAN") }}<br>{{ t("schoolPageTitleLine3", "(SMK)") }}</div>
            <div class="data-card school-data-card">
                <div class="data-row"><div class="data-label">Nama Sekolah</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.namaSekolah }}</div></div>
                <div class="data-row"><div class="data-label">NPSN</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.npsn }}</div></div>
                <div class="data-row"><div class="data-label">NIS/NSS/NDS</div><div class="data-sep">:</div><div class="data-value">-</div></div>
                <div class="data-row"><div class="data-label">Alamat Sekolah</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.alamatJalan }}</div></div>
                <div class="data-row"><div class="data-label">Kode pos</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kodePos || '-' }}</div></div>
                <div class="data-row"><div class="data-label">Telepon</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.telepon || '-' }}</div></div>
                <div class="data-row"><div class="data-label">Kelurahan</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kelurahan }}</div></div>
                <div class="data-row"><div class="data-label">Kecamatan</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kecamatan }}</div></div>
                <div class="data-row"><div class="data-label">Kabupaten</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.kabupaten }}</div></div>
                <div class="data-row"><div class="data-label">Provinsi</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.provinsi }}</div></div>
                <div class="data-row"><div class="data-label">Website</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.website || '-' }}</div></div>
                <div class="data-row"><div class="data-label">E-mail</div><div class="data-sep">:</div><div class="data-value">{{ raporConfig.email }}</div></div>
            </div>
        </div>

        <!-- Page 3: Identitas Peserta Didik -->
        <div class="rapor-paper rapor-fit-paper">
            <div class="page-title biodata-page-title">{{ t("biodataPageTitle", "KETERANGAN TENTANG DIRI PESERTA DIDIK") }}</div>
            <div class="data-card biodata-data-card">
                <div class="data-row"><div class="data-num">1.</div><div class="data-label">Nama Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.nama }}</div></div>
                <div class="data-row"><div class="data-num">2.</div><div class="data-label">NIPD / NIPDN</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</div></div>
                <div class="data-row"><div class="data-num">3.</div><div class="data-label">Tempat, Tanggal Lahir</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.tempatLahir || '-' }}{{ selectedStudent.tanggalLahir ? ', ' + selectedStudent.tanggalLahir : '' }}</div></div>
                <div class="data-row"><div class="data-num">4.</div><div class="data-label">Jenis Kelamin</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.jenisKelamin || '-' }}</div></div>
                <div class="data-row"><div class="data-num">5.</div><div class="data-label">Agama</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.agama || '-' }}</div></div>
                <div class="data-row"><div class="data-num">6.</div><div class="data-label">Status dalam keluarga</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.statusKeluarga || '-' }}</div></div>
                <div class="data-row"><div class="data-num">7.</div><div class="data-label">Anak ke -</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.anakKe || '-' }}</div></div>
                <div class="data-row"><div class="data-num">8.</div><div class="data-label">Alamat Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamat || '-' }}</div></div>
                <div class="data-row"><div class="data-num">9.</div><div class="data-label">Nomor Telepon Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.telepon || '-' }}</div></div>
                <div class="data-row"><div class="data-num">10.</div><div class="data-label">Sekolah Asal</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.sekolahAsal || '-' }}</div></div>
                <div class="data-row"><div class="data-num">11.</div><div class="data-label" style="width: auto;">Diterima di sekolah ini</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">Di Kelas</div><div class="data-sep">:</div><div class="data-value">{{ myClass?.nama || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">Pada Tanggal</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.tanggalDiterima || '-' }}</div></div>
                <div class="data-row"><div class="data-num">12.</div><div class="data-label" style="width: auto;">Nama Orang Tua</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">a. Ayah</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaAyah || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">b. Ibu</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaIbu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">13.</div><div class="data-label">Alamat Orang Tua</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamatOrtu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">14.</div><div class="data-label">Nomor Telepon Orang Tua</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.teleponOrtu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">15.</div><div class="data-label" style="width: auto;">Pekerjaan Orang Tua</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">a. Ayah</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanAyah || '-' }}</div></div>
                <div class="data-row"><div class="data-num"></div><div class="data-label" style="padding-left: 10px;">b. Ibu</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanIbu || '-' }}</div></div>
                <div class="data-row"><div class="data-num">16.</div><div class="data-label">Nama Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.namaWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">17.</div><div class="data-label">Alamat Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.alamatWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">18.</div><div class="data-label">Nomor Telepon Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.teleponWali || '-' }}</div></div>
                <div class="data-row"><div class="data-num">19.</div><div class="data-label">Pekerjaan Wali Siswa</div><div class="data-sep">:</div><div class="data-value">{{ selectedStudent.pekerjaanWali || '-' }}</div></div>
            </div>
            <div class="footer-sign-area">
                <div class="photo-box"><br>pas foto<br><br>3 x 4</div>
                <div class="signature-right-bio">
                    {{ raporConfig.kotaTtd }}, {{ currentReportDateLabel }}<br>{{ t("biodataSignatureRole", "Kepala Sekolah,") }}<br><br><br><br>
                    <div class="signature-name-bio">{{ raporConfig.namaKepsek }}</div>
                    <div>NIP. {{ raporConfig.nipKepsek }}</div>
                </div>
            </div>
        </div>

        <!-- Page 4+: Raport Nilai -->
        <div v-for="(page, pageIdx) in raporPages" :key="'print-page-' + pageIdx" class="rapor-paper rapor-nilai-paper">
            <template v-if="page.isFirst">
                <div class="page-title" style="margin-bottom: 20px; font-size: 14pt;">{{ raporCms.reportTitle || "LAPORAN CAPAIAN HASIL BELAJAR" }}</div>
                <div v-if="raporCms.reportSubtitle" class="report-cms-subtitle">{{ raporCms.reportSubtitle }}</div>
                <div class="report-header-info">
                    <table>
                        <tbody>
                          <tr><td>Nama Sekolah</td><td>: {{ raporConfig.namaSekolah }}</td></tr>
                          <tr><td>Alamat</td><td>: {{ raporConfig.alamatJalan }}</td></tr>
                          <tr><td>Nama Siswa</td><td>: {{ selectedStudent.nama }}</td></tr>
                          <tr><td>NIPD/NIPDN</td><td>: {{ selectedStudent.nis || '-' }} / {{ selectedStudent.nisn || '-' }}</td></tr>
                        </tbody>
                    </table>
                    <table>
                        <tbody>
                          <tr><td>Kelas</td><td>: {{ myClass?.nama || '-' }}</td></tr>
                          <tr><td>Fase</td><td>: {{ myClass?.fase || 'E' }}</td></tr>
                          <tr><td>Semester</td><td>: {{ currentSemesterLabel }}</td></tr>
                          <tr><td>Tahun Ajaran</td><td>: {{ currentTahunAjaran }}</td></tr>
                          <tr><td>Konsentrasi Keahlian</td><td>: {{ myClass?.konsentrasiKeahlian || myClass?.jurusan || '-' }}</td></tr>
                        </tbody>
                    </table>
                </div>
            </template>
            <table v-if="page.slots.length" class="main-table">
                <thead><tr><th>NO</th><th>{{ t("reportMainTableTitle", "MATA PELAJARAN") }}</th><th>{{ t("reportMainTableScoreTitle", "NILAI") }}</th><th>{{ t("reportMainTableDescriptionTitle", "DESKRIPSI CAPAIAN KOMPETENSI") }}</th></tr></thead>
                <tbody>
                    <template v-for="(slot, si) in page.slots" :key="'ps'+pageIdx+'-'+si">
                        <tr v-if="slot.type === 'header'" class="kelompok-row"><td colspan="4"><strong>{{ slot.label }}</strong></td></tr>
                        <tr v-else-if="slot.type === 'blank'" class="blank-row">
                            <td class="center">&nbsp;</td>
                            <td>&nbsp;</td>
                            <td class="center">&nbsp;</td>
                            <td>&nbsp;</td>
                        </tr>
                        <tr v-else>
                            <td class="center">{{ slot.idx + 1 }}</td>
                            <td>{{ slot.sub.nama }}</td>
                            <td class="center"><strong>{{ slot.sub.na || '-' }}</strong></td>
                            <td style="font-size: 8.5pt; line-height: 1.3;">{{ slot.sub.deskripsi }}</td>
                        </tr>
                    </template>
                </tbody>
            </table>
            <template v-if="page.footerBlocks?.length">
                <div v-if="canViewWaliSections && hasFooterBlock(page, 'extracurricular')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleExtracurricular || "C. Ekstrakurikuler" }}</div>
                    <table class="main-table sub-table">
                        <thead><tr><th style="width: 40px;">No</th><th>Kegiatan Ekstrakurikuler</th><th>Keterangan</th></tr></thead>
                        <tbody>
                          <tr v-for="(item, idx) in renderedExtracurricularRows" :key="`print-ext-${idx}`">
                            <td class="center">{{ idx + 1 }}</td>
                            <td>{{ item.kegiatan || "-" }}</td>
                            <td>{{ item.keterangan || "-" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="canViewWaliSections && hasFooterBlock(page, 'prestasi')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleAchievement || "D. Prestasi" }}</div>
                    <table class="main-table sub-table">
                        <thead><tr><th style="width: 40px;">No</th><th>Jenis Prestasi</th><th>Keterangan</th></tr></thead>
                        <tbody>
                          <tr v-for="(item, idx) in renderedAchievementRows" :key="`print-ach-${idx}`">
                            <td class="center">{{ idx + 1 }}</td>
                            <td>{{ item.jenis || "-" }}</td>
                            <td>{{ item.keterangan || "-" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="hasFooterBlock(page, 'ketidakhadiran')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleAttendance || "E. Ketidakhadiran" }}</div>
                    <table class="attendance-table compact-attendance">
                        <tbody>
                          <tr v-for="(item, idx) in renderedAttendanceRows" :key="`print-att-${idx}`">
                            <td style="width: 60%;">{{ item.label || "-" }}</td>
                            <td class="center">{{ item.value ? item.value : " hari" }}</td>
                          </tr>
                        </tbody>
                    </table>
                </div>

                <div v-if="canViewWaliSections && hasFooterBlock(page, 'catatan')" class="report-section">
                    <div class="report-subtitle">{{ raporCms.sectionTitleHomeroomNote || "F. Catatan Wali Kelas" }}</div>
                    <div class="note-box">{{ renderedHomeroomNote }}</div>
                </div>

                <div v-if="hasFooterBlock(page, 'signature')" class="sig-container report-signatures">
                    <div class="sig-box"><span class="cms-multiline">{{ t("signatureParentLabel", "Mengetahui,\nOrang Tua/Wali") }}</span><br><br><br><br><div class="sig-line"></div></div>
                    <div class="sig-box">{{ raporConfig.kotaTtd }}, {{ currentReportDateLabel }}<br><span class="cms-multiline">{{ t("signatureHomeroomLabel", "Wali Kelas,") }}</span><br><br><br><br><div class="sig-line">{{ myClass?.waliKelasNama || '___________' }}</div><div style="font-size: 9pt;">NIP. -</div></div>
                    <div class="sig-box center-full"><span class="cms-multiline">{{ t("signaturePrincipalLabel", "Mengetahui,\nKepala Sekolah") }}</span><br><br><br><br><div class="sig-line">{{ raporConfig.namaKepsek }}</div><div style="font-size: 9pt;">NIP. {{ raporConfig.nipKepsek }}</div></div>
                </div>
            </template>
            <div class="rapor-page-number">Hal. {{ pageIdx + 1 }} / {{ raporPages.length }}</div>
        </div>
    </div>
  </div>
</template>

<style scoped>
@import './WaliKelasRapor.css';
</style>

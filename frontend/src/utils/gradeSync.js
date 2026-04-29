import { collection, onSnapshot, query, where } from "firebase/firestore";

export const toId = (value) => String(value ?? "").trim();

export const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const normalizeGradeRecord = (raw = {}) => {
  const knowledge = {
    ph: toNumber(raw.knowledge?.ph ?? raw.ph),
    pts: toNumber(raw.knowledge?.pts ?? raw.pts),
    pas: toNumber(raw.knowledge?.pas ?? raw.pas),
  };
  const skill = {
    praktik: toNumber(raw.skill?.praktik ?? raw.praktik),
    proyek: toNumber(raw.skill?.proyek ?? raw.proyek),
    produk: toNumber(raw.skill?.produk ?? raw.produk),
  };

  const knowledgeScore = toNumber(
    raw.knowledge_score ?? ((knowledge.ph + knowledge.pts + knowledge.pas) / 3),
  );
  const skillScore = toNumber(
    raw.skill_score ?? ((skill.praktik + skill.proyek + skill.produk) / 3),
  );
  const finalScore = toNumber(
    raw.final_score ?? raw.na ?? raw.nilai_akhir ?? ((knowledgeScore + skillScore) / 2),
  );

  return {
    ...raw,
    student_id: toId(raw.student_id || raw.studentId || raw.siswaId),
    studentId: toId(raw.student_id || raw.studentId || raw.siswaId),
    subject_id: toId(raw.subject_id || raw.subjectId || raw.mapelId),
    subjectId: toId(raw.subject_id || raw.subjectId || raw.mapelId),
    kelasId: toId(raw.kelasId || raw.class_id),
    class_id: toId(raw.kelasId || raw.class_id),
    knowledge,
    skill,
    knowledge_score: Number(knowledgeScore.toFixed(1)),
    skill_score: Number(skillScore.toFixed(1)),
    na: Number(finalScore.toFixed(1)),
    final_score: Number(finalScore.toFixed(1)),
  };
};

export const isGradeFilled = (grade) => {
  if (!grade) return false;
  const normalized = normalizeGradeRecord(grade);
  if (normalized.final_score > 0) return true;

  const components = [
    normalized.knowledge.ph,
    normalized.knowledge.pts,
    normalized.knowledge.pas,
    normalized.skill.praktik,
    normalized.skill.proyek,
    normalized.skill.produk,
  ];
  return components.some((value) => value > 0);
};

export const createGradeDocMap = (docs) => {
  const gradeMap = {};
  docs.forEach((grade) => {
    const normalized = normalizeGradeRecord(grade);
    if (!normalized.student_id || !normalized.subject_id) return;
    gradeMap[`${normalized.student_id}_${normalized.subject_id}`] = normalized;
  });
  return gradeMap;
};

const mergeDocsFromSources = (sourceMaps) => {
  const merged = new Map();
  Object.values(sourceMaps).forEach((sourceMap) => {
    sourceMap.forEach((gradeDoc, docId) => {
      merged.set(docId, normalizeGradeRecord(gradeDoc));
    });
  });
  return Array.from(merged.values());
};

const createRealtimeListener = (queries, onChange, onError) => {
  const sourceMaps = {};
  const unsubscribers = queries.map(({ source, q }) =>
    onSnapshot(
      q,
      (snap) => {
        const nextMap = new Map();
        snap.forEach((gradeDoc) => {
          nextMap.set(gradeDoc.id, { id: gradeDoc.id, ...gradeDoc.data() });
        });
        sourceMaps[source] = nextMap;
        onChange(mergeDocsFromSources(sourceMaps));
      },
      (error) => {
        if (onError) onError(error, source);
      },
    ),
  );

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
};

export const listenToClassGrades = (db, classId, onChange, onError) => {
  const normalizedClassId = toId(classId);
  if (!normalizedClassId) {
    onChange([]);
    return () => {};
  }

  return createRealtimeListener(
    [
      {
        source: "kelasId",
        q: query(collection(db, "grades"), where("kelasId", "==", normalizedClassId)),
      },
      {
        source: "class_id",
        q: query(collection(db, "grades"), where("class_id", "==", normalizedClassId)),
      },
    ],
    onChange,
    onError,
  );
};

export const listenToClassSubjectGrades = (db, classId, subjectId, onChange, onError) => {
  const normalizedClassId = toId(classId);
  const normalizedSubjectId = toId(subjectId);

  if (!normalizedClassId || !normalizedSubjectId) {
    onChange([]);
    return () => {};
  }

  return createRealtimeListener(
    [
      {
        source: "kelasId_mapelId",
        q: query(
          collection(db, "grades"),
          where("kelasId", "==", normalizedClassId),
          where("mapelId", "==", normalizedSubjectId),
        ),
      },
      {
        source: "kelasId_subject_id",
        q: query(
          collection(db, "grades"),
          where("kelasId", "==", normalizedClassId),
          where("subject_id", "==", normalizedSubjectId),
        ),
      },
      {
        source: "class_id_mapelId",
        q: query(
          collection(db, "grades"),
          where("class_id", "==", normalizedClassId),
          where("mapelId", "==", normalizedSubjectId),
        ),
      },
      {
        source: "class_id_subject_id",
        q: query(
          collection(db, "grades"),
          where("class_id", "==", normalizedClassId),
          where("subject_id", "==", normalizedSubjectId),
        ),
      },
    ],
    onChange,
    onError,
  );
};

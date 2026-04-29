import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB3IBZsAZycEslFQ3KjKIKBT1W59W4JmQo",
  authDomain: "si-rapor.firebaseapp.com",
  projectId: "si-rapor",
  storageBucket: "si-rapor.appspot.com",
  messagingSenderId: "762112302226",
  appId: "1:762112302226:web:b7dba2f06dd85c7aafda4b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  console.log("Starting Migration...");
  
  // 1. Identify legacy admin users (those without tenantId but with role 'admin')
  const usersSnap = await getDocs(collection(db, "users"));
  const legacyAdmins = [];
  usersSnap.forEach(d => {
    const data = d.data();
    if (data.role === 'admin' && !data.tenantId) {
      legacyAdmins.push({ id: d.id, ...data });
    }
  });

  if (legacyAdmins.length === 0) {
    console.log("No legacy admins found. Creating a generic legacy-tenant...");
    // Just in case, let's create a legacy tenant and move all global data into it
  } else {
    console.log(`Found ${legacyAdmins.length} legacy admins. Mapping global data to the first legacy admin...`);
  }

  const legacyTenantId = legacyAdmins.length > 0 ? legacyAdmins[0].id : "legacy-school-1";
  
  console.log("Creating tenant document: ", legacyTenantId);
  // Create Tenant Document
  await setDoc(doc(db, "tenants", legacyTenantId), {
    ownerUid: legacyTenantId,
    status: "active",
    plan: "pro",
    createdAt: new Date().toISOString(),
    schoolInfo: {
      nama: "Sekolah Migrasi (Legacy)",
      email: legacyAdmins.length > 0 ? legacyAdmins[0].email : "legacy@sekolah.id",
    }
  }, { merge: true });

  // Update legacy users to point to this tenant
  const batch = writeBatch(db);
  let batchCount = 0;
  
  usersSnap.forEach(d => {
    const data = d.data();
    // Jika tidak punya tenantId dan bukan superadmin
    if (!data.tenantId && data.role !== 'superadmin' && d.id !== 'superadmin') {
      const userRef = doc(db, "users", d.id);
      batch.update(userRef, { 
        tenantId: legacyTenantId,
        tenantStatus: "active"
      });
      batchCount++;
    }
  });

  if (batchCount > 0) {
    console.log(`Updating ${batchCount} users to legacy tenant...`);
    await batch.commit();
  }

  // Now move data: classes, subjects, students, grades, student_rapor_content, settings
  const collectionsToMove = [
    "classes", "subjects", "students", "grades", "student_rapor_content"
  ];

  for (const colName of collectionsToMove) {
    console.log(`Migrating collection: ${colName}`);
    const snap = await getDocs(collection(db, colName));
    const docsToMove = snap.docs;
    
    if (docsToMove.length === 0) {
      console.log(`- Empty, skipping.`);
      continue;
    }
    
    console.log(`- Found ${docsToMove.length} documents. Moving...`);
    
    // Firestore batch limits to 500 operations
    let currentBatch = writeBatch(db);
    let count = 0;
    
    for (const d of docsToMove) {
      const oldRef = doc(db, colName, d.id);
      const newRef = doc(db, `tenants/${legacyTenantId}/${colName}`, d.id);
      
      currentBatch.set(newRef, d.data());
      // Optionally delete old: currentBatch.delete(oldRef);
      count++;
      
      if (count >= 400) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await currentBatch.commit();
    }
    console.log(`- Moved ${docsToMove.length} documents for ${colName}`);
  }

  // Special for settings
  console.log("Migrating settings...");
  const settingsSnap = await getDocs(collection(db, "settings"));
  for (const d of settingsSnap.docs) {
    const newRef = doc(db, `tenants/${legacyTenantId}/settings`, d.id);
    await setDoc(newRef, d.data());
  }
  
  // Note: Nested subcollections inside `classes` (e.g. settings/competencies) 
  console.log("Migrating nested competencies...");
  const classesSnap = await getDocs(collection(db, "classes"));
  for (const c of classesSnap.docs) {
    try {
      const compSnap = await getDocs(collection(db, `classes/${c.id}/settings`));
      for (const comp of compSnap.docs) {
        const newRef = doc(db, `tenants/${legacyTenantId}/classes/${c.id}/settings`, comp.id);
        await setDoc(newRef, comp.data());
      }
    } catch(e) {}
  }

  console.log("Migration completed successfully!");
  process.exit(0);
}

migrate().catch(e => {
  console.error(e);
  process.exit(1);
});

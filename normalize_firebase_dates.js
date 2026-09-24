import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBzvBcAXT09TPxPZIgjop2CGVnpztK_TMU",
  authDomain: "art-booth-21252.firebaseapp.com",
  projectId: "art-booth-21252",
  storageBucket: "art-booth-21252.firebasestorage.app",
  messagingSenderId: "1067527240933",
  appId: "1:1067527240933:web:94bcdeb870f749831f680c",
  measurementId: "G-PJ32Y791MH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper to normalize dates to dd/mm/yyyy format (Christian Era)
function normalizeTimestamp(ts) {
  if (!ts) return "";
  const cleaned = ts.replace(",", "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return "";
  
  const datePart = parts[0];
  const timePart = parts[1] || "";
  
  const dateSplit = datePart.split("/");
  if (dateSplit.length !== 3) return ts;
  
  let day = parseInt(dateSplit[0], 10);
  let month = parseInt(dateSplit[1], 10);
  let year = parseInt(dateSplit[2], 10);
  
  // Convert Buddhist Era to Christian Era
  if (year > 2500) {
    year = year - 543;
  }
  
  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);
  
  const formattedDate = `${dayStr}/${monthStr}/${yearStr}`;
  if (timePart) {
    return `${formattedDate} ${timePart}`;
  }
  return formattedDate;
}

async function runNormalization() {
  console.log("Fetching sales docs from Firestore for 'BOOTHSUAY'...");
  const colRef = collection(db, "booths", "BOOTHSUAY", "sales");
  const snapshot = await getDocs(colRef);
  
  console.log(`Found ${snapshot.size} total sales documents.`);
  
  const batch = writeBatch(db);
  let updateCount = 0;
  
  snapshot.forEach((document) => {
    const data = document.data();
    const oldTimestamp = data.timestamp || "";
    const newTimestamp = normalizeTimestamp(oldTimestamp);
    
    if (oldTimestamp !== newTimestamp) {
      console.log(`Updating document ${document.id}: "${oldTimestamp}" -> "${newTimestamp}"`);
      const docRef = doc(db, "booths", "BOOTHSUAY", "sales", document.id);
      batch.update(docRef, { timestamp: newTimestamp });
      updateCount++;
    }
  });
  
  if (updateCount > 0) {
    console.log(`Committing batch update for ${updateCount} documents...`);
    await batch.commit();
    console.log("Batch update completed successfully!");
  } else {
    console.log("No documents required updating. All timestamps are already normalized!");
  }
}

runNormalization().catch(console.error);

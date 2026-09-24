import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

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

async function getSales() {
  console.log("Fetching sales for booth 'BOOTHSUAY'...");
  try {
    const querySnapshot = await getDocs(collection(db, "booths", "BOOTHSUAY", "sales"));
    const sales = [];
    querySnapshot.forEach((doc) => {
      sales.push({ id: doc.id, ...doc.data() });
    });
    console.log(`Successfully fetched ${sales.length} sales records.`);
    
    // Sort sales by timestamp if present
    sales.sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeB - timeA; // Descending
    });

    fs.writeFileSync("boothsuay_sales.json", JSON.stringify(sales, null, 2));
    console.log("Saved sales to boothsuay_sales.json");
  } catch (error) {
    console.error("Error fetching sales:", error);
  }
}

getSales();

import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  orderBy,
  writeBatch
} from "firebase/firestore";
// User's Firebase configuration read from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const subscribeToProducts = (boothId, onUpdate) => {
  const productsRef = collection(db, "booths", boothId, "products");
  
  return onSnapshot(productsRef, (snapshot) => {
    if (snapshot.empty) {
      onUpdate([]);
    } else {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      onUpdate(items);
    }
  }, (error) => {
    console.error("Firestore Products subscription error:", error);
  });
};

/**
 * Subscribe to Sales ledger records
 */
export const subscribeToSalesHistory = (boothId, onUpdate) => {
  const salesRef = collection(db, "booths", boothId, "sales");
  // Order sales by timestamp in descending order
  const q = query(salesRef, orderBy("timestamp", "desc"));

  return onSnapshot(q, (snapshot) => {
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    onUpdate(history);
  }, (error) => {
    console.error("Firestore Sales subscription error:", error);
  });
};

/**
 * Log a transaction receipt in Firestore
 */
export const addSaleRecord = async (boothId, receipt) => {
  const saleDocRef = doc(db, "booths", boothId, "sales", receipt.id);
  // Store receipt details
  await setDoc(saleDocRef, receipt);
};

/**
 * Update stock level of an item in Firestore
 */
export const updateProductStock = async (boothId, productId, newStock) => {
  const productDocRef = doc(db, "booths", boothId, "products", productId);
  await updateDoc(productDocRef, {
    stock: newStock
  });
};

/**
 * Add a new product to Firestore inventory catalog
 */
export const addProductRecord = async (boothId, product) => {
  const docRef = doc(db, "booths", boothId, "products", product.id);
  await setDoc(docRef, product);
};

/**
 * Delete a product from Firestore inventory catalog
 */
export const deleteProductRecord = async (boothId, productId) => {
  const docRef = doc(db, "booths", boothId, "products", productId);
  await deleteDoc(docRef);
};

/**
 * Reset all sales history logs for a session
 */
export const resetSalesHistory = async (boothId) => {
  const salesRef = collection(db, "booths", boothId, "sales");
  const snapshot = await getDocs(salesRef);
  const batch = writeBatch(db);

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
};

/**
 * Reset the inventory catalog to factory defaults
 */
export const resetInventoryCatalog = async (boothId) => {
  const productsRef = collection(db, "booths", boothId, "products");
  const snapshot = await getDocs(productsRef);
  const deleteBatch = writeBatch(db);

  snapshot.docs.forEach((doc) => {
    deleteBatch.delete(doc.ref);
  });

  await deleteBatch.commit();
  // Seeding runs automatically inside subscribeToProducts snapshot when it detects empty collection
};

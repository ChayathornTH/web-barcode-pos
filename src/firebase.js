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
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";

// User's Firebase configuration read from environment variables (with fallback)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBzvBcAXT09TPxPZIgjop2CGVnpztK_TMU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "art-booth-21252.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "art-booth-21252",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "art-booth-21252.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1067527240933",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1067527240933:web:94bcdeb870f749831f680c",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-PJ32Y791MH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * Client-side image compression to ensure images are lightweight (< 100KB)
 * Safe for Firebase Storage uploads, Firestore records, and localStorage fallback
 */
export const compressImage = (file, maxWidth = 240, maxHeight = 240, quality = 0.70) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Invalid image file'));
    }
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            return resolve({ dataUrl: reader.result, file });
          }
          const compressedFile = new File([blob], file.name || 'product.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, file: compressedFile });
        }, 'image/jpeg', quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Upload a product image file to Firebase Storage
 * Returns the public download URL
 */
export const uploadProductImage = async (boothId, file, productId) => {
  try {
    const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
    const cleanId = (productId || 'prod_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `booths/${boothId || 'default'}/products/${cleanId}_${Date.now()}.${fileExt}`;
    const fileRef = storageRef(storage, filePath);
    
    const metadata = {
      contentType: file.type || 'image/jpeg'
    };
    
    const uploadResult = await uploadBytes(fileRef, file, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);
    return downloadUrl;
  } catch (error) {
    console.error("Firebase Storage upload error:", error);
    let friendlyMessage = error.message;
    if (error.code === 'storage/unknown' || error.message?.includes('404')) {
      friendlyMessage = "Firebase Storage bucket not found. Please click 'Get started' in Firebase Console > Storage to initialize your bucket.";
    } else if (error.code === 'storage/unauthorized' || error.code === 'storage/permission-denied') {
      friendlyMessage = "Firebase Storage permission denied. Please allow read/write in Firebase Console > Storage > Rules.";
    }
    const customErr = new Error(friendlyMessage);
    customErr.code = error.code;
    customErr.originalError = error;
    throw customErr;
  }
};

export const subscribeToProducts = (boothId, onUpdate, onError) => {
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
    if (onError) onError(error);
  });
};

/**
 * Subscribe to Sales ledger records
 */
export const subscribeToSalesHistory = (boothId, onUpdate, onError) => {
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
    if (onError) onError(error);
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
 * Clear all products in a booth's inventory catalog
 */
export const resetInventoryCatalog = async (boothId) => {
  const productsRef = collection(db, "booths", boothId, "products");
  const snapshot = await getDocs(productsRef);
  const docs = snapshot.docs;
  const chunkSize = 400;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const deleteBatch = writeBatch(db);
    chunk.forEach((doc) => {
      deleteBatch.delete(doc.ref);
    });
    await deleteBatch.commit();
  }
};

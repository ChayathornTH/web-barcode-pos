/**
 * Client-side image utility functions combining:
 * - Option A: Ultra-light thumbnail compression (~6-12 KB) for fast sync
 * - Option B: Local-first device caching for instant offline rendering without network lag
 */

// In-memory cache for 60fps instant access without disk reads
const memoryImageCache = new Map();

/**
 * Retrieve cached image from local device memory or localStorage
 */
export const getLocalImage = (productId) => {
  if (!productId) return null;
  if (memoryImageCache.has(productId)) {
    return memoryImageCache.get(productId);
  }
  try {
    const cached = localStorage.getItem(`pos_img_${productId}`);
    if (cached) {
      memoryImageCache.set(productId, cached);
      return cached;
    }
  } catch {
    // Quota or private browsing fallback
  }
  return null;
};

/**
 * Cache an image locally on the device (Option B)
 */
export const setLocalImage = (productId, dataUrl) => {
  if (!productId || !dataUrl) return;
  memoryImageCache.set(productId, dataUrl);
  try {
    localStorage.setItem(`pos_img_${productId}`, dataUrl);
  } catch {
    // In-memory cache still works if localStorage is restricted
  }
};

/**
 * Resolves a product image to its correct URL.
 * Checks local device cache first (Option B) for instant offline rendering.
 */
export const getProductImageUrl = (image, productName = '', productId = '') => {
  const img = image ? String(image).trim() : '';

  // 1. If an image is provided directly, prioritize it and update local cache!
  if (img) {
    if (productId && img.startsWith('data:')) {
      setLocalImage(productId, img);
    }

    // If already a data URL, blob URL, absolute path, or external URL, return directly
    if (
      img.startsWith('data:') ||
      img.startsWith('blob:') ||
      img.startsWith('http://') ||
      img.startsWith('https://') ||
      img.startsWith('/')
    ) {
      return img;
    }

    // Relative file name in public/product-images/
    const hasExt = /\.(png|jpe?g|webp|gif|svg)$/i.test(img);
    const filename = hasExt ? img : `${img}.png`;
    return `/web-barcode-pos/product-images/${filename}`;
  }

  // 2. If no image passed, check if we have a locally cached image for this product
  if (productId) {
    const cached = getLocalImage(productId);
    if (cached) return cached;
  }

  // 3. Fallback to product name in product-images/
  if (productName) {
    return `/web-barcode-pos/product-images/${productName}.png`;
  }
  return '';
};

/**
 * Client-side ultra-light compression (Option A)
 * Resizes photos to a compact thumbnail (default 240x240, JPEG 0.70)
 * Drops payload from ~70 KB down to ~6-12 KB for ultra-fast sync even on 3G
 */
export const compressImage = (file, maxWidth = 240, maxHeight = 240, quality = 0.70) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Please select a valid image file'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for processing'));
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

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        // Calculate size in KB
        const sizeKB = Math.round((dataUrl.length * 0.75) / 1024 * 10) / 10;
        resolve({ dataUrl, width, height, sizeKB });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
};

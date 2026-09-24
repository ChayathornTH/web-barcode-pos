import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PRODUCTS } from './data/mockProducts';
import PosView from './components/PosView';
import InventoryView from './components/InventoryView';
import DashboardView from './components/DashboardView';
import { ShoppingCart, Database, LayoutDashboard, Settings, AlertCircle, CheckCircle, RefreshCw, Tablet, Download, Share2, X } from 'lucide-react';
import { 
  subscribeToProducts,
  subscribeToSalesHistory, 
  addSaleRecord, 
  updateProductStock, 
  addProductRecord,
  deleteProductRecord,
  resetSalesHistory as resetSalesFirebase,
  resetInventoryCatalog as resetInventoryFirebase
} from './firebase';

const normalizeProducts = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(p => {
    let tiers = p.setTiers;
    if (typeof tiers === 'string') {
      try { tiers = JSON.parse(tiers); } catch (e) { tiers = []; }
    }
    if (p.isSetPriced && Array.isArray(tiers)) {
      const basePrice = p.price || 0;
      const normalizedTiers = tiers.map(t => {
        const qty = t.quantity || 1;
        let tPrice = t.price;
        let tDiscount = t.discount;

        if (tDiscount === undefined && tPrice !== undefined) {
          tDiscount = Math.max(0, basePrice * qty - tPrice);
        } else if (tPrice === undefined && tDiscount !== undefined) {
          tPrice = Math.max(0, basePrice * qty - tDiscount);
        } else if (tPrice === undefined && tDiscount === undefined) {
          tPrice = basePrice * qty;
          tDiscount = 0;
        }
        return {
          ...t,
          quantity: typeof qty === 'number' ? qty : (parseInt(qty) || 1),
          price: typeof tPrice === 'number' ? tPrice : (parseFloat(tPrice) || 0),
          discount: typeof tDiscount === 'number' ? tDiscount : (parseFloat(tDiscount) || 0)
        };
      });
      return {
        ...p,
        tag: p.tag || p.series || p.fandom || '',
        setTiers: normalizedTiers
      };
    }
    return {
      ...p,
      tag: p.tag || p.series || p.fandom || ''
    };
  });
};

const normalizeCart = (cartItems) => {
  if (!Array.isArray(cartItems)) return [];
  return cartItems.map(item => {
    let tiers = item.setTiers;
    if (typeof tiers === 'string') {
      try { tiers = JSON.parse(tiers); } catch (e) { tiers = []; }
    }
    if (item.isSetPriced && Array.isArray(tiers)) {
      const basePrice = item.price || 0;
      const normalizedTiers = tiers.map(t => {
        const qty = t.quantity || 1;
        let tPrice = t.price;
        let tDiscount = t.discount;

        if (tDiscount === undefined && tPrice !== undefined) {
          tDiscount = Math.max(0, basePrice * qty - tPrice);
        } else if (tPrice === undefined && tDiscount !== undefined) {
          tPrice = Math.max(0, basePrice * qty - tDiscount);
        } else if (tPrice === undefined && tDiscount === undefined) {
          tPrice = basePrice * qty;
          tDiscount = 0;
        }
        return {
          ...t,
          quantity: typeof qty === 'number' ? qty : (parseInt(qty) || 1),
          price: typeof tPrice === 'number' ? tPrice : (parseFloat(tPrice) || 0),
          discount: typeof tDiscount === 'number' ? tDiscount : (parseFloat(tDiscount) || 0)
        };
      });
      return {
        ...item,
        setTiers: normalizedTiers
      };
    }
    return item;
  });
};

const parseCSVProducts = (text) => {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const parsed = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = [];
    let current = '';
    let insideQuote = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());

    const product = {};
    headers.forEach((header, index) => {
      let val = row[index] || '';
      val = val.replace(/^["']|["']$/g, '').trim();
      
      const key = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key === 'barcode') product.barcode = val;
      else if (key === 'name') product.name = val;
      else if (key === 'price') product.price = parseFloat(val) || 0;
      else if (key === 'category') product.category = val || 'Others';
      else if (key === 'stock') product.stock = parseInt(val) || 0;
      else if (key === 'artist' || key === 'owner') product.artist = val || 'Unknown';
      else if (key === 'tag' || key === 'tags' || key === 'series' || key === 'fandom') product.tag = val;
      else if (key === 'emoji') product.emoji = val || '📦';
      else if (key === 'image') product.image = val;
      else if (key === 'description') product.description = val;
      else if (key === 'issetpriced') product.isSetPriced = val.toLowerCase() === 'true';
      else if (key === 'setgroupname') product.setGroupName = val;
      else if (key === 'set1qty') product.set1qty = parseInt(val) || 0;
      else if (key === 'set1price') product.set1price = parseFloat(val) || 0;
      else if (key === 'set2qty') product.set2qty = parseInt(val) || 0;
      else if (key === 'set2price') product.set2price = parseFloat(val) || 0;
      else if (key === 'set3qty') product.set3qty = parseInt(val) || 0;
      else if (key === 'set3price') product.set3price = parseFloat(val) || 0;
    });

    product.id = product.id || `prod-${product.barcode || Math.random().toString(36).substr(2, 9)}`;

    if (product.isSetPriced) {
      const tiers = [];
      if (product.set1qty && product.set1price) {
        tiers.push({ quantity: product.set1qty, price: product.set1price });
      }
      if (product.set2qty && product.set2price) {
        tiers.push({ quantity: product.set2qty, price: product.set2price });
      }
      if (product.set3qty && product.set3price) {
        tiers.push({ quantity: product.set3qty, price: product.set3price });
      }

      delete product.set1qty;
      delete product.set1price;
      delete product.set2qty;
      delete product.set2price;
      delete product.set3qty;
      delete product.set3price;

      if (tiers.length > 0) {
        product.setTiers = tiers;
      } else if (!product.setTiers || product.setTiers.length === 0) {
        product.setTiers = [
          { quantity: 1, price: product.price, discount: 0 },
          { quantity: 3, price: 25.00, discount: Math.max(0, product.price * 3 - 25.00) },
          { quantity: 5, price: 35.00, discount: Math.max(0, product.price * 5 - 35.00) }
        ];
      }
    }

    parsed.push(product);
  }

  return normalizeProducts(parsed);
};

export default function App() {
  const [activeView, setActiveView] = useState('terminal');
  
  // Cloud Sync Settings State
  const [boothId, setBoothId] = useState(() => {
    const saved = localStorage.getItem('pos_booth_id');
    return saved ? saved.trim().toUpperCase() : "";
  });

  // Database States
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('pos_products');
    const parsed = saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
    return normalizeProducts(parsed);
  });



  // Cart State (Local to device so cashiers don't collide)
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('pos_cart');
    const parsed = saved ? JSON.parse(saved) : [];
    return normalizeCart(parsed);
  });

  // Sales History State
  const [salesHistory, setSalesHistory] = useState(() => {
    const saved = localStorage.getItem('pos_sales_history');
    return saved ? JSON.parse(saved) : [];
  });

  // UI States
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [cloudSyncError, setCloudSyncError] = useState(null);

  // iPad & PWA Standalone App States
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => {
    return (
      (typeof window !== 'undefined' && window.navigator?.standalone === true) ||
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    );
  });

  useEffect(() => {
    const checkStandalone = () => {
      const standalone = 
        window.navigator?.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      setIsStandalone(standalone);
    };

    window.addEventListener('resize', checkStandalone);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('resize', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        addToast('OmniScan installed successfully!', 'success');
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  // Floating Toast Notification Helper
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Load products dynamically from public/products.csv on initial setup (only if no booth and no saved products)
  useEffect(() => {
    const loadProductsFromCSV = async () => {
      // Don't auto-fetch if connected to cloud booth or if inventory has already been initialized/cleared
      if (localStorage.getItem('pos_booth_id') || localStorage.getItem('pos_products') !== null) {
        return;
      }

      try {
        const githubUrl = "https://raw.githubusercontent.com/ChayathornTH/web-barcode-pos/main/public/products.csv";
        const basePath = import.meta.env.BASE_URL || '/';
        const localUrl = `${basePath}products.csv`.replace(/\/+/g, '/');
        
        let response;
        let loadedFromGithub = false;
        
        // Try fetching from GitHub raw content first for real-time changes
        try {
          response = await fetch(githubUrl, { cache: 'no-store' });
          if (response.ok) {
            loadedFromGithub = true;
          } else {
            throw new Error("GitHub raw fetch failed");
          }
        } catch (githubErr) {
          console.warn("Could not fetch from GitHub raw repository, falling back to local file:", githubErr);
          response = await fetch(localUrl);
        }

        if (!response.ok) {
          throw new Error(`Failed to load products.csv: ${response.statusText}`);
        }
        
        const csvText = await response.text();
        const parsed = parseCSVProducts(csvText);
        if (parsed && parsed.length > 0) {
          setProducts(parsed);
          localStorage.setItem('pos_products', JSON.stringify(parsed));
          addToast(
            `Loaded ${parsed.length} products ${loadedFromGithub ? 'from GitHub (latest)' : 'from local backup'}`, 
            'success'
          );
        }
      } catch (error) {
        console.error("Failed to load products from CSV, using cached catalog:", error);
      }
    };
    loadProductsFromCSV();
  }, []);

  // Sync LOCAL states to local storage (only when NOT using cloud sync)
  useEffect(() => {
    if (!boothId) {
      localStorage.setItem('pos_products', JSON.stringify(products));
    }
  }, [products, boothId]);

  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!boothId) {
      localStorage.setItem('pos_sales_history', JSON.stringify(salesHistory));
    }
  }, [salesHistory, boothId]);

  // Real-time Cloud DB Synchronization Hook
  useEffect(() => {
    if (!boothId) {
      setCloudSyncError(null);
      return;
    }

    const timer = setTimeout(() => {
      addToast(`Syncing with cloud booth: "${boothId}"`, 'info');
    }, 0);
    
    // Subscribe to products sub-collection
    const unsubscribeProds = subscribeToProducts(boothId, (items) => {
      setCloudSyncError(null);
      setProducts(normalizeProducts(items));
    }, (error) => {
      console.error("Firestore Products subscription error:", error);
      if (error.code === 'permission-denied') {
        setCloudSyncError("Firebase Permission Denied: Firestore Security Rules expired. Please update rules in Firebase Console.");
        addToast("Firebase permission denied! Please update Firestore Security Rules in Firebase Console.", "error");
      } else {
        setCloudSyncError(error.message);
        addToast(`Firebase sync error: ${error.message}`, "error");
      }
    });

    // Subscribe to sales sub-collection
    const unsubscribeSales = subscribeToSalesHistory(boothId, (history) => {
      setSalesHistory(history);
    }, (error) => {
      console.error("Firestore Sales subscription error:", error);
      if (error.code === 'permission-denied') {
        setCloudSyncError("Firebase Permission Denied: Firestore Security Rules expired.");
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribeProds();
      unsubscribeSales();
    };
  }, [boothId]);



  // Connect to a shared Cloud Booth
  const handleConnectBooth = (e) => {
    e.preventDefault();
    const code = e.target.elements.boothInput.value.trim().toUpperCase();
    if (!code) return;
    
    setBoothId(code);
    localStorage.setItem('pos_booth_id', code);
    addToast(`Connected to Shared Cloud Booth: "${code}"`, "success");
    setActiveView('terminal'); // Switch back to POS view on connect
  };

  // Disconnect from cloud and fall back to local storage
  const handleDisconnectBooth = () => {
    if (window.confirm("Disconnect from cloud sync? You will fall back to local offline storage.")) {
      setBoothId("");
      localStorage.removeItem('pos_booth_id');
      addToast("Switched to local offline storage.", "info");
      
      // Load offline presets
      const savedProds = localStorage.getItem('pos_products');
      setProducts(savedProds ? normalizeProducts(JSON.parse(savedProds)) : DEFAULT_PRODUCTS);
      const savedHistory = localStorage.getItem('pos_sales_history');
      setSalesHistory(savedHistory ? JSON.parse(savedHistory) : []);
    }
  };

  // Centralized scan barcode action
  const handleScanEvent = useCallback((barcodeString) => {
    // Look up item
    const matchedProduct = products.find(p => p.barcode === barcodeString);

    if (matchedProduct) {
      // Find how many of this item are already in the cart
      const cartItem = cart.find(item => item.id === matchedProduct.id);
      const currentQty = cartItem ? cartItem.quantity : 0;

      if (matchedProduct.stock === 0 || currentQty >= matchedProduct.stock) {
        addToast(`"${matchedProduct.name}" is out of stock!`, 'warning');
        return false;
      }

      // Add to cart
      setCart((prevCart) => {
        const existing = prevCart.find(item => item.id === matchedProduct.id);
        if (existing) {
          return prevCart.map(item => 
            item.id === matchedProduct.id 
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
          return [...prevCart, { ...matchedProduct, quantity: 1 }];
        }
      });

      setLastScannedItem({ ...matchedProduct, barcode: barcodeString });
      setActiveView('terminal');

      addToast(`Added ${matchedProduct.name} to cart.`, 'success');
      return true;
    } else {
      addToast(`Unknown Barcode: "${barcodeString}". Register it in inventory.`, 'error');
      return false;
    }
  }, [products, cart]);

  // Keyboard wedge listener for physical barcode scanners
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      const currentTime = Date.now();
      const delay = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (delay > 65) {
        buffer = "";
      }

      const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                             document.activeElement.tagName === 'TEXTAREA' || 
                             document.activeElement.tagName === 'SELECT';

      if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
        buffer += e.key;
      } else if (e.key === 'Enter') {
        if (buffer.length >= 3 && (delay < 45 || !isInputFocused)) {
          e.preventDefault();
          e.stopPropagation();
          
          handleScanEvent(buffer);
          buffer = "";
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [handleScanEvent]);

  // Inventory Management Actions
  const handleAddProduct = async (newProd) => {
    let finalProd = { ...newProd };
    if (newProd.isSetPriced && newProd.setGroupName) {
      const matchingGroupProd = products.find(p => p.isSetPriced && p.setGroupName === newProd.setGroupName);
      if (matchingGroupProd && (!newProd.setTiers || newProd.setTiers.length === 0)) {
        finalProd.setTiers = matchingGroupProd.setTiers;
      }
    }

    const updatedList = [finalProd, ...products];
    setProducts(updatedList);
    localStorage.setItem('pos_products', JSON.stringify(updatedList));

    if (boothId) {
      try {
        await addProductRecord(boothId, finalProd);
        addToast(`Registered "${finalProd.name}" in cloud inventory catalog.`, 'success');
      } catch (err) {
        console.error("Add product Firestore error:", err);
        addToast(
          err.code === 'permission-denied'
            ? 'Firebase permission denied! Please update Firestore Security Rules in Firebase Console.'
            : `Failed to save product to cloud: ${err.message}`,
          'error'
        );
      }
    } else {
      addToast(`Registered "${finalProd.name}" in inventory catalog.`, 'success');
    }
  };

  const handleUpdateProduct = async (updatedProd) => {
    const originalProd = products.find(p => p.id === updatedProd.id);
    const originalGroupName = originalProd?.setGroupName || '';
    const newGroupName = updatedProd.setGroupName || '';
    const isGroupNameChanged = originalProd && originalProd.isSetPriced && updatedProd.isSetPriced && originalGroupName !== newGroupName;

    const syncTiersForProduct = (targetProd, referenceTiers) => {
      const basePrice = targetProd.price || 0;
      return referenceTiers.map(t => {
        const qty = t.quantity || 1;
        const tPrice = t.price !== undefined ? t.price : Math.max(0, basePrice * qty - (t.discount || 0));
        const discount = Math.max(0, basePrice * qty - tPrice);
        return {
          quantity: qty,
          price: tPrice,
          discount: discount
        };
      });
    };

    let updatedList = products.map(p => p.id === updatedProd.id ? updatedProd : p);

    if (updatedProd.isSetPriced && newGroupName) {
      // Check if we are renaming an existing group
      const otherGroupNames = products.filter(p => p.id !== updatedProd.id && p.isSetPriced).map(p => p.setGroupName);
      const isNewGroupBrandNew = !otherGroupNames.includes(newGroupName);

      if (isGroupNameChanged && isNewGroupBrandNew && originalGroupName) {
        // Renaming group: update all products in original group to the new group name and new tiers
        updatedList = updatedList.map(p => {
          if (p.isSetPriced && p.setGroupName === originalGroupName) {
            return {
              ...p,
              setGroupName: newGroupName,
              setTiers: syncTiersForProduct(p, updatedProd.setTiers)
            };
          }
          return p;
        });
      } else {
        // Same group or joining an existing group: synchronize tiers for all items in the new group
        updatedList = updatedList.map(p => {
          if (p.isSetPriced && p.setGroupName === newGroupName && p.id !== updatedProd.id) {
            return {
              ...p,
              setTiers: syncTiersForProduct(p, updatedProd.setTiers)
            };
          }
          return p;
        });
      }
    }

    // Always update local state immediately so UI and image update with zero delay
    setProducts(updatedList);
    localStorage.setItem('pos_products', JSON.stringify(updatedList));

    // Update cloud sync
    if (boothId) {
      try {
        for (const p of updatedList) {
          const current = products.find(curr => curr.id === p.id);
          if (JSON.stringify(current) !== JSON.stringify(p)) {
            await addProductRecord(boothId, p);
          }
        }
        addToast(`Updated product: ${updatedProd.name} in cloud.`, 'info');
      } catch (err) {
        console.error("Update product Firestore error:", err);
        addToast(
          err.code === 'permission-denied'
            ? 'Firebase permission denied! Please update Firestore Security Rules in Firebase Console.'
            : `Failed to update cloud product: ${err.message}`,
          'error'
        );
      }
    } else {
      addToast(`Updated product: ${updatedProd.name} and synced group settings.`, 'info');
    }
  };

  const handleDeleteProduct = async (id) => {
    const prod = products.find(p => p.id === id);
    if (boothId) {
      try {
        await deleteProductRecord(boothId, id);
        addToast(`Deleted "${prod?.name || 'product'}" from cloud.`, 'warning');
      } catch (err) {
        console.error("Delete product Firestore error:", err);
        addToast(`Failed to delete product from cloud: ${err.message}`, 'error');
      }
    } else {
      const updatedList = products.filter(p => p.id !== id);
      setProducts(updatedList);
      localStorage.setItem('pos_products', JSON.stringify(updatedList));
      addToast(`Deleted "${prod?.name || 'product'}" from database.`, 'warning');
    }
  };

  const handleImportProducts = async (importedProds, overwrite = false) => {
    try {
      let updatedList;
      if (overwrite) {
        if (boothId) {
          for (const p of products) {
            await deleteProductRecord(boothId, p.id);
          }
        }
        updatedList = importedProds;
      } else {
        const mergedMap = new Map();
        products.forEach(p => {
          mergedMap.set(p.barcode || p.id, p);
        });
        importedProds.forEach(p => {
          const key = p.barcode || p.id;
          const existing = mergedMap.get(key);
          const id = existing ? existing.id : (p.id || `prod-${p.barcode}-${Date.now()}`);
          mergedMap.set(key, { ...p, id });
        });
        updatedList = Array.from(mergedMap.values());
      }

      const normalized = normalizeProducts(updatedList);

      if (boothId) {
        for (const p of normalized) {
          await addProductRecord(boothId, p);
        }
      } else {
        setProducts(normalized);
        localStorage.setItem('pos_products', JSON.stringify(normalized));
      }
      addToast(`Successfully imported ${importedProds.length} products.`, 'success');
      return true;
    } catch (err) {
      console.error(err);
      addToast(`Import failed: ${err.message}`, 'error');
      return false;
    }
  };

  const handleResetInventory = async () => {
    if (window.confirm("Are you sure you want to restore the inventory catalog from products.csv? This will overwrite custom products and reset all changes.")) {
      try {
        const githubUrl = "https://raw.githubusercontent.com/ChayathornTH/web-barcode-pos/main/public/products.csv";
        const basePath = import.meta.env.BASE_URL || '/';
        const localUrl = `${basePath}products.csv`.replace(/\/+/g, '/');
        
        let response;
        try {
          response = await fetch(githubUrl, { cache: 'no-store' });
          if (!response.ok) throw new Error();
        } catch {
          response = await fetch(localUrl);
        }
        
        if (!response.ok) {
          throw new Error("Failed to fetch CSV for reset");
        }
        
        const csvText = await response.text();
        const csvProducts = parseCSVProducts(csvText);
        
        if (csvProducts && csvProducts.length > 0) {
          if (boothId) {
            // First clear products in Firebase
            await resetInventoryFirebase(boothId);
            // Then seed with csvProducts
            for (const p of csvProducts) {
              await addProductRecord(boothId, p);
            }
          } else {
            setProducts(csvProducts);
            localStorage.setItem('pos_products', JSON.stringify(csvProducts));
          }
          addToast("Successfully reset inventory from products.csv", "success");
        } else {
          throw new Error("Parsed CSV is empty");
        }
      } catch (error) {
        console.error("Error resetting inventory:", error);
        addToast("Failed to reset inventory from CSV. Using default catalog instead.", "error");
        
        // Fallback to hardcoded mock products if CSV parse/fetch fails completely
        if (boothId) {
          await resetInventoryFirebase(boothId);
          for (const p of DEFAULT_PRODUCTS) {
            await addProductRecord(boothId, p);
          }
        } else {
          setProducts(DEFAULT_PRODUCTS);
          localStorage.setItem('pos_products', JSON.stringify(DEFAULT_PRODUCTS));
        }
      }
    }
  };

  const handleClearInventory = async () => {
    if (window.confirm("Are you sure you want to clear ALL products from the inventory? This will permanently delete all items in this catalog.")) {
      try {
        if (boothId) {
          await resetInventoryFirebase(boothId);
        }
        setProducts([]);
        localStorage.setItem('pos_products', JSON.stringify([]));
        addToast("All products have been cleared from inventory.", "info");
      } catch (err) {
        console.error("Error clearing inventory:", err);
        addToast(`Failed to clear inventory: ${err.message}`, "error");
      }
    }
  };

  // Custom Item sale injection (adds virtual art commissions directly to cart)
  const handleAddCustomCartItem = (name, price, category = 'Others', artist = 'Unknown') => {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      addToast("Invalid custom item price.", "error");
      return;
    }
    const customProduct = {
      id: `custom-${Date.now()}`,
      barcode: `custom-${Date.now()}`,
      name: name.trim() || 'Custom Item',
      price: priceNum,
      category: category,
      stock: 999,
      emoji: "🎨",
      artist: artist.trim() || 'Unknown',
      description: "Custom commissioned art item.",
      isSetPriced: category === 'Stickers',
      setGroupName: category === 'Stickers' ? 'Stickers' : '',
      setTiers: category === 'Stickers' ? [
        { quantity: 1, price: 10.00, discount: 0.00 },
        { quantity: 3, price: 25.00, discount: 5.00 },
        { quantity: 5, price: 35.00, discount: 15.00 }
      ] : []
    };

    setCart((prev) => [...prev, { ...customProduct, quantity: 1 }]);
    addToast(`Added custom "${customProduct.name}" (฿${priceNum.toFixed(2)}) by ${customProduct.artist} to cart.`, 'success');
  };

  // Cart Management Actions
  const handleUpdateCartQty = (id, newQty) => {
    if (newQty <= 0) {
      handleRemoveFromCart(id);
      return;
    }

    const item = cart.find(c => c.id === id);
    const prod = products.find(p => p.id === id);

    if (!item) return;

    if (prod && prod.id.startsWith('custom-')) {
      setCart((prev) => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c));
      return;
    }

    if (prod && prod.stock < newQty) {
      addToast(`Cannot add more. Only ${prod.stock} items left in stock.`, 'warning');
      return;
    }

    setCart((prev) => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c));
  };

  const handleRemoveFromCart = (id) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    
    setCart((prev) => prev.filter(c => c.id !== id));
    addToast(`Removed "${item.name}" from cart.`, 'info');
  };

  const handleClearCart = () => {
    setCart([]);
    setLastScannedItem(null);
    addToast("Cart cleared.", "info");
  };

  // Checkout simulation logger
  const handleCheckout = async (receipt) => {
    try {
      if (boothId) {
        // Update database stock levels for all purchased non-custom items
        for (const item of cart) {
          if (!item.id.startsWith('custom-')) {
            const prod = products.find(p => p.id === item.id);
            if (prod) {
              const newStock = Math.max(0, prod.stock - item.quantity);
              await updateProductStock(boothId, item.id, newStock);
            }
          }
        }
        await addSaleRecord(boothId, receipt);
      } else {
        // Update local stock levels
        setProducts((prevProducts) => 
          prevProducts.map(p => {
            const cartItem = cart.find(item => item.id === p.id);
            if (cartItem) {
              return { ...p, stock: Math.max(0, p.stock - cartItem.quantity) };
            }
            return p;
          })
        );
        setSalesHistory((prev) => [receipt, ...prev]);
      }
      
      setCart([]); 
      setLastScannedItem(null);
      addToast(`Transaction ${receipt.id} processed successfully!`, 'success');
    } catch (err) {
      console.error("Checkout stock update failed:", err);
      addToast("Failed to process transaction inventory update.", "error");
    }
  };

  const handleResetSalesHistory = () => {
    if (boothId) {
      resetSalesFirebase(boothId);
    } else {
      setSalesHistory([]);
      localStorage.removeItem('pos_sales_history');
    }
    addToast("Sales ledger history has been reset.", "info");
  };

  return (
    <div className="app-container">
      
      {/* Sidebar Navigation */}
      <aside className="app-sidebar glass-panel">
        <div style={styles.sidebarBrand}>
          <div style={styles.brandLogo}>⚡</div>
          <div className="sidebar-brand-name">
            <h1 style={styles.brandTitle}>OmniScan POS</h1>
            <span style={styles.brandSubtitle}>Artist Ledger v2.0</span>
          </div>
        </div>

        <nav className="app-sidebar-nav">
          <button 
            className={`btn ${activeView === 'terminal' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
            style={styles.navBtn}
            onClick={() => setActiveView('terminal')}
          >
            <ShoppingCart size={18} />
            <span>POS Terminal</span>
          </button>

          <button 
            className={`btn ${activeView === 'inventory' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
            style={styles.navBtn}
            onClick={() => setActiveView('inventory')}
          >
            <Database size={18} />
            <span>Product Inventory</span>
            <span className="badge">{products.length}</span>
          </button>

          <button 
            className={`btn ${activeView === 'dashboard' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
            style={styles.navBtn}
            onClick={() => setActiveView('dashboard')}
          >
            <LayoutDashboard size={18} />
            <span>Sales Dashboard</span>
          </button>

          <button 
            className={`btn ${activeView === 'settings' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
            style={styles.navBtn}
            onClick={() => setActiveView('settings')}
          >
            <Settings size={18} />
            <span>Cloud Sync</span>
          </button>

          <button 
            className="btn btn-secondary"
            style={{
              ...styles.navBtn,
              borderColor: isStandalone ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.4)',
              background: isStandalone ? 'rgba(16, 185, 129, 0.1)' : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.15))'
            }}
            onClick={isStandalone ? () => addToast('Already running in standalone iPad app mode!', 'success') : handleInstallClick}
            title={isStandalone ? 'Running in iPad App Mode' : 'Add OmniScan to Home Screen'}
          >
            <Tablet size={18} color={isStandalone ? 'var(--success)' : 'var(--accent)'} />
            <span>{isStandalone ? 'iPad App Mode' : (deferredPrompt ? 'Install App' : 'Add to Home')}</span>
          </button>
        </nav>

        {/* Global Wedge Active status indicator */}
        <div className="sidebar-status-box glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span className="pulse-primary" style={styles.statusDot}></span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>SYSTEM ACTIVE</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
            PC scanner and cloud services are active.
          </p>
        </div>

        <div className="sidebar-footer" style={styles.sidebarFooter}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Created by Antigravity AI</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeView === 'terminal' && (
          <PosView 
            products={products}
            cart={cart}
            onUpdateCartQty={handleUpdateCartQty}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onManualScan={handleScanEvent}
            onCheckout={handleCheckout}
            lastScannedItem={lastScannedItem}
            onAddCustomItem={handleAddCustomCartItem}
          />
        )}

        {activeView === 'inventory' && (
          <InventoryView 
            products={products}
            boothId={boothId}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onSimulateScan={handleScanEvent}
            onResetInventory={handleResetInventory}
            onClearInventory={handleClearInventory}
            onImportProducts={handleImportProducts}
          />
        )}

        {activeView === 'dashboard' && (
          <DashboardView 
            salesHistory={salesHistory}
            onResetSalesHistory={handleResetSalesHistory}
          />
        )}

        {activeView === 'settings' && (
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
              <Settings color="var(--primary)" /> Cloud Synchronization & Storage
            </h2>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Synchronize your product catalog, pricing, stock levels, images, and sales history across multiple devices (PC and phones) in real-time.
            </p>

            {cloudSyncError && (
              <div style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--danger)',
                color: '#fca5a5',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                lineHeight: '1.4'
              }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                  <AlertCircle size={16} color="var(--danger)" /> Firebase Permission Denied
                </div>
                <p style={{ fontSize: '0.8rem', opacity: 0.95 }}>
                  Your Firebase 30-day Test Mode Security Rules have expired.
                </p>
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  Go to Firebase Console &gt; Firestore Database &gt; Rules<br />
                  Set: <code>allow read, write: if true;</code> and click Publish.
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span className={boothId ? (cloudSyncError ? "" : "pulse-primary") : ""} style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: !boothId ? 'var(--warning)' : (cloudSyncError ? 'var(--danger)' : 'var(--success)'),
                  display: 'inline-block'
                }}></span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: !boothId ? 'var(--warning)' : (cloudSyncError ? 'var(--danger)' : 'var(--success)') }}>
                  {!boothId ? 'LOCAL OFFLINE STORAGE' : (cloudSyncError ? 'FIREBASE PERMISSION ERROR' : 'CLOUD SYNC ACTIVE (ONLINE)')}
                </span>
              </div>

              {boothId ? (
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
                    Connected to Shared Booth ID: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{boothId}</strong>
                  </p>
                  <button className="btn btn-danger" onClick={handleDisconnectBooth} style={{ width: '100%' }}>
                    Disconnect Sync
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
                    Enter a shared Booth ID code (e.g. <code>BOOTHSUAY</code>) to sync. Multiple devices using the same code share databases instantly!
                  </p>
                  <form onSubmit={handleConnectBooth} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="Enter Booth ID Code..."
                      className="custom-input"
                      style={{ textTransform: 'uppercase' }}
                      name="boothInput"
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                      Enable Real-Time Cloud Sync
                    </button>
                  </form>
                </div>
              )}
            </div>

            <div style={{
              padding: '0.85rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: '1.4',
              marginBottom: '1rem'
            }}>
              <strong style={{ color: 'var(--accent)' }}>Firebase Storage (Image Hosting):</strong>
              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                To upload product photos directly to Firebase Storage, activate Storage in your Firebase Console (<strong>Build &gt; Storage &gt; Get started</strong>). If Storage is not active, local image compression is automatically used.
              </p>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <strong>Note:</strong> Connecting to a shared cloud booth fetches the current cloud inventory. If the booth ID is new, it seeds automatically with Art Fest defaults. Disconnecting returns you to offline files.
            </div>
          </div>
        )}
      </main>

      {/* Toast Notification Container */}
      <div style={styles.toastContainer}>
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className="glass-panel"
            style={{
              ...styles.toastCard,
              borderLeft: `4px solid ${
                toast.type === 'success' ? 'var(--success)' : 
                toast.type === 'error' ? 'var(--danger)' : 
                toast.type === 'warning' ? 'var(--warning)' : 
                'var(--accent)'
              }`
            }}
          >
            {toast.type === 'success' && <CheckCircle size={16} color="var(--success)" />}
            {toast.type === 'error' && <AlertCircle size={16} color="var(--danger)" />}
            {toast.type === 'warning' && <AlertCircle size={16} color="var(--warning)" />}
            {toast.type === 'info' && <RefreshCw size={16} color="var(--accent)" />}
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* iPad / PWA Install Guide Modal */}
      {showInstallGuide && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
        }}>
          <div className="glass-panel" style={{
            maxWidth: '500px',
            width: '100%',
            backgroundColor: 'rgba(15, 19, 31, 0.98)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            borderRadius: '16px',
            padding: '1.75rem',
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            animation: 'slideIn 0.25s ease-out'
          }}>
            <button
              onClick={() => setShowInstallGuide(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.4rem',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem'
              }}>
                ⚡
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', color: '#fff', margin: 0 }}>Install OmniScan on iPad</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Run fullscreen like a native app without Safari bars
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', margin: '1.5rem 0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}>1</div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Tap Safari's <strong>Share</strong> button <Share2 size={16} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    At the top of Safari on your iPad, tap the square icon with an arrow pointing up.
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}>2</div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    Select <strong>"Add to Home Screen"</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    In the share sheet, scroll down and tap the option with the plus (+) icon.
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}>3</div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    Tap <strong>"Add"</strong> & Launch
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Tap Add in the top-right corner. Now open OmniScan from your iPad home screen to run in standalone app mode!
                  </div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setShowInstallGuide(false)}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  sidebarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2.5rem',
  },
  brandLogo: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    color: '#fff',
    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
  },
  brandTitle: {
    fontSize: '1.2rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--text-primary)',
  },
  brandSubtitle: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  navBtn: {
    width: '100%',
    justifyContent: 'flex-start',
    padding: '0.85rem 1rem',
    fontSize: '0.9rem',
    position: 'relative',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--success)',
    display: 'inline-block',
  },
  sidebarFooter: {
    borderTop: '1px solid var(--border-color)',
    paddingTop: '1rem',
    textAlign: 'center',
  },
  toastContainer: {
    position: 'fixed',
    bottom: '2rem',
    right: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  toastCard: {
    padding: '0.85rem 1.25rem',
    backgroundColor: 'rgba(15, 19, 31, 0.95)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    pointerEvents: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    maxWidth: '340px',
  }
};

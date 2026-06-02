import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PRODUCTS } from './data/mockProducts';
import PosView from './components/PosView';
import InventoryView from './components/InventoryView';
import DashboardView from './components/DashboardView';
import { ShoppingCart, Database, LayoutDashboard, Settings, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
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
    if (p.isSetPriced && Array.isArray(p.setTiers)) {
      const basePrice = p.price || 0;
      const normalizedTiers = p.setTiers.map(t => {
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
          price: typeof tPrice === 'number' ? tPrice : (parseFloat(tPrice) || 0),
          discount: typeof tDiscount === 'number' ? tDiscount : (parseFloat(tDiscount) || 0)
        };
      });
      return {
        ...p,
        setTiers: normalizedTiers
      };
    }
    return p;
  });
};

const normalizeCart = (cartItems) => {
  if (!Array.isArray(cartItems)) return [];
  return cartItems.map(item => {
    if (item.isSetPriced && Array.isArray(item.setTiers)) {
      const basePrice = item.price || 0;
      const normalizedTiers = item.setTiers.map(t => {
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
      else if (key === 'category') product.category = val || 'Other';
      else if (key === 'stock') product.stock = parseInt(val) || 0;
      else if (key === 'artist' || key === 'owner') product.artist = val || 'Unknown';
      else if (key === 'emoji') product.emoji = val || '📦';
      else if (key === 'image') product.image = val;
      else if (key === 'description') product.description = val;
      else if (key === 'issetpriced') product.isSetPriced = val.toLowerCase() === 'true';
      else if (key === 'setgroupname') product.setGroupName = val;
    });

    product.id = product.id || `prod-${product.barcode || Math.random().toString(36).substr(2, 9)}`;

    if (product.isSetPriced && (!product.setTiers || product.setTiers.length === 0)) {
      product.setTiers = [
        { quantity: 1, price: product.price, discount: 0 },
        { quantity: 3, price: 25.00, discount: Math.max(0, product.price * 3 - 25.00) },
        { quantity: 5, price: 35.00, discount: Math.max(0, product.price * 5 - 35.00) }
      ];
    }

    parsed.push(product);
  }

  return normalizeProducts(parsed);
};

export default function App() {
  const [activeView, setActiveView] = useState('terminal');
  
  // Cloud Sync Settings State
  const [boothId, setBoothId] = useState(() => {
    return localStorage.getItem('pos_booth_id') || "";
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

  // Floating Toast Notification Helper
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Load products dynamically from public/products.csv on mount
  useEffect(() => {
    const loadProductsFromCSV = async () => {
      try {
        const basePath = import.meta.env.BASE_URL || '/';
        const url = `${basePath}products.csv`.replace(/\/+/g, '/');
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load products.csv: ${response.statusText}`);
        }
        const csvText = await response.text();
        const parsed = parseCSVProducts(csvText);
        if (parsed && parsed.length > 0) {
          setProducts(parsed);
          localStorage.setItem('pos_products', JSON.stringify(parsed));
          addToast(`Loaded ${parsed.length} products from products.csv`, 'success');
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
    if (!boothId) return;

    const timer = setTimeout(() => {
      addToast(`Syncing with cloud booth: "${boothId}"`, 'info');
    }, 0);
    
    // Subscribe to products sub-collection (with auto-seeding if empty on cloud)
    const unsubscribeProds = subscribeToProducts(boothId, (items) => {
      if (items.length === 0) {
        setProducts(prevProducts => {
          if (prevProducts.length > 0) {
            addToast("Cloud booth is empty. Syncing and seeding catalog from products.csv...", "info");
            prevProducts.forEach(p => {
              addProductRecord(boothId, p);
            });
          }
          return prevProducts;
        });
      } else {
        setProducts(normalizeProducts(items));
      }
    });

    // Subscribe to sales sub-collection
    const unsubscribeSales = subscribeToSalesHistory(boothId, (history) => {
      setSalesHistory(history);
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
      if (matchedProduct.stock === 0) {
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

      // Update inventory stock (decrement by 1) locally
      const newStock = Math.max(0, matchedProduct.stock - 1);
      setProducts((prevProducts) => 
        prevProducts.map(p => 
          p.id === matchedProduct.id ? { ...p, stock: newStock } : p
        )
      );
      if (boothId) {
        updateProductStock(boothId, matchedProduct.id, newStock).catch(e => {
          console.warn("Could not sync stock to Firebase:", e);
        });
      }

      setLastScannedItem({ ...matchedProduct, barcode: barcodeString });
      setActiveView('terminal');

      addToast(`Added ${matchedProduct.name} to cart.`, 'success');
      return true;
    } else {
      addToast(`Unknown Barcode: "${barcodeString}". Register it in inventory.`, 'error');
      return false;
    }
  }, [products, boothId]);

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
  const handleAddProduct = (newProd) => {
    let finalProd = { ...newProd };
    if (newProd.isSetPriced && newProd.setGroupName) {
      const matchingGroupProd = products.find(p => p.isSetPriced && p.setGroupName === newProd.setGroupName);
      if (matchingGroupProd && (!newProd.setTiers || newProd.setTiers.length === 0)) {
        finalProd.setTiers = matchingGroupProd.setTiers;
      }
    }

    if (boothId) {
      addProductRecord(boothId, finalProd);
    } else {
      const updatedList = [finalProd, ...products];
      setProducts(updatedList);
      localStorage.setItem('pos_products', JSON.stringify(updatedList));
    }
    addToast(`Registered "${finalProd.name}" in inventory catalog.`, 'success');
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

    // Update state/sync
    if (boothId) {
      for (const p of updatedList) {
        const current = products.find(curr => curr.id === p.id);
        if (JSON.stringify(current) !== JSON.stringify(p)) {
          addProductRecord(boothId, p);
        }
      }
    } else {
      setProducts(updatedList);
      localStorage.setItem('pos_products', JSON.stringify(updatedList));
    }
    addToast(`Updated product: ${updatedProd.name} and synced group settings.`, 'info');
  };

  const handleDeleteProduct = (id) => {
    const prod = products.find(p => p.id === id);
    if (boothId) {
      deleteProductRecord(boothId, id);
    } else {
      const updatedList = products.filter(p => p.id !== id);
      setProducts(updatedList);
      localStorage.setItem('pos_products', JSON.stringify(updatedList));
    }
    addToast(`Deleted "${prod?.name || 'product'}" from database.`, 'warning');
  };

  const handleResetInventory = () => {
    if (window.confirm("Are you sure you want to restore the default inventory catalog? This will overwrite custom products.")) {
      if (boothId) {
        resetInventoryFirebase(boothId);
      } else {
        setProducts(DEFAULT_PRODUCTS);
        localStorage.setItem('pos_products', JSON.stringify(DEFAULT_PRODUCTS));
      }
      addToast("Restored default product catalog.", "info");
    }
  };

  // Custom Item sale injection (adds virtual art commissions directly to cart)
  const handleAddCustomCartItem = (name, price, category = 'Other', artist = 'Unknown') => {
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
    const _qtyDiff = newQty - item.quantity;

    if (prod && prod.id.startsWith('custom-')) {
      setCart((prev) => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c));
      return;
    }

    if (prod && prod.stock < _qtyDiff) {
      addToast(`Cannot add more. Only ${prod.stock} items left in stock.`, 'warning');
      return;
    }

    setCart((prev) => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c));
    
    if (prod) {
      const newStock = prod.stock - _qtyDiff;
      setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: newStock } : p));
      if (boothId) {
        updateProductStock(boothId, id, newStock).catch(e => {
          console.warn("Could not sync stock to Firebase:", e);
        });
      }
    }
  };

  const handleRemoveFromCart = (id) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;

    if (!item.id.startsWith('custom-')) {
      setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: p.stock + item.quantity } : p));
      if (boothId) {
        const prod = products.find(p => p.id === id);
        if (prod) {
          updateProductStock(boothId, id, prod.stock + item.quantity).catch(e => {
            console.warn("Could not sync stock to Firebase:", e);
          });
        }
      }
    }
    
    setCart((prev) => prev.filter(c => c.id !== id));
    addToast(`Removed "${item.name}" from cart.`, 'info');
  };

  const handleClearCart = () => {
    setProducts((prevProducts) => {
      let updated = [...prevProducts];
      cart.forEach(cartItem => {
        if (!cartItem.id.startsWith('custom-')) {
          updated = updated.map(p => 
            p.id === cartItem.id ? { ...p, stock: p.stock + cartItem.quantity } : p
          );
        }
      });
      return updated;
    });

    if (boothId) {
      cart.forEach(cartItem => {
        if (!cartItem.id.startsWith('custom-')) {
          const prod = products.find(p => p.id === cartItem.id);
          if (prod) {
            updateProductStock(boothId, cartItem.id, prod.stock + cartItem.quantity).catch(e => {
              console.warn("Could not sync stock to Firebase:", e);
            });
          }
        }
      });
    }

    setCart([]);
    setLastScannedItem(null);
    addToast("Cart cleared.", "info");
  };

  // Checkout simulation logger
  const handleCheckout = (receipt) => {
    if (boothId) {
      addSaleRecord(boothId, receipt);
    } else {
      setSalesHistory((prev) => [receipt, ...prev]);
    }
    setCart([]); 
    setLastScannedItem(null);
    addToast(`Transaction ${receipt.id} processed successfully!`, 'success');
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
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onSimulateScan={handleScanEvent}
            onResetInventory={handleResetInventory}
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
              <Settings color="var(--primary)" /> Cloud Synchronization
            </h2>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
              Synchronize your product catalog, pricing, stock levels, and sales history across multiple devices (PC and phones) in real-time.
            </p>

            <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.15)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span className={boothId ? "pulse-primary" : ""} style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: boothId ? 'var(--success)' : 'var(--warning)',
                  display: 'inline-block'
                }}></span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: boothId ? 'var(--success)' : 'var(--warning)' }}>
                  {boothId ? 'CLOUD STORAGE ACTIVE (ONLINE)' : 'LOCAL OFFLINE STORAGE'}
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
                    Enter a shared Booth ID code (e.g. <code>ARTBOOTH12</code>) to sync. Multiple devices using the same code share databases instantly!
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

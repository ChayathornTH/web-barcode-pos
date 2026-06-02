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

export default function App() {
  const [activeView, setActiveView] = useState('terminal');
  
  // Cloud Sync Settings State
  const [boothId, setBoothId] = useState(() => {
    return localStorage.getItem('pos_booth_id') || "";
  });

  // Database States
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
  });

  // Cart State (Local to device so cashiers don't collide)
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('pos_cart');
    return saved ? JSON.parse(saved) : [];
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
    
    // Subscribe to products sub-collection
    const unsubscribeProds = subscribeToProducts(boothId, (items) => {
      setProducts(items);
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
      setProducts(savedProds ? JSON.parse(savedProds) : DEFAULT_PRODUCTS);
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

      // Update inventory stock (decrement by 1)
      const newStock = Math.max(0, matchedProduct.stock - 1);
      if (boothId) {
        updateProductStock(boothId, matchedProduct.id, newStock);
      } else {
        setProducts((prevProducts) => 
          prevProducts.map(p => 
            p.id === matchedProduct.id ? { ...p, stock: newStock } : p
          )
        );
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
    if (boothId) {
      addProductRecord(boothId, newProd);
    } else {
      setProducts((prev) => [newProd, ...prev]);
    }
    addToast(`Registered "${newProd.name}" in inventory catalog.`, 'success');
  };

  const handleUpdateProduct = (updatedProd) => {
    if (boothId) {
      addProductRecord(boothId, updatedProd);
    } else {
      setProducts((prev) => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
    }
    addToast(`Updated product: ${updatedProd.name}`, 'info');
  };

  const handleDeleteProduct = (id) => {
    const prod = products.find(p => p.id === id);
    if (boothId) {
      deleteProductRecord(boothId, id);
    } else {
      setProducts((prev) => prev.filter(p => p.id !== id));
    }
    addToast(`Deleted "${prod?.name || 'product'}" from database.`, 'warning');
  };

  const handleResetInventory = () => {
    if (window.confirm("Are you sure you want to restore the default inventory catalog? This will overwrite custom products.")) {
      if (boothId) {
        resetInventoryFirebase(boothId);
      } else {
        setProducts(DEFAULT_PRODUCTS);
        localStorage.removeItem('pos_products');
      }
      addToast("Restored default product catalog.", "info");
    }
  };

  // Custom Item sale injection (adds virtual art commissions directly to cart)
  const handleAddCustomCartItem = (name, price, category = 'Other') => {
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
      description: "Custom commissioned art item.",
      isSetPriced: category === 'Stickers',
      setGroupName: category === 'Stickers' ? 'Stickers' : '',
      setTiers: category === 'Stickers' ? [
        { quantity: 1, discount: 0.00 },
        { quantity: 3, discount: 5.00 },
        { quantity: 5, discount: 15.00 }
      ] : []
    };

    setCart((prev) => [...prev, { ...customProduct, quantity: 1 }]);
    addToast(`Added custom "${customProduct.name}" (฿${priceNum.toFixed(2)}) to cart.`, 'success');
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
      if (boothId) {
        updateProductStock(boothId, id, newStock);
      } else {
        setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: newStock } : p));
      }
    }
  };

  const handleRemoveFromCart = (id) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;

    if (!item.id.startsWith('custom-')) {
      if (boothId) {
        const prod = products.find(p => p.id === id);
        if (prod) {
          updateProductStock(boothId, id, prod.stock + item.quantity);
        }
      } else {
        setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: p.stock + item.quantity } : p));
      }
    }
    
    setCart((prev) => prev.filter(c => c.id !== id));
    addToast(`Removed "${item.name}" from cart.`, 'info');
  };

  const handleClearCart = () => {
    if (boothId) {
      cart.forEach(cartItem => {
        if (!cartItem.id.startsWith('custom-')) {
          const prod = products.find(p => p.id === cartItem.id);
          if (prod) {
            updateProductStock(boothId, cartItem.id, prod.stock + cartItem.quantity);
          }
        }
      });
    } else {
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

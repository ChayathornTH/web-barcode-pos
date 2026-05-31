import React, { useState, useEffect } from 'react';
import { DEFAULT_PRODUCTS } from './data/mockProducts';
import PosView from './components/PosView';
import InventoryView from './components/InventoryView';
import DashboardView from './components/DashboardView';
import { ShoppingCart, Database, Barcode, LayoutDashboard, Settings, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeView, setActiveView] = useState('terminal');
  
  // Database States
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('pos_products');
    return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
  });

  // Cart State
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('pos_cart');
    return saved ? JSON.parse(saved) : [];
  });

  // Sales History / Ledger State
  const [salesHistory, setSalesHistory] = useState(() => {
    const saved = localStorage.getItem('pos_sales_history');
    return saved ? JSON.parse(saved) : [];
  });

  // UI States
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [globalScanTrigger, setGlobalScanTrigger] = useState(0);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('pos_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('pos_sales_history', JSON.stringify(salesHistory));
  }, [salesHistory]);

  // Floating Toast Notification Helper
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 3.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, 3500);
  };

  // Centralized scan barcode action
  const handleScanEvent = (barcodeString) => {
    // Look up item
    const matchedProduct = products.find(p => p.barcode === barcodeString);

    if (matchedProduct) {
      // Add to cart
      setCart((prevCart) => {
        const existing = prevCart.find(item => item.id === matchedProduct.id);
        if (existing) {
          // Increment qty
          return prevCart.map(item => 
            item.id === matchedProduct.id 
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
          // Add new item line
          return [...prevCart, { ...matchedProduct, quantity: 1 }];
        }
      });

      // Update inventory stock (decrement by 1)
      setProducts((prevProducts) => 
        prevProducts.map(p => 
          p.id === matchedProduct.id 
            ? { ...p, stock: Math.max(0, p.stock - 1) }
            : p
        )
      );

      // Trigger flash highlight in POS view
      setLastScannedItem({ ...matchedProduct, barcode: barcodeString });
      
      // Auto switch view to terminal if scan occurs elsewhere (so they see the cart update)
      setActiveView('terminal');

      addToast(`Added ${matchedProduct.name} to cart.`, 'success');
      return true;
    } else {
      addToast(`Unknown Barcode: "${barcodeString}". Please register it in the inventory database.`, 'error');
      // Set scanning trigger to display quick error feedback flash
      setGlobalScanTrigger(prev => prev + 1);
      return false;
    }
  };

  // Keyboard wedge listener for physical barcode scanners
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      const currentTime = Date.now();
      const delay = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // If delay between keystrokes is too long, we treat it as human typing and clear buffer
      if (delay > 65) {
        buffer = "";
      }

      // Check if focus is inside standard text inputs
      const isInputFocused = document.activeElement.tagName === 'INPUT' || 
                             document.activeElement.tagName === 'TEXTAREA' || 
                             document.activeElement.tagName === 'SELECT';

      // Capture standard digit keys (barcodes are numeric, but support some alphanumeric wedges)
      if (e.key.length === 1 && /[0-9a-zA-Z]/.test(e.key)) {
        buffer += e.key;
      } else if (e.key === 'Enter') {
        // Barcode wedges terminate with "Enter"
        // Scanners scan extremely quickly (delay < 45ms per character).
        // If buffer has digits and it arrived fast OR if no text input is focused, process it!
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
  }, [products]);

  // Inventory Management Actions
  const handleAddProduct = (newProd) => {
    setProducts((prev) => [newProd, ...prev]);
    addToast(`Registered "${newProd.name}" in inventory database.`, 'success');
  };

  const handleUpdateProduct = (updatedProd) => {
    setProducts((prev) => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
    addToast(`Updated product: ${updatedProd.name}`, 'info');
  };

  const handleDeleteProduct = (id) => {
    const prod = products.find(p => p.id === id);
    setProducts((prev) => prev.filter(p => p.id !== id));
    addToast(`Deleted "${prod?.name || 'product'}" from database.`, 'warning');
  };

  const handleResetInventory = () => {
    if (window.confirm("Are you sure you want to restore the default inventory catalog? This will overwrite custom products.")) {
      setProducts(DEFAULT_PRODUCTS);
      localStorage.removeItem('pos_products');
      addToast("Restored default product catalog.", "info");
    }
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

    // Check inventory levels
    if (prod && prod.stock < _qtyDiff) {
      addToast(`Cannot add more. Only ${prod.stock} items left in stock.`, 'warning');
      return;
    }

    // Update cart
    setCart((prev) => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c));
    
    // Update inventory
    setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: p.stock - _qtyDiff } : p));
  };

  const handleRemoveFromCart = (id) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;

    // Restore stock
    setProducts((prev) => prev.map(p => p.id === id ? { ...p, stock: p.stock + item.quantity } : p));
    
    // Remove from cart
    setCart((prev) => prev.filter(c => c.id !== id));
    addToast(`Removed "${item.name}" from cart.`, 'info');
  };

  const handleClearCart = () => {
    // Restore all stocks for cart items
    setProducts((prevProducts) => {
      let updated = [...prevProducts];
      cart.forEach(cartItem => {
        updated = updated.map(p => 
          p.id === cartItem.id 
            ? { ...p, stock: p.stock + cartItem.quantity }
            : p
        );
      });
      return updated;
    });

    setCart([]);
    setLastScannedItem(null);
    addToast("Cart cleared.", "info");
  };

  // Checkout simulation logger
  const handleCheckout = (receipt) => {
    setSalesHistory((prev) => [receipt, ...prev]);
    setCart([]);
    setLastScannedItem(null);
    addToast(`Transaction ${receipt.id} processed successfully!`, 'success');
  };

  return (
    <div className="app-container">
      
      {/* Sidebar Navigation */}
      <aside className="app-sidebar glass-panel">
        <div style={styles.sidebarBrand}>
          <div style={styles.brandLogo}>⚡</div>
          <div className="sidebar-brand-name">
            <h1 style={styles.brandTitle}>OmniScan POS</h1>
            <span style={styles.brandSubtitle}>Retail Management v1.2</span>
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
        </nav>

        {/* Global Wedge Active status indicator */}
        <div className="sidebar-status-box glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span className="pulse-primary" style={styles.statusDot}></span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>SYSTEM LISTENING</span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
            PC Scanner Wedge is globally active. Type or scan codes at any time.
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
          />
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

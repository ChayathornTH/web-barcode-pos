import { useState, useRef, useEffect, useCallback } from 'react';
import { ShoppingCart, Search, Volume2, VolumeX, Barcode, Sparkles, Plus, Minus, Trash2, Printer, CheckCircle, Grid } from 'lucide-react';

const CATEGORIES = ['All', 'Paintings', 'Prints', 'Stickers', 'Accessories', 'Stationery'];

const generateReceiptId = () => `REC-${Math.floor(100000 + Math.random() * 900000)}`;

export default function PosView({ 
  products,
  cart, 
  onUpdateCartQty, 
  onRemoveFromCart, 
  onClearCart, 
  onManualScan, 
  onCheckout,
  lastScannedItem,
  onAddCustomItem // Prop to handle custom charge commissions
}) {
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeMobileTab, setActiveMobileTab] = useState('catalog'); // 'catalog' | 'cart'
  
  // Custom Charge States
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customCategory, setCustomCategory] = useState('Other');

  const [manualCode, setManualCode] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState({ code: '', percent: 0 });
  const [discountError, setDiscountError] = useState('');
  
  // Checkout & Receipt Modal State
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  
  const manualInputRef = useRef(null);

  // Play audio beep on scan success
  const playBeep = useCallback(() => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5 note
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08); // 80ms beep
    } catch (e) {
      console.warn("Audio Context beep failed", e);
    }
  }, [isMuted]);

  // Listen for barcode scan trigger from parent
  useEffect(() => {
    if (lastScannedItem) {
      playBeep();
    }
  }, [lastScannedItem, playBeep]);

  // Handle barcode from manual form
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    
    const success = onManualScan(manualCode.trim());
    if (success) {
      setManualCode('');
    }
  };

  const formatTiersInfo = (product) => {
    if (!product.isSetPriced || !product.setTiers || product.setTiers.length <= 1) return "";
    const discountTiers = product.setTiers.filter(t => t.quantity > 1);
    return discountTiers.map(t => `${t.quantity} = -฿${t.discount.toFixed(0)}`).join(', ');
  };

  // Handle product click in catalog (Simulates a fast barcode scan)
  const handleProductClick = (product) => {
    if (product.stock === 0) return;
    onManualScan(product.barcode);
  };

  // Promo Code Handler
  const handleApplyPromo = (e) => {
    e.preventDefault();
    setDiscountError('');
    const code = discountCode.trim().toUpperCase();
    
    if (!code) return;

    if (code === 'WELCOME10') {
      setAppliedDiscount({ code: 'WELCOME10 (10%)', percent: 10 });
      setDiscountCode('');
    } else if (code === 'SUPERFOOD') {
      setAppliedDiscount({ code: 'SUPERFOOD (15%)', percent: 15 });
      setDiscountCode('');
    } else if (code === 'ARTFEST') {
      setAppliedDiscount({ code: 'ARTFEST (20%)', percent: 20 });
      setDiscountCode('');
    } else if (code === 'FREESHIP') {
      setAppliedDiscount({ code: 'FREESHIP ($5.00 Flat)', percent: 'flat-5' });
      setDiscountCode('');
    } else {
      setDiscountError('Invalid promo code.');
    }
  };

  const handleRemovePromo = () => {
    setAppliedDiscount({ code: '', percent: 0 });
  };

  // Generic Optimal Set Discount Calculation
  const calculateOptimalGroupDiscount = (qty, tiers) => {
    if (qty <= 0 || !tiers || tiers.length === 0) return 0;
    const validTiers = tiers.filter(t => t.quantity > 0 && t.discount >= 0);
    if (validTiers.length === 0) return 0;

    validTiers.sort((a, b) => a.quantity - b.quantity);
    const dp = Array(qty + 1).fill(0);

    for (let i = 1; i <= qty; i++) {
      let maxDisc = dp[i - 1];
      for (const tier of validTiers) {
        if (i >= tier.quantity) {
          maxDisc = Math.max(maxDisc, dp[i - tier.quantity] + tier.discount);
        }
      }
      dp[i] = maxDisc;
    }
    return dp[qty];
  };

  // Group cart items by set group
  const setGroups = {};
  cart.forEach(item => {
    if (item.isSetPriced) {
      const groupKey = item.setGroupName ? item.setGroupName.trim() : `single-${item.id}`;
      if (!setGroups[groupKey]) {
        setGroups[groupKey] = {
          items: [],
          tiers: item.setTiers || []
        };
      }
      setGroups[groupKey].items.push(item);
    }
  });

  const setDiscounts = [];
  Object.keys(setGroups).forEach(groupKey => {
    const group = setGroups[groupKey];
    const totalQty = group.items.reduce((sum, i) => sum + i.quantity, 0);
    const discount = calculateOptimalGroupDiscount(totalQty, group.tiers);
    if (discount > 0) {
      setDiscounts.push({
        groupName: groupKey.startsWith('single-') ? group.items[0].name : `${groupKey} Set`,
        amount: discount
      });
    }
  });

  const totalSetDiscount = setDiscounts.reduce((sum, d) => sum + d.amount, 0);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = 0; // VAT removed
  
  let discountAmount = 0;
  const remainingSubtotal = Math.max(0, subtotal - totalSetDiscount);
  
  if (appliedDiscount.percent === 'flat-5') {
    discountAmount = remainingSubtotal > 0 ? 5.00 : 0;
  } else {
    discountAmount = remainingSubtotal * (appliedDiscount.percent / 100);
  }
  
  const total = Math.max(0, remainingSubtotal + tax - discountAmount);

  // Checkout process simulation
  const handleCheckoutClick = () => {
    if (cart.length === 0) return;

    const receipt = {
      id: generateReceiptId(),
      timestamp: new Date().toLocaleString(),
      items: [...cart],
      subtotal,
      tax,
      stickerDiscount: totalSetDiscount, // Keep variable name for compatibility in historical lists
      setDiscounts: setDiscounts, // Store detailed set discounts list
      discount: {
        code: appliedDiscount.code,
        amount: discountAmount
      },
      total
    };

    setReceiptData(receipt);
    setIsReceiptOpen(true);
    onCheckout(receipt);
  };

  // Print Receipt handler
  const handlePrintReceipt = () => {
    window.print();
  };

  // Clear cart and close receipt
  const handleNewSale = () => {
    onClearCart();
    setAppliedDiscount({ code: '', percent: 0 });
    setIsReceiptOpen(false);
    setReceiptData(null);
  };

  // Filter Catalog Products
  const filteredCatalogProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                          p.description?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                          p.barcode.includes(catalogSearch);
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={styles.viewContainer}>
      
      {/* Header controls block */}
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>Sales Terminal</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Tap product cards to register sales, apply coupons, and checkout.
          </p>
        </div>
        <div style={styles.controlsRow}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? "Unmute scan beep" : "Mute scan beep"}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {isMuted ? "Muted" : "Beep Sound"}
          </button>
        </div>
      </div>

      {/* Mobile Tab Selectors (Toggle between Catalog and Cart on phones) */}
      <div className="mobile-view-tabs">
        <button 
          className={`btn ${activeMobileTab === 'catalog' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
          onClick={() => setActiveMobileTab('catalog')}
          style={{ width: '100%' }}
        >
          <Grid size={16} /> Shop Catalog
        </button>
        <button 
          className={`btn ${activeMobileTab === 'cart' ? 'btn-primary glow-primary' : 'btn-secondary'}`}
          onClick={() => setActiveMobileTab('cart')}
          style={{ width: '100%', position: 'relative' }}
        >
          <ShoppingCart size={16} /> Cart
          {cart.length > 0 && (
            <span style={styles.mobileCartBadge}>
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Main Terminal Screen Split Layout */}
      <div className={`pos-grid ${activeMobileTab === 'catalog' ? 'show-catalog' : 'show-cart'}`}>
        
        {/* Left Side: Product Catalog Grid */}
        <div className="pos-left-col">
          <div className="glass-panel" style={styles.catalogCardContainer}>
            
            {/* Search & Category Filter Section */}
            <div style={styles.searchFilterBlock}>
              <div style={styles.searchWrapper}>
                <Search size={18} style={styles.searchIcon} />
                <input 
                  type="text" 
                  placeholder="Search art pieces, catalog..." 
                  className="custom-input"
                  style={styles.searchInput}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
              </div>
              
              <div className="catalog-tabs">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    className={`catalog-tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="catalog-grid" style={{ padding: '0.25rem 0' }}>
              
              {/* Special Custom Item Card (Always first) */}
              <div 
                className="glass-panel glass-panel-hover catalog-card glow-primary"
                onClick={() => setIsCustomModalOpen(true)}
                style={{
                  ...styles.cardClickReset,
                  border: '1px dashed var(--primary)',
                  backgroundColor: 'rgba(139, 92, 246, 0.04)',
                  cursor: 'pointer'
                }}
                title="Add custom price or sketch sale"
              >
                <div className="catalog-card-emoji" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>➕</div>
                <div className="catalog-card-name" style={{ color: 'var(--primary)' }}>Custom Sale</div>
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <div className="catalog-card-price" style={{ color: 'var(--primary)' }}>Add Price</div>
                  <div className="catalog-card-stock" style={{ color: 'var(--primary)' }}>Open charge</div>
                </div>
              </div>

              {filteredCatalogProducts.map(product => {
                const isOutOfStock = product.stock === 0;
                return (
                  <div 
                    key={product.id} 
                    className={`glass-panel glass-panel-hover catalog-card ${isOutOfStock ? 'disabled' : ''}`}
                    onClick={() => handleProductClick(product)}
                    style={{
                      ...styles.cardClickReset,
                      opacity: isOutOfStock ? 0.45 : 1,
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      border: isOutOfStock ? '1px dashed var(--border-color)' : '1px solid var(--border-color)'
                    }}
                    title={isOutOfStock ? "Out of stock" : `Tap to add: ${product.name}`}
                  >
                    {product.image ? (
                      <div className="catalog-card-image-wrapper">
                        <img src={product.image} alt={product.name} className="catalog-card-img" />
                      </div>
                    ) : (
                      <div className="catalog-card-emoji">{product.emoji}</div>
                    )}
                    <div className="catalog-card-name">{product.name}</div>
                    
                    {product.isSetPriced && (
                      <div className="catalog-card-set-tag" style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: 'var(--success)',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.15)',
                        borderRadius: '4px',
                        padding: '0.1rem 0.35rem',
                        marginTop: '0.2rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        cursor: 'help'
                      }} title={`${product.setGroupName} Set (${formatTiersInfo(product)})`}>
                        🏷️ {product.setGroupName} ({formatTiersInfo(product)})
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <div className="catalog-card-price">฿{product.price.toFixed(2)}</div>
                      <div className="catalog-card-stock" style={{
                        color: isOutOfStock ? 'var(--danger)' : product.stock < 5 ? 'var(--warning)' : 'var(--text-muted)'
                      }}>
                        {isOutOfStock ? "Sold Out" : `${product.stock} left`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Barcode input row (For hardware scanning) */}
          <div className="glass-panel" style={styles.scanFormCard}>
            <h3 style={styles.cardTitle}>
              <Barcode size={18} color="var(--primary)" /> Barcode & Scanner Input
            </h3>
            <form onSubmit={handleManualSubmit} style={styles.formRow}>
              <input
                ref={manualInputRef}
                type="text"
                placeholder="Scanner input focused automatically (or type code like 2001)..."
                className="custom-input"
                style={{ flexGrow: 1 }}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 1.5rem' }}>
                Add Code
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Cart Summary Panel */}
        <div className="pos-right-col">
          <div className="glass-panel" style={styles.cartCard}>
            <h3 style={styles.cardTitle}>
              <ShoppingCart size={18} color="var(--primary)" /> Shopping Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h3>

            {cart.length === 0 ? (
              <div style={styles.emptyCart}>
                <ShoppingCart size={40} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cart is empty.</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Tap products in the catalog to add items.</p>
              </div>
            ) : (
              <div style={styles.cartList}>
                {cart.map((item) => (
                  <div key={item.id} className="item-row cart-row">
                    <div style={styles.itemInfo}>
                      <span style={styles.itemEmoji}>{item.emoji}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.itemName}>{item.name}</div>
                        <div style={styles.itemMeta}>
                          <span>฿{item.price.toFixed(2)} each</span>
                        </div>
                      </div>
                    </div>

                    <div className="qty-actions-wrapper">
                      <div style={styles.qtyActions}>
                        <button 
                          style={styles.qtyBtn} 
                          onClick={() => onUpdateCartQty(item.id, item.quantity - 1)}
                        >
                          <Minus size={12} />
                        </button>
                        <span style={styles.qtyCount}>{item.quantity}</span>
                        <button 
                          style={styles.qtyBtn} 
                          onClick={() => onUpdateCartQty(item.id, item.quantity + 1)}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div className="item-subtotal" style={styles.itemSubtotal}>
                        ฿{(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    <button 
                      style={styles.removeBtn} 
                      onClick={() => onRemoveFromCart(item.id)}
                      title="Remove product"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Bill Summary totals */}
            <div style={{ ...styles.summarySection, borderTop: cart.length > 0 ? '1px solid var(--border-color)' : 'none', marginTop: 'auto' }}>
              <div style={styles.summaryTable}>
                <div style={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>฿{subtotal.toFixed(2)}</span>
                </div>
                {tax > 0 && (
                  <div style={styles.summaryRow}>
                    <span>Tax (7%)</span>
                    <span>฿{tax.toFixed(2)}</span>
                  </div>
                )}

                {setDiscounts.map((disc, idx) => (
                  <div key={idx} style={{ ...styles.summaryRow, color: 'var(--success)' }}>
                    <span>{disc.groupName} Discount</span>
                    <span>-฿{disc.amount.toFixed(2)}</span>
                  </div>
                ))}

                {appliedDiscount.code && (
                  <div style={{ ...styles.summaryRow, color: 'var(--success)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>Discount</span>
                      <button style={styles.promoTagRemove} onClick={handleRemovePromo}>×</button>
                    </div>
                    <span>-฿{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div style={styles.totalRow}>
                  <span>Total Amount</span>
                  <span>฿{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Promo Code Entry */}
              {cart.length > 0 && !appliedDiscount.code && (
                <form onSubmit={handleApplyPromo} style={styles.promoForm}>
                  <input
                    type="text"
                    placeholder="Promo Code..."
                    className="custom-input"
                    style={styles.promoInput}
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary" style={{ padding: '0 1rem', fontSize: '0.85rem' }}>
                    Apply
                  </button>
                </form>
              )}

              {discountError && (
                <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
                  {discountError}
                </div>
              )}

              {cart.length > 0 && (
                <div style={styles.codeTips}>
                  <Sparkles size={12} color="var(--warning)" />
                  <span>Try code: <strong>ARTFEST</strong> (20% off)</span>
                </div>
              )}

              <button 
                className={`btn btn-primary pulse-primary ${cart.length === 0 ? 'disabled' : ''}`}
                style={{ ...styles.checkoutBtn, opacity: cart.length === 0 ? 0.5 : 1, cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
                onClick={handleCheckoutClick}
                disabled={cart.length === 0}
              >
                <ShoppingCart size={18} /> Complete Checkout
              </button>

              {cart.length > 0 && (
                <button 
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  onClick={onClearCart}
                >
                  Clear Cart
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Receipts Popup Modal */}
      {isReceiptOpen && receiptData && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.receiptContainer}>
            
            <div id="printable-receipt" style={styles.receiptBody}>
              <div style={styles.receiptHeader}>
                <div style={styles.receiptLogo}>⚡ OMNISCAN POS</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>Art Fair Artist Ledger</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Booth #12 - Craft Festival</div>
                <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '1rem 0' }}></div>
              </div>

              <div style={styles.receiptMeta}>
                <div><strong>Receipt #:</strong> {receiptData.id}</div>
                <div><strong>Date:</strong> {receiptData.timestamp}</div>
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '0.75rem 0' }}></div>

              {/* Items List */}
              <div style={styles.receiptItems}>
                {receiptData.items.map((item) => (
                  <div key={item.id} style={styles.receiptItemRow}>
                    <div style={{ flexGrow: 1 }}>
                      <div>{item.emoji} {item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {item.quantity} x ฿{item.price.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      ฿{(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '0.75rem 0' }}></div>

              <div style={styles.receiptTotals}>
                <div style={styles.receiptTotalRow}>
                  <span>Subtotal</span>
                  <span>฿{receiptData.subtotal.toFixed(2)}</span>
                </div>
                {receiptData.tax > 0 && (
                  <div style={styles.receiptTotalRow}>
                    <span>Tax (7%)</span>
                    <span>฿{receiptData.tax.toFixed(2)}</span>
                  </div>
                )}
                {receiptData.setDiscounts ? (
                  receiptData.setDiscounts.map((disc, idx) => (
                    <div key={idx} style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                      <span>{disc.groupName} Discount</span>
                      <span>-฿{disc.amount.toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  receiptData.stickerDiscount > 0 && (
                    <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                      <span>Sticker Set Discount</span>
                      <span>-฿{receiptData.stickerDiscount.toFixed(2)}</span>
                    </div>
                  )
                )}
                {receiptData.discount.amount > 0 && (
                  <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                    <span>Discount ({receiptData.discount.code})</span>
                    <span>-฿{receiptData.discount.amount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderBottom: '1px solid #000', margin: '0.4rem 0' }}></div>
                <div style={{ ...styles.receiptTotalRow, fontSize: '1.2rem', fontWeight: 800 }}>
                  <span>Grand Total</span>
                  <span>฿{receiptData.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '1rem 0' }}></div>

              <div style={styles.receiptFooter}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Thank you for supporting custom art!</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>Artist Session Record</div>
              </div>
            </div>

            <div style={styles.receiptActions}>
              <button className="btn btn-secondary" onClick={handlePrintReceipt}>
                <Printer size={16} /> Print
              </button>
              <button className="btn btn-success" onClick={handleNewSale} style={{ flexGrow: 1 }}>
                <CheckCircle size={16} /> New Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Price / Charge Modal */}
      {isCustomModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.receiptContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ color: 'var(--text-primary)' }}>➕ Add Custom Charge</h3>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.25rem' }} onClick={() => setIsCustomModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              onAddCustomItem(customName || 'Custom Art Item', customPrice, customCategory);
              setCustomName('');
              setCustomPrice('');
              setCustomCategory('Other');
              setIsCustomModalOpen(false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Price (฿) *</label>
                <input 
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="custom-input"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Item Name (Optional)</label>
                <input 
                  type="text"
                  placeholder="E.g., Custom Pencil Sketch"
                  className="custom-input"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
                <select 
                  className="custom-input"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="Paintings">Paintings</option>
                  <option value="Prints">Prints</option>
                  <option value="Stickers">Stickers</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Stationery">Stationery</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsCustomModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add to Cart
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

const styles = {
  viewContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  controlsRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  catalogCardContainer: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  searchFilterBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  searchWrapper: {
    position: 'relative',
    width: '100%',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none'
  },
  searchInput: {
    paddingLeft: '2.5rem',
    width: '100%',
  },
  emptyCatalog: {
    padding: '3rem 1rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardClickReset: {
    userSelect: 'none',
    transition: 'all 0.15s ease',
  },
  scanFormCard: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.5rem',
    marginBottom: '0.25rem',
  },
  formRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  cartCard: {
    padding: '1.25rem',
    minHeight: '480px',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyCart: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 1rem',
  },
  cartList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '0.5rem',
    maxHeight: '300px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  itemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexGrow: 1,
    minWidth: 0,
  },
  itemEmoji: {
    fontSize: '1.5rem',
    width: '36px',
    height: '36px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemName: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemMeta: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    marginTop: '0.1rem',
  },
  qtyActions: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '0.2rem',
    gap: '0.5rem',
  },
  qtyBtn: {
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCount: {
    fontSize: '0.8rem',
    fontWeight: 700,
    width: '16px',
    textAlign: 'center',
  },
  itemSubtotal: {
    fontSize: '0.95rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    width: '70px',
    textAlign: 'right',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '4px',
  },
  summarySection: {
    paddingTop: '1rem',
  },
  summaryTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.1rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '0.75rem',
    marginTop: '0.25rem',
  },
  promoForm: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  promoInput: {
    flexGrow: 1,
    padding: '0.45rem 0.75rem',
    fontSize: '0.8rem',
  },
  promoTagRemove: {
    background: 'transparent',
    border: 'none',
    color: 'var(--danger)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.9rem',
  },
  codeTips: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    marginBottom: '1rem',
  },
  checkoutBtn: {
    width: '100%',
    padding: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5, 7, 12, 0.85)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  receiptContainer: {
    width: '100%',
    maxWidth: '400px',
    background: '#ffffff',
    color: '#1e293b',
    padding: '1.5rem',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    animation: 'slideIn 0.25s ease-out forwards',
  },
  receiptBody: {
    background: '#ffffff',
    padding: '0.5rem',
  },
  receiptHeader: {
    textAlign: 'center',
  },
  receiptLogo: {
    fontFamily: 'var(--font-heading)',
    fontWeight: 800,
    fontSize: '1.3rem',
    color: '#0f172a',
  },
  receiptMeta: {
    fontSize: '0.8rem',
    color: '#64748b',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  receiptItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  receiptItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.85rem',
  },
  receiptTotals: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  receiptTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
  },
  receiptFooter: {
    textAlign: 'center',
    marginTop: '0.5rem',
  },
  receiptActions: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1.5rem',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '1rem',
  },
  mobileCartBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: 'var(--danger)',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: 'bold',
    borderRadius: '50%',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
};

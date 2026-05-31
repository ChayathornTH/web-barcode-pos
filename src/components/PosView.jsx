import React, { useState, useRef, useEffect } from 'react';
import { ShoppingCart, Camera, CameraOff, Volume2, VolumeX, Barcode, CornerDownLeft, Sparkles, Plus, Minus, Trash2, Printer, CheckCircle, RefreshCcw } from 'lucide-react';
import Scanner from './Scanner';

export default function PosView({ 
  cart, 
  onUpdateCartQty, 
  onRemoveFromCart, 
  onClearCart, 
  onManualScan, 
  onCheckout,
  lastScannedItem 
}) {
  const [manualCode, setManualCode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState({ code: '', percent: 0 });
  const [discountError, setDiscountError] = useState('');
  
  // Checkout & Receipt Modal State
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  
  const manualInputRef = useRef(null);

  // Focus manual input on load
  useEffect(() => {
    if (manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, []);

  // Play audio beep
  const playBeep = () => {
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
  };

  // Listen for barcode scan trigger from parent
  useEffect(() => {
    if (lastScannedItem) {
      playBeep();
    }
  }, [lastScannedItem]);

  // Handle barcode from manual form
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    
    const success = onManualScan(manualCode.trim());
    if (success) {
      setManualCode('');
    }
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

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.07; // 7% tax
  
  let discountAmount = 0;
  if (appliedDiscount.percent === 'flat-5') {
    discountAmount = subtotal > 0 ? 5.00 : 0;
  } else {
    discountAmount = subtotal * (appliedDiscount.percent / 100);
  }
  
  const total = Math.max(0, subtotal + tax - discountAmount);

  // Checkout process simulation
  const handleCheckoutClick = () => {
    if (cart.length === 0) return;

    // Create receipt structure
    const receipt = {
      id: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toLocaleString(),
      items: [...cart],
      subtotal,
      tax,
      discount: {
        code: appliedDiscount.code,
        amount: discountAmount
      },
      total
    };

    setReceiptData(receipt);
    setIsReceiptOpen(true);
    
    // Call parent to log sale in history
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
    if (manualInputRef.current) {
      manualInputRef.current.focus();
    }
  };

  return (
    <div style={styles.viewContainer}>
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>POS Terminal</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Scan barcodes using camera or USB reader, adjust quantities, and checkout.
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
          
          <button 
            className={`btn ${isCameraActive ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setIsCameraActive(!isCameraActive)}
          >
            {isCameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
            {isCameraActive ? "Close Camera" : "Open Camera"}
          </button>
        </div>
      </div>

      <div className="pos-grid">
        
        {/* Left Side: Scanning & Inputs */}
        <div className="pos-left-col">
          
          {/* Scanner view */}
          {isCameraActive && (
            <div style={{ height: '320px', marginBottom: '1.25rem' }}>
              <Scanner 
                active={isCameraActive} 
                onScanSuccess={(code) => {
                  onManualScan(code);
                }} 
              />
            </div>
          )}

          {/* Barcode forms (Manual Entry & PC Keyboard wedge reminder) */}
          <div className="glass-panel" style={styles.scanFormCard}>
            <h3 style={styles.cardTitle}>
              <Barcode size={18} color="var(--primary)" /> Barcode Entry
            </h3>

            <form onSubmit={handleManualSubmit} style={styles.formRow}>
              <div style={{ position: 'relative', flexGrow: 1 }}>
                <input
                  ref={manualInputRef}
                  type="text"
                  placeholder="Enter barcode or type code (e.g. 1001, 1002)..."
                  className="custom-input"
                  style={styles.manualInput}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/[^0-9]/g, ''))}
                />
                <button type="submit" style={styles.enterKeyHint} title="Add barcode to cart">
                  <CornerDownLeft size={14} /> Enter
                </button>
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '0 1.5rem' }}>
                Add Item
              </button>
            </form>

            <div style={styles.hardwareTip}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <strong>Hardware Scanner Active:</strong> Simply scan standard barcodes directly with your USB scanner at any time. It will auto-detect and populate.
              </p>
            </div>
          </div>

          {/* Toast style notification of last scanned item */}
          {lastScannedItem && (
            <div className="glass-panel glow-success" style={styles.toast}>
              <span style={{ fontSize: '1.5rem' }}>{lastScannedItem.emoji}</span>
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 700 }}>SCANNED SUCCESS</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{lastScannedItem.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>${lastScannedItem.price.toFixed(2)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Barcode: {lastScannedItem.barcode}</div>
              </div>
            </div>
          )}

          {/* Cart item display */}
          <div className="glass-panel" style={styles.cartCard}>
            <h3 style={styles.cardTitle}>
              <ShoppingCart size={18} color="var(--primary)" /> Scanned Items ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h3>

            {cart.length === 0 ? (
              <div style={styles.emptyCart}>
                <ShoppingCart size={40} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cart is empty.</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>Scan a barcode to start shopping.</p>
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
                          <span>${item.price.toFixed(2)} each</span>
                          <span style={{ color: 'var(--border-color-hover)' }}>|</span>
                          <span style={{ color: 'var(--text-muted)' }}>Code: {item.barcode}</span>
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
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>

                    <button 
                      style={styles.removeBtn} 
                      onClick={() => onRemoveFromCart(item.id)}
                      title="Remove product from cart"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Totals & Checkout actions */}
        <div className="pos-right-col">
          <div className="glass-panel" style={styles.summaryCard}>
            <h3 style={styles.cardTitle}>Bill Summary</h3>
            
            <div style={styles.summaryTable}>
              <div style={styles.summaryRow}>
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div style={styles.summaryRow}>
                <span>Vat Tax (7%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>

              {appliedDiscount.code && (
                <div style={{ ...styles.summaryRow, color: 'var(--success)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>Discount</span>
                    <button style={styles.promoTagRemove} onClick={handleRemovePromo}>×</button>
                  </div>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div style={styles.totalRow}>
                <span>Total Amount</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Promo Codes Input */}
            {!appliedDiscount.code && (
              <form onSubmit={handleApplyPromo} style={styles.promoForm}>
                <input
                  type="text"
                  placeholder="Discount Code..."
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

            <div style={styles.codeTips}>
              <Sparkles size={12} color="var(--warning)" />
              <span>Try codes: <strong>WELCOME10</strong> (10% off) or <strong>SUPERFOOD</strong> (15% off)</span>
            </div>

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

      {/* Receipts Modal popup */}
      {isReceiptOpen && receiptData && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.receiptContainer}>
            
            {/* Print friendly block wrapper */}
            <div id="printable-receipt" style={styles.receiptBody}>
              <div style={styles.receiptHeader}>
                <div style={styles.receiptLogo}>⚡ OMNISCAN POS</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>OmniScan Retail Ltd.</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Bangkok, Thailand</div>
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
                        {item.quantity} x ${item.price.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      ${(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '0.75rem 0' }}></div>

              <div style={styles.receiptTotals}>
                <div style={styles.receiptTotalRow}>
                  <span>Subtotal</span>
                  <span>${receiptData.subtotal.toFixed(2)}</span>
                </div>
                <div style={styles.receiptTotalRow}>
                  <span>Vat Tax (7%)</span>
                  <span>${receiptData.tax.toFixed(2)}</span>
                </div>
                {receiptData.discount.amount > 0 && (
                  <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                    <span>Discount ({receiptData.discount.code})</span>
                    <span>-${receiptData.discount.amount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderBottom: '1px solid #000', margin: '0.4rem 0' }}></div>
                <div style={{ ...styles.receiptTotalRow, fontSize: '1.2rem', fontWeight: 800 }}>
                  <span>Grand Total</span>
                  <span>${receiptData.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '1rem 0' }}></div>

              <div style={styles.receiptFooter}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Thank you for your purchase!</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>Please keep this receipt for returns.</div>
                
                {/* Visual barcode scan print helper */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <svg width="120" height="40">
                    <rect width="120" height="40" fill="#ffffff" />
                    <g fill="#000000">
                      {/* Fake barcode lines for printable receipt */}
                      {Array.from({ length: 30 }).map((_, i) => (
                        <rect 
                          key={i} 
                          x={15 + i * 3} 
                          y={5} 
                          width={(i % 3 === 0 || i % 7 === 0) ? 2 : 1} 
                          height={30} 
                        />
                      ))}
                    </g>
                  </svg>
                </div>
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
  manualInput: {
    width: '100%',
    paddingRight: '4.5rem',
  },
  enterKeyHint: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    color: 'var(--text-muted)',
    fontSize: '0.7rem',
    padding: '0.2rem 0.4rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
    cursor: 'pointer',
  },
  hardwareTip: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 0.8rem',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    border: '1px solid rgba(16, 185, 129, 0.1)',
    borderRadius: '6px',
  },
  toast: {
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    animation: 'slideIn 0.2s ease-out forwards',
    borderLeft: '4px solid var(--success)',
  },
  cartCard: {
    padding: '1.25rem',
    minHeight: '280px',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyCart: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 1rem',
  },
  cartList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  itemInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexGrow: 1,
    minWidth: 0,
  },
  itemEmoji: {
    fontSize: '1.75rem',
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemName: {
    fontSize: '0.95rem',
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
    width: '24px',
    height: '24px',
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
    fontSize: '0.85rem',
    fontWeight: 700,
    width: '18px',
    textAlign: 'center',
  },
  itemSubtotal: {
    fontSize: '1rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    width: '80px',
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
  summaryCard: {
    padding: '1.5rem',
  },
  summaryTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
    margin: '1.25rem 0',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.1rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '0.85rem',
    marginTop: '0.25rem',
  },
  promoForm: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  promoInput: {
    flexGrow: 1,
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
  },
  promoTagRemove: {
    background: 'transparent',
    border: 'none',
    color: 'var(--danger)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem',
  },
  codeTips: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    marginBottom: '1.25rem',
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
    letterSpacing: '-0.02em',
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
  }
};

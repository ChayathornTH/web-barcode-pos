import { useState } from 'react';
import { DollarSign, FileText, ShoppingBag, TrendingUp, Calendar, ArrowUpRight, Eye, Printer, X, Download, Trash2 } from 'lucide-react';

export default function DashboardView({ salesHistory, onResetSalesHistory }) {
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Stats Calculations
  const totalRevenue = salesHistory.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = salesHistory.length;
  const totalItemsSold = salesHistory.reduce((sum, sale) => 
    sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
  );
  const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Group Sales by Hour for hourly chart
  const hourlyBuckets = Array.from({ length: 13 }, (_, i) => ({
    hour: i + 9, // 9am to 9pm
    label: `${i + 9 > 12 ? i + 9 - 12 : i + 9}${i + 9 >= 12 ? 'PM' : 'AM'}`,
    amount: 0
  }));

  salesHistory.forEach(sale => {
    let hour = 12;
    try {
      const timeStr = sale.timestamp.split(',')[1]?.trim();
      if (timeStr) {
        const parts = timeStr.split(':');
        let hr = parseInt(parts[0]);
        const isPM = timeStr.toLowerCase().includes('pm');
        const isAM = timeStr.toLowerCase().includes('am');
        if (isPM && hr < 12) hr += 12;
        if (isAM && hr === 12) hr = 0;
        hour = hr;
      }
    } catch {
      hour = 12;
    }
    
    const bucket = hourlyBuckets.find(b => b.hour === hour);
    if (bucket) {
      bucket.amount += sale.total;
    } else {
      if (hour < 9) hourlyBuckets[0].amount += sale.total;
      else hourlyBuckets[12].amount += sale.total;
    }
  });

  const maxHourlySales = Math.max(...hourlyBuckets.map(b => b.amount), 50);

  // Category Distribution
  const categorySales = {};
  salesHistory.forEach(sale => {
    sale.items.forEach(item => {
      categorySales[item.category] = (categorySales[item.category] || 0) + (item.price * item.quantity);
    });
  });

  const totalCatSales = Object.values(categorySales).reduce((a, b) => a + b, 0) || 1;
  const sortedCategories = Object.entries(categorySales)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: (amount / totalCatSales) * 100
    }))
    .sort((a, b) => b.amount - a.amount);

  // Export ledger list to CSV format
  const handleExportCSV = () => {
    if (salesHistory.length === 0) return;
    
    const headers = [
      "Receipt ID", 
      "Timestamp", 
      "Product Name", 
      "Category", 
      "Quantity", 
      "Unit Price (฿)", 
      "Line Subtotal (฿)", 
      "Sticker Discount (฿)",
      "Coupon Code", 
      "Coupon Discount (฿)", 
      "Invoice Grand Total (฿)"
    ];
    
    const rows = [];
    salesHistory.forEach(sale => {
      sale.items.forEach((item, index) => {
        rows.push([
          sale.id,
          sale.timestamp,
          item.name,
          item.category,
          item.quantity,
          item.price.toFixed(2),
          (item.price * item.quantity).toFixed(2),
          index === 0 ? (sale.stickerDiscount || 0).toFixed(2) : "0.00",
          sale.discount.code || "None",
          index === 0 ? (sale.discount.amount || 0).toFixed(2) : "0.00",
          index === 0 ? sale.total.toFixed(2) : ""
        ]);
      });
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `artfest_sales_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={styles.viewContainer}>
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>Sales Analytics Dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Real-time business insights, revenue statistics, and item velocities.
          </p>
        </div>
        
        {/* Dashboard Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {salesHistory.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={handleExportCSV}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn btn-danger" onClick={() => {
                if (window.confirm("Are you sure you want to reset all transaction history logs? This will delete all past session sales data permanently.")) {
                  onResetSalesHistory();
                }
              }}>
                <Trash2 size={14} /> Reset Session
              </button>
            </>
          )}
        </div>
      </div>

      {/* Numerical Stats Cards */}
      <div className="stats-grid">
        
        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statHeader}>
            <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)' }}>
              <DollarSign size={20} />
            </div>
            <span style={styles.statLabel}>Total Revenue</span>
          </div>
          <div style={styles.statValue}>฿{totalRevenue.toFixed(2)}</div>
          <div style={styles.statTrend}>
            <TrendingUp size={14} color="var(--success)" />
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>+12.4%</span> vs yesterday
          </div>
        </div>

        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statHeader}>
            <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent)' }}>
              <FileText size={20} />
            </div>
            <span style={styles.statLabel}>Transactions</span>
          </div>
          <div style={styles.statValue}>{totalTransactions}</div>
          <div style={styles.statTrend}>
            <ArrowUpRight size={14} color="var(--success)" />
            <span style={{ color: 'var(--success)', fontWeight: 600 }}>Active session</span>
          </div>
        </div>

        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statHeader}>
            <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
              <ShoppingBag size={20} />
            </div>
            <span style={styles.statLabel}>Items Sold</span>
          </div>
          <div style={styles.statValue}>{totalItemsSold}</div>
          <div style={styles.statTrend}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Avg: {(totalItemsSold / (totalTransactions || 1)).toFixed(1)} / tickets</span>
          </div>
        </div>

        <div className="glass-panel" style={styles.statCard}>
          <div style={styles.statHeader}>
            <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
              <TrendingUp size={20} />
            </div>
            <span style={styles.statLabel}>Avg Ticket</span>
          </div>
          <div style={styles.statValue}>฿{averageTicket.toFixed(2)}</div>
          <div style={styles.statTrend}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Total basket value avg</span>
          </div>
        </div>

      </div>

      {/* Visual Charts Grid */}
      <div className="charts-grid">
        
        {/* Hourly sales distribution (Custom SVG) */}
        <div className="glass-panel" style={styles.chartCard}>
          <h3 style={styles.cardTitle}>Hourly Sales (฿)</h3>
          
          <div style={styles.svgContainer}>
            <svg width="100%" height="220" style={{ overflow: 'visible' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                const y = 180 - ratio * 150;
                const value = Math.round(maxHourlySales * ratio);
                return (
                  <g key={index}>
                    <line x1="40" y1={y} x2="100%" y2={y} stroke="var(--border-color)" strokeDasharray="4 4" />
                    <text x="32" y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">฿{value}</text>
                  </g>
                );
              })}

              {hourlyBuckets.map((bucket, index) => {
                const barWidth = 14; 
                const x = 45 + index * 26; 
                const barHeight = (bucket.amount / maxHourlySales) * 150;
                const y = 180 - barHeight;
                const isHovered = bucket.amount > 0;

                return (
                  <g key={index}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(barHeight, 2)}
                      rx="2"
                      fill={isHovered ? 'url(#barGradient)' : 'var(--border-color)'}
                      style={{ transition: 'all 0.3s ease' }}
                    />
                    
                    {bucket.amount > 0 && (
                      <text 
                        x={x + barWidth/2} 
                        y={y - 8} 
                        fill="var(--text-primary)" 
                        fontSize="8" 
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        ฿{Math.round(bucket.amount)}
                      </text>
                    )}

                    <text
                      x={x + barWidth/2}
                      y="198"
                      fill="var(--text-muted)"
                      fontSize="8"
                      textAnchor="middle"
                    >
                      {bucket.label}
                    </text>
                  </g>
                );
              })}

              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Category distribution */}
        <div className="glass-panel" style={styles.chartCard}>
          <h3 style={styles.cardTitle}>Sales by Department</h3>
          
          {sortedCategories.length === 0 ? (
            <div style={styles.emptyCategories}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No inventory categories sold yet.</p>
            </div>
          ) : (
            <div style={styles.categoryList}>
              {sortedCategories.map((cat, idx) => (
                <div key={idx} style={styles.categoryRow}>
                  <div style={styles.categoryMeta}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{cat.category}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      ฿{cat.amount.toFixed(2)} ({Math.round(cat.percent)}%)
                    </span>
                  </div>
                  <div style={styles.barTrack}>
                    <div style={{
                      ...styles.barFill,
                      width: `${cat.percent}%`,
                      backgroundColor: idx % 3 === 0 ? 'var(--primary)' : idx % 3 === 1 ? 'var(--accent)' : 'var(--success)'
                    }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Transaction History Table Ledger */}
      <div className="glass-panel" style={styles.tableCard}>
        <h3 style={styles.cardTitle}>Transaction Ledger</h3>
        
        {salesHistory.length === 0 ? (
          <div style={styles.emptyLedger}>
            <Calendar size={32} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No transactions recorded.</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Complete a checkout on the POS terminal to start recording data.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>Receipt ID</th>
                  <th style={styles.th}>Date & Time</th>
                  <th style={styles.th}>Items</th>
                  <th style={styles.th}>Discount</th>
                  <th style={styles.th}>Total</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.map((sale) => {
                  const qty = sale.items.reduce((s, i) => s + i.quantity, 0);
                  const totalDiscount = (sale.discount?.amount || 0) + (sale.stickerDiscount || 0);
                  return (
                    <tr key={sale.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{sale.id}</td>
                      <td style={styles.td}>{sale.timestamp}</td>
                      <td style={styles.td}>{qty} items</td>
                      <td style={styles.td}>
                        {totalDiscount > 0 ? (
                          <span style={styles.discountBadge}>-฿{totalDiscount.toFixed(2)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>None</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 800, color: 'var(--success)' }}>
                        ฿{sale.total.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={styles.viewInvoiceBtn}
                          onClick={() => setSelectedReceipt(sale)}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipts Popup Modal */}
      {selectedReceipt && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.receiptContainer}>
            <button style={styles.closeBtn} onClick={() => setSelectedReceipt(null)}>
              <X size={20} />
            </button>
            
            <div id="printable-history-receipt" style={styles.receiptBody}>
              <div style={styles.receiptHeader}>
                <div style={styles.receiptLogo}>⚡ OMNISCAN POS</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>Art Fair Artist Ledger</div>
                <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '1rem 0' }}></div>
              </div>

              <div style={styles.receiptMeta}>
                <div><strong>Receipt #:</strong> {selectedReceipt.id}</div>
                <div><strong>Date:</strong> {selectedReceipt.timestamp}</div>
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '0.75rem 0' }}></div>

              <div style={styles.receiptItems}>
                {selectedReceipt.items.map((item) => (
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
                  <span>฿{selectedReceipt.subtotal.toFixed(2)}</span>
                </div>
                {selectedReceipt.tax > 0 && (
                  <div style={styles.receiptTotalRow}>
                    <span>Tax (7%)</span>
                    <span>฿{selectedReceipt.tax.toFixed(2)}</span>
                  </div>
                )}
                {selectedReceipt.setDiscounts ? (
                  selectedReceipt.setDiscounts.map((disc, idx) => (
                    <div key={idx} style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                      <span>{disc.groupName} Discount</span>
                      <span>-฿{disc.amount.toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  selectedReceipt.stickerDiscount > 0 && (
                    <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                      <span>Sticker Set Discount</span>
                      <span>-฿{selectedReceipt.stickerDiscount.toFixed(2)}</span>
                    </div>
                  )
                )}
                {selectedReceipt.discount.amount > 0 && (
                  <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                    <span>Discount ({selectedReceipt.discount.code})</span>
                    <span>-฿{selectedReceipt.discount.amount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderBottom: '1px solid #000', margin: '0.4rem 0' }}></div>
                <div style={{ ...styles.receiptTotalRow, fontSize: '1.2rem', fontWeight: 800 }}>
                  <span>Grand Total</span>
                  <span>฿{selectedReceipt.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ borderBottom: '1px dashed #cbd5e1', margin: '1rem 0' }}></div>

              <div style={styles.receiptFooter}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>PAID / DUPLICATE RECEIPT</div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                  <svg width="120" height="30">
                    <rect width="120" height="30" fill="#ffffff" />
                    <g fill="#000000">
                      {Array.from({ length: 25 }).map((_, i) => (
                        <rect key={i} x={20 + i * 3} y={2} width={(i % 2 === 0 || i % 5 === 0) ? 2.5 : 1} height={26} />
                      ))}
                    </g>
                  </svg>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1 }}
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Copy
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }}
                onClick={() => setSelectedReceipt(null)}
              >
                Close
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
  statCard: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  statHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  statIconWrapper: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    margin: '0.2rem 0',
  },
  statTrend: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  chartCard: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '300px',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '1.5rem',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '0.5rem',
  },
  svgContainer: {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'flex-end',
    width: '100%',
    padding: '0 0.5rem 0.5rem 0.5rem',
  },
  emptyCategories: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  categoryRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  categoryMeta: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  barTrack: {
    height: '8px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
  },
  barFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  tableCard: {
    padding: '1.5rem',
  },
  emptyLedger: {
    padding: '3rem 1rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  thRow: {
    borderBottom: '1px solid var(--border-color)',
  },
  th: {
    padding: '0.75rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
    transition: 'background var(--transition-fast)',
  },
  td: {
    padding: '1rem',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
  },
  discountBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    color: 'var(--success)',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  viewInvoiceBtn: {
    padding: '0.4rem 0.8rem',
    fontSize: '0.8rem',
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
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
  },
  receiptBody: {
    background: '#ffffff',
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
  }
};

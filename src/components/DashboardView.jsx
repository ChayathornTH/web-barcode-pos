import { useState, useMemo } from 'react';
import { DollarSign, FileText, ShoppingBag, TrendingUp, Calendar, ArrowUpRight, Eye, Printer, X, Download, Trash2 } from 'lucide-react';

// Generic Optimal Set Discount Calculation helper (same as PosView.jsx)
const calculateOptimalGroupDiscount = (qty, tiers, basePrice = 10.00) => {
  let activeTiers = tiers;
  if (typeof activeTiers === 'string') {
    try { activeTiers = JSON.parse(activeTiers); } catch (e) { activeTiers = []; }
  }
  if (qty <= 0 || !Array.isArray(activeTiers) || activeTiers.length === 0) return 0;
  const validTiers = activeTiers.map(t => {
    const disc = t.discount !== undefined ? t.discount : Math.max(0, basePrice * t.quantity - (t.price || 0));
    const discNum = typeof disc === 'number' ? disc : (parseFloat(disc) || 0);
    return { quantity: t.quantity, discount: discNum };
  }).filter(t => t.quantity > 0 && t.discount >= 0);

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

// Helper to calculate exact line gross, set discount, and net share for each item in a sale
const calculateReceiptLineNets = (sale) => {
  // 1. Map items to temporary objects to avoid mutating original receipt items
  const saleItems = sale.items.map((item, index) => ({
    item,
    index,
    gross: item.price * item.quantity,
    setDiscount: 0,
    afterSetDiscount: item.price * item.quantity
  }));

  // 2. Group these mapped items by set group to calculate set/sticker discounts
  const setGroups = {};
  saleItems.forEach(mapped => {
    const item = mapped.item;
    if (item.isSetPriced) {
      const groupKey = item.setGroupName ? item.setGroupName.trim() : `single-${item.id}`;
      if (!setGroups[groupKey]) {
        setGroups[groupKey] = {
          mappedItems: [],
          tiers: item.setTiers || []
        };
      }
      setGroups[groupKey].mappedItems.push(mapped);
    }
  });

  // 3. Calculate set discount for each set group and assign it to mapped items
  Object.keys(setGroups).forEach(groupKey => {
    const group = setGroups[groupKey];
    const totalQty = group.mappedItems.reduce((sum, m) => sum + m.item.quantity, 0);
    const basePrice = group.mappedItems[0]?.item.price || 10.00;
    const groupDiscount = calculateOptimalGroupDiscount(totalQty, group.tiers, basePrice);
    
    // Distribute discount proportionally by quantity within the group
    group.mappedItems.forEach(mapped => {
      mapped.setDiscount = totalQty > 0 ? (mapped.item.quantity / totalQty) * groupDiscount : 0;
      mapped.afterSetDiscount = Math.max(0, mapped.gross - mapped.setDiscount);
    });
  });

  // 4. Calculate total remaining subtotal after set discounts
  const remainingSubtotal = saleItems.reduce((sum, m) => sum + m.afterSetDiscount, 0);

  // 5. Distribute the final total paid in the sale proportionally to afterSetDiscount
  const total = sale.total;
  return saleItems.map(mapped => {
    let netShare = 0;
    if (remainingSubtotal > 0) {
      netShare = (mapped.afterSetDiscount / remainingSubtotal) * total;
    }
    return {
      ...mapped,
      netShare
    };
  });
};

// Helper to get artist specific share details in a single sale
const getArtistShareInSale = (sale, artistName) => {
  const lineNets = calculateReceiptLineNets(sale);
  let net = 0;
  let gross = 0;
  let qty = 0;
  lineNets.forEach(line => {
    if ((line.item.artist || 'Unknown') === artistName) {
      net += line.netShare;
      gross += line.gross;
      qty += line.item.quantity;
    }
  });
  return { net, gross, qty };
};

export default function DashboardView({ salesHistory, onResetSalesHistory }) {
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productSortBy, setProductSortBy] = useState('net-desc');

  // Stats & Distribution Calculations wrapped in useMemo for performance
  const stats = useMemo(() => {
    // Stats Calculations
    const totalRevenueVal = salesHistory.reduce((sum, sale) => sum + sale.total, 0);
    const totalTransactionsVal = salesHistory.length;
    const totalItemsSoldVal = salesHistory.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageTicketVal = totalTransactionsVal > 0 ? totalRevenueVal / totalTransactionsVal : 0;

    // Global Payment split
    let globalCashTotalVal = 0;
    let globalQrTotalVal = 0;
    salesHistory.forEach(sale => {
      if (sale.paymentMethod === 'cash') {
        globalCashTotalVal += sale.total;
      } else {
        globalQrTotalVal += sale.total;
      }
    });

    // Group Sales by Hour for hourly chart
    const hourlyBucketsVal = Array.from({ length: 13 }, (_, i) => ({
      hour: i + 9, // 9am to 9pm
      label: `${i + 9 > 12 ? i + 9 - 12 : i + 9}${i + 9 >= 12 ? 'PM' : 'AM'}`,
      amount: 0
    }));

    salesHistory.forEach(sale => {
      let hour = 12;
      try {
        if (sale.timestamp) {
          const cleaned = sale.timestamp.replace(',', '').trim();
          const parts = cleaned.split(/\s+/);
          // If there is a space separating date and time, parts[1] is the time string.
          // Otherwise, fall back to parts[0]
          const timeStr = parts[1] || parts[0];
          if (timeStr && timeStr.includes(':')) {
            const timeParts = timeStr.split(':');
            let hr = parseInt(timeParts[0]);
            const isPM = cleaned.toLowerCase().includes('pm');
            const isAM = cleaned.toLowerCase().includes('am');
            if (isPM && hr < 12) hr += 12;
            if (isAM && hr === 12) hr = 0;
            hour = hr;
          }
        }
      } catch {
        hour = 12;
      }
      
      const bucket = hourlyBucketsVal.find(b => b.hour === hour);
      if (bucket) {
        bucket.amount += sale.total;
      } else {
        if (hour < 9) hourlyBucketsVal[0].amount += sale.total;
        else hourlyBucketsVal[12].amount += sale.total;
      }
    });

    const maxHourlySalesVal = Math.max(...hourlyBucketsVal.map(b => b.amount), 50);

    // Category Distribution
    const categorySales = {};
    salesHistory.forEach(sale => {
      sale.items.forEach(item => {
        categorySales[item.category] = (categorySales[item.category] || 0) + (item.price * item.quantity);
      });
    });

    const totalCatSales = Object.values(categorySales).reduce((a, b) => a + b, 0) || 1;
    const sortedCategoriesVal = Object.entries(categorySales)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: (amount / totalCatSales) * 100
      }))
      .sort((a, b) => b.amount - a.amount);

    // Product sales tracking
    const productSales = {};
    salesHistory.forEach(sale => {
      const lineNets = calculateReceiptLineNets(sale);
      lineNets.forEach(line => {
        const prodId = line.item.id;
        if (!productSales[prodId]) {
          productSales[prodId] = {
            id: prodId,
            name: line.item.name,
            emoji: line.item.emoji || '📦',
            artist: line.item.artist || 'Unknown',
            category: line.item.category,
            quantity: 0,
            gross: 0,
            net: 0
          };
        }
        productSales[prodId].quantity += line.item.quantity;
        productSales[prodId].gross += line.gross;
        productSales[prodId].net += line.netShare;
      });
    });

    // Calculate global hero product
    const globalProds = Object.values(productSales);
    let globalHeroProductVal = null;
    if (globalProds.length > 0) {
      globalProds.sort((a, b) => b.net - a.net || b.quantity - a.quantity);
      globalHeroProductVal = globalProds[0];
    }

    // Artist Distribution (Proportional Net Share Split and Payment Method breakdown)
    const artistSales = {};
    salesHistory.forEach(sale => {
      const lineNets = calculateReceiptLineNets(sale);
      const artistsInSale = new Set();

      lineNets.forEach(line => {
        const name = line.item.artist || 'Unknown';
        artistsInSale.add(name);

        if (!artistSales[name]) {
          artistSales[name] = { 
            gross: 0, 
            net: 0, 
            quantity: 0,
            transactions: 0,
            cashNet: 0,
            cashGross: 0,
            qrNet: 0,
            qrGross: 0,
            hourlySales: Array.from({ length: 13 }, (_, i) => ({
              hour: i + 9,
              label: `${i + 9 > 12 ? i + 9 - 12 : i + 9}${i + 9 >= 12 ? 'PM' : 'AM'}`,
              amount: 0
            })),
            categorySales: {}
          };
        }
        artistSales[name].gross += line.gross;
        artistSales[name].quantity += line.item.quantity;
        artistSales[name].net += line.netShare;

        if (sale.paymentMethod === 'cash') {
          artistSales[name].cashNet += line.netShare;
          artistSales[name].cashGross += line.gross;
        } else {
          artistSales[name].qrNet += line.netShare;
          artistSales[name].qrGross += line.gross;
        }

        // Hourly split per artist
        let hour = 12;
        try {
          if (sale.timestamp) {
            const cleaned = sale.timestamp.replace(',', '').trim();
            const parts = cleaned.split(/\s+/);
            const timeStr = parts[1] || parts[0];
            if (timeStr && timeStr.includes(':')) {
              const timeParts = timeStr.split(':');
              let hr = parseInt(timeParts[0]);
              const isPM = cleaned.toLowerCase().includes('pm');
              const isAM = cleaned.toLowerCase().includes('am');
              if (isPM && hr < 12) hr += 12;
              if (isAM && hr === 12) hr = 0;
              hour = hr;
            }
          }
        } catch {
          hour = 12;
        }

        const bucket = artistSales[name].hourlySales.find(b => b.hour === hour);
        if (bucket) {
          bucket.amount += line.netShare;
        } else {
          if (hour < 9) artistSales[name].hourlySales[0].amount += line.netShare;
          else artistSales[name].hourlySales[12].amount += line.netShare;
        }

        // Category split per artist
        artistSales[name].categorySales[line.item.category] = 
          (artistSales[name].categorySales[line.item.category] || 0) + line.gross;
      });

      artistsInSale.forEach(name => {
        if (artistSales[name]) {
          artistSales[name].transactions += 1;
        }
      });
    });

    // Calculate hero product per artist
    Object.keys(artistSales).forEach(artistName => {
      const artistProds = Object.values(productSales).filter(p => p.artist === artistName);
      if (artistProds.length > 0) {
        artistProds.sort((a, b) => b.net - a.net || b.quantity - a.quantity);
        artistSales[artistName].heroProduct = artistProds[0];
      } else {
        artistSales[artistName].heroProduct = null;
      }
    });

    const totalArtistNetSales = Object.values(artistSales).reduce((a, b) => a + b.net, 0) || 1;
    const sortedArtistsVal = Object.entries(artistSales)
      .map(([artist, data]) => ({
        artist,
        gross: data.gross,
        net: data.net,
        quantity: data.quantity,
        percent: (data.net / totalArtistNetSales) * 100,
        transactions: data.transactions,
        cashNet: data.cashNet,
        cashGross: data.cashGross,
        qrNet: data.qrNet,
        qrGross: data.qrGross,
        hourlySales: data.hourlySales,
        categorySales: data.categorySales,
        heroProduct: data.heroProduct
      }))
      .sort((a, b) => b.net - a.net);

    const sortedProductsVal = Object.values(productSales)
      .sort((a, b) => b.net - a.net || b.quantity - a.quantity);

    return {
      totalRevenue: totalRevenueVal,
      totalTransactions: totalTransactionsVal,
      totalItemsSold: totalItemsSoldVal,
      averageTicket: averageTicketVal,
      globalCashTotal: globalCashTotalVal,
      globalQrTotal: globalQrTotalVal,
      hourlyBuckets: hourlyBucketsVal,
      maxHourlySales: maxHourlySalesVal,
      sortedCategories: sortedCategoriesVal,
      sortedArtists: sortedArtistsVal,
      globalHeroProduct: globalHeroProductVal,
      sortedProducts: sortedProductsVal
    };
  }, [salesHistory]);

  const {
    totalRevenue,
    totalTransactions,
    totalItemsSold,
    averageTicket,
    globalCashTotal,
    globalQrTotal,
    hourlyBuckets,
    maxHourlySales,
    sortedCategories,
    sortedArtists,
    globalHeroProduct,
    sortedProducts
  } = stats;

  const selectedArtistData = useMemo(() => {
    if (selectedArtist === 'all') return null;
    return sortedArtists.find(a => a.artist === selectedArtist) || null;
  }, [sortedArtists, selectedArtist]);

  const artistStats = selectedArtistData || {
    gross: 0,
    net: 0,
    quantity: 0,
    transactions: 0,
    cashNet: 0,
    cashGross: 0,
    qrNet: 0,
    qrGross: 0,
    hourlySales: [],
    categorySales: {},
    heroProduct: null
  };

  const heroProductToShow = selectedArtist === 'all'
    ? globalHeroProduct
    : artistStats.heroProduct;

  const hourlyBucketsToRender = selectedArtist === 'all'
    ? hourlyBuckets
    : (artistStats.hourlySales || []);

  const maxHourlySalesToRender = selectedArtist === 'all'
    ? maxHourlySales
    : Math.max(...hourlyBucketsToRender.map(b => b.amount), 50);

  const categoriesToRender = useMemo(() => {
    if (selectedArtist === 'all') return sortedCategories;
    
    const artistCats = artistStats.categorySales || {};
    const artistTotalCatSales = Object.values(artistCats).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(artistCats)
      .map(([category, amount]) => ({
        category,
        amount,
        percent: (amount / artistTotalCatSales) * 100
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [selectedArtist, sortedCategories, artistStats]);

  const filteredSalesHistory = useMemo(() => {
    if (selectedArtist === 'all') return salesHistory;
    return salesHistory.filter(sale => 
      sale.items.some(item => (item.artist || 'Unknown') === selectedArtist)
    );
  }, [salesHistory, selectedArtist]);

  const productCategories = useMemo(() => {
    const activeProducts = selectedArtist === 'all'
      ? sortedProducts
      : sortedProducts.filter(p => p.artist === selectedArtist);
    const cats = new Set(activeProducts.map(p => p.category));
    return Array.from(cats);
  }, [sortedProducts, selectedArtist]);

  const productsToRender = useMemo(() => {
    let items = sortedProducts;
    
    // 1. Filter by artist if needed
    if (selectedArtist !== 'all') {
      items = items.filter(p => p.artist === selectedArtist);
    }
    
    // 2. Filter by Category
    if (productCategoryFilter !== 'all') {
      items = items.filter(p => p.category === productCategoryFilter);
    }
    
    // 3. Filter by Search Query
    if (productSearch.trim() !== '') {
      const query = productSearch.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(query));
    }
    
    // 4. Sort
    const sorted = [...items];
    if (productSortBy === 'net-desc') {
      sorted.sort((a, b) => b.net - a.net || b.quantity - a.quantity);
    } else if (productSortBy === 'net-asc') {
      sorted.sort((a, b) => a.net - b.net || a.quantity - b.quantity);
    } else if (productSortBy === 'qty-desc') {
      sorted.sort((a, b) => b.quantity - a.quantity || b.net - a.net);
    } else if (productSortBy === 'qty-asc') {
      sorted.sort((a, b) => a.quantity - b.quantity || a.net - b.net);
    } else if (productSortBy === 'name-asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (productSortBy === 'name-desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name));
    }
    
    return sorted;
  }, [sortedProducts, selectedArtist, productCategoryFilter, productSearch, productSortBy]);

  // Export ledger list to CSV format
  const handleExportCSV = () => {
    if (salesHistory.length === 0) return;
    
    const headers = [
      "Receipt ID", 
      "Timestamp", 
      "Product Name", 
      "Category", 
      "Artist",
      "Quantity", 
      "Unit Price (฿)", 
      "Line Subtotal (฿)", 
      "Line Net Share (฿)",
      "Sticker Discount (฿)",
      "Coupon Code", 
      "Coupon Discount (฿)", 
      "Invoice Grand Total (฿)",
      "Payment Method",
      "Cash Received (฿)",
      "Change (฿)"
    ];
    
    const rows = [];
    const activeSales = selectedArtist === 'all' 
      ? salesHistory 
      : salesHistory.filter(sale => sale.items.some(item => (item.artist || 'Unknown') === selectedArtist));

    activeSales.forEach(sale => {
      const lineNets = calculateReceiptLineNets(sale);
      let artistLineIndex = 0;
      lineNets.forEach((line, index) => {
        const lineArtist = line.item.artist || 'Unknown';
        if (selectedArtist !== 'all' && lineArtist !== selectedArtist) return;

        rows.push([
          sale.id,
          sale.timestamp,
          line.item.name,
          line.item.category,
          lineArtist,
          line.item.quantity,
          line.item.price.toFixed(2),
          line.gross.toFixed(2),
          line.netShare.toFixed(2),
          artistLineIndex === 0 ? (sale.stickerDiscount || 0).toFixed(2) : "0.00",
          sale.discount.code || "None",
          artistLineIndex === 0 ? (sale.discount.amount || 0).toFixed(2) : "0.00",
          artistLineIndex === 0 ? sale.total.toFixed(2) : "",
          artistLineIndex === 0 ? (sale.paymentMethod || "Unknown") : "",
          artistLineIndex === 0 ? (sale.cashReceived !== null && sale.cashReceived !== undefined ? sale.cashReceived.toFixed(2) : "") : "",
          artistLineIndex === 0 ? (sale.changeAmount !== null && sale.changeAmount !== undefined ? sale.changeAmount.toFixed(2) : "") : ""
        ]);
        artistLineIndex++;
      });
    });

    const csvString = [headers.join(","), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const artistSuffix = selectedArtist === 'all' ? '' : `_${selectedArtist.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    link.setAttribute("download", `artfest_sales_ledger${artistSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

      {/* Artist Filter Control Panel */}
      <div className="glass-panel" style={styles.filterBar}>
        <div style={styles.filterLabelGroup}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🎨 Filter by Artist:
          </span>
          <select 
            value={selectedArtist} 
            onChange={(e) => setSelectedArtist(e.target.value)}
            className="custom-input"
            style={styles.filterSelect}
          >
            <option value="all">All Artists (Full Dashboard)</option>
            {sortedArtists.map(a => (
              <option key={a.artist} value={a.artist}>
                {a.artist} (฿{a.net.toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        {/* Quick select artist tags (chips) */}
        {sortedArtists.length > 0 && (
          <div style={styles.tagsContainer}>
            <button 
              onClick={() => setSelectedArtist('all')}
              style={{
                ...styles.tagButton,
                backgroundColor: selectedArtist === 'all' ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                borderColor: selectedArtist === 'all' ? 'var(--primary)' : 'var(--border-color)',
                color: selectedArtist === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              All
            </button>
            {sortedArtists.slice(0, 6).map(a => (
              <button 
                key={a.artist}
                onClick={() => setSelectedArtist(a.artist)}
                style={{
                  ...styles.tagButton,
                  backgroundColor: selectedArtist === a.artist ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                  borderColor: selectedArtist === a.artist ? 'var(--primary)' : 'var(--border-color)',
                  color: selectedArtist === a.artist ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {a.artist}
              </button>
            ))}
            {sortedArtists.length > 6 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center', marginLeft: '0.5rem' }}>
                +{sortedArtists.length - 6} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Numerical Stats Cards */}
      <div className="stats-grid">
        {selectedArtist === 'all' ? (
          <>
            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statHeader}>
                <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)' }}>
                  <DollarSign size={20} />
                </div>
                <span style={styles.statLabel}>Total Revenue</span>
              </div>
              <div style={styles.statValue}>฿{totalRevenue.toFixed(2)}</div>
              <div style={styles.statTrend}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 500 }}>
                  💵 Cash: ฿{globalCashTotal.toFixed(2)} | 📱 QR: ฿{globalQrTotal.toFixed(2)}
                </span>
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
          </>
        ) : (
          <>
            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statHeader}>
                <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)' }}>
                  <DollarSign size={20} />
                </div>
                <span style={styles.statLabel}>Artist Net Revenue</span>
              </div>
              <div style={styles.statValue}>฿{artistStats.net.toFixed(2)}</div>
              <div style={styles.statTrend}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  Gross sales: ฿{artistStats.gross.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statHeader}>
                <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent)' }}>
                  <FileText size={20} />
                </div>
                <span style={styles.statLabel}>Transactions</span>
              </div>
              <div style={styles.statValue}>{artistStats.transactions}</div>
              <div style={styles.statTrend}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {artistStats.quantity} items sold
                </span>
              </div>
            </div>

            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statHeader}>
                <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                  <span style={{ fontSize: '1.2rem' }}>💵</span>
                </div>
                <span style={styles.statLabel}>Cash Share (Net)</span>
              </div>
              <div style={styles.statValue}>฿{artistStats.cashNet.toFixed(2)}</div>
              <div style={styles.statTrend}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  Gross Cash: ฿{artistStats.cashGross.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="glass-panel" style={styles.statCard}>
              <div style={styles.statHeader}>
                <div style={{ ...styles.statIconWrapper, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
                  <span style={{ fontSize: '1.2rem' }}>📱</span>
                </div>
                <span style={styles.statLabel}>QR Share (Net)</span>
              </div>
              <div style={styles.statValue}>฿{artistStats.qrNet.toFixed(2)}</div>
              <div style={styles.statTrend}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  Gross QR: ฿{artistStats.qrGross.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hero Product Spotlight Banner */}
      {heroProductToShow && (
        <div className="glass-panel glow-primary" style={styles.heroBanner}>
          <div style={styles.heroLeft}>
            <div style={styles.heroBadge}>
              <span>🌟 HERO PRODUCT</span>
            </div>
            <h3 style={styles.heroTitle}>
              <span style={{ fontSize: '1.8rem', marginRight: '0.5rem' }}>{heroProductToShow.emoji}</span>
              {heroProductToShow.name}
            </h3>
            <p style={styles.heroSubtitle}>
              Artist: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{heroProductToShow.artist}</span> | Category: {heroProductToShow.category}
            </p>
          </div>
          <div style={styles.heroRight}>
            <div style={styles.heroStatItem}>
              <span style={styles.heroStatLabel}>Units Sold</span>
              <span style={styles.heroStatVal}>{heroProductToShow.quantity} units</span>
            </div>
            <div style={{ width: '1px', height: '35px', backgroundColor: 'var(--border-color)', alignSelf: 'center' }}></div>
            <div style={styles.heroStatItem}>
              <span style={styles.heroStatLabel}>Net Revenue</span>
              <span style={{ ...styles.heroStatVal, color: 'var(--success)' }}>฿{heroProductToShow.net.toFixed(2)}</span>
            </div>
            <div style={{ width: '1px', height: '35px', backgroundColor: 'var(--border-color)', alignSelf: 'center' }}></div>
            <div style={styles.heroStatItem}>
              <span style={styles.heroStatLabel}>Avg Price</span>
              <span style={styles.heroStatVal}>฿{(heroProductToShow.gross / heroProductToShow.quantity).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Visual Charts Grid */}
      <div className="charts-grid">
        
        {/* Hourly sales distribution (Custom SVG) */}
        <div className="glass-panel" style={styles.chartCard}>
          <h3 style={styles.cardTitle}>
            {selectedArtist === 'all' ? 'Hourly Sales (฿)' : `Hourly Sales for ${selectedArtist} (฿)`}
          </h3>
          
          <div style={styles.svgContainer}>
            <svg width="100%" height="220" style={{ overflow: 'visible' }}>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                const y = 180 - ratio * 150;
                const value = Math.round(maxHourlySalesToRender * ratio);
                return (
                  <g key={index}>
                    <line x1="40" y1={y} x2="100%" y2={y} stroke="var(--border-color)" strokeDasharray="4 4" />
                    <text x="32" y={y + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">฿{value}</text>
                  </g>
                );
              })}

              {hourlyBucketsToRender.map((bucket, index) => {
                const barWidth = 14; 
                const x = 45 + index * 26; 
                const barHeight = (bucket.amount / maxHourlySalesToRender) * 150;
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
          <h3 style={styles.cardTitle}>
            {selectedArtist === 'all' ? 'Sales by Department' : `Department Sales for ${selectedArtist}`}
          </h3>
          
          {categoriesToRender.length === 0 ? (
            <div style={styles.emptyCategories}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No inventory categories sold yet.</p>
            </div>
          ) : (
            <div style={styles.categoryList}>
              {categoriesToRender.map((cat, idx) => (
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

        {/* Artist Distribution */}
        <div className="glass-panel" style={styles.chartCard}>
          <h3 style={styles.cardTitle}>Sales by Artist</h3>
          
          {sortedArtists.length === 0 ? (
            <div style={styles.emptyCategories}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No artist sales recorded yet.</p>
            </div>
          ) : (
            <div style={styles.categoryList}>
              {sortedArtists.map((art, idx) => {
                const isSelected = selectedArtist === art.artist;
                return (
                  <div 
                    key={idx} 
                    style={{
                      ...styles.categoryRow,
                      padding: isSelected ? '0.5rem' : '0',
                      borderRadius: isSelected ? '8px' : '0',
                      border: isSelected ? '1px solid var(--primary)' : 'none',
                      backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
                    }}
                  >
                    <div style={styles.categoryMeta}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>🎨 {art.artist}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Net: ฿{art.net.toFixed(2)} (Gross: ฿{art.gross.toFixed(2)})
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                      <span>{art.quantity} items sold</span>
                      <span>{Math.round(art.percent)}% share</span>
                    </div>
                    <div style={styles.barTrack}>
                      <div style={{
                        ...styles.barFill,
                        width: `${art.percent}%`,
                        backgroundColor: idx % 3 === 0 ? 'var(--accent)' : idx % 3 === 1 ? 'var(--primary)' : 'var(--success)'
                      }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Transaction History Table Ledger */}
      {/* Item Sales Summary Card */}
      <div className="glass-panel" style={styles.tableCard}>
        <h3 style={styles.cardTitle}>
          {selectedArtist === 'all' ? 'Item Sales Summary' : `Item Sales Summary for ${selectedArtist}`}
        </h3>
        
        {/* Item Summary Table Controls */}
        <div style={styles.tableControlsBar}>
          <input 
            type="text"
            placeholder="🔍 Search items by name..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="custom-input"
            style={styles.searchControl}
          />
          
          <div style={styles.controlGroupRight}>
            <div style={styles.controlItem}>
              <span style={styles.controlItemLabel}>Category:</span>
              <select
                value={productCategoryFilter}
                onChange={(e) => setProductCategoryFilter(e.target.value)}
                className="custom-input"
                style={styles.dropdownControl}
              >
                <option value="all">All Categories</option>
                {productCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div style={styles.controlItem}>
              <span style={styles.controlItemLabel}>Sort By:</span>
              <select
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value)}
                className="custom-input"
                style={styles.dropdownControl}
              >
                <option value="net-desc">Net Share: High to Low</option>
                <option value="net-asc">Net Share: Low to High</option>
                <option value="qty-desc">Qty Sold: High to Low</option>
                <option value="qty-asc">Qty Sold: Low to High</option>
                <option value="name-asc">Product Name: A to Z</option>
                <option value="name-desc">Product Name: Z to A</option>
              </select>
            </div>
          </div>
        </div>

        {productsToRender.length === 0 ? (
          <div style={styles.emptyLedger}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No item sales matching active filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>Product</th>
                  {selectedArtist === 'all' && <th style={styles.th}>Artist</th>}
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Qty Sold</th>
                  <th style={styles.th}>Gross Sales</th>
                  <th style={styles.th}>Net Share</th>
                </tr>
              </thead>
              <tbody>
                {productsToRender.map((prod) => (
                  <tr key={prod.id} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 700 }}>
                      <span style={{ marginRight: '0.5rem', fontSize: '1.1rem' }}>{prod.emoji}</span>
                      {prod.name}
                    </td>
                    {selectedArtist === 'all' && (
                      <td style={styles.td}>🎨 {prod.artist}</td>
                    )}
                    <td style={styles.td}>{prod.category}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{prod.quantity} pcs</td>
                    <td style={styles.td}>฿{prod.gross.toFixed(2)}</td>
                    <td style={{ ...styles.td, fontWeight: 800, color: 'var(--success)' }}>฿{prod.net.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-panel" style={styles.tableCard}>
        <h3 style={styles.cardTitle}>
          {selectedArtist === 'all' ? 'Transaction Ledger' : `Transaction Ledger for ${selectedArtist}`}
        </h3>
        
        {filteredSalesHistory.length === 0 ? (
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
                  {selectedArtist !== 'all' && <th style={styles.th}>Artist Share (Net)</th>}
                  <th style={styles.th}>Total</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalesHistory.map((sale) => {
                  const qty = sale.items.reduce((s, i) => s + i.quantity, 0);
                  const totalDiscount = (sale.discount?.amount || 0) + (sale.stickerDiscount || 0);
                  const artistShare = selectedArtist !== 'all' ? getArtistShareInSale(sale, selectedArtist) : null;
                  return (
                    <tr key={sale.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: 700 }}>{sale.id}</td>
                      <td style={styles.td}>{sale.timestamp}</td>
                      <td style={styles.td}>
                        {selectedArtist === 'all' 
                          ? `${qty} items` 
                          : `${artistShare.qty} of ${qty} items`}
                      </td>
                      <td style={styles.td}>
                        {totalDiscount > 0 ? (
                          <span style={styles.discountBadge}>-฿{totalDiscount.toFixed(2)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>None</span>
                        )}
                      </td>
                      {selectedArtist !== 'all' && (
                        <td style={{ ...styles.td, fontWeight: 800, color: 'var(--primary)' }}>
                          ฿{artistShare.net.toFixed(2)}
                        </td>
                      )}
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
                    <span>฿{(selectedReceipt.subtotal || 0).toFixed(2)}</span>
                  </div>
                  {selectedReceipt.tax > 0 && (
                    <div style={styles.receiptTotalRow}>
                      <span>Tax (7%)</span>
                      <span>฿{(selectedReceipt.tax || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedReceipt.setDiscounts ? (
                    selectedReceipt.setDiscounts.map((disc, idx) => (
                      <div key={idx} style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                        <span>{disc.groupName} Discount</span>
                        <span>-฿{(disc.amount || 0).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    selectedReceipt.stickerDiscount > 0 && (
                      <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                        <span>Sticker Set Discount</span>
                        <span>-฿{(selectedReceipt.stickerDiscount || 0).toFixed(2)}</span>
                      </div>
                    )
                  )}
                  {selectedReceipt.discount?.amount > 0 && (
                    <div style={{ ...styles.receiptTotalRow, color: '#0f766e' }}>
                      <span>Discount ({selectedReceipt.discount?.code})</span>
                      <span>-฿{(selectedReceipt.discount?.amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ borderBottom: '1px solid #000', margin: '0.4rem 0' }}></div>
                  <div style={{ ...styles.receiptTotalRow, fontSize: '1.2rem', fontWeight: 800 }}>
                    <span>Grand Total</span>
                    <span>฿{(selectedReceipt.total || 0).toFixed(2)}</span>
                  </div>

                  {selectedReceipt.paymentMethod && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.4rem', 
                      borderRadius: '4px', 
                      backgroundColor: 'rgba(0, 0, 0, 0.02)',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      color: '#334155'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Payment Method</span>
                        <span>{selectedReceipt.paymentMethod === 'cash' ? '💵 Cash' : '📱 PromptPay QR'}</span>
                      </div>
                      {selectedReceipt.paymentMethod === 'cash' && selectedReceipt.cashReceived !== null && selectedReceipt.cashReceived !== undefined && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', color: '#64748b' }}>
                            <span>Cash Received</span>
                            <span>฿{(selectedReceipt.cashReceived || 0).toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f766e', fontWeight: 600 }}>
                            <span>Change</span>
                            <span>฿{(selectedReceipt.changeAmount || 0).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    {selectedReceipt.paymentMethod === 'qrpromptpay' && selectedReceipt.promptPayId && (
                      <div style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center', marginTop: '0.2rem' }}>
                        Paid via PromptPay ID: {selectedReceipt.promptPayId}
                      </div>
                    )}
                  </div>
                )}
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
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  closeBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    zIndex: 10, // Ensure it sits above scrollable content
  },
  receiptBody: {
    background: '#ffffff',
    overflowY: 'auto',
    flex: 1,
    paddingRight: '0.5rem',
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
  filterBar: {
    padding: '1rem 1.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  filterLabelGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  filterSelect: {
    padding: '0.5rem 2.2rem 0.5rem 1rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
    minWidth: '220px',
  },
  tagsContainer: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  tagButton: {
    padding: '0.35rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all var(--transition-fast)',
    outline: 'none',
  },
  heroBanner: {
    padding: '1.25rem 1.75rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1.5rem',
    flexWrap: 'wrap',
    background: 'radial-gradient(at 0% 0%, rgba(139, 92, 246, 0.1) 0px, var(--glass-bg) 50%)',
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  heroLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--primary-glow)',
    border: '1px solid var(--primary)',
    borderRadius: '4px',
    padding: '0.15rem 0.4rem',
    fontSize: '0.65rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
  },
  heroTitle: {
    fontSize: '1.3rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
  },
  heroSubtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  heroRight: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap',
  },
  heroStatItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  heroStatLabel: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
  },
  heroStatVal: {
    fontSize: '1.1rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  tableControlsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '1.25rem',
    paddingBottom: '1rem',
    borderBottom: '1px dashed var(--border-color)',
  },
  searchControl: {
    padding: '0.45rem 1rem',
    fontSize: '0.85rem',
    flex: '1 1 250px',
  },
  controlGroupRight: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  controlItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  controlItemLabel: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: 600,
  },
  dropdownControl: {
    padding: '0.45rem 2.2rem 0.45rem 1rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
  }
};

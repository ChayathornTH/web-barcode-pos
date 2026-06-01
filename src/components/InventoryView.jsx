import { useState } from 'react';
import { Plus, Search, Trash2, Edit3, X, Barcode as BarcodeIcon, RotateCcw, AlertTriangle } from 'lucide-react';

// Custom lightweight barcode renderer
function BarcodeVisualizer({ value }) {
  // Deterministic fake EAN-13 line drawing
  const lines = [];
  let currentX = 10;
  
  // Use a hash of the value to generate a consistent line pattern
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
  }
  hash = Math.abs(hash);

  for (let i = 0; i < 45; i++) {
    const isGuard = i < 3 || (i > 20 && i < 23) || i > 41;
    const bit = (hash >> (i % 24)) & 1;
    const height = isGuard ? 55 : 46;
    const barWidth = isGuard ? 1.5 : (bit === 1 ? 3 : 1.5);
    const hasBar = (i % 2 === 0);

    if (hasBar) {
      lines.push(
        <rect 
          key={i} 
          x={currentX} 
          y={5} 
          width={barWidth} 
          height={height} 
          fill="#1e293b" 
        />
      );
    }
    currentX += barWidth + (bit === 1 ? 1 : 1.5);
  }

  return (
    <div style={styles.barcodeCard}>
      <svg width="150" height="70" viewBox="0 0 160 70" style={{ display: 'block' }}>
        <rect width="100%" height="100%" fill="#ffffff" rx="4" />
        <g>{lines}</g>
        <text 
          x="80" 
          y="64" 
          textAnchor="middle" 
          fontSize="9" 
          fontFamily="monospace" 
          fontWeight="700" 
          fill="#1e293b"
          letterSpacing="1.5"
        >
          {value}
        </text>
      </svg>
    </div>
  );
}

const CATEGORIES = [
  "Fresh Produce",
  "Dairy",
  "Bakery",
  "Beverages",
  "Snacks",
  "Packaged Food",
  "Personal Care",
  "Stationery",
  "Other"
];

// Helper to match emojis based on product characteristics
const getEmojiForProduct = (name, category) => {
  const n = name.toLowerCase();
  if (n.includes('milk') || n.includes('cheese') || n.includes('butter')) return '🥛';
  if (n.includes('bread') || n.includes('croissant') || n.includes('bun')) return '🍞';
  if (n.includes('coke') || n.includes('cola') || n.includes('soda') || n.includes('water') || n.includes('drink') || n.includes('juice')) return '🥤';
  if (n.includes('noodle') || n.includes('pasta') || n.includes('soup')) return '🍜';
  if (n.includes('chip') || n.includes('snack') || n.includes('cookie') || n.includes('chocolate') || n.includes('candy')) return '🍫';
  if (n.includes('apple') || n.includes('banana') || n.includes('fruit') || n.includes('salad') || n.includes('orange') || n.includes('berry') || n.includes('avocado')) return '🍎';
  if (n.includes('paper') || n.includes('pen') || n.includes('pencil') || n.includes('book')) return '📄';
  if (n.includes('paste') || n.includes('brush') || n.includes('shampoo') || n.includes('soap')) return '🪥';
  if (n.includes('razor') || n.includes('blade')) return '🪒';
  if (n.includes('coffee') || n.includes('tea')) return '☕';

  // Fallbacks by category
  switch (category) {
    case "Fresh Produce": return '🥗';
    case "Dairy": return '🧀';
    case "Bakery": return '🥯';
    case "Beverages": return '🥤';
    case "Snacks": return '🍿';
    case "Packaged Food": return '🥫';
    case "Personal Care": return '🧼';
    case "Stationery": return '✏️';
    default: return '📦';
  }
};

export default function InventoryView({ products, onAddProduct, onUpdateProduct, onDeleteProduct, onSimulateScan, onResetInventory }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Form State
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Other');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Handle Edit click
  const handleEditClick = (product) => {
    setEditingProduct(product);
    setBarcode(product.barcode);
    setName(product.name);
    setPrice(product.price.toString());
    setCategory(product.category);
    setStock(product.stock.toString());
    setDescription(product.description || '');
    setIsModalOpen(true);
  };

  // Handle Add Click
  const handleAddClick = () => {
    setEditingProduct(null);
    setBarcode('');
    setName('');
    setPrice('');
    setCategory('Other');
    setStock('');
    setDescription('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Auto generate 13 digit barcode
  const handleGenerateBarcode = () => {
    // Generate standard-looking EAN-13 mock
    const random12Digits = Array.from({length: 12}, () => Math.floor(Math.random() * 10)).join('');
    // Simple checksum digit
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(random12Digits[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    setBarcode(random12Digits + checksum);
  };

  // Handle Form Submit
  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!barcode || !name || !price || !stock) {
      setFormError("Please fill in all required fields.");
      return;
    }

    const priceNum = parseFloat(price);
    const stockNum = parseInt(stock);

    if (isNaN(priceNum) || priceNum <= 0) {
      setFormError("Price must be a valid number greater than 0.");
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setFormError("Stock cannot be negative.");
      return;
    }

    // Check duplicate barcode
    const duplicate = products.find(p => p.barcode === barcode && (!editingProduct || p.id !== editingProduct.id));
    if (duplicate) {
      setFormError(`Barcode is already assigned to: ${duplicate.name}`);
      return;
    }

    const emoji = getEmojiForProduct(name, category);

    if (editingProduct) {
      // Update
      onUpdateProduct({
        ...editingProduct,
        barcode,
        name,
        price: priceNum,
        category,
        stock: stockNum,
        description,
        emoji
      });
    } else {
      // Add
      onAddProduct({
        id: `prod-${Date.now()}`,
        barcode,
        name,
        price: priceNum,
        category,
        stock: stockNum,
        description,
        emoji
      });
    }

    setIsModalOpen(false);
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.barcode.includes(searchTerm) || 
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={styles.viewContainer}>
      <div style={styles.header}>
        <div>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>Inventory Database</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Manage barcode catalog, update stock levels, and simulate scans.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onResetInventory} title="Reset database to default items">
            <RotateCcw size={16} /> Reset Default
          </button>
          <button className="btn btn-primary" onClick={handleAddClick}>
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={styles.filterBar}>
        <div style={styles.searchWrapper}>
          <Search size={18} style={styles.searchIcon} />
          <input 
            type="text" 
            placeholder="Search by name, barcode, category..." 
            className="custom-input"
            style={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div style={styles.categorySelectWrapper}>
          <select 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="custom-input"
            style={styles.categorySelect}
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid inventory list */}
      <div style={styles.gridContainer}>
        {filteredProducts.length === 0 ? (
          <div className="glass-panel" style={styles.emptyState}>
            <AlertTriangle size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} />
            <h3>No Products Found</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              No matches found for your filter. Try adjusting your search query or add a new product.
            </p>
          </div>
        ) : (
          filteredProducts.map(product => (
            <div key={product.id} className="glass-panel glass-panel-hover" style={styles.productCard}>
              <div style={styles.cardHeader}>
                <div style={styles.emojiContainer}>{product.emoji}</div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={styles.categoryBadge}>{product.category}</span>
                  <h4 style={styles.productName}>{product.name}</h4>
                </div>
              </div>

              <p style={styles.description}>{product.description || "No description provided."}</p>

              <div style={styles.priceStockRow}>
                <div>
                  <div style={styles.label}>PRICE</div>
                  <div style={styles.priceVal}>${product.price.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={styles.label}>STOCK</div>
                  <div style={{
                    ...styles.stockVal,
                    color: product.stock === 0 ? 'var(--danger)' : product.stock < 10 ? 'var(--warning)' : 'var(--text-primary)'
                  }}>
                    {product.stock} units
                  </div>
                </div>
              </div>

              {/* Visual Barcode display */}
              <div style={styles.barcodeSection}>
                <BarcodeVisualizer value={product.barcode} />
              </div>

              {/* Action buttons */}
              <div style={styles.cardActions}>
                <button 
                  className="btn btn-success" 
                  onClick={() => onSimulateScan(product.barcode)}
                  style={styles.simulateBtn}
                  title="Simulate barcode scanning this product"
                >
                  <BarcodeIcon size={14} /> Scan Test
                </button>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleEditClick(product)}
                    style={styles.actionBtn}
                    title="Edit Product"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    className="btn btn-danger" 
                    onClick={() => onDeleteProduct(product.id)}
                    style={styles.actionBtn}
                    title="Delete Product"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal dialog for Add / Edit */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={styles.modalContainer}>
            <div style={styles.modalHeader}>
              <h3>{editingProduct ? "Edit Product" : "Add New Product"}</h3>
              <button style={styles.closeBtn} onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={styles.form}>
              {formError && (
                <div style={styles.errorAlert}>
                  <AlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flexGrow: 1 }}>
                  <label style={styles.formLabel}>Barcode *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="custom-input"
                      style={{ flexGrow: 1 }}
                      placeholder="E.g., 8850125000114"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value.replace(/[^0-9]/g, ''))}
                      required
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={handleGenerateBarcode}
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    >
                      Generate
                    </button>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Use 13-digit EAN code or a simple short number (like 1001) for fast mock scans.
                  </span>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Product Name *</label>
                <input 
                  type="text" 
                  className="custom-input"
                  placeholder="E.g., Farmhouse Bread"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Price ($) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    className="custom-input"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </div>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Stock Qty *</label>
                  <input 
                    type="number" 
                    min="0"
                    className="custom-input"
                    placeholder="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Category</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  className="custom-input"
                  style={{ width: '100%' }}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Description</label>
                <textarea 
                  className="custom-input"
                  rows="3"
                  style={{ resize: 'none', width: '100%' }}
                  placeholder="Enter short details about the product..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={styles.formActions}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? "Save Changes" : "Create Product"}
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
  filterBar: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    flexGrow: 1,
    minWidth: '250px',
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
  categorySelectWrapper: {
    width: '200px',
  },
  categorySelect: {
    width: '100%',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.25rem',
  },
  emptyState: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    textAlign: 'center',
  },
  productCard: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  cardHeader: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    minWidth: 0,
  },
  emojiContainer: {
    fontSize: '2rem',
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--accent)',
    letterSpacing: '0.05em',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '0.1rem',
  },
  description: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    height: '2.8em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  priceStockRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '0.75rem',
  },
  label: {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  priceVal: {
    fontSize: '1.1rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginTop: '0.1rem',
  },
  stockVal: {
    fontSize: '0.9rem',
    fontWeight: 600,
    marginTop: '0.1rem',
  },
  barcodeSection: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0.5rem 0',
  },
  barcodeCard: {
    borderRadius: '6px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  cardActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: 'auto',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '0.75rem',
  },
  simulateBtn: {
    flexGrow: 1,
    padding: '0.45rem 0.8rem',
    fontSize: '0.8rem',
  },
  actionBtn: {
    padding: '0.45rem',
    width: '32px',
    height: '32px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5, 7, 12, 0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modalContainer: {
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideIn 0.25s ease-out forwards',
  },
  modalHeader: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  form: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  errorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid var(--danger)',
    borderRadius: '6px',
    padding: '0.75rem',
    color: 'var(--danger)',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  formRow: {
    display: 'flex',
    gap: '1rem',
  },
  formLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '1rem',
    marginTop: '0.5rem',
  }
};

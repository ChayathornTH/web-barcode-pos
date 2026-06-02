import { useState } from 'react';
import { Plus, Search, Trash2, Edit3, X, Barcode as BarcodeIcon, RotateCcw, AlertTriangle } from 'lucide-react';


const CATEGORIES = [
  "Paintings",
  "Prints",
  "Stickers",
  "Accessories",
  "Stationery",
  "Other"
];

// Helper to match emojis based on product characteristics
const getEmojiForProduct = (name, category) => {
  const n = name.toLowerCase();
  if (n.includes('canvas') || n.includes('acrylic') || n.includes('oil') || n.includes('paint')) return '🎨';
  if (n.includes('watercolor') || n.includes('landscape') || n.includes('gouache')) return '🌸';
  if (n.includes('sticker')) return '✨';
  if (n.includes('print')) return '🖼️';
  if (n.includes('keychain') || n.includes('charm')) return '🔑';
  if (n.includes('pin') || n.includes('badge')) return '📌';
  if (n.includes('postcard') || n.includes('card')) return '✉️';
  if (n.includes('book') || n.includes('sketchbook') || n.includes('notebook')) return '📓';
  if (n.includes('tape') || n.includes('washi')) return '🎞️';

  // Fallbacks by category
  switch (category) {
    case "Paintings": return '🎨';
    case "Prints": return '🖼️';
    case "Stickers": return '✨';
    case "Accessories": return '🔑';
    case "Stationery": return '📓';
    default: return '📦';
  }
};

export default function InventoryView({ products, onAddProduct, onUpdateProduct, onDeleteProduct, onSimulateScan, onResetInventory }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Get all unique existing set groups and their tiers from the product list
  const availableGroups = {};
  products.forEach(p => {
    if (p.isSetPriced && p.setGroupName) {
      const nameKey = p.setGroupName.trim();
      if (!availableGroups[nameKey]) {
        availableGroups[nameKey] = p.setTiers || [];
      }
    }
  });
  const groupNames = Object.keys(availableGroups);

  // Form State
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Other');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [isSetPriced, setIsSetPriced] = useState(false);
  const [setGroupName, setSetGroupName] = useState('');
  const [groupSelectValue, setGroupSelectValue] = useState('');
  const [tier1Qty, setTier1Qty] = useState('1');
  const [tier1Price, setTier1Price] = useState('');
  const [tier2Qty, setTier2Qty] = useState('');
  const [tier2Price, setTier2Price] = useState('');
  const [tier3Qty, setTier3Qty] = useState('');
  const [tier3Price, setTier3Price] = useState('');
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
    setImage(product.image || '');
    setIsSetPriced(!!product.isSetPriced);
    const gName = product.setGroupName || '';
    setSetGroupName(gName);
    if (gName && groupNames.includes(gName)) {
      setGroupSelectValue(gName);
    } else if (gName) {
      setGroupSelectValue('__new__');
    } else {
      setGroupSelectValue('');
    }
    const tiers = product.setTiers || [];
    setTier1Qty(tiers[0]?.quantity?.toString() || '1');
    setTier1Price(tiers[0]?.price?.toString() || '');
    setTier2Qty(tiers[1]?.quantity?.toString() || '');
    setTier2Price(tiers[1]?.price?.toString() || '');
    setTier3Qty(tiers[2]?.quantity?.toString() || '');
    setTier3Price(tiers[2]?.price?.toString() || '');
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
    setImage('');
    setIsSetPriced(false);
    setSetGroupName('');
    setGroupSelectValue('');
    setTier1Qty('1');
    setTier1Price('');
    setTier2Qty('');
    setTier2Price('');
    setTier3Qty('');
    setTier3Price('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle group select changes
  const handleGroupSelectChange = (val) => {
    setGroupSelectValue(val);
    if (val === '__new__') {
      setSetGroupName('');
      setTier1Qty('1');
      setTier1Price(price || '');
      setTier2Qty('');
      setTier2Price('');
      setTier3Qty('');
      setTier3Price('');
    } else if (val === '') {
      setSetGroupName('');
    } else {
      setSetGroupName(val);
      const tiers = availableGroups[val] || [];
      setTier1Qty(tiers[0]?.quantity?.toString() || '1');
      setTier1Price(tiers[0]?.price?.toString() || '');
      setTier2Qty(tiers[1]?.quantity?.toString() || '');
      setTier2Price(tiers[1]?.price?.toString() || '');
      setTier3Qty(tiers[2]?.quantity?.toString() || '');
      setTier3Price(tiers[2]?.price?.toString() || '');
      
      // Auto-prefill regularly priced field
      if (tiers[0]?.price) {
        setPrice(tiers[0].price.toString());
      }
    }
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

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFormError('Image size must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
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

    // Construct set pricing tiers if enabled
    const setTiers = [];
    if (isSetPriced) {
      if (tier1Qty && tier1Price) {
        setTiers.push({ quantity: parseInt(tier1Qty), price: parseFloat(tier1Price) });
      }
      if (tier2Qty && tier2Price) {
        setTiers.push({ quantity: parseInt(tier2Qty), price: parseFloat(tier2Price) });
      }
      if (tier3Qty && tier3Price) {
        setTiers.push({ quantity: parseInt(tier3Qty), price: parseFloat(tier3Price) });
      }
    }

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
        emoji,
        image,
        isSetPriced,
        setGroupName: setGroupName.trim(),
        setTiers
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
        emoji,
        image,
        isSetPriced,
        setGroupName: setGroupName.trim(),
        setTiers
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
                {product.image ? (
                  <div style={styles.imageContainer}>
                    <img src={product.image} alt={product.name} style={styles.productCardImage} />
                  </div>
                ) : (
                  <div style={styles.emojiContainer}>{product.emoji}</div>
                )}
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.15rem' }}>
                    <span style={styles.categoryBadge}>{product.category}</span>
                    <span style={styles.barcodeBadge}>#{product.barcode}</span>
                    {product.isSetPriced && (
                      <span style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--success)',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}>🏷️ {product.setGroupName || "Set"} Tier</span>
                    )}
                  </div>
                  <h4 style={styles.productName}>{product.name}</h4>
                </div>
              </div>

              <p style={styles.description}>{product.description || "No description provided."}</p>

              <div style={styles.priceStockRow}>
                <div>
                  <div style={styles.label}>PRICE</div>
                  <div style={styles.priceVal}>฿{product.price.toFixed(2)}</div>
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
                  <label style={styles.formLabel}>Price (฿) *</label>
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
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setCategory(newCat);
                    if (newCat === 'Stickers') {
                      setIsSetPriced(true);
                      const hasStickers = groupNames.includes('Stickers');
                      setGroupSelectValue(hasStickers ? 'Stickers' : '__new__');
                      setSetGroupName('Stickers');
                      setPrice('10.00');
                      setTier1Qty('1');
                      setTier1Price('10.00');
                      setTier2Qty('3');
                      setTier2Price('25.00');
                      setTier3Qty('5');
                      setTier3Price('35.00');
                    }
                  }}
                  className="custom-input"
                  style={{ width: '100%' }}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <input 
                  type="checkbox" 
                  id="isSetPriced" 
                  checked={isSetPriced}
                  onChange={(e) => setIsSetPriced(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isSetPriced" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Enable Set / Volume Tier Pricing
                </label>
              </div>

              {isSetPriced && (
                <div style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={styles.formGroup}>
                    <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Set Group Name</label>
                    <select 
                      value={groupSelectValue}
                      onChange={(e) => handleGroupSelectChange(e.target.value)}
                      className="custom-input"
                      style={{ width: '100%', fontSize: '0.85rem', marginBottom: groupSelectValue === '__new__' ? '0.5rem' : '0' }}
                    >
                      <option value="">-- Select Existing Group --</option>
                      {groupNames.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="__new__">+ Create New Group...</option>
                    </select>

                    {groupSelectValue === '__new__' && (
                      <input 
                        type="text" 
                        placeholder="Type new group name (e.g., Pins, Prints)..." 
                        className="custom-input"
                        style={{ fontSize: '0.85rem', width: '100%' }}
                        value={setGroupName}
                        onChange={(e) => setSetGroupName(e.target.value)}
                        required
                      />
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 1 Qty</label>
                      <input type="number" min="1" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier1Qty} onChange={(e) => setTier1Qty(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 1 Price (฿)</label>
                      <input type="number" step="0.01" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier1Price} onChange={(e) => setTier1Price(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 2 Qty (Opt)</label>
                      <input type="number" min="1" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier2Qty} onChange={(e) => setTier2Qty(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 2 Price (฿) (Opt)</label>
                      <input type="number" step="0.01" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier2Price} onChange={(e) => setTier2Price(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 3 Qty (Opt)</label>
                      <input type="number" min="1" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier3Qty} onChange={(e) => setTier3Qty(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...styles.formLabel, fontSize: '0.75rem' }}>Tier 3 Price (฿) (Opt)</label>
                      <input type="number" step="0.01" className="custom-input" style={{ fontSize: '0.85rem' }} value={tier3Price} onChange={(e) => setTier3Price(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Product Image</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {image && (
                    <div style={styles.imagePreviewContainer}>
                      <img src={image} alt="Preview" style={styles.imagePreview} />
                      <button 
                        type="button" 
                        onClick={() => setImage('')} 
                        style={styles.imageRemoveBtn}
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexGrow: 1 }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageFileChange} 
                      style={{ display: 'none' }}
                      id="product-image-file"
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <label 
                        htmlFor="product-image-file" 
                        className="btn btn-secondary" 
                        style={{ cursor: 'pointer', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                      >
                        Upload Image
                      </label>
                      <input 
                        type="text" 
                        className="custom-input"
                        style={{ flexGrow: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        placeholder="Or paste image URL..."
                        value={image.startsWith('data:') ? 'Local Image Loaded' : image}
                        disabled={image.startsWith('data:')}
                        onChange={(e) => setImage(e.target.value)}
                      />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Max size 2MB. Stored locally or synced in cloud.
                    </span>
                  </div>
                </div>
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
  imageContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  productCardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '64px',
    height: '64px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    background: 'rgba(239, 68, 68, 0.85)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  categoryBadge: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--accent)',
    letterSpacing: '0.05em',
  },
  barcodeBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
    letterSpacing: '0.02em',
    background: 'rgba(255, 255, 255, 0.04)',
    padding: '0.15rem 0.35rem',
    borderRadius: '4px',
    border: '1px solid var(--border-color)',
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

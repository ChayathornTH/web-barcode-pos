import { useState } from 'react';
import { Plus, Search, Trash2, Edit3, X, Barcode as BarcodeIcon, RotateCcw, AlertTriangle, Copy, Upload, Download, FileSpreadsheet, Clipboard, CheckCircle2 } from 'lucide-react';


const CATEGORIES = [
  "Stickers",
  "Acrylics",
  "Postcards",
  "Books",
  "Other"
];

const normalizeCategoryName = (cat) => {
  if (!cat) return 'Other';
  const c = cat.trim().toLowerCase();
  if (c === 'paintings' || c === 'painting' || c === 'acrylics' || c === 'acrylic' || c === 'art') return 'Acrylics';
  if (c === 'prints' || c === 'print' || c === 'postcards' || c === 'postcard') return 'Postcards';
  if (c === 'stickers' || c === 'sticker') return 'Stickers';
  if (c === 'books' || c === 'book' || c === 'stationery') return 'Books';
  return 'Other';
};

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
    case "Acrylics":
    case "Paintings":
      return '🎨';
    case "Postcards":
    case "Prints":
      return '🖼️';
    case "Stickers":
      return '✨';
    case "Books":
    case "Stationery":
      return '📓';
    case "Other":
    case "Accessories":
      return '📦';
    default:
      return '📦';
  }
};

export default function InventoryView({ products, onAddProduct, onUpdateProduct, onDeleteProduct, onSimulateScan, onResetInventory, onImportProducts }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Bulk Catalog Tool States
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState('import_file');
  const [pasteText, setPasteText] = useState('');
  const [parsedProducts, setParsedProducts] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [importMode, setImportMode] = useState('merge');
  const [dragActive, setDragActive] = useState(false);

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

  const [selectedArtist, setSelectedArtist] = useState('All');

  // Form State
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
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

  const handleDuplicateClick = (product) => {
    setEditingProduct(null); // Create a new product when saving
    
    // Auto generate standard-looking EAN-13 mock barcode
    const random12Digits = Array.from({length: 12}, () => Math.floor(Math.random() * 10)).join('');
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(random12Digits[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    setBarcode(random12Digits + checksum);

    setName(`${product.name} (Copy)`);
    setArtist(product.artist || '');
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
    const getPriceVal = (t) => {
      if (!t) return '';
      if (t.price !== undefined) return t.price.toString();
      if (t.discount !== undefined) return Math.max(0, product.price * t.quantity - t.discount).toString();
      return '';
    };
    setTier1Qty(tiers[0]?.quantity?.toString() || '1');
    setTier1Price(getPriceVal(tiers[0]) || product.price.toString());
    setTier2Qty(tiers[1]?.quantity?.toString() || '');
    setTier2Price(getPriceVal(tiers[1]));
    setTier3Qty(tiers[2]?.quantity?.toString() || '');
    setTier3Price(getPriceVal(tiers[2]));
    
    setFormError('');
    setIsModalOpen(true);
  };

  const handleParseText = (text) => {
    if (!text.trim()) {
      setParsedProducts([]);
      setParseErrors(['Input text is empty.']);
      return;
    }

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      setParsedProducts([]);
      setParseErrors(['No data rows found.']);
      return;
    }

    // Detect delimiter
    const headerLine = lines[0];
    let delimiter = ',';
    if (headerLine.includes('\t')) {
      delimiter = '\t';
    } else if (headerLine.includes(',')) {
      delimiter = ',';
    } else {
      delimiter = '\t';
    }

    const splitLine = (line, delim) => {
      if (delim === '\t') {
        return line.split('\t').map(val => val.trim().replace(/^["']|["']$/g, ''));
      }
      const result = [];
      let current = '';
      let insideQuote = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(val => val.trim().replace(/^["']|["']$/g, ''));
    };

    const rawHeaders = splitLine(headerLine, delimiter);
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const nameIndex = headers.indexOf('name');
    const priceIndex = headers.indexOf('price');

    if (nameIndex === -1 || priceIndex === -1) {
      setParsedProducts([]);
      setParseErrors([
        `Could not find required columns 'Name' and 'Price'. Detected headers: [${rawHeaders.join(', ')}].`,
        `Make sure your first row contains the column headers (e.g. Name, Price, Barcode, Stock, Category, Artist).`
      ]);
      return;
    }

    const tempProducts = [];
    const tempErrors = [];

    for (let i = 1; i < lines.length; i++) {
      const rowVals = splitLine(lines[i], delimiter);
      if (rowVals.length === 0 || (rowVals.length === 1 && !rowVals[0])) continue;

      const p = {};
      headers.forEach((header, idx) => {
        let val = rowVals[idx] || '';

        if (header === 'barcode') p.barcode = val;
        else if (header === 'name') p.name = val;
        else if (header === 'price') p.price = parseFloat(val);
        else if (header === 'category') p.category = normalizeCategoryName(val);
        else if (header === 'stock') p.stock = parseInt(val);
        else if (header === 'artist' || header === 'owner') p.artist = val;
        else if (header === 'emoji') p.emoji = val;
        else if (header === 'image') p.image = val;
        else if (header === 'description') p.description = val;
        else if (header === 'issetpriced') p.isSetPriced = val.toLowerCase() === 'true';
        else if (header === 'setgroupname') p.setGroupName = val;
      });

      const rowNum = i + 1;
      if (!p.name) {
        tempErrors.push(`Row ${rowNum}: Product name is missing.`);
        continue;
      }

      if (isNaN(p.price) || p.price < 0) {
        tempErrors.push(`Row ${rowNum} ("${p.name}"): Price is invalid or negative.`);
        continue;
      }

      if (isNaN(p.stock) || p.stock < 0) {
        p.stock = 0;
      }

      if (!p.barcode) {
        const random12Digits = Array.from({length: 12}, () => Math.floor(Math.random() * 10)).join('');
        let sum = 0;
        for (let k = 0; k < 12; k++) {
          sum += parseInt(random12Digits[k]) * (k % 2 === 0 ? 1 : 3);
        }
        const checksum = (10 - (sum % 10)) % 10;
        p.barcode = random12Digits + checksum;
      }

      if (!p.category) p.category = 'Other';
      if (!p.artist) p.artist = 'Unknown';
      if (!p.emoji) p.emoji = getEmojiForProduct(p.name, p.category);

      if (p.isSetPriced) {
        p.setTiers = [
          { quantity: 1, price: p.price, discount: 0 },
          { quantity: 3, price: p.price * 2.5, discount: Math.max(0, p.price * 3 - (p.price * 2.5)) },
          { quantity: 5, price: p.price * 4.0, discount: Math.max(0, p.price * 5 - (p.price * 4.0)) }
        ];
      }

      p.id = `prod-${p.barcode}-${Date.now() + i}`;
      tempProducts.push(p);
    }

    setParsedProducts(tempProducts);
    setParseErrors(tempErrors);
  };

  const handleCSVFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        handleParseText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        handleParseText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedProducts.length === 0) return;
    
    if (importMode === 'overwrite') {
      if (!window.confirm("WARNING: Overwrite Mode will delete ALL current products in this catalog before importing. Are you sure you want to proceed?")) {
        return;
      }
    }
    
    if (onImportProducts) {
      const success = await onImportProducts(parsedProducts, importMode === 'overwrite');
      if (success) {
        setIsBulkModalOpen(false);
        setParsedProducts([]);
        setParseErrors([]);
        setPasteText('');
      }
    }
  };

  const handleExportCSV = () => {
    const headers = ["Barcode", "Name", "Price", "Category", "Stock", "Artist", "Emoji", "Image", "Description", "IsSetPriced", "SetGroupName"];
    const rows = products.map(p => {
      return [
        p.barcode || '',
        `"${(p.name || '').replace(/"/g, '""')}"`,
        p.price,
        p.category || 'Other',
        p.stock || 0,
        `"${(p.artist || 'Unknown').replace(/"/g, '""')}"`,
        p.emoji || '📦',
        p.image || '',
        `"${(p.description || '').replace(/"/g, '""')}"`,
        p.isSetPriced ? 'TRUE' : 'FALSE',
        p.setGroupName || ''
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `products_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers = ["Barcode", "Name", "Price", "Category", "Stock", "Artist", "Emoji", "Image", "Description", "IsSetPriced", "SetGroupName"];
    const sampleRows = [
      ["8850125000114", "Cozy Coffee Shop Print", "15.00", "Prints", "25", "Bob", "☕", "", "Warm-toned illustration print", "FALSE", ""],
      ["3001", "Holographic Sticker Pack", "12.00", "Stickers", "50", "Charlie", "✨", "", "Waterproof die-cut stickers", "TRUE", "Stickers"]
    ].map(row => row.join(','));
    
    const csvContent = [headers.join(','), ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "products_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Edit click
  const handleEditClick = (product) => {
    setFormError('');
    setEditingProduct(product);
    setBarcode(product.barcode);
    setName(product.name);
    setArtist(product.artist || '');
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
    const getPriceVal = (t) => {
      if (!t) return '';
      if (t.price !== undefined) return t.price.toString();
      if (t.discount !== undefined) return Math.max(0, product.price * t.quantity - t.discount).toString();
      return '';
    };
    setTier1Qty(tiers[0]?.quantity?.toString() || '1');
    setTier1Price(getPriceVal(tiers[0]) || product.price.toString());
    setTier2Qty(tiers[1]?.quantity?.toString() || '');
    setTier2Price(getPriceVal(tiers[1]));
    setTier3Qty(tiers[2]?.quantity?.toString() || '');
    setTier3Price(getPriceVal(tiers[2]));
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
    setArtist('');
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
      setTier1Price(price || '10.00');
      setTier2Qty('');
      setTier2Price('');
      setTier3Qty('');
      setTier3Price('');
    } else if (val === '') {
      setSetGroupName('');
    } else {
      setSetGroupName(val);
      const tiers = availableGroups[val] || [];
      const basePrice = parseFloat(price) || 0;
      const getPriceVal = (t) => {
        if (!t) return '';
        if (t.price !== undefined) return t.price.toString();
        if (t.discount !== undefined) return Math.max(0, basePrice * t.quantity - t.discount).toString();
        return '';
      };
      setTier1Qty(tiers[0]?.quantity?.toString() || '1');
      setTier1Price(getPriceVal(tiers[0]) || basePrice.toString());
      setTier2Qty(tiers[1]?.quantity?.toString() || '');
      setTier2Price(getPriceVal(tiers[1]));
      setTier3Qty(tiers[2]?.quantity?.toString() || '');
      setTier3Price(getPriceVal(tiers[2]));
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

    if (isNaN(priceNum) || priceNum < 0) {
      setFormError("Price must be a valid number greater than or equal to 0.");
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
        const qty = parseInt(tier1Qty);
        const tPrice = parseFloat(tier1Price);
        const discount = Math.max(0, (priceNum * qty) - tPrice);
        setTiers.push({ quantity: qty, price: tPrice, discount });
      }
      if (tier2Qty && tier2Price) {
        const qty = parseInt(tier2Qty);
        const tPrice = parseFloat(tier2Price);
        const discount = Math.max(0, (priceNum * qty) - tPrice);
        setTiers.push({ quantity: qty, price: tPrice, discount });
      }
      if (tier3Qty && tier3Price) {
        const qty = parseInt(tier3Qty);
        const tPrice = parseFloat(tier3Price);
        const discount = Math.max(0, (priceNum * qty) - tPrice);
        setTiers.push({ quantity: qty, price: tPrice, discount });
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
        artist: artist.trim(),
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
        artist: artist.trim(),
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

  const uniqueArtists = Array.from(new Set(products.map(p => p.artist || 'Unknown').filter(Boolean))).sort();

  // Filter products and sort so items in the same group are next to each other
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.barcode.includes(searchTerm) || 
                          p.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesArtist = selectedArtist === 'All' || (p.artist || 'Unknown') === selectedArtist;
    return matchesSearch && matchesCategory && matchesArtist;
  }).sort((a, b) => {
    const aGroup = (a.isSetPriced && a.setGroupName) ? a.setGroupName.trim().toLowerCase() : '';
    const bGroup = (b.isSetPriced && b.setGroupName) ? b.setGroupName.trim().toLowerCase() : '';
    
    if (aGroup && bGroup) {
      if (aGroup !== bGroup) {
        return aGroup.localeCompare(bGroup);
      }
      return a.name.localeCompare(b.name);
    }
    if (aGroup) return -1;
    if (bGroup) return 1;
    
    // Sort ungrouped items by category then name
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
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
          <button className="btn btn-secondary" onClick={() => setIsBulkModalOpen(true)} title="Bulk Import / Export Products">
            <FileSpreadsheet size={16} /> Bulk Tools
          </button>
          <button className="btn btn-primary" onClick={handleAddClick}>
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* GitHub products.csv Sync Warning Banner */}
      <div className="glass-panel" style={{
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        color: 'var(--text-primary)',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.25rem'
      }}>
        <span style={{ fontSize: '1.2rem' }}>💡</span>
        <span>
          <strong>GitHub Ledger Sync:</strong> Your product catalog is loaded dynamically from <code>products.csv</code> in your GitHub repository. Update that spreadsheet file on GitHub to change items permanently for all cashiers.
        </span>
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
          <div style={styles.categorySelectWrapper}>
            <select 
              value={selectedArtist} 
              onChange={(e) => setSelectedArtist(e.target.value)}
              className="custom-input"
              style={styles.categorySelect}
            >
              <option value="All">All Artists</option>
              {uniqueArtists.map(art => (
                <option key={art} value={art}>{art}</option>
              ))}
            </select>
          </div>
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
                      }}>🏷️ {product.setGroupName || "Set"}</span>
                    )}
                  </div>
                  <h4 style={styles.productName}>{product.name}</h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginTop: '0.15rem' }}>
                    🎨 {product.artist || "Unknown"}
                  </div>
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
                    onClick={() => handleDuplicateClick(product)}
                    style={styles.actionBtn}
                    title="Duplicate Product (Clone)"
                  >
                    <Copy size={14} />
                  </button>
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
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete "${product.name}"?`)) {
                        onDeleteProduct(product.id);
                      }
                    }}
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

               <div style={styles.formRow}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
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
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.formLabel}>Artist / Owner *</label>
                  <input 
                    type="text" 
                    placeholder="E.g., Alice, Bob" 
                    className="custom-input"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    required
                  />
                </div>
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

      {/* Modal dialog for Bulk Tools */}
      {isBulkModalOpen && (
        <div style={styles.modalOverlay}>
          <div className="glass-panel" style={{ ...styles.modalContainer, maxWidth: '640px' }}>
            <div style={styles.modalHeader}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} color="var(--primary)" />
                <span>Bulk Catalog Tools</span>
              </h3>
              <button style={styles.closeBtn} onClick={() => {
                setIsBulkModalOpen(false);
                setParsedProducts([]);
                setParseErrors([]);
                setPasteText('');
              }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}>
              <button 
                type="button"
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: bulkTab === 'import_file' ? 'var(--bg-secondary)' : 'transparent',
                  color: bulkTab === 'import_file' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderBottom: bulkTab === 'import_file' ? '2px solid var(--primary)' : 'none',
                  transition: 'all 0.2s'
                }}
                onClick={() => { setBulkTab('import_file'); setParsedProducts([]); setParseErrors([]); }}
              >
                <Upload size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Import File (.csv)
              </button>
              <button 
                type="button"
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: bulkTab === 'paste' ? 'var(--bg-secondary)' : 'transparent',
                  color: bulkTab === 'paste' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderBottom: bulkTab === 'paste' ? '2px solid var(--primary)' : 'none',
                  transition: 'all 0.2s'
                }}
                onClick={() => { setBulkTab('paste'); setParsedProducts([]); setParseErrors([]); }}
              >
                <Clipboard size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Copy-Paste Sheets
              </button>
              <button 
                type="button"
                style={{
                  flex: 1,
                  padding: '1rem',
                  border: 'none',
                  background: bulkTab === 'export' ? 'var(--bg-secondary)' : 'transparent',
                  color: bulkTab === 'export' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderBottom: bulkTab === 'export' ? '2px solid var(--primary)' : 'none',
                  transition: 'all 0.2s'
                }}
                onClick={() => { setBulkTab('export'); setParsedProducts([]); setParseErrors([]); }}
              >
                <Download size={14} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Export Catalog
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {bulkTab === 'import_file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Upload or drag-and-drop a spreadsheet <code>.csv</code> file.
                  </p>
                  
                  <div 
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    style={{
                      border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border-color)'}`,
                      borderRadius: '8px',
                      padding: '2.5rem 1.5rem',
                      textAlign: 'center',
                      backgroundColor: dragActive ? 'rgba(139, 92, 246, 0.04)' : 'rgba(255, 255, 255, 0.01)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)'
                    }}
                    onClick={() => document.getElementById('bulk-csv-upload-input').click()}
                  >
                    <Upload size={32} color={dragActive ? 'var(--primary)' : 'var(--text-secondary)'} style={{ marginBottom: '0.75rem' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      {dragActive ? "Drop the file here!" : "Drag & Drop your CSV file"}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      or click to browse from computer
                    </div>
                    <input 
                      type="file" 
                      id="bulk-csv-upload-input" 
                      accept=".csv"
                      onChange={handleCSVFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} 
                      onClick={handleDownloadTemplate}
                    >
                      <Download size={12} /> Download CSV Template
                    </button>
                  </div>
                </div>
              )}

              {bulkTab === 'paste' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Copy cells from Excel or Google Sheets and paste them below. The first row <b>must</b> contain column headers (e.g. <code>Name</code>, <code>Price</code>, <code>Barcode</code>, <code>Stock</code>, <code>Artist</code>).
                  </p>
                  <textarea 
                    className="custom-input"
                    rows="6"
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem', width: '100%', resize: 'none' }}
                    placeholder="Barcode&#9;Name&#9;Price&#9;Category&#9;Stock&#9;Artist&#10;8850125&#9;Sticker A&#9;10.00&#9;Stickers&#9;50&#9;Alice&#10;8850126&#9;Print B&#9;40.00&#9;Prints&#9;10&#9;Bob"
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      handleParseText(e.target.value);
                    }}
                  />
                </div>
              )}

              {bulkTab === 'export' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center', padding: '2rem 1rem', textAlign: 'center' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                    marginBottom: '0.5rem'
                  }}>
                    <FileSpreadsheet size={32} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Backup / Edit in Excel</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '320px', margin: '0 auto' }}>
                      Export your entire inventory catalog to a standard CSV file, which you can edit in Google Sheets or Excel.
                    </p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={handleExportCSV} style={{ padding: '0.6rem 1.5rem' }}>
                    <Download size={16} /> Export Catalog (.csv)
                  </button>
                </div>
              )}

              {/* Parsed Results Preview */}
              {parsedProducts.length > 0 && (
                <div style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 0, 0, 0.15)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircle2 size={16} /> Ready to Import: {parsedProducts.length} Items
                    </span>
                  </div>
                  
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.5rem' }}>Name</th>
                          <th style={{ padding: '0.5rem' }}>Price</th>
                          <th style={{ padding: '0.5rem' }}>Stock</th>
                          <th style={{ padding: '0.5rem' }}>Artist</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedProducts.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.emoji} {p.name}</td>
                            <td style={{ padding: '0.5rem' }}>฿{p.price.toFixed(2)}</td>
                            <td style={{ padding: '0.5rem' }}>{p.stock}</td>
                            <td style={{ padding: '0.5rem', color: 'var(--primary)', fontWeight: 500 }}>{p.artist}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Parsing Errors list */}
              {parseErrors.length > 0 && (
                <div style={{
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.04)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={16} /> Data Validation Errors / Alerts
                  </span>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {parseErrors.map((err, idx) => (
                      <li key={idx} style={{ color: 'rgba(248, 113, 113, 0.9)' }}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confirm Actions */}
              {parsedProducts.length > 0 && (
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '1rem',
                  marginTop: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Import Mode:</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        value="merge" 
                        checked={importMode === 'merge'} 
                        onChange={() => setImportMode('merge')} 
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Merge (Add new & update existing barcodes)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="importMode" 
                        value="overwrite" 
                        checked={importMode === 'overwrite'} 
                        onChange={() => setImportMode('overwrite')} 
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: 'var(--danger)' }}>Overwrite (Replace entire catalog)</span>
                    </label>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => {
                        setParsedProducts([]);
                        setParseErrors([]);
                        setPasteText('');
                      }}
                    >
                      Clear
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleConfirmImport}>
                      Confirm Import
                    </button>
                  </div>
                </div>
              )}
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

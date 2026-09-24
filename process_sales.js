import fs from "fs";

// Read the sales data
const rawData = fs.readFileSync("boothsuay_sales.json", "utf8");
const sales = JSON.parse(rawData);

let totalRevenue = 0;
let totalDiscount = 0;
let totalItemsSold = 0;

const paymentMethods = {};
const productsSold = {};
const artistsSold = {};
const categoriesSold = {};
const transactionRows = [];
const itemRows = [];

// Helper to normalize dates to dd/mm/yyyy format (Christian Era)
function normalizeTimestamp(ts) {
  if (!ts) return "";
  const cleaned = ts.replace(",", "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return "";
  
  const datePart = parts[0];
  const timePart = parts[1] || "";
  
  const dateSplit = datePart.split("/");
  if (dateSplit.length !== 3) return ts; // fallback to original
  
  let day = parseInt(dateSplit[0], 10);
  let month = parseInt(dateSplit[1], 10);
  let year = parseInt(dateSplit[2], 10);
  
  // Normalize year from Buddhist Era to Christian Era if applicable
  if (year > 2500) {
    year = year - 543;
  }
  
  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);
  
  const formattedDate = `${dayStr}/${monthStr}/${yearStr}`;
  if (timePart) {
    return `${formattedDate} ${timePart}`;
  }
  return formattedDate;
}

// Helper to escape CSV fields
function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

sales.forEach((sale) => {
  const saleId = sale.id;
  const total = Number(sale.total) || 0;
  const subtotal = Number(sale.subtotal) || 0;
  const paymentMethod = sale.paymentMethod || "unknown";
  const timestamp = normalizeTimestamp(sale.timestamp || "");
  
  let discountAmount = 0;
  if (sale.discount && typeof sale.discount.amount === "number") {
    discountAmount += sale.discount.amount;
  }
  if (typeof sale.stickerDiscount === "number") {
    discountAmount += sale.stickerDiscount;
  }

  totalRevenue += total;
  totalDiscount += discountAmount;

  // Track payment methods
  paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + total;

  // Gather items
  const items = sale.items || [];
  const itemNames = [];

  items.forEach((item) => {
    const itemId = item.id || "unknown";
    const name = item.name || "Unnamed Product";
    const barcode = item.barcode || "";
    const category = item.category || "Others";
    const artist = item.artist || "Unknown";
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 1;
    const itemTotal = price * qty;

    totalItemsSold += qty;
    itemNames.push(`${name} (x${qty})`);

    // Track product sales
    if (!productsSold[itemId]) {
      productsSold[itemId] = {
        id: itemId,
        name: name,
        barcode: barcode,
        category: category,
        artist: artist,
        quantity: 0,
        revenue: 0
      };
    }
    productsSold[itemId].quantity += qty;
    productsSold[itemId].revenue += itemTotal;

    // Track artist sales
    if (!artistsSold[artist]) {
      artistsSold[artist] = {
        artist: artist,
        quantity: 0,
        revenue: 0
      };
    }
    artistsSold[artist].quantity += qty;
    artistsSold[artist].revenue += itemTotal;

    // Track category sales
    if (!categoriesSold[category]) {
      categoriesSold[category] = {
        category: category,
        quantity: 0,
        revenue: 0
      };
    }
    categoriesSold[category].quantity += qty;
    categoriesSold[category].revenue += itemTotal;

    // Item line row
    itemRows.push({
      transactionId: saleId,
      timestamp: timestamp,
      productId: itemId,
      productName: name,
      barcode: barcode,
      category: category,
      artist: artist,
      price: price,
      quantity: qty,
      total: itemTotal
    });
  });

  // Transaction row
  transactionRows.push({
    id: saleId,
    timestamp: timestamp,
    subtotal: subtotal,
    discount: discountAmount,
    total: total,
    paymentMethod: paymentMethod,
    itemsSummary: itemNames.join("; ")
  });
});

// Write Transactions CSV
const txHeaders = ["Transaction ID", "Timestamp", "Subtotal", "Discount", "Total", "Payment Method", "Items Summary"];
const txCsvContent = [
  txHeaders.join(","),
  ...transactionRows.map(row => [
    escapeCSV(row.id),
    escapeCSV(row.timestamp),
    row.subtotal,
    row.discount,
    row.total,
    escapeCSV(row.paymentMethod),
    escapeCSV(row.itemsSummary)
  ].join(","))
].join("\n");
fs.writeFileSync("boothsuay_transactions.csv", txCsvContent);

// Write Item Lines CSV
const itemHeaders = ["Transaction ID", "Timestamp", "Product ID", "Product Name", "Barcode", "Category", "Artist", "Unit Price", "Quantity", "Total Price"];
const itemCsvContent = [
  itemHeaders.join(","),
  ...itemRows.map(row => [
    escapeCSV(row.transactionId),
    escapeCSV(row.timestamp),
    escapeCSV(row.productId),
    escapeCSV(row.productName),
    escapeCSV(row.barcode),
    escapeCSV(row.category),
    escapeCSV(row.artist),
    row.price,
    row.quantity,
    row.total
  ].join(","))
].join("\n");
fs.writeFileSync("boothsuay_items_sold.csv", itemCsvContent);

// Write Products Summary CSV
const prodHeaders = ["Product ID", "Product Name", "Barcode", "Category", "Artist", "Quantity Sold", "Revenue"];
const prodCsvContent = [
  prodHeaders.join(","),
  ...Object.values(productsSold)
    .sort((a, b) => b.revenue - a.revenue)
    .map(row => [
      escapeCSV(row.id),
      escapeCSV(row.name),
      escapeCSV(row.barcode),
      escapeCSV(row.category),
      escapeCSV(row.artist),
      row.quantity,
      row.revenue
    ].join(","))
].join("\n");
fs.writeFileSync("boothsuay_sales_by_product.csv", prodCsvContent);

// Write Artists Summary CSV
const artistHeaders = ["Artist", "Quantity Sold", "Revenue"];
const artistCsvContent = [
  artistHeaders.join(","),
  ...Object.values(artistsSold)
    .sort((a, b) => b.revenue - a.revenue)
    .map(row => [
      escapeCSV(row.artist),
      row.quantity,
      row.revenue
    ].join(","))
].join("\n");
fs.writeFileSync("boothsuay_sales_by_artist.csv", artistCsvContent);

// Output console summary
console.log("=========================================");
console.log("SALES ANALYSIS REPORT - BOOTHSUAY");
console.log("=========================================");
console.log(`Total Sales Transactions: ${sales.length}`);
console.log(`Total Items Sold:         ${totalItemsSold}`);
console.log(`Total Gross Revenue:      THB ${totalRevenue.toFixed(2)}`);
console.log(`Total Discounts Given:    THB ${totalDiscount.toFixed(2)}`);
console.log("-----------------------------------------");
console.log("PAYMENT METHOD BREAKDOWN:");
Object.entries(paymentMethods).forEach(([method, amt]) => {
  console.log(`  - ${method}: THB ${amt.toFixed(2)}`);
});
console.log("=========================================");
console.log("CSV files generated successfully:");
console.log("1. boothsuay_transactions.csv");
console.log("2. boothsuay_items_sold.csv");
console.log("3. boothsuay_sales_by_product.csv");
console.log("4. boothsuay_sales_by_artist.csv");
console.log("=========================================");

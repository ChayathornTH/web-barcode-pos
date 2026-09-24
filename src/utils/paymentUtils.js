import QRCode from 'qrcode';

/**
 * Computes CRC16-CCITT checksum for PromptPay EMVCo payload
 * Polynomial: 0x1021, Initial: 0xFFFF
 */
function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates an official EMVCo-compliant Thai PromptPay QR payload string completely offline.
 * Works with:
 * - Mobile Phone (10 digits starting with 0 -> converted to 0066...)
 * - National ID / Tax ID (13 digits)
 * - e-Wallet ID (15 digits)
 * Supports dynamic amount (or static without amount).
 */
export function generatePromptPayPayload(target, amount) {
  const cleanTarget = (target || '').replace(/[^0-9]/g, '');
  if (!cleanTarget) return '';

  let subtag = '';
  if (cleanTarget.length === 10 && cleanTarget.startsWith('0')) {
    // Mobile number: international format e.g. 0066812345678
    const intl = '0066' + cleanTarget.substring(1);
    subtag = '01' + intl.length.toString().padStart(2, '0') + intl;
  } else if (cleanTarget.length === 13) {
    // National ID / Tax ID
    subtag = '0213' + cleanTarget;
  } else if (cleanTarget.length === 15) {
    // e-Wallet ID
    subtag = '0315' + cleanTarget;
  } else {
    // Fallback: strip leading 0s and treat as mobile
    const intl = '0066' + cleanTarget.replace(/^0+/, '');
    subtag = '01' + intl.length.toString().padStart(2, '0') + intl;
  }

  const aid = '0016A000000677010111';
  const tag29Value = aid + subtag;
  const tag29 = '29' + tag29Value.length.toString().padStart(2, '0') + tag29Value;

  let payload = '000201'; // Payload Format Indicator
  payload += (amount !== undefined && amount > 0) ? '010212' : '010211'; // Point of Initiation
  payload += tag29;
  payload += '5303764'; // Currency (764 = THB)

  if (amount !== undefined && amount > 0) {
    const amtStr = Number(amount).toFixed(2);
    payload += '54' + amtStr.length.toString().padStart(2, '0') + amtStr;
  }

  payload += '5802TH'; // Country Code (TH)
  payload += '6304'; // Checksum Tag & Length

  const checksum = crc16(payload);
  return payload + checksum;
}

/**
 * Generates an offline PromptPay QR Code as an image Data URL (100% offline, no internet required).
 */
export async function generatePromptPayQRDataUrl(target, amount, options = {}) {
  const payload = generatePromptPayPayload(target, amount);
  if (!payload) return '';
  return await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: options.width || 256,
    color: {
      dark: '#003a70', // Official PromptPay navy blue or black
      light: '#ffffff'
    }
  });
}

/**
 * Calculates quick change bill/coin denomination breakdown.
 * Helps cashiers count change instantly without mental math.
 */
export function calculateChangeBreakdown(changeAmount) {
  let remaining = Math.round(Number(changeAmount || 0));
  if (remaining <= 0) return [];

  const denominations = [
    { value: 1000, label: '฿1,000', name: 'bill', color: '#7c3aed' },
    { value: 500, label: '฿500', name: 'bill', color: '#9333ea' },
    { value: 100, label: '฿100', name: 'bill', color: '#dc2626' },
    { value: 50, label: '฿50', name: 'bill', color: '#2563eb' },
    { value: 20, label: '฿20', name: 'bill', color: '#16a34a' },
    { value: 10, label: '฿10', name: 'coin', color: '#ca8a04' },
    { value: 5, label: '฿5', name: 'coin', color: '#64748b' },
    { value: 2, label: '฿2', name: 'coin', color: '#d97706' },
    { value: 1, label: '฿1', name: 'coin', color: '#94a3b8' }
  ];

  const breakdown = [];
  for (const denom of denominations) {
    if (remaining >= denom.value) {
      const count = Math.floor(remaining / denom.value);
      remaining %= denom.value;
      breakdown.push({
        value: denom.value,
        count,
        label: denom.label,
        name: denom.name,
        color: denom.color
      });
    }
  }
  return breakdown;
}

/**
 * Generates smart quick-cash suggestion amounts based on the total due.
 */
export function getQuickCashSuggestions(total) {
  const t = Math.ceil(total);
  const suggestions = new Set();

  // 1. Exact amount
  suggestions.add(t);

  // 2. Next nearest rounded amounts (e.g. +10, +20, +50, +100)
  const round10 = Math.ceil(t / 10) * 10;
  if (round10 > t) suggestions.add(round10);

  const round20 = Math.ceil(t / 20) * 20;
  if (round20 > t) suggestions.add(round20);

  const round50 = Math.ceil(t / 50) * 50;
  if (round50 > t) suggestions.add(round50);

  const round100 = Math.ceil(t / 100) * 100;
  if (round100 > t) suggestions.add(round100);

  // 3. Standard bills
  const bills = [50, 100, 500, 1000];
  for (const b of bills) {
    if (b >= t) suggestions.add(b);
  }

  return Array.from(suggestions).sort((a, b) => a - b).slice(0, 6);
}

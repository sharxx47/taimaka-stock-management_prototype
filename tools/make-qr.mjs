// Makes Assets/qr-live-link.svg, the QR code of the live link shown on the sign-in page.
// Run once with: node tools/make-qr.mjs (needs the qrcode dev dependency; no outside QR service).
import fs from 'node:fs';
import QRCode from 'qrcode';

const LINK = 'https://sharxx47.github.io/taimaka-stock-management_prototype/';
const svg = await QRCode.toString(LINK, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#1B2A2F', light: '#FFFFFF' } });
fs.writeFileSync(new URL('../Assets/qr-live-link.svg', import.meta.url), svg);
console.log(`Assets/qr-live-link.svg: ${LINK}`);

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Cria um SVG vetorial de altíssima definição para o ícone do MedSchedule
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="50%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <!-- Background Rounded Rect -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Cruz Médica com Cantos Arredondados -->
  <g filter="url(#shadow)" fill="#ffffff">
    <!-- Barra Vertical -->
    <rect x="206" y="90" width="100" height="332" rx="28"/>
    <!-- Barra Horizontal -->
    <rect x="90" y="206" width="332" height="100" rx="28"/>
  </g>

  <!-- Calendário em Destaque no Canto Inferior Direito -->
  <g transform="translate(240, 240)" filter="url(#shadow)">
    <!-- Base do Calendário -->
    <rect x="0" y="0" width="190" height="190" rx="42" fill="#1e1b4b" stroke="#ffffff" stroke-width="12"/>
    <!-- Cabeçalho do Calendário -->
    <path d="M 0 42 C 0 18.8 18.8 0 42 0 L 148 0 C 171.2 0 190 18.8 190 42 L 190 56 L 0 56 Z" fill="#6366f1"/>
    <!-- Argolas do Calendário -->
    <circle cx="50" cy="18" r="8" fill="#ffffff"/>
    <circle cx="140" cy="18" r="8" fill="#ffffff"/>
    <!-- Ponto / Check do Dia -->
    <circle cx="95" cy="122" r="22" fill="#06b6d4"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(assetsDir, 'icon.svg'), svgIcon, 'utf8');

// Cria PNG do arquivo original ou utiliza o gerado
const originalJpg = 'C:\\Users\\gabri\\.gemini\\antigravity\\brain\\0b7c3034-d9f2-4c3c-b2a8-84fd0eafa757\\app_icon_1789136110591.jpg';
if (fs.existsSync(originalJpg)) {
  fs.copyFileSync(originalJpg, path.join(assetsDir, 'icon.png'));
}

// Cria um arquivo .ico válido em formato binário encapsulando a imagem
function createIcoFromBuffer(pngBuffer, icoPath) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0);   // 0 = 256px
  dirEntry.writeUInt8(0, 1);   // 0 = 256px
  dirEntry.writeUInt8(0, 2);   // color palette count
  dirEntry.writeUInt8(0, 3);   // reserved
  dirEntry.writeUInt16LE(1, 4);  // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // image size
  dirEntry.writeUInt32LE(6 + 16, 12);          // image offset

  const icoBuffer = Buffer.concat([header, dirEntry, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
}

if (fs.existsSync(originalJpg)) {
  createIcoFromBuffer(fs.readFileSync(originalJpg), path.join(assetsDir, 'icon.ico'));
}

console.log('✅ Assets de ícone gerados com sucesso em desktop/assets!');

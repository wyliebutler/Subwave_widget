const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Pure Node PNG + ICO generator (zero external dependencies)
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function blendPixel(buf, idx, r, g, b, a) {
  if (a <= 0) return;
  const srcA = clamp01(a);
  const dstA = buf[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  buf[idx] = Math.round((r * srcA + buf[idx] * dstA * (1 - srcA)) / outA);
  buf[idx + 1] = Math.round((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
  buf[idx + 2] = Math.round((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

function roundedRectSdf(px, py, cx, cy, hw, hh, radius) {
  const dx = Math.abs(px - cx) - (hw - radius);
  const dy = Math.abs(py - cy) - (hh - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function renderRadioIcon(size, opts = {}) {
  const { live = false, tray = false } = opts;
  const buf = Buffer.alloc(size * size * 4, 0);
  const aa = 1.15;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const pad = tray ? size * 0.04 : size * 0.07;
      const half = size / 2 - pad;
      const rad = size * 0.23;
      const dBox = roundedRectSdf(x, y, cx, cy, half, half, rad);
      const boxAlpha = 1 - smoothstep(-aa * 0.5, aa * 0.5, dBox);

      if (boxAlpha > 0) {
        const gy = (y - pad) / (size - pad * 2);
        const bgR = Math.round(30 - gy * 10);
        const bgG = Math.round(25 - gy * 9);
        const bgB = Math.round(22 - gy * 8);
        blendPixel(buf, idx, bgR, bgG, bgB, boxAlpha);

        const rimAlpha =
          (1 - smoothstep(0, aa * 1.2, Math.abs(dBox + size * 0.02))) * 0.45 * boxAlpha;
        blendPixel(buf, idx, 197, 160, 89, rimAlpha);
      }

      const dist = Math.hypot(x - cx, y - cy);
      const rOuter = size * (tray ? 0.36 : 0.34);
      const discAlpha = (1 - smoothstep(rOuter - aa * 0.6, rOuter + aa * 0.6, dist)) * boxAlpha;
      if (discAlpha > 0) {
        blendPixel(buf, idx, 14, 12, 11, discAlpha * 0.95);

        const g1 = 1 - smoothstep(0, aa * 0.85, Math.abs(dist - rOuter * 0.78));
        const g2 = 1 - smoothstep(0, aa * 0.85, Math.abs(dist - rOuter * 0.58));
        blendPixel(buf, idx, 229, 217, 192, (g1 * 0.16 + g2 * 0.14) * discAlpha);
      }

      const rLabel = size * (tray ? 0.16 : 0.145);
      const labelAlpha = (1 - smoothstep(rLabel - aa * 0.6, rLabel + aa * 0.6, dist)) * boxAlpha;
      if (labelAlpha > 0) {
        if (live) {
          blendPixel(buf, idx, 235, 78, 52, labelAlpha);
        } else {
          blendPixel(buf, idx, 197, 160, 89, labelAlpha);
        }
      }

      const rHole = Math.max(1.1, size * 0.038);
      const holeAlpha = (1 - smoothstep(rHole - aa * 0.5, rHole + aa * 0.5, dist)) * boxAlpha;
      if (holeAlpha > 0) {
        blendPixel(buf, idx, 20, 17, 15, holeAlpha);
      }

      if (live) {
        const dotX = cx + half * 0.58;
        const dotY = cy - half * 0.58;
        const dotR = Math.max(1.8, size * (tray ? 0.14 : 0.085));
        const dDot = Math.hypot(x - dotX, y - dotY);
        const glow = (1 - smoothstep(dotR * 0.6, dotR * 2.1, dDot)) * 0.35;
        blendPixel(buf, idx, 255, 110, 64, glow);
        const dotAlpha = 1 - smoothstep(dotR - aa * 0.5, dotR + aa * 0.5, dDot);
        blendPixel(buf, idx, 255, 92, 53, dotAlpha);
      }
    }
  }

  return encodePng(size, size, buf);
}

// Monochrome black + alpha template icon for macOS Menu Bar (auto-tints for light/dark menu bars)
function renderMacTemplateIcon(size, live = false) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const aa = 0.95;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);

      // Outer vinyl ring stroke
      const rOuter = size * 0.39;
      const ringHalfStroke = Math.max(0.85, size * 0.055);
      const outerRingAlpha = 1 - smoothstep(ringHalfStroke - aa * 0.5, ringHalfStroke + aa * 0.5, Math.abs(dist - rOuter));

      // Center label solid dot with spindle cutout
      const rInner = size * 0.15;
      const rSpindle = Math.max(0.9, size * 0.048);
      const innerDot =
        (1 - smoothstep(rInner - aa * 0.5, rInner + aa * 0.5, dist)) *
        smoothstep(rSpindle - aa * 0.4, rSpindle + aa * 0.4, dist);

      let alpha = Math.max(outerRingAlpha * 0.9, innerDot);

      // Live broadcast dot in top-right when streaming
      if (live) {
        const dotX = cx + size * 0.32;
        const dotY = cy - size * 0.32;
        const dotR = Math.max(1.4, size * 0.12);
        const dDot = Math.hypot(x - dotX, y - dotY);
        const clearHalo = 1 - smoothstep(dotR + size * 0.04, dotR + size * 0.09, dDot);
        alpha = alpha * (1 - clearHalo);
        const dotAlpha = 1 - smoothstep(dotR - aa * 0.45, dotR + aa * 0.45, dDot);
        alpha = Math.max(alpha, dotAlpha);
      }

      if (alpha > 0.01) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = Math.round(clamp01(alpha) * 255);
      }
    }
  }

  return encodePng(size, size, buf);
}

function buildIco(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const buffers = [header];

  pngEntries.forEach(({ size, png }, i) => {
    const base = 6 + i * 16;
    header[base] = size >= 256 ? 0 : size;
    header[base + 1] = size >= 256 ? 0 : size;
    header[base + 2] = 0;
    header[base + 3] = 0;
    header.writeUInt16LE(1, base + 4);
    header.writeUInt16LE(32, base + 6);
    header.writeUInt32LE(png.length, base + 8);
    header.writeUInt32LE(offset, base + 12);
    offset += png.length;
    buffers.push(png);
  });

  return Buffer.concat(buffers);
}

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// Windows multi-size .ico
const sizes = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = sizes.map((size) => ({
  size,
  png: renderRadioIcon(size, { live: false, tray: size <= 32 }),
}));
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), buildIco(icoEntries));

// 512x512 master PNG (used by electron-builder to generate macOS .icns automatically)
fs.writeFileSync(path.join(assetsDir, 'icon.png'), renderRadioIcon(512, { live: false }));

// Windows tray icons
fs.writeFileSync(path.join(assetsDir, 'tray-idle.png'), renderRadioIcon(32, { live: false, tray: true }));
fs.writeFileSync(path.join(assetsDir, 'tray-playing.png'), renderRadioIcon(32, { live: true, tray: true }));

// macOS Retina Menu Bar template icons (18pt @1x and 36px @2x)
fs.writeFileSync(path.join(assetsDir, 'trayMacTemplate.png'), renderMacTemplateIcon(18, false));
fs.writeFileSync(path.join(assetsDir, 'trayMacTemplate@2x.png'), renderMacTemplateIcon(36, false));
fs.writeFileSync(path.join(assetsDir, 'trayMacLiveTemplate.png'), renderMacTemplateIcon(18, true));
fs.writeFileSync(path.join(assetsDir, 'trayMacLiveTemplate@2x.png'), renderMacTemplateIcon(36, true));

console.log('Generated Windows (.ico + tray PNGs), 512px icon.png, and macOS Menu Bar Template icons.');

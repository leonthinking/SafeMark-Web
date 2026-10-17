export const LIMITS = Object.freeze({ bytes: 25 * 1024 * 1024, pixels: 24_000_000, edge: 8192 });
export const DEFAULTS = Object.freeze({ text: '仅供办理业务使用，他用无效', size: 3.2, opacity: 45, angle: -30, spacing: 3, mode: 'repeat', color: '#ffffff', position: 'center' });

export function validateDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('图片尺寸无效，请换一张图片。');
  if (width > LIMITS.edge || height > LIMITS.edge || width * height > LIMITS.pixels) throw new Error('图片过大：请先缩小到 2400 万像素以内，且最长边不超过 8192 px。');
}

// Inspect raster headers before asking the browser to allocate a decoded bitmap.
export function inspectRaster(buffer) {
  const b = new Uint8Array(buffer), v = new DataView(buffer);
  const ascii = (offset, n) => String.fromCharCode(...b.subarray(offset, offset + n));
  let width, height, type;
  if (b.length >= 24 && b[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    type = 'image/png'; width = v.getUint32(16); height = v.getUint32(20);
  } else if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    type = 'image/webp'; const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      if (b[20] & 2) throw new Error('暂不支持动画图片，请使用静态 JPG、PNG 或 WebP。');
      width = 1 + b[24] + (b[25] << 8) + (b[26] << 16); height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    } else if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff;
    } else if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = v.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  } else if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    type = 'image/jpeg'; let offset = 2;
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 0xff) break;
      while (b[offset] === 0xff) offset++;
      const marker = b[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > b.length) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > b.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!width || !height || !type) throw new Error('无法读取这张图片。请选择有效的 JPG、PNG 或 WebP；HEIC 和 SVG 暂不支持。');
  validateDimensions(width, height);
  return { width, height, type };
}

export function outputName(name, type) {
  const stem = name.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 70).trim() || 'image';
  return `${stem}-safemark.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
}

export function fontPixels(width, height, percentage) { return Math.max(12, Math.min(width, height) * percentage / 100); }
// Bound the temporary pattern to at most 2048² pixels, including pathological
// multiline text. A pattern transform restores the intended source-pixel size.
export function tileResolution(width, height, previewScale = 1) {
  const scale = Math.min(1, previewScale, 2048 / width, 2048 / height);
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)), scale };
}
function linesFor(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}

export function render(canvas, image, width, height, settings, { maxEdge = Infinity, original = false, jpeg = false } = {}) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建绘图区域，请缩小图片后重试。');
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  if (jpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(image, 0, 0, width, height);
  if (original || !settings.text.trim()) return;
  const size = fontPixels(width, height, settings.size);
  const font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.font = font;
  const lines = linesFor(ctx, settings.text.trim(), Math.max(size * 2, width * (settings.mode === 'single' ? .7 : .5)));
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width), size);
  const textHeight = lines.length * size * 1.45;
  ctx.save(); ctx.globalAlpha = settings.opacity / 100;
  const y = settings.mode === 'single' ? ({ top: .23, center: .5, bottom: .77 }[settings.position] ?? .5) * height : height / 2;
  ctx.translate(width / 2, y); ctx.rotate(settings.angle * Math.PI / 180);
  if (settings.mode === 'repeat') {
    const tile = document.createElement('canvas');
    const logicalWidth = Math.ceil(textWidth + size * settings.spacing), logicalHeight = Math.ceil(textHeight + size * settings.spacing);
    const resolution = tileResolution(logicalWidth, logicalHeight, scale);
    tile.width = resolution.width; tile.height = resolution.height;
    const sx = tile.width / logicalWidth, sy = tile.height / logicalHeight;
    const tc = tile.getContext('2d'); tc.scale(sx, sy); tc.font = font; tc.fillStyle = settings.color; tc.textAlign = 'center'; tc.textBaseline = 'middle';
    lines.forEach((line, i) => tc.fillText(line, logicalWidth / 2, logicalHeight / 2 + (i - (lines.length - 1) / 2) * size * 1.45));
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) throw new Error('无法生成水印，请换一张图片后重试。');
    pattern.setTransform(new DOMMatrix().scale(1 / sx, 1 / sy));
    ctx.fillStyle = pattern; const diagonal = Math.hypot(width, height);
    ctx.fillRect(-diagonal, -diagonal, diagonal * 2, diagonal * 2);
    tile.width = tile.height = 1;
  } else {
    ctx.font = font; ctx.fillStyle = settings.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.45));
  }
  ctx.restore();
}

export function makeDemo() {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8dfcc'; ctx.fillRect(0, 0, 1600, 1000);
  ctx.fillStyle = '#eee8cd'; ctx.beginPath(); ctx.arc(1170, 300, 125, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a2b29b'; ctx.beginPath(); ctx.moveTo(0, 700); ctx.lineTo(0, 580); ctx.lineTo(280, 290); ctx.lineTo(700, 760); ctx.lineTo(1150, 480); ctx.lineTo(1600, 680); ctx.lineTo(1600, 1000); ctx.lineTo(0, 1000); ctx.fill();
  ctx.fillStyle = '#6e8f7c'; ctx.beginPath(); ctx.moveTo(0, 820); ctx.lineTo(500, 530); ctx.lineTo(980, 810); ctx.lineTo(1400, 630); ctx.lineTo(1600, 720); ctx.lineTo(1600, 1000); ctx.lineTo(0, 1000); ctx.fill();
  ctx.fillStyle = '#3e6959'; ctx.beginPath(); ctx.moveTo(0, 900); ctx.bezierCurveTo(550, 710, 850, 1100, 1600, 840); ctx.lineTo(1600, 1000); ctx.lineTo(0, 1000); ctx.fill();
  ctx.fillStyle = '#294a3d'; ctx.font = '500 23px sans-serif'; ctx.fillText('A MOMENT TO KEEP', 90, 110);
  ctx.font = '500 60px sans-serif'; ctx.fillText('山间来信', 85, 190);
  ctx.font = '24px sans-serif'; ctx.fillText('SafeMark · 本地生成的示例插画', 90, 240);
  return c;
}

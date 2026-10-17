import { test, expect } from '@playwright/test';

async function fixture(page, type = 'image/png', width = 800, height = 600, transparent = false) {
  const bytes = await page.evaluate(({type,width,height,transparent}) => {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d'); if (!transparent) { ctx.fillStyle = '#426457'; ctx.fillRect(0,0,width,height); }
    ctx.fillStyle = '#e3d3a1'; ctx.fillRect(width/4,height/4,width/2,height/2);
    return [...Uint8Array.from(atob(c.toDataURL(type).split(',')[1]), x => x.charCodeAt(0))];
  }, {type,width,height,transparent});
  return Buffer.from(bytes);
}
async function upload(page, buffer, name = 'test.png', mimeType = 'image/png') {
  await page.locator('#file').setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('#status')).toContainText('图片已在本地载入');
}
async function downloadBytes(page) {
  const pending = page.waitForEvent('download'); await page.locator('#download').click();
  const dl = await pending; const stream = await dl.createReadStream(); const parts = [];
  for await (const b of stream) parts.push(b);
  return { bytes: Buffer.concat(parts), name: dl.suggestedFilename() };
}
async function decode(page, bytes) {
  return page.evaluate(async data => {
    const blob = new Blob([new Uint8Array(data)]), url = URL.createObjectURL(blob);
    const image = new Image(); image.src = url; await image.decode();
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(image,0,0); URL.revokeObjectURL(url);
    return { width:c.width, height:c.height, corner:[...ctx.getImageData(0,0,1,1).data], pixels:[...ctx.getImageData(0,0,c.width,c.height).data] };
  }, [...bytes]);
}
test('local-only edit, PNG/JPEG export, no outgoing requests or storage', async ({page,context}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#preview')).toBeVisible();
  const requests = []; page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  const input = await fixture(page,'image/png',800,600,true);
  await upload(page,input,'my-private-photo.png');
  await page.locator('#watermark-text').fill('ONLY FOR TEST');
  await page.locator('input[value=single]').check(); await page.locator('#angle').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input')); });
  await page.locator('#opacity').evaluate(el => { el.value = '100'; el.dispatchEvent(new Event('input')); });
  const png = await downloadBytes(page); expect(png.name).toBe('my-private-photo-safemark.png');
  const result = await decode(page,png.bytes); expect([result.width,result.height]).toEqual([800,600]); expect(result.corner[3]).toBe(0);
  const original = await decode(page,input); expect(result.pixels).not.toEqual(original.pixels);
  await page.locator('#format').selectOption('image/jpeg');
  const corner = () => page.locator('#preview').evaluate(c => [...c.getContext('2d').getImageData(0,0,1,1).data]);
  await expect.poll(corner).toEqual([255,255,255,255]);
  await page.locator('#compare').click(); await expect.poll(corner).toEqual([0,0,0,0]);
  await page.locator('#compare').click(); await expect.poll(corner).toEqual([255,255,255,255]);
  const jpg = await downloadBytes(page); expect(jpg.bytes[0]).toBe(0xff); expect(jpg.bytes[1]).toBe(0xd8);
  const opaque = await decode(page,jpg.bytes); expect(opaque.corner).toEqual([255,255,255,255]);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({local:localStorage.length,session:sessionStorage.length,cookie:document.cookie}))).toEqual({local:0,session:0,cookie:''});
  await context.setOffline(false); await page.reload(); await expect(page.locator('#sample-tag')).toBeVisible();
  await expect(page.locator('#watermark-text')).not.toHaveValue('ONLY FOR TEST');
});
test('modes, compare, reset, empty text, invalid input, replacement and privacy dialog', async ({page}) => {
  await page.goto('/'); await page.waitForLoadState('networkidle'); const input = await fixture(page);
  const requests = []; page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await upload(page,input);
  const snapshot = () => page.locator('#preview').evaluate(async c => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(c.toDataURL())))].map(b => b.toString(16).padStart(2,'0')).join(''); });
  const watermarked = await snapshot(); await page.locator('#compare').click();
  await expect(page.locator('#compare')).toHaveAttribute('aria-pressed','true');
  await expect.poll(snapshot).not.toEqual(watermarked);
  await page.locator('#compare').click(); await expect.poll(snapshot).toEqual(watermarked);
  await page.locator('#watermark-text').fill(''); await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#reset').click(); await expect(page.locator('#download')).toBeEnabled();
  await expect.poll(snapshot).toEqual(watermarked);
  const before = await snapshot();
  await page.locator('#file').setInputFiles({name:'evil.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});
  await expect(page.locator('#status')).toHaveClass('status-line error'); expect(await snapshot()).toBe(before);
  await upload(page,await fixture(page,'image/webp',320,240),'test.webp','image/webp');
  await expect(page.locator('#file-info')).toContainText('320 × 240');
  await page.locator('#clear').click(); await expect(page.locator('#sample-tag')).toBeVisible(); await expect(page.locator('#clear')).toBeDisabled();
  await page.locator('#privacy-open').click(); await expect(page.locator('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).not.toBeVisible();
  expect(requests).toEqual([]);
});
test('mobile layout remains within viewport and can export a file', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await upload(page,await fixture(page,'image/jpeg',600,800),'portrait.jpg','image/jpeg');
  const exported = await downloadBytes(page); const result = await decode(page,exported.bytes);
  expect([result.width,result.height]).toEqual([600,800]);
  await page.screenshot({path:`test-results/mobile-${test.info().project.name}.png`,fullPage:true});
});

test('phone JPEG orientation, oversize headers and drag-and-drop', async ({page}) => {
  await page.goto('/');
  const jpeg = await fixture(page,'image/jpeg',800,600);
  // EXIF orientation 6, as on portrait phone photos (rotate 90 degrees clockwise).
  const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  const rotated = Buffer.concat([jpeg.subarray(0,2),exif,jpeg.subarray(2)]);
  await upload(page,rotated,'phone.jpg','image/jpeg');
  await expect(page.locator('#file-info')).toContainText('600 × 800');
  const output = await downloadBytes(page); const image = await decode(page,output.bytes);
  expect([image.width,image.height]).toEqual([600,800]);
  const oversized = Buffer.alloc(24); oversized.set([137,80,78,71]); oversized.write('IHDR',12); oversized.writeUInt32BE(100000,16); oversized.writeUInt32BE(100000,20);
  await page.locator('#file').setInputFiles({name:'huge.png',mimeType:'image/png',buffer:oversized});
  await expect(page.locator('#status')).toContainText('图片过大');
  await expect(page.locator('#file-info')).toContainText('600 × 800');
  const png = await fixture(page,'image/png',400,300);
  await page.locator('#drop-zone').evaluate((zone,bytes) => {
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)],'dropped.png',{type:'image/png'}));
    zone.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));
  },[...png]);
  await expect(page.locator('#status')).toContainText('图片已在本地载入');
  await expect(page.locator('#file-name')).toHaveText('dropped.png');
});

test('bounded multiline rendering and no image removal during export', async ({page}) => {
  await page.goto('/');
  const tileData = await page.evaluate(async () => {
    const {render,DEFAULTS} = await import('/watermark.js');
    const image = document.createElement('canvas'); image.width = image.height = 1;
    const target = document.createElement('canvas'), sizes = [], periods = [];
    const original = CanvasRenderingContext2D.prototype.createPattern;
    CanvasRenderingContext2D.prototype.createPattern = function(image,...args) {
      const dims = [image.width,image.height]; sizes.push(dims);
      const pattern = original.call(this,image,...args), transform = pattern.setTransform.bind(pattern);
      pattern.setTransform = matrix => { periods.push([dims[0]*matrix.a,dims[1]*matrix.d]); transform(matrix); };
      return pattern;
    };
    try {
      render(target,image,6000,4000,{...DEFAULTS,size:10,text:'A\n'.repeat(60)},{maxEdge:1600});
      render(target,image,6000,4000,{...DEFAULTS,text:'A'},{maxEdge:1600});
      render(target,image,6000,4000,{...DEFAULTS,text:'A'},{maxEdge:1200});
    }
    finally { CanvasRenderingContext2D.prototype.createPattern = original; }
    return {sizes,periods};
  });
  expect(tileData.sizes.length).toBe(3);
  for (const size of tileData.sizes) { expect(size[0]).toBeLessThanOrEqual(2048); expect(size[1]).toBeLessThanOrEqual(2048); }
  // Chromium may store DOMMatrix components as float32; allow subpixel rounding.
  expect(tileData.periods[1][0]).toBeCloseTo(tileData.periods[2][0],3);
  expect(tileData.periods[1][1]).toBeCloseTo(tileData.periods[2][1],3);
  await upload(page,await fixture(page));
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback,...args) { original.call(this,blob => setTimeout(() => callback(blob),1000),...args); };
  });
  const pending = page.waitForEvent('download'); await page.locator('#download').click();
  await expect(page.locator('#clear')).toBeDisabled(); await expect(page.locator('#choose')).toBeDisabled();
  await pending; await expect(page.locator('#clear')).toBeEnabled();
});

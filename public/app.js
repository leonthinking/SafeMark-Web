import { DEFAULTS, LIMITS, inspectRaster, validateDimensions, fontPixels, outputName, render, makeDemo } from './watermark.js';
const $ = id => document.getElementById(id);
const demo = makeDemo();
let source = { image: demo, width: demo.width, height: demo.height, name: 'safemark-demo', demo: true, url: null };
let settings = { ...DEFAULTS }, generation = 0, loading = false, exporting = false, comparing = false, frame = 0;
const downloadURLs = new Map();

function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function controls() {
  $('download').disabled = loading || exporting || !settings.text.trim();
  $('download').textContent = exporting ? '正在本地生成…' : '↓ 下载水印图片';
  $('choose').disabled = exporting;
  $('choose').textContent = loading ? '正在读取…' : source.demo ? '＋ 选择你的图片' : '＋ 更换图片';
  $('clear').disabled = exporting || (source.demo && !loading);
  $('text-count').textContent = `${$('watermark-text').value.length} / 120`;
  $('size-value').textContent = `${Math.round(fontPixels(source.width, source.height, settings.size))} px`;
  $('opacity-value').textContent = `${settings.opacity}%`;
  $('angle-value').textContent = `${settings.angle}°`;
  $('spacing-value').textContent = `${settings.spacing} ×`;
  $('spacing-row').hidden = settings.mode !== 'repeat'; $('position-row').hidden = settings.mode !== 'single';
  $('export-hint').textContent = !settings.text.trim() ? '请先输入水印文字。' : source.demo ? '下载内置示例，或选择你的图片开始。' : '图片在本地生成，不会上传。';
}
function paint() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    try { render($('preview'), source.image, source.width, source.height, settings, { maxEdge: 1600, original: comparing, jpeg: !comparing && $('format').value === 'image/jpeg' }); }
    catch (error) { status(error.message, true); }
  });
  controls();
}
function leaveCompare() { comparing = false; $('compare').setAttribute('aria-pressed', 'false'); $('compare').textContent = '◐ 查看原图'; }
function describe() {
  $('sample-tag').hidden = !source.demo;
  $('file-name').textContent = source.demo ? '山间来信 · 示例图片' : source.name;
  $('file-info').textContent = `${source.width} × ${source.height} px${source.bytes ? ` · ${(source.bytes / 1024 / 1024).toFixed(2)} MB` : ''}`;
  leaveCompare(); paint();
}
function dispose(old) { if (old.url) URL.revokeObjectURL(old.url); }
async function loadFile(file) {
  if (!file || exporting) return;
  const ticket = ++generation; loading = true; controls(); status('正在浏览器中读取图片…');
  let url;
  try {
    if (file.size > LIMITS.bytes) throw new Error('文件超过 25 MB，请缩小后重试。');
    const buffer = await file.arrayBuffer();
    if (ticket !== generation) return;
    const { type } = inspectRaster(buffer);
    // Use the verified raster type, never a supplied MIME type or remote URL.
    url = URL.createObjectURL(new Blob([buffer], { type }));
    const image = new Image(); image.src = url; await image.decode();
    if (ticket !== generation) return;
    validateDimensions(image.naturalWidth, image.naturalHeight);
    const old = source;
    source = { image, width: image.naturalWidth, height: image.naturalHeight, name: file.name, bytes: file.size, demo: false, url };
    url = null; dispose(old); describe(); status('图片已在本地载入，可以开始编辑。');
  } catch (error) {
    if (ticket === generation) status(error.message.includes('decode') || error.name === 'EncodingError' ? '图片无法解码，文件可能损坏。请换一张图片。' : error.message, true);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (ticket === generation) { loading = false; controls(); }
  }
}
$('choose').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => { loadFile(event.target.files[0]); event.target.value = ''; });
$('clear').addEventListener('click', () => { ++generation; loading = false; dispose(source); source = { image: demo, width: demo.width, height: demo.height, name: 'safemark-demo', demo: true }; describe(); status('已移除你的图片，恢复内置示例。'); });
let dragDepth = 0;
for (const name of ['dragenter', 'dragover', 'dragleave', 'drop']) window.addEventListener(name, event => event.preventDefault());
$('drop-zone').addEventListener('dragenter', () => { dragDepth++; $('drop-hint').hidden = false; });
$('drop-zone').addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-hint').hidden = true; } });
window.addEventListener('drop', event => { dragDepth = 0; $('drop-hint').hidden = true; if (event.dataTransfer.files.length > 1) status('一次处理一张图片，请只选择一个文件。', true); else loadFile(event.dataTransfer.files[0]); });
$('watermark-text').addEventListener('input', event => { settings.text = event.target.value.slice(0, 120); leaveCompare(); paint(); });
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { settings.text = button.dataset.preset; $('watermark-text').value = settings.text; leaveCompare(); paint(); }));
for (const key of ['size','opacity','angle','spacing']) $(key).addEventListener('input', event => { settings[key] = Number(event.target.value); leaveCompare(); paint(); });
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', () => { settings.mode = input.value; leaveCompare(); paint(); }));
document.querySelectorAll('input[name=color]').forEach(input => input.addEventListener('change', () => { settings.color = input.value; $('custom-color').value = settings.color; leaveCompare(); paint(); }));
$('custom-color').addEventListener('input', event => { settings.color = event.target.value; document.querySelectorAll('input[name=color]').forEach(input => { input.checked = input.value === settings.color; }); leaveCompare(); paint(); });
$('position').addEventListener('change', event => { settings.position = event.target.value; leaveCompare(); paint(); });
$('format').addEventListener('change', () => { leaveCompare(); paint(); });
$('compare').addEventListener('click', () => { comparing = !comparing; $('compare').setAttribute('aria-pressed', String(comparing)); $('compare').textContent = comparing ? '◐ 返回水印预览' : '◐ 查看原图'; paint(); });
$('reset').addEventListener('click', () => {
  settings = { ...DEFAULTS }; $('watermark-text').value = settings.text;
  for (const key of ['size','opacity','angle','spacing','position']) $(key).value = settings[key];
  document.querySelectorAll('input[name=mode]').forEach(input => { input.checked = input.value === settings.mode; });
  document.querySelectorAll('input[name=color]').forEach(input => { input.checked = input.value === settings.color; });
  $('custom-color').value = settings.color; leaveCompare(); paint(); status('水印设置已恢复默认。');
});
function releaseDownload(url) { const timer = downloadURLs.get(url); if (timer) clearTimeout(timer); URL.revokeObjectURL(url); downloadURLs.delete(url); }
$('download').addEventListener('click', async () => {
  if (loading || exporting || !settings.text.trim()) return;
  exporting = true; controls(); status('正在本地生成原尺寸图片…');
  const snapshot = { ...settings }, image = source, type = $('format').value;
  const canvas = document.createElement('canvas');
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    render(canvas, image.image, image.width, image.height, snapshot, { jpeg: type === 'image/jpeg' });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, .92));
    if (!blob || !blob.size) throw new Error('浏览器内存不足，无法导出。请缩小图片后再试。');
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = outputName(image.name, type); document.body.append(a); a.click(); a.remove();
    downloadURLs.set(url, setTimeout(() => releaseDownload(url), 60_000));
    status('已生成水印图片，请在浏览器的下载中查看。手机上可打开下载文件，再保存到照片。');
  } catch (error) { status(error.message || '导出失败，请缩小图片后重试。', true); }
  finally { canvas.width = canvas.height = 1; exporting = false; controls(); }
});
$('privacy-open').addEventListener('click', () => $('privacy').showModal());
$('privacy-close').addEventListener('click', () => $('privacy').close());
$('privacy').addEventListener('click', event => { if (event.target === $('privacy')) { const r = $('privacy').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('privacy').close(); } });
window.addEventListener('pagehide', () => { ++generation; dispose(source); for (const url of downloadURLs.keys()) releaseDownload(url); });
describe();

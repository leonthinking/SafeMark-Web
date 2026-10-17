import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRaster, validateDimensions, outputName, LIMITS, tileResolution } from '../public/watermark.js';
test('reject oversized dimensions before decoding', () => {
  assert.throws(() => validateDimensions(8193, 10), /8192/);
  assert.throws(() => validateDimensions(6000, 5000), /2400/);
  assert.throws(() => validateDimensions(0, 100), /尺寸/);
  assert.doesNotThrow(() => validateDimensions(6000, 4000));
  const b = new Uint8Array(24); b.set([137,80,78,71]); b.set([73,72,68,82],12);
  new DataView(b.buffer).setUint32(16, 200000); new DataView(b.buffer).setUint32(20, 200000);
  assert.throws(() => inspectRaster(b.buffer), /图片过大/);
});
test('reject unsupported raster data regardless of claimed file extension', () => {
  for (const input of ['', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'GIF89a', 'not an image']) assert.throws(() => inspectRaster(new TextEncoder().encode(input).buffer));
});
test('sanitize download names without exposing filesystem paths', () => {
  assert.equal(outputName('example.photo.png','image/jpeg'), 'example.photo-safemark.jpg');
  assert.equal(outputName('../secret\n.jpg','image/png'), '..-secret--safemark.png');
  assert.equal(outputName('.jpg','image/jpeg'), 'image-safemark.jpg');
  assert.ok(outputName('x'.repeat(300)+'.png','image/png').length < 90);
  assert.equal(LIMITS.bytes, 25*1024*1024);
});
test('pathological multiline watermark cannot allocate an unbounded pattern tile', () => {
  for (const [width,height,scale] of [[1600,70800,1],[6400,90000,0.25],[6000,4000,1]]) {
    const tile = tileResolution(width,height,scale);
    assert.ok(tile.width <= 2048 && tile.height <= 2048);
    assert.ok(tile.width * tile.height <= 2048 ** 2);
    assert.ok(tile.scale > 0);
  }
});

/*
Decode a QR code from elements in the current page (canvas/img/video) using jsQR.

Usage (DevTools Console):
  await window.__decodeQrToText({ preferUrl: true, copy: true })

Or inject via Playwright/OpenClaw browser.evaluate.

Notes:
- Loads jsQR from jsDelivr if not already present.
- Scans canvas elements first (Craigslist often renders QR to canvas), then images.
*/

async function loadJsQR() {
  if (globalThis.jsQR) return globalThis.jsQR;

  const src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load jsQR from ' + src));
    document.head.appendChild(s);
  });
  if (!globalThis.jsQR) throw new Error('jsQR did not attach to window');
  return globalThis.jsQR;
}

function isProbablyUrl(s) {
  return typeof s === 'string' && /^(https?:\/\/|mailto:|tel:)/i.test(s.trim());
}

function getImageDataFromCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const w = canvas.width || canvas.clientWidth;
  const h = canvas.height || canvas.clientHeight;
  if (!w || !h) return null;
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    // Security/cors taint or other issues.
    return null;
  }
}

function getImageDataFromDrawable(el) {
  const w = el.naturalWidth || el.videoWidth || el.width || el.clientWidth;
  const h = el.naturalHeight || el.videoHeight || el.height || el.clientHeight;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

async function decodeFromImageData(imageData, jsqr) {
  const qr = jsqr(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return qr?.data || null;
}

async function scanPage({ preferUrl = true } = {}) {
  const jsqr = await loadJsQR();

  // 1) canvases first
  const canvases = Array.from(document.querySelectorAll('canvas'))
    .filter(c => (c.width || c.clientWidth) && (c.height || c.clientHeight));

  for (const c of canvases) {
    const id = getImageDataFromCanvas(c);
    if (!id) continue;
    const data = await decodeFromImageData(id, jsqr);
    if (!data) continue;
    if (!preferUrl || isProbablyUrl(data)) return { data, source: 'canvas' };
    // keep non-url but only as fallback
    return { data, source: 'canvas', note: 'decoded-non-url' };
  }

  // 2) images (including data URLs)
  const imgs = Array.from(document.images || []);
  for (const img of imgs) {
    if (!img.complete) continue;
    const id = getImageDataFromDrawable(img);
    if (!id) continue;
    const data = await decodeFromImageData(id, jsqr);
    if (!data) continue;
    if (!preferUrl || isProbablyUrl(data)) return { data, source: 'img' };
    return { data, source: 'img', note: 'decoded-non-url' };
  }

  // 3) videos (rare)
  const videos = Array.from(document.querySelectorAll('video'));
  for (const v of videos) {
    const id = getImageDataFromDrawable(v);
    if (!id) continue;
    const data = await decodeFromImageData(id, jsqr);
    if (!data) continue;
    if (!preferUrl || isProbablyUrl(data)) return { data, source: 'video' };
    return { data, source: 'video', note: 'decoded-non-url' };
  }

  return null;
}

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Expose a single helper on window for easy use.
globalThis.__decodeQrToText = async function __decodeQrToText(opts = {}) {
  const { copy = false, preferUrl = true } = opts;
  const res = await scanPage({ preferUrl });
  if (!res) return { ok: false, error: 'No QR code decoded from canvases/images/videos on this page.' };

  const out = {
    ok: true,
    text: res.data,
    source: res.source,
    isUrl: isProbablyUrl(res.data),
  };

  if (copy) out.copied = await copyToClipboard(res.data);
  return out;
};

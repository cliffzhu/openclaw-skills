#!/usr/bin/env node
/**
 * extract-upload-url.js
 *
 * Extract the Craigslist phone-upload URL from the editimage step.
 * Connects to OpenClaw's existing Chrome CDP session (port 18800) so cookies/
 * login state are shared — no re-login needed.
 *
 * Methods tried in order (fastest first, no screenshot required):
 *   1. dom:text   — regex scan of visible page text
 *   2. dom:attr   — data-url / data-href / href attributes
 *   3. dom:img    — QR-as-<img> with encoded URL in a query param (chl, data, q…)
 *   4. canvas:jsqr — export canvas pixels → jsQR (in-process, no zbarimg/file I/O)
 *
 * Usage:
 *   node extract-upload-url.js [--cdp http://127.0.0.1:18800]
 *
 * Output (stdout, JSON):
 *   { "url": "https://post.craigslist.org/i/...", "method": "<method>" }
 *   { "url": null, "method": "not-found", "error": "..." }   ← on failure
 *
 * Exit codes:  0 = found,  1 = not found / error
 */

'use strict';

const path = require('path');
// jsqr lives next to this script's node_modules
const jsQR = require(path.join(__dirname, 'node_modules/jsqr'));
const { chromium } = require('playwright');

const CDP_URL = (() => {
  const idx = process.argv.indexOf('--cdp');
  return idx !== -1 ? process.argv[idx + 1] : 'http://127.0.0.1:18800';
})();

const UPLOAD_URL_RE = /^https:\/\/post\.craigslist\.org\/i\//;

// ─── Method 1 & 2 & 3: pure DOM extraction (no screenshot) ─────────────────
async function domExtract(page) {
  return page.evaluate((reStr) => {
    const re = new RegExp(reStr);

    // 1) Visible text scan
    const text = document.body?.innerText || '';
    const textMatch = text.match(/https?:\/\/post\.craigslist\.org\/i\/[^\s"'<>]+/);
    if (textMatch) return { url: textMatch[0], method: 'dom:text' };

    // 2) Attribute scan
    for (const el of document.querySelectorAll('[data-url],[data-href],[href]')) {
      for (const attr of ['data-url', 'data-href', 'href']) {
        const v = (el.getAttribute(attr) || '').trim();
        if (re.test(v)) return { url: v, method: 'dom:attr' };
      }
    }

    // 3) QR-as-<img>: URL encoded in src query params (Google Charts, etc.)
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!src) continue;
      try {
        const u = new URL(src, location.href);
        for (const key of ['chl', 'data', 'url', 'q', 'u']) {
          const v = u.searchParams.get(key);
          if (v && re.test(decodeURIComponent(v)))
            return { url: decodeURIComponent(v), method: `dom:img:${key}` };
        }
        // Rare: the img src IS the upload URL
        if (re.test(src)) return { url: src, method: 'dom:img:src' };
      } catch (_) { /* ignore */ }
    }

    return null;
  }, UPLOAD_URL_RE.source);
}

// ─── Method 4: canvas pixel data → jsQR (in-process, no file/zbarimg) ───────
async function canvasJsQR(page) {
  // Export each canvas element as RGBA pixel data via evaluate
  const canvases = await page.evaluate(() => {
    return [...document.querySelectorAll('canvas')].map(canvas => {
      try {
        // Normalise to 400×400 for consistent QR detection
        const tmp = document.createElement('canvas');
        tmp.width = 400;
        tmp.height = 400;
        const ctx = tmp.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 400, 400);
        // Return raw RGBA as a regular array (structured-clone safe)
        const imgData = ctx.getImageData(0, 0, 400, 400);
        return { data: Array.from(imgData.data), width: 400, height: 400 };
      } catch (_) {
        return null;
      }
    }).filter(Boolean);
  });

  for (const { data, width, height } of canvases) {
    const code = jsQR(new Uint8ClampedArray(data), width, height);
    if (code?.data && UPLOAD_URL_RE.test(code.data))
      return { url: code.data, method: 'canvas:jsqr' };
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  } catch (err) {
    output(null, 'not-found', `Cannot connect to CDP at ${CDP_URL}: ${err.message}`);
    process.exit(1);
  }

  try {
    // Find the editimage page across all contexts/pages
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().includes('?s=editimage') || p.url().includes('editimage')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      // Fall back to most recently active page
      const allPages = browser.contexts().flatMap(c => c.pages());
      page = allPages[allPages.length - 1] ?? null;
    }

    if (!page) {
      output(null, 'not-found', 'No open page found in CDP session');
      process.exit(1);
    }

    // Validate we're on the editimage step
    const url = page.url();
    if (!url.includes('editimage') && !url.includes('post.craigslist.org')) {
      output(null, 'wrong-page', `Current page is not an editimage step: ${url}`);
      process.exit(1);
    }

    // Try methods in order
    let result = await domExtract(page);
    if (!result) result = await canvasJsQR(page);

    if (result) {
      output(result.url, result.method);
      process.exit(0);
    } else {
      output(null, 'not-found', 'All extraction methods exhausted');
      process.exit(1);
    }
  } finally {
    await browser.close().catch(() => {});
  }
})();

function output(url, method, error) {
  const obj = { url: url ?? null, method };
  if (error) obj.error = error;
  process.stdout.write(JSON.stringify(obj) + '\n');
}

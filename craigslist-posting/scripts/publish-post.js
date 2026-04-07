#!/usr/bin/env node
/**
 * publish-post.js
 *
 * After the user replies "DONE" (images uploaded), drive the final steps:
 *   done-with-images → preview → publish → capture live URL
 *
 * Connects to OpenClaw's Chrome CDP session (port 18800) so no re-login needed.
 *
 * Usage:
 *   node publish-post.js [--cdp http://127.0.0.1:18800] [--timeout 30000]
 *
 * Output (stdout, JSON):
 *   { "liveUrl": "https://<city>.craigslist.org/...", "manageUrl": "https://post.craigslist.org/manage/..." }
 *   { "liveUrl": null, "error": "..." }   ← on failure
 *
 * Exit codes: 0 = published,  1 = error
 */

'use strict';

const { chromium } = require('playwright');

const CDP_URL = (() => {
  const idx = process.argv.indexOf('--cdp');
  return idx !== -1 ? process.argv[idx + 1] : 'http://127.0.0.1:18800';
})();

const TIMEOUT = (() => {
  const idx = process.argv.indexOf('--timeout');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 30000;
})();

// Selectors for each step — order matters; try each and use first match
const DONE_WITH_IMAGES_SELECTORS = [
  'button:has-text("done with images")',
  'input[value*="done" i]',
  '[class*="doneimages"]',
  'button:has-text("Done")',
];

const PUBLISH_SELECTORS = [
  'button:has-text("publish")',
  'input[value="publish" i]',
  'button:has-text("Publish")',
  '[class*="publish"]',
];

async function clickFirst(page, selectors, stepName) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        return sel;
      }
    } catch (_) { /* try next */ }
  }
  throw new Error(`Could not find "${stepName}" button. Tried: ${selectors.join(', ')}`);
}

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
  } catch (err) {
    output(null, null, `Cannot connect to CDP at ${CDP_URL}: ${err.message}`);
    process.exit(1);
  }

  try {
    // Find the editimage page
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().includes('editimage') || p.url().includes('post.craigslist.org/k/')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      output(null, null, 'No craigslist posting page found in CDP session');
      process.exit(1);
    }

    // ── Step 1: Click "done with images" ────────────────────────────────────
    const doneSelector = await clickFirst(page, DONE_WITH_IMAGES_SELECTORS, 'done with images');

    // Wait for URL to advance to the preview step (any step after editimage)
    await page.waitForFunction(
      () => !location.href.includes('editimage'),
      { timeout: TIMEOUT }
    );

    // ── Step 2: Click "publish" on preview page ──────────────────────────────
    // Give the preview page a moment to render
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
    await clickFirst(page, PUBLISH_SELECTORS, 'publish');

    // ── Step 3: Wait for the confirmation / live listing page ────────────────
    // Success: URL is the live listing (vancouver.craigslist.org/...)
    // or the manage page (post.craigslist.org/manage/...)
    await page.waitForFunction(
      () => (
        /craigslist\.org\/[a-z]{3}\/[a-z]+\/d\//.test(location.href) ||
        /post\.craigslist\.org\/manage\//.test(location.href) ||
        /craigslist\.org.*posted/.test(document.title.toLowerCase())
      ),
      { timeout: TIMEOUT }
    );

    const finalUrl = page.url();

    // Try to find both live URL and manage URL from the confirmation page
    const urls = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(h => h.includes('craigslist.org'));
      const live = links.find(u => /craigslist\.org\/[a-z]{3}\/[a-z]+\/d\//.test(u));
      const manage = links.find(u => /post\.craigslist\.org\/manage\//.test(u));
      return { live: live || null, manage: manage || null };
    });

    const liveUrl = urls.live || (/craigslist\.org\/[a-z]{3}\/[a-z]+\/d\//.test(finalUrl) ? finalUrl : null);
    const manageUrl = urls.manage || (/post\.craigslist\.org\/manage\//.test(finalUrl) ? finalUrl : null);

    output(liveUrl, manageUrl);
    process.exit(0);

  } catch (err) {
    output(null, null, err.message);
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
  }
})();

function output(liveUrl, manageUrl, error) {
  const obj = { liveUrl: liveUrl ?? null, manageUrl: manageUrl ?? null };
  if (error) obj.error = error;
  process.stdout.write(JSON.stringify(obj) + '\n');
}

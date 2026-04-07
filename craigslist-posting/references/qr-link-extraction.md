# Craigslist QR upload link extraction (DOM-first)

Goal: obtain the URL encoded by the “upload images from your phone” QR code without doing image/QR decoding.

Craigslist typically generates the QR from a URL that is present in the page HTML/DOM. Prefer extracting that URL directly.

## Browser `evaluate` snippet

Run this in the page that shows the QR code (“Scan the QR code to upload images from your phone”).

```js
() => {
  // 1) Look for obvious anchors or text containing an upload URL
  const text = document.body?.innerText || '';
  const direct = text.match(/https?:\/\/\S+/g)?.find(u => /craigslist\.org/.test(u));
  if (direct) return { kind: 'text', url: direct };

  // 2) Inspect images; the QR may be an <img> whose src contains the encoded URL
  const imgs = [...document.querySelectorAll('img')];
  for (const img of imgs) {
    const src = img.currentSrc || img.src || '';
    if (!src) continue;

    // Common patterns: ?data=<urlencoded> or ?chs=...&chl=<urlencoded>
    try {
      const u = new URL(src, location.href);
      for (const key of ['data', 'chl', 'url', 'u', 'q']) {
        const v = u.searchParams.get(key);
        if (v && /craigslist\.org/.test(v)) {
          return { kind: `img:${key}`, url: decodeURIComponent(v), src };
        }
      }
      // Sometimes the whole src is a redirect-like URL
      if (/craigslist\.org/.test(src)) return { kind: 'img:src', url: src, src };
    } catch (e) {
      // ignore
    }
  }

  // 3) Inspect any elements that look like they store the link
  const candidates = [...document.querySelectorAll('[data-url],[data-href],[href]')];
  for (const el of candidates) {
    const v = el.getAttribute('data-url') || el.getAttribute('data-href') || el.getAttribute('href') || '';
    if (v && /craigslist\.org/.test(v)) {
      try { return { kind: 'attr', url: new URL(v, location.href).toString() }; }
      catch { return { kind: 'attr', url: v }; }
    }
  }

  return { kind: 'not-found' };
}
```

## What to send to the user

- If you find a URL: send the URL and instruct: “Scan QR or open this link on your phone to upload images; keep the browser page open while uploading.”
- If not found: send the QR screenshot and ask them to scan it.

## Important behavior rule (two-mode)

If the user already provided photos/attachments for the post, do NOT return the QR link; upload the images directly.

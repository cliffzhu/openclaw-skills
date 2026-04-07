---
name: qr-to-link
description: Convert a QR code inside a photo to a link. Use when the user shares an image/screenshot/photo with a QR code and wants the URL. Runs locally/offline using zbarimg.
---

# qr-to-link

Simple local app to convert a QR code in a photo into a URL.

## Local app command
- `./decode_qr.sh /path/to/photo.jpg`

## Browser (Craigslist / QR rendered to canvas)
Craigslist often renders the phone-upload QR to a **`<canvas>`**.

You now have two reliable options:

### Option A — Screenshot + offline decode (recommended)
1) Enlarge the QR on-page (or inject a temporary large canvas with nearest-neighbor scaling).
2) Take a screenshot that includes the enlarged QR.
3) Decode locally:
   - `./extract_craigslist_qr_link.sh /path/to/screenshot.png`

### Option B — In-page decode (requires loading jsQR)
1) Open DevTools Console on the page with the QR
2) Paste the contents of `decode_qr_in_page.js`
3) Run:
   - `await window.__decodeQrToText({ copy: true })`

It returns `{ ok, text, isUrl, source, copied }` and (optionally) copies the decoded text to clipboard.

## Dependency install
- `./install_deps.sh`

## Behavior
- Returns URL(s) found in the QR payload.
- If no URL exists but QR text decodes, it reports that the payload is not a link.
- If no QR is detected, it asks for a clearer crop/photo.

## Notes
- Uses `zbarimg` for offline/local decoding.
- No cloud upload required.

---
name: craigslist-posting
description: Create or manage Craigslist postings using the OpenClaw browser tool. Use when the user asks to post/sell an item on Craigslist, renew/repost an ad, check for expiring posts, or needs help navigating the My Account/posting flow. Default image handling: return the phone-upload link (URL only) and do not ask for photos or attempt direct uploads.
---

# Craigslist Posting

Use this workflow to create a Craigslist “for sale by owner” post, check renew/repost status, and handle image upload via phone-upload link (URL only).

## Defaults

Defaults should be provided via environment variables so this skill can be published without personal info.

- `CRAIGSLIST_SITE` — Craigslist site root (example: `https://<city>.craigslist.org/`)
- `CRAIGSLIST_AREA` — area slug used during posting (example: `some/area`)
- `CRAIGSLIST_POSTAL_CODE` — postal/ZIP used on the posting form (example: `12345` / `A1A 1A1`)
- `CRAIGSLIST_PICKUP_TEXT` — neighborhood/pickup text (optional)
- Fallbacks (if unset):
  - `CRAIGSLIST_SITE`: *(ask the user)*
  - `CRAIGSLIST_AREA`: *(ask the user)*
  - `CRAIGSLIST_POSTAL_CODE`: *(ask the user)*
  - `CRAIGSLIST_PICKUP_TEXT`: *(omit)*

## Safety / confirmation rules

- After returning the phone-upload link, if the user replies **DONE**, proceed immediately:
  1) click **done with images**
  2) go to preview
  3) click **publish**
  Do not require an extra “publish” confirmation.
- Avoid enabling “publish phone number” unless the user explicitly asks.

## Workflow: create a new item-for-sale post

### Messaging policy (critical)
- Do **not** ask the user to say “Continue”.
- Do **not** send progress/status messages while steps are succeeding.
- Only message the user if:
  1) login/CAPTCHA blocks automation, or
  2) required information is missing/ambiguous (title/price/category/location), or
  3) an unexpected error occurs.
- Never return a placeholder/fake URL.
- Normal success path: do the browser work silently and only reply once you have the upload link (URL only).
- If you cannot obtain the upload link (e.g., blocked by login/CAPTCHA or QR decode fails), then and only then reply with the blocking error.

### Steps (fast + retry)
**Goal:** minimize waits. Prefer *element/URL-based* checks over `networkidle`.

General rule for each step transition:
- Click once.
- Wait for either:
  1) URL contains the next `?s=` step, OR
  2) a distinctive element for the next step appears.
- If the click fails/timeouts, retry once, then report a blocking error.

1) **Open** Craigslist.
2) Go to **acct / My account**.
   - If login is required or a CAPTCHA appears: stop and ask the user to complete it.
3) Click **make a new post**.
4) Choose:
   - Area: `${CRAIGSLIST_AREA}` (if unset, ask the user)
   - Posting type: **for sale by owner**
   - Category: pick the closest matching category.
5) Fill the form (use defaults where possible):
   - Title
   - Price
   - City/neighborhood: `${CRAIGSLIST_PICKUP_TEXT:-}` (if empty, leave blank)
   - Postal/ZIP: `${CRAIGSLIST_POSTAL_CODE}` (if unset, ask the user)
   - Description
6) Proceed through geo/map steps automatically (no networkidle waits).
7) **Images step (always)**
   - Run: `node ~/.openclaw/workspace/skills/public/craigslist-posting/scripts/extract-upload-url.js`
   - Return the `url` field from stdout (URL only). Then stop and wait.
8) When the user replies **DONE**
   - Run: `node ~/.openclaw/workspace/skills/public/craigslist-posting/scripts/publish-post.js`
   - Wait for JSON output with `liveUrl` + `manageUrl`.
9) After publish: send `liveUrl` + `manageUrl` to the user.

## Images step (URL only)

Goal: return a **phone upload link** extracted from the QR code area.

- Do **not** ask the user to send photos as attachments.
- Do **not** attempt direct file uploads (OS file picker limitations).

### Environment variables
- `CRAIGSLIST_SITE` — craigslist root URL (example: `https://<city>.craigslist.org/`). If missing, ask the user.
- `CRAIGSLIST_AREA` — area slug (example: `some/area`). If missing, ask the user.
- `CRAIGSLIST_POSTAL_CODE` — postal/ZIP for the form (example: `12345` / `A1A 1A1`). If missing, ask the user.
- `CRAIGSLIST_PICKUP_TEXT` — neighborhood/pickup text (optional).

Set these in the OpenClaw service environment (systemd override) or the shell environment that launches OpenClaw.

### Hard validation rules before returning any URL
Before sending an upload link to the user, you must verify ALL of:
1) You are on the Craigslist image step:
   - `location.href` contains `post.craigslist.org/k/` AND `?s=editimage`
2) The extracted URL matches `^https://post\.craigslist\.org/i/`

If either check fails:
- Do NOT return any URL.
- Return a short blocking message (e.g., "Blocked: not on editimage page / login required / could not decode QR").

### Extraction method (Playwright script — preferred)

Use the Playwright script instead of manual screenshot + zbarimg. It is faster (no file I/O), handles the partial/cropped-canvas issue, and decodes QR in-process.

```bash
node ~/.openclaw/workspace/skills/public/craigslist-posting/scripts/extract-upload-url.js
# Output: { "url": "https://post.craigslist.org/i/...", "method": "dom:text|dom:attr|dom:img:chl|canvas:jsqr" }
```

Methods tried in order (no screenshot, no zbarimg needed):
1. **dom:text** — regex scan of visible page text (fastest)
2. **dom:attr** — `data-url` / `data-href` / `href` attribute scan
3. **dom:img** — QR-as-`<img>` with URL embedded in src query param (`chl`, `data`, `q`…)
4. **canvas:jsqr** — exports canvas pixels via `page.evaluate()` → jsQR in-process (eliminates the partial-screenshot problem that caused previous failures)

Requires OpenClaw browser to be running (`openclaw browser start`) — reuses the same Chrome CDP session (port 18800) so login/cookies are shared automatically.

**Fallback only if script fails:** enlarge QR canvas → screenshot → `zbarimg`.

### After user uploads
- Wait for the user to reply **DONE** (no image-count verification).
- On DONE: use the Playwright publish script:

```bash
node ~/.openclaw/workspace/skills/public/craigslist-posting/scripts/publish-post.js
# Output: { "liveUrl": "https://<city>.craigslist.org/...", "manageUrl": "https://post.craigslist.org/manage/..." }
```

This clicks "done with images", waits for the preview page (`page.waitForFunction`), clicks "publish", then waits for the live listing URL — all in one reliable exec call instead of multiple sequential browser tool steps.

## Renew / repost check

From **acct → postings**:
- Check **expiring soon** for “renew/repost”.
- Check **most recent** for deleted/expired posts.
- Report status and ask before clicking **renew/repost/undelete**.

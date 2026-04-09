# OpenClaw Skills

This repository contains OpenClaw skill directories.

## Skills

- `craigslist-posting/`
- `qr-to-link/`

## Requirements

### Common
- An OpenClaw installation that can load skills from your workspace:
  - `skills/public/<skill-name>/SKILL.md`

### craigslist-posting
- A Chromium-based browser available for OpenClaw browser automation.
- Ability to log in to Craigslist in the controlled browser session (you may be asked to complete login/CAPTCHA).
- Node.js available to run the bundled scripts.
- The skill uses environment variables for defaults (optional, but recommended):
  - `CRAIGSLIST_SITE` (example: `https://vancouver.craigslist.org/`)
  - `CRAIGSLIST_AREA` (example: `burnaby/newwest`)
  - `CRAIGSLIST_POSTAL_CODE` (example: `V3N1V1`)

### qr-to-link
- Local QR decoding tool:
  - `zbarimg` installed (used by `decode_qr.sh` / `extract_craigslist_qr_link.sh`).
- Shell access to run the scripts.

## Install into an OpenClaw workspace

Copy the skill directory into your workspace:

- `skills/public/<skill-name>/`

Each skill is self-contained and includes its own `SKILL.md`.

## Quick sanity checks

- `qr-to-link`: `./qr-to-link/decode_qr.sh /path/to/image.png`
- `craigslist-posting`: start the OpenClaw browser, begin a post, then use the skill workflow to obtain the phone-upload URL.

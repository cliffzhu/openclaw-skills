#!/usr/bin/env bash
set -euo pipefail

# extract_craigslist_qr_link.sh
# Decode the phone-upload URL from a Craigslist posting image-upload page.
# Strategy: take a screenshot (that includes the QR), then decode with zbarimg.
#
# Note: the screenshot step is expected to be done by OpenClaw's browser tool.
# This script only decodes the provided screenshot.

IMG_PATH="${1:-}"
if [[ -z "$IMG_PATH" ]]; then
  echo "Usage: $0 /path/to/screenshot.png" >&2
  exit 2
fi

if ! command -v zbarimg >/dev/null 2>&1; then
  echo "ERROR: zbarimg not installed. Install package 'zbar'." >&2
  exit 3
fi

# Print unique decoded lines
zbarimg --quiet --raw "$IMG_PATH" | awk 'NF{print}' | awk '!seen[$0]++'

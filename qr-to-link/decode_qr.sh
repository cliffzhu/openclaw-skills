#!/usr/bin/env bash
set -euo pipefail

IMG_PATH="${1:-}"
if [[ -z "$IMG_PATH" ]]; then
  echo "Usage: decode_qr.sh /path/to/image [--all]" >&2
  exit 2
fi

SHOW_ALL="${2:-}"

if [[ ! -f "$IMG_PATH" ]]; then
  echo "ERROR: File not found: $IMG_PATH" >&2
  exit 2
fi

if ! command -v zbarimg >/dev/null 2>&1; then
  echo "ERROR: zbarimg not installed. Run ./install_deps.sh first." >&2
  exit 3
fi

# --raw prints one decoded payload per line.
RAW_OUTPUT="$(zbarimg --quiet --raw "$IMG_PATH" 2>/dev/null || true)"

if [[ -z "$RAW_OUTPUT" ]]; then
  echo "ERROR: No QR code detected. Try a sharper or closer crop of the QR." >&2
  exit 4
fi

URLS="$(printf '%s\n' "$RAW_OUTPUT" | grep -Eo 'https?://[^[:space:]]+' | sed 's/[),.;]*$//' | awk '!seen[$0]++' || true)"

if [[ -n "$URLS" ]]; then
  if [[ "$SHOW_ALL" == "--all" ]]; then
    printf '%s\n' "$URLS"
  else
    printf '%s\n' "$URLS" | head -n 1
  fi
  exit 0
fi

echo "ERROR: QR decoded, but no URL found in payload." >&2
echo "Decoded payload:" >&2
printf '%s\n' "$RAW_OUTPUT" >&2
exit 5

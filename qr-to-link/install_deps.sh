#!/usr/bin/env bash
set -euo pipefail

if command -v zbarimg >/dev/null 2>&1; then
  echo "zbarimg is already installed."
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y zbar-tools
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y zbar
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -Sy --noconfirm zbar
elif command -v brew >/dev/null 2>&1; then
  brew install zbar
else
  echo "Unsupported package manager. Install zbar manually and ensure zbarimg is in PATH." >&2
  exit 1
fi

echo "Installed dependency: zbarimg"

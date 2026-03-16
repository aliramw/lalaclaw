#!/bin/zsh

set -euo pipefail

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install LibreOffice automatically." >&2
  echo "Install Homebrew from https://brew.sh/ and rerun this script." >&2
  exit 1
fi

if command -v soffice >/dev/null 2>&1; then
  echo "LibreOffice is already installed."
  exit 0
fi

brew install --cask libreoffice

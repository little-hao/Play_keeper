#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
VERSION="$(node -p "require('$EXTENSION_DIR/manifest.json').version")"
OUTPUT_DIR="$ROOT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/PlayKeeper-Windows-v${VERSION}.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_FILE"
(
  cd "$EXTENSION_DIR"
  zip -qr "$OUTPUT_FILE" . -x '*.DS_Store'
)

ZIP_ENTRIES="$(unzip -Z1 "$OUTPUT_FILE")"
grep -Fxq 'manifest.json' <<<"$ZIP_ENTRIES"
echo "Created $OUTPUT_FILE"

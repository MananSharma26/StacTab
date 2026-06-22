#!/bin/bash
# Build StacTab extension zip for Chrome Web Store submission
set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')
OUTFILE="stactab-v${VERSION}.zip"

echo "Building StacTab v${VERSION}..."

zip -r "$OUTFILE" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  archive.html \
  archive.js \
  icon_v2.png \
  --exclude "*.DS_Store"

echo "Done: $OUTFILE ($(du -sh $OUTFILE | cut -f1))"

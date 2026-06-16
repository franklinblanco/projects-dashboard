#!/usr/bin/env bash
# Builds the SwiftUI executable and wraps it in a double-clickable .app bundle.
# Usage: ./build-app.sh   →   produces dist/Projects Dashboard.app
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="Projects Dashboard"
EXEC="ProjectsDashboard"
BUNDLE_ID="dev.franklinblanco.projects-dashboard"
VERSION="1.0.0"

echo "▸ Building release binary…"
swift build -c release

if [ ! -f AppIcon.icns ]; then
  echo "▸ Generating app icon…"
  swift make-icon.swift
  iconutil -c icns AppIcon.iconset -o AppIcon.icns
fi

BIN="$(swift build -c release --show-bin-path)/$EXEC"
APP="dist/$APP_NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN" "$APP/Contents/MacOS/$EXEC"
cp AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$EXEC</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppleEventsUsageDescription</key><string>Projects Dashboard opens your terminal in a new window at a project's folder.</string>
</dict>
</plist>
PLIST

# Ad-hoc codesign so Gatekeeper lets it launch locally.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "✓ Built $APP"
echo "  Run with:  open \"$APP\"   (or drag it to /Applications)"

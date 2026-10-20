#!/usr/bin/env bash
set -e

APP_NAME="newNewton.app"
APP_PATH="/Applications/$APP_NAME"
EXTENSION_NAME="newNewtonWidgetsExtension.appex"
BUNDLE_ID="new.newton"
WIDGET_BUNDLE_ID="new.newton.widgets"
APP_GROUP_ID="group.com.newton.enhancer"

echo "==> 1. Terminating running processes..."
killall newNewton 2>/dev/null || true
killall newNewtonWidgetsExtension 2>/dev/null || true

echo "==> 2. Unregistering from PlugInKit & LaunchServices..."
if [ -d "$APP_PATH/Contents/PlugIns/$EXTENSION_NAME" ]; then
    pluginkit -r "$APP_PATH/Contents/PlugIns/$EXTENSION_NAME" 2>/dev/null || true
fi

# Unregister any copies found in DerivedData
find ~/Library/Developer/Xcode/DerivedData -name "$EXTENSION_NAME" -path "*/Build/Products/*" 2>/dev/null | while read -r ext; do
    pluginkit -r "$ext" 2>/dev/null || true
done

if [ -e "$APP_PATH" ]; then
    /System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister \
        -u "$APP_PATH" 2>/dev/null || true
fi

echo "==> 3. Removing installed application..."
rm -rf "$APP_PATH"

echo "==> 4. Clearing DerivedData..."
rm -rf ~/Library/Developer/Xcode/DerivedData/newNewton-*

echo "==> 5. Clearing app and widget containers/caches..."
rm -rf ~/Library/Containers/"$BUNDLE_ID" 2>/dev/null || true
rm -rf ~/Library/Containers/"$WIDGET_BUNDLE_ID" 2>/dev/null || true
rm -rf ~/Library/Group\ Containers/"$APP_GROUP_ID" 2>/dev/null || true

echo "==> 6. Resetting widget daemon (chronod) and NotificationCenter..."
killall -9 chronod 2>/dev/null || true
killall NotificationCenter 2>/dev/null || true

echo "==> 7. Garbage collecting LaunchServices..."
/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister \
    -gc 2>/dev/null || true

echo "==> Done! Checking remaining PlugInKit registrations (should be empty):"
pluginkit -m -v -p com.apple.widgetkit-extension | grep -i newnewton || echo "No newNewton widget extensions found."

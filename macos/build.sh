#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Newton Widgets macOS Build & Packaging Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILD_DIR="${SCRIPT_DIR}/build"
APP_DIR="${BUILD_DIR}/NewtonEnhancer.app"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"
RESOURCES_DIR="${CONTENTS_DIR}/Resources"
PLUGINS_DIR="${CONTENTS_DIR}/PlugIns"
EXTENSION_DIR="${PLUGINS_DIR}/NewtonWidgetsExtension.appex"
EXTENSION_CONTENTS_DIR="${EXTENSION_DIR}/Contents"
EXTENSION_MACOS_DIR="${EXTENSION_CONTENTS_DIR}/MacOS"
EXTENSION_RESOURCES_DIR="${EXTENSION_CONTENTS_DIR}/Resources"

TARGET_TRIPLE="arm64-apple-macos14.0"

echo "=========================================================="
echo "🚀 Building Newton Widgets macOS Container App & WidgetKit Extension"
echo "=========================================================="

# 1. Clean previous build
rm -rf "${APP_DIR}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}" "${EXTENSION_MACOS_DIR}" "${EXTENSION_RESOURCES_DIR}"

# 2. Copy Plists and Resources
echo "📄 Copying Info.plist resources..."
cp "${SCRIPT_DIR}/Resources/App-Info.plist" "${CONTENTS_DIR}/Info.plist"
cp "${SCRIPT_DIR}/Resources/Extension-Info.plist" "${EXTENSION_CONTENTS_DIR}/Info.plist"

# 3. Source file definitions
SHARED_SOURCES=(
    "${SCRIPT_DIR}/Sources/Shared/NewtonSpecs.swift"
    "${SCRIPT_DIR}/Sources/Shared/NewtonTheme.swift"
    "${SCRIPT_DIR}/Sources/Shared/DishClassifier.swift"
    "${SCRIPT_DIR}/Sources/Shared/MenuModel.swift"
    "${SCRIPT_DIR}/Sources/Shared/MenuDataManager.swift"
    "${SCRIPT_DIR}/Sources/Shared/PortalDataManager.swift"
    "${SCRIPT_DIR}/Sources/Shared/PortalWidgetBridge.swift"
    "${SCRIPT_DIR}/Sources/Shared/DayIntents.swift"
)

WIDGET_SOURCES=(
    "${SHARED_SOURCES[@]}"
    "${SCRIPT_DIR}/Sources/Widgets/MessMenuView.swift"
    "${SCRIPT_DIR}/Sources/Widgets/AttendanceWidgetView.swift"
    "${SCRIPT_DIR}/Sources/Widgets/MessMenuWidget.swift"
    "${SCRIPT_DIR}/Sources/Widgets/NewtonWidgetsBundle.swift"
)

APP_SOURCES=(
    "${SHARED_SOURCES[@]}"
    "${SCRIPT_DIR}/Sources/App/MenuBarController.swift"
    "${SCRIPT_DIR}/Sources/App/AppDelegate.swift"
    "${SCRIPT_DIR}/Sources/App/MainApp.swift"
)

# 4. Compile WidgetKit Extension
echo "⚡ Compiling NewtonWidgetsExtension.appex binary..."
swiftc -O \
    -target "${TARGET_TRIPLE}" \
    -parse-as-library \
    -framework WidgetKit \
    -framework SwiftUI \
    -framework AppKit \
    -framework AppIntents \
    -Xlinker -rpath -Xlinker @executable_path/../../Frameworks \
    -Xlinker -rpath -Xlinker /usr/lib/swift \
    -o "${EXTENSION_MACOS_DIR}/NewtonWidgetsExtension" \
    "${WIDGET_SOURCES[@]}"

echo "  ✓ Widget extension compiled successfully."

# 5. Compile Container Headless App
echo "⚡ Compiling NewtonEnhancer host app binary..."
swiftc -O \
    -target "${TARGET_TRIPLE}" \
    -parse-as-library \
    -framework SwiftUI \
    -framework AppKit \
    -framework AppIntents \
    -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
    -Xlinker -rpath -Xlinker /usr/lib/swift \
    -o "${MACOS_DIR}/NewtonEnhancer" \
    "${APP_SOURCES[@]}"

echo "  ✓ Host app compiled successfully."

# 6. Codesign both bundles
echo "🔏 Ad-hoc signing bundles with entitlements..."
codesign --force --sign - --entitlements "${SCRIPT_DIR}/Resources/Extension.entitlements" "${EXTENSION_DIR}"
codesign --force --sign - --entitlements "${SCRIPT_DIR}/Resources/App.entitlements" "${APP_DIR}"

echo "  ✓ Bundles signed successfully."
echo "=========================================================="
echo "🎉 Built successfully at: ${APP_DIR}"
echo "=========================================================="

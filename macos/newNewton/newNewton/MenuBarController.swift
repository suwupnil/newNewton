import AppKit
import SwiftUI
#if canImport(SafariServices)
import SafariServices
#endif

@MainActor
public final class MenuBarController: NSObject {
    private var statusItem: NSStatusItem!
    private var menu: NSMenu!

    public override init() {
        super.init()
        setupStatusItem()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "sparkles.rectangle.stack.fill", accessibilityDescription: "newNewton")
            button.imagePosition = .imageLeft
        }

        buildMenu()
    }

    public func buildMenu() {
        menu = NSMenu()

        // 1. Header item
        let titleItem = NSMenuItem(title: "newNewton macOS Suite", action: nil, keyEquivalent: "")
        titleItem.isEnabled = false
        menu.addItem(titleItem)

        // 2. Auth Token Status
        let hasToken = PortalDataManager.shared.hasAuthToken
        let tokenStatusText = hasToken
            ? "Portal Auth Token: Connected ✓"
            : "Portal Auth Token: Not Set (Preview Mode)"
        let tokenStatusItem = NSMenuItem(title: tokenStatusText, action: nil, keyEquivalent: "")
        tokenStatusItem.image = NSImage(
            systemSymbolName: hasToken ? "checkmark.seal.fill" : "key.slash",
            accessibilityDescription: nil
        )
        menu.addItem(tokenStatusItem)

        // 3. Current Mess Status
        let (currentMeal, nextMeal) = MealType.status()
        let (day, _, _, _, _, _, _) = MenuDataManager.shared.loadMenuForSelectedDay()

        let statusText: String
        if let current = currentMeal {
            statusText = "\(day.rawValue) • Serving Now: \(current.rawValue)"
        } else if let next = nextMeal {
            statusText = "\(day.rawValue) • Next Up: \(next.rawValue)"
        } else {
            statusText = "\(day.rawValue) • Campus Mess"
        }

        let statusMenuItem = NSMenuItem(title: statusText, action: nil, keyEquivalent: "")
        statusMenuItem.image = NSImage(systemSymbolName: "fork.knife", accessibilityDescription: nil)
        menu.addItem(statusMenuItem)

        menu.addItem(NSMenuItem.separator())

        // 4. Native macOS Alert Input Box for Auth Token
        let setTokenItem = NSMenuItem(
            title: hasToken ? "Update Portal Auth Token…" : "Paste Portal Auth Token…",
            action: #selector(promptForAuthToken),
            keyEquivalent: "t"
        )
        setTokenItem.target = self
        setTokenItem.image = NSImage(systemSymbolName: "key.fill", accessibilityDescription: nil)
        menu.addItem(setTokenItem)

        // 5. Sync Attendance Now
        let syncPortalItem = NSMenuItem(
            title: "Sync Attendance Now",
            action: #selector(syncPortalData),
            keyEquivalent: "s"
        )
        syncPortalItem.target = self
        syncPortalItem.image = NSImage(systemSymbolName: "arrow.triangle.2.circlepath", accessibilityDescription: nil)
        menu.addItem(syncPortalItem)

        // 6. Refresh Mess Menu
        let refreshItem = NSMenuItem(
            title: "Refresh Mess Menu from GitHub",
            action: #selector(refreshMenu),
            keyEquivalent: "r"
        )
        refreshItem.target = self
        refreshItem.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: nil)
        menu.addItem(refreshItem)

        menu.addItem(NSMenuItem.separator())

        // 7. Safari Extension Preferences
        let safariItem = NSMenuItem(
            title: "Enable in Safari Extensions…",
            action: #selector(openSafariExtensionPreferences),
            keyEquivalent: "e"
        )
        safariItem.target = self
        safariItem.image = NSImage(systemSymbolName: "safari.fill", accessibilityDescription: nil)
        menu.addItem(safariItem)

        // 8. Widget Guide
        let guideItem = NSMenuItem(
            title: "How to Add Widgets to Desktop…",
            action: #selector(showWidgetGuide),
            keyEquivalent: "w"
        )
        guideItem.target = self
        guideItem.image = NSImage(systemSymbolName: "plus.rectangle.on.rectangle", accessibilityDescription: nil)
        menu.addItem(guideItem)

        menu.addItem(NSMenuItem.separator())

        // 9. Quit
        let quitItem = NSMenuItem(title: "Quit newNewton", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    // MARK: - Native macOS Alert Input Box for Auth Token
    @objc public func promptForAuthToken() {
        NSApp.activate(ignoringOtherApps: true)

        let alert = NSAlert()
        alert.messageText = "Newton Portal Auth Token"
        alert.informativeText = "Open the newNewton extension → Utilities tab → click 'Copy Token', then paste your auth-token below to power the Attendance Tracker macOS widget."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Save & Sync")
        alert.addButton(withTitle: "Cancel")
        if PortalDataManager.shared.hasAuthToken {
            alert.addButton(withTitle: "Clear Token")
        }

        let inputField = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        inputField.placeholderString = "Paste auth-token from extension Utilities tab…"
        inputField.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        inputField.usesSingleLineMode = true
        inputField.lineBreakMode = .byTruncatingMiddle

        if let existing = PortalDataManager.shared.loadAuthToken() {
            inputField.stringValue = existing
        } else if let clip = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  clip.count >= 16 && !clip.contains(" ") && !clip.contains("\n") {
            inputField.stringValue = clip
        }

        alert.accessoryView = inputField
        alert.window.initialFirstResponder = inputField

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            let rawValue = inputField.stringValue
            PortalDataManager.shared.saveAuthToken(rawValue)
            buildMenu()

            Task {
                await PortalDataManager.shared.syncAllPortalData()
                await MainActor.run {
                    self.buildMenu()
                }
            }
        } else if response == .alertThirdButtonReturn {
            PortalDataManager.shared.saveAuthToken("")
            buildMenu()
        }
    }

    @objc private func syncPortalData() {
        guard PortalDataManager.shared.hasAuthToken else {
            promptForAuthToken()
            return
        }
        Task {
            await PortalDataManager.shared.syncAllPortalData()
            await MainActor.run {
                self.buildMenu()
                let alert = NSAlert()
                alert.messageText = "Attendance Synced"
                alert.informativeText = "Your Newton Attendance Tracker widget has been updated with the latest data from Newton LMS."
                alert.alertStyle = .informational
                alert.addButton(withTitle: "OK")
                alert.runModal()
            }
        }
    }

    @objc private func openSafariExtensionPreferences() {
        #if canImport(SafariServices)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "new.newton.safari-extension") { _ in }
        #endif
    }

    @objc private func showWidgetGuide() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "How to Add newNewton Widgets to Your Desktop"
        alert.informativeText = """
        1. Right-click anywhere on your macOS Desktop wallpaper and choose 'Edit Widgets…'.
        2. Search for 'Newton' to find the native widgets:
           • Today's Mess Menu (2x1)
           • Campus Mess Menu (2x2)
           • Newton Attendance Tracker (2x1 & 2x2 with 75% / 80% / 85% targets)
        3. Drag any widget directly onto your desktop or Notification Center!
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Got it!")
        alert.runModal()
    }

    @objc private func refreshMenu() {
        Task {
            let success = await MenuDataManager.shared.refreshFromRemote()
            await MainActor.run {
                self.buildMenu()
                let alert = NSAlert()
                alert.messageText = success ? "Menu Updated!" : "Could not reach GitHub"
                alert.informativeText = success
                    ? "The mess menu has been refreshed with the latest data from GitHub and widget timelines have been updated."
                    : "Using the cached/offline menu. Please check your internet connection."
                alert.alertStyle = success ? .informational : .warning
                alert.addButton(withTitle: "OK")
                alert.runModal()
            }
        }
    }

    @objc private func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

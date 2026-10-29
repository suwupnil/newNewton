import AppKit

@MainActor
public final class AppDelegate: NSObject, NSApplicationDelegate {
    private var menuBarController: MenuBarController?

    public func applicationDidFinishLaunching(_ notification: Notification) {
        menuBarController = MenuBarController()

        // Background fetch of latest mess menu + portal data on launch
        Task {
            await MenuDataManager.shared.ensureFreshMenuForCurrentWeek()
            if PortalDataManager.shared.hasAuthToken {
                await PortalDataManager.shared.syncAllPortalData()
            }
        }

        // Prompt for auth-token via native macOS alert input box if not set yet
        if !PortalDataManager.shared.hasAuthToken {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.menuBarController?.promptForAuthToken()
            }
        }
    }

    public func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        menuBarController?.promptForAuthToken()
        return true
    }
}

import SwiftUI
import AppKit

@MainActor
final class NewtonAppDelegate: NSObject, NSApplicationDelegate {
    private var menuBarController: MenuBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        menuBarController = MenuBarController()

        Task {
            await MenuDataManager.shared.ensureFreshMenuForCurrentWeek()
            if PortalDataManager.shared.hasAuthToken {
                await PortalDataManager.shared.syncAllPortalData()
            }
        }

        // Show native macOS alert input box on first launch if auth-token is missing
        if !PortalDataManager.shared.hasAuthToken {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                self?.menuBarController?.promptForAuthToken()
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        menuBarController?.promptForAuthToken()
        return true
    }
}

@main
struct MyApp: App {
    @NSApplicationDelegateAdaptor(NewtonAppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

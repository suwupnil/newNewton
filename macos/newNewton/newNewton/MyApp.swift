import SwiftUI

@main
struct MyApp: App {
    init() {
        Task {
            await MenuDataManager.shared.ensureFreshMenuForCurrentWeek()
        }
    }

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

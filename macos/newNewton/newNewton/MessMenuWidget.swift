import WidgetKit
import SwiftUI

public struct MenuEntry: TimelineEntry {
    public let date: Date
    public let day: DayOfWeek
    public let menu: DailyMenu
    public let isToday: Bool
    public let meal: MealType
    public let todayDay: DayOfWeek
    public let todayMenu: DailyMenu
    public let todayMeal: MealType

    public init(
        date: Date,
        day: DayOfWeek,
        menu: DailyMenu,
        isToday: Bool,
        meal: MealType,
        todayDay: DayOfWeek = DayOfWeek.from(),
        todayMenu: DailyMenu = DailyMenu(),
        todayMeal: MealType = .lunch
    ) {
        self.date = date
        self.day = day
        self.menu = menu
        self.isToday = isToday
        self.meal = meal
        self.todayDay = todayDay
        self.todayMenu = todayMenu
        self.todayMeal = todayMeal
    }

    public static var sample: MenuEntry {
        let sampleDaily = DailyMenu(
            breakfast: ["Veg Uttapam", "Sambar & Peanut Chutney", "Hot Milk", "Tea (D)", "Bread/Butter/Jam"],
            lunch: ["Rajma Masala", "Dahi Lauki Chana", "Steamed Rice", "Chapati", "Gulab Jamun", "Curd", "Green Salad"],
            snacks: ["French Fries", "Ketchup", "Hot Coffee", "Tea (D)"],
            dinner: ["Soya Aloo Matar Masala", "Punjabi Urad-Chana Dal", "Cabbage Fry SI Style", "Rice", "Chapati", "Cucumber Salad"]
        )
        return MenuEntry(
            date: Date(),
            day: .monday,
            menu: sampleDaily,
            isToday: true,
            meal: .lunch,
            todayDay: .monday,
            todayMenu: sampleDaily,
            todayMeal: .lunch
        )
    }
}

public struct MenuProvider: TimelineProvider {
    public init() {}

    public func placeholder(in context: Context) -> MenuEntry {
        MenuEntry.sample
    }

    public func getSnapshot(in context: Context, completion: @escaping (MenuEntry) -> Void) {
        let (day, menu, isToday, meal, todayDay, todayMenu, todayMeal) = MenuDataManager.shared.loadMenuForSelectedDay()
        completion(MenuEntry(date: Date(), day: day, menu: menu, isToday: isToday, meal: meal, todayDay: todayDay, todayMenu: todayMenu, todayMeal: todayMeal))
    }

    public func getTimeline(in context: Context, completion: @escaping (Timeline<MenuEntry>) -> Void) {
        Task {
            // Fetch from GitHub and store locally if never fetched or if a new Monday has arrived
            await MenuDataManager.shared.ensureFreshMenuForCurrentWeek()

            let (day, menu, isToday, meal, todayDay, todayMenu, todayMeal) = MenuDataManager.shared.loadMenuForSelectedDay()
            let currentEntry = MenuEntry(date: Date(), day: day, menu: menu, isToday: isToday, meal: meal, todayDay: todayDay, todayMenu: todayMenu, todayMeal: todayMeal)

            // Automatically refresh at the start of the next meal window, or in 15 minutes
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
            let timeline = Timeline(entries: [currentEntry], policy: .after(nextUpdate))
            completion(timeline)
        }
    }
}

public struct MessMenuWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: MenuEntry

    public init(entry: MenuEntry) {
        self.entry = entry
    }

    public var body: some View {
        Group {
            switch family {
            case .systemMedium:
                // 2x1 Widget: strictly today's meal, no top date pills bar
                MessMenuView(
                    day: entry.todayDay,
                    menu: entry.todayMenu,
                    isToday: true,
                    currentDate: entry.date,
                    selectedMeal: entry.todayMeal,
                    is2x1Mode: true
                )
            default:
                // 2x2 Widget: full features, selectable day pills
                MessMenuView(
                    day: entry.day,
                    menu: entry.menu,
                    isToday: entry.isToday,
                    currentDate: entry.date,
                    selectedMeal: entry.meal,
                    is2x1Mode: false
                )
            }
        }
        .environment(\.colorScheme, .dark)
        .containerBackground(for: .widget) {
            ZStack {
                Color(red: 16/255, green: 18/255, blue: 22/255)
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.04),
                        Color.clear,
                        Color.black.opacity(0.18)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }
}

public struct TodayMessMenuWidget: Widget {
    public let kind: String = "com.newton.enhancer.widget.today"

    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MenuProvider()) { entry in
            MessMenuView(
                day: entry.todayDay,
                menu: entry.todayMenu,
                isToday: true,
                currentDate: entry.date,
                selectedMeal: entry.todayMeal,
                is2x1Mode: true
            )
            .environment(\.colorScheme, .dark)
            .containerBackground(for: .widget) {
                ZStack {
                    Color(red: 16/255, green: 18/255, blue: 22/255)
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.04),
                            Color.clear,
                            Color.black.opacity(0.18)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
            }
        }
        .configurationDisplayName("Today's Mess Menu (2x1)")
        .description("Shows today's meal with side-by-side main & side courses and meal navigation.")
        .contentMarginsDisabled()
        .supportedFamilies([.systemMedium])
    }
}

public struct WeeklyMessMenuWidget: Widget {
    public let kind: String = "com.newton.enhancer.widget.menu"

    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MenuProvider()) { entry in
            MessMenuWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Campus Mess Menu (2x2)")
        .description("Weekly mess menu with day pills, side-by-side main & side courses, and meal navigation.")
        .contentMarginsDisabled()
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

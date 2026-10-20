import Foundation
import AppIntents
#if canImport(WidgetKit)
import WidgetKit
#endif

// MARK: - Day Selection Intent (Pills Navigation)
@available(macOS 14.0, *)
public struct SelectDayIntent: AppIntent {
    public static var title: LocalizedStringResource = "Select Day"
    public static var description = IntentDescription("Select day of the week to view menu")

    @Parameter(title: "Day")
    public var day: String

    public init() {
        self.day = "Monday"
    }

    public init(day: DayOfWeek) {
        self.day = day.rawValue
    }

    public func perform() async throws -> some IntentResult {
        if let targetDay = DayOfWeek(rawValue: day) {
            MenuDataManager.shared.selectDay(targetDay)
        }
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

// MARK: - Day Navigation Intents (Horizontal Hierarchy)
@available(macOS 14.0, *)
public struct NextDayIntent: AppIntent {
    public static var title: LocalizedStringResource = "Next Day"
    public static var description = IntentDescription("View menu for the next day")

    public init() {}

    public func perform() async throws -> some IntentResult {
        MenuDataManager.shared.advanceDay(by: 1)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

@available(macOS 14.0, *)
public struct PreviousDayIntent: AppIntent {
    public static var title: LocalizedStringResource = "Previous Day"
    public static var description = IntentDescription("View menu for the previous day")

    public init() {}

    public func perform() async throws -> some IntentResult {
        MenuDataManager.shared.advanceDay(by: -1)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

@available(macOS 14.0, *)
public struct TodayIntent: AppIntent {
    public static var title: LocalizedStringResource = "Today"
    public static var description = IntentDescription("Reset menu view to today and serving meal")

    public init() {}

    public func perform() async throws -> some IntentResult {
        MenuDataManager.shared.resetDay()
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

// MARK: - Meal Navigation Intents (Vertical Hierarchy)
@available(macOS 14.0, *)
public struct PreviousMealIntent: AppIntent {
    public static var title: LocalizedStringResource = "Previous Meal"
    public static var description = IntentDescription("Cycle to previous meal (Breakfast, Lunch, Snacks, Dinner)")

    public init() {}

    public func perform() async throws -> some IntentResult {
        MenuDataManager.shared.advanceMeal(by: -1)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

@available(macOS 14.0, *)
public struct NextMealIntent: AppIntent {
    public static var title: LocalizedStringResource = "Next Meal"
    public static var description = IntentDescription("Cycle to next meal (Breakfast, Lunch, Snacks, Dinner)")

    public init() {}

    public func perform() async throws -> some IntentResult {
        MenuDataManager.shared.advanceMeal(by: 1)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

// MARK: - Direct Meal Selection Intent
@available(macOS 14.0, *)
public struct SelectMealIntent: AppIntent {
    public static var title: LocalizedStringResource = "Select Meal"
    public static var description = IntentDescription("Select specific meal to view (Breakfast, Lunch, Snacks, Dinner)")

    @Parameter(title: "Meal")
    public var meal: String

    public init() {
        self.meal = "Breakfast"
    }

    public init(meal: MealType) {
        self.meal = meal.rawValue
    }

    public func perform() async throws -> some IntentResult {
        if let targetMeal = MealType(rawValue: meal) {
            MenuDataManager.shared.selectMeal(targetMeal)
        }
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        return .result()
    }
}

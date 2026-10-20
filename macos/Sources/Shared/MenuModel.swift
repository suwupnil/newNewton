import Foundation
import SwiftUI

// MARK: - Daily & Weekly Menu Models
public struct DailyMenu: Codable, Equatable, Sendable {
    public var breakfast: [String]
    public var lunch: [String]
    public var snacks: [String]
    public var dinner: [String]

    public init(
        breakfast: [String] = [],
        lunch: [String] = [],
        snacks: [String] = [],
        dinner: [String] = []
    ) {
        self.breakfast = breakfast
        self.lunch = lunch
        self.snacks = snacks
        self.dinner = dinner
    }

    public func items(for meal: MealType) -> [String] {
        switch meal {
        case .breakfast: return breakfast
        case .lunch: return lunch
        case .snacks: return snacks
        case .dinner: return dinner
        }
    }
}

public typealias WeeklyMenu = [String: DailyMenu]

// MARK: - Day of Week
public enum DayOfWeek: String, CaseIterable, Codable, Sendable, Identifiable {
    case monday = "Monday"
    case tuesday = "Tuesday"
    case wednesday = "Wednesday"
    case thursday = "Thursday"
    case friday = "Friday"
    case saturday = "Saturday"
    case sunday = "Sunday"

    public var id: String { rawValue }

    public var abbreviation: String {
        switch self {
        case .monday: return "Mon"
        case .tuesday: return "Tue"
        case .wednesday: return "Wed"
        case .thursday: return "Thu"
        case .friday: return "Fri"
        case .saturday: return "Sat"
        case .sunday: return "Sun"
        }
    }

    public static func from(date: Date = Date()) -> DayOfWeek {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        // 1 = Sunday, 2 = Monday, ..., 7 = Saturday
        switch weekday {
        case 1: return .sunday
        case 2: return .monday
        case 3: return .tuesday
        case 4: return .wednesday
        case 5: return .thursday
        case 6: return .friday
        case 7: return .saturday
        default: return .monday
        }
    }

    public func offset(by days: Int) -> DayOfWeek {
        let all = DayOfWeek.allCases
        guard let currentIndex = all.firstIndex(of: self) else { return self }
        let newIndex = (currentIndex + days) % all.count
        let finalIndex = newIndex >= 0 ? newIndex : (newIndex + all.count)
        return all[finalIndex]
    }
}

// MARK: - Meal Types and Schedules
public enum MealType: String, CaseIterable, Identifiable, Sendable {
    case breakfast = "Breakfast"
    case lunch = "Lunch"
    case snacks = "Snacks"
    case dinner = "Dinner"

    public var id: String { rawValue }

    public var iconName: String {
        switch self {
        case .breakfast: return "cup.and.saucer.fill"
        case .lunch: return "fork.knife"
        case .snacks: return "mug.fill"
        case .dinner: return "moon.stars.fill"
        }
    }

    public var emoji: String {
        switch self {
        case .breakfast: return "叉"
        case .lunch: return "惚"
        case .snacks: return "笘包ｸ
        case .dinner: return "佐"
        }
    }

    public var timeRangeString: String {
        switch self {
        case .breakfast: return "07:30 - 09:30 AM"
        case .lunch: return "12:00 - 02:30 PM"
        case .snacks: return "04:30 - 06:30 PM"
        case .dinner: return "07:30 - 09:30 PM"
        }
    }

    public var startMinute: Int {
        switch self {
        case .breakfast: return 7 * 60 + 30   // 450
        case .lunch: return 12 * 60            // 720
        case .snacks: return 16 * 60 + 30     // 990
        case .dinner: return 19 * 60 + 30     // 1170
        }
    }

    public var endMinute: Int {
        switch self {
        case .breakfast: return 9 * 60 + 30   // 570
        case .lunch: return 14 * 60 + 30      // 870
        case .snacks: return 18 * 60 + 30     // 1110
        case .dinner: return 21 * 60 + 30     // 1290
        }
    }

    public var accentColor: Color {
        switch self {
        case .breakfast: return NewtonTheme.orange
        case .lunch: return NewtonTheme.success
        case .snacks: return NewtonTheme.purple
        case .dinner: return NewtonTheme.brandPrimary
        }
    }

    public static func status(at date: Date = Date()) -> (current: MealType?, next: MealType?) {
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        let totalMinutes = hour * 60 + minute

        let all = MealType.allCases
        for meal in all {
            if totalMinutes >= meal.startMinute && totalMinutes <= meal.endMinute {
                let nextMealIndex = (all.firstIndex(of: meal)! + 1) % all.count
                return (current: meal, next: all[nextMealIndex])
            }
        }

        // Between meals
        if totalMinutes < MealType.breakfast.startMinute {
            return (current: nil, next: .breakfast)
        } else if totalMinutes < MealType.lunch.startMinute {
            return (current: nil, next: .lunch)
        } else if totalMinutes < MealType.snacks.startMinute {
            return (current: nil, next: .snacks)
        } else if totalMinutes < MealType.dinner.startMinute {
            return (current: nil, next: .dinner)
        } else {
            // After dinner
            return (current: nil, next: .breakfast)
        }
    }

    public var next: MealType {
        let all = MealType.allCases
        guard let idx = all.firstIndex(of: self) else { return .breakfast }
        return all[(idx + 1) % all.count]
    }

    public var previous: MealType {
        let all = MealType.allCases
        guard let idx = all.firstIndex(of: self) else { return .dinner }
        return all[(idx - 1 + all.count) % all.count]
    }

    public func statusBadge(at date: Date = Date(), isToday: Bool) -> (label: String, isServing: Bool) {
        guard isToday else {
            return (timeRangeString, false)
        }
        let (current, next) = MealType.status(at: date)
        if current == self {
            return ("SERVING NOW", true)
        } else if current == nil && next == self {
            return ("NEXT UP", false)
        }
        return (timeRangeString, false)
    }
}

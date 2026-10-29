import Foundation
import SwiftUI
#if canImport(WidgetKit)
import WidgetKit
#endif

public final class MenuDataManager: @unchecked Sendable {
    public static let shared = MenuDataManager()

    private let appGroupID = "group.com.newton.enhancer"
    private let remoteMenuURL = URL(string: "https://ru-print.vercel.app")!
    private let dayOffsetKey = "newton_menu_day_offset"
    private let selectedDayKey = "newton_menu_selected_day"
    private let mealKey = "newton_menu_meal_override"
    private let lastUpdatedKey = "newton_menu_last_updated"
    private let cachedMenuDataKey = "newton_menu_cached_data"
    private let memoryLock = NSLock()

    private var inMemoryCache: WeeklyMenu?
    private var inMemoryDayOffset: Int = 0
    private var inMemorySelectedDay: DayOfWeek?
    private var inMemoryMealOverride: MealType?

    private init() {
        self.inMemoryDayOffset = defaults.integer(forKey: dayOffsetKey)
        if let savedDay = defaults.string(forKey: selectedDayKey),
           let day = DayOfWeek(rawValue: savedDay) {
            self.inMemorySelectedDay = day
        }
        if let savedMeal = defaults.string(forKey: mealKey),
           let meal = MealType(rawValue: savedMeal) {
            self.inMemoryMealOverride = meal
        }
    }

    private var defaults: UserDefaults {
        if let groupDefaults = UserDefaults(suiteName: appGroupID) {
            return groupDefaults
        }
        return UserDefaults.standard
    }

    private var cacheFileURL: URL {
        let fileManager = FileManager.default
        if let groupURL = fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
            return groupURL.appendingPathComponent("menu.json")
        }
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let newtonDir = appSupport.appendingPathComponent("com.newton.enhancer", isDirectory: true)
        try? fileManager.createDirectory(at: newtonDir, withIntermediateDirectories: true)
        return newtonDir.appendingPathComponent("menu.json")
    }

    // MARK: - Weekly Monday Cache Expiration Logic

    /// Calculates the Unix timestamp of the most recent Monday at 00:00:00 local time.
    public func mostRecentMondayTimestamp(from now: Date = Date()) -> TimeInterval {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: now) // 1 = Sun, 2 = Mon ... 7 = Sat
        let daysSinceMonday = (weekday + 5) % 7
        let startOfToday = calendar.startOfDay(for: now)
        let recentMonday = calendar.date(byAdding: .day, value: -daysSinceMonday, to: startOfToday) ?? startOfToday
        return recentMonday.timeIntervalSince1970
    }

    /// Returns true if the menu has never been fetched from remote, is older than 7 days,
    /// or was last fetched before this week's Monday at 00:00:00.
    public func needsMondayRefresh(now: Date = Date()) -> Bool {
        let lastUpdated = defaults.double(forKey: lastUpdatedKey)
        if lastUpdated <= 0 {
            return true
        }
        // If older than 7 days
        if now.timeIntervalSince1970 - lastUpdated > 7 * 24 * 60 * 60 {
            return true
        }
        // If last fetch was before the most recent Monday at 00:00:00
        if lastUpdated < mostRecentMondayTimestamp(from: now) {
            return true
        }
        return false
    }

    /// Ensures the local cache is populated and refreshed if a new Monday has passed.
    @discardableResult
    public func ensureFreshMenuForCurrentWeek() async -> WeeklyMenu {
        let hasLocalCache = loadLocalCachedMenu() != nil
        if !hasLocalCache || needsMondayRefresh() {
            _ = await refreshFromRemote()
        }
        return loadMenu()
    }

    // MARK: - Day Navigation
    public func selectDay(_ day: DayOfWeek) {
        memoryLock.lock()
        let today = DayOfWeek.from(date: Date())
        if day == today {
            inMemorySelectedDay = nil
            defaults.removeObject(forKey: selectedDayKey)
        } else {
            inMemorySelectedDay = day
            defaults.set(day.rawValue, forKey: selectedDayKey)
        }
        inMemoryDayOffset = 0
        defaults.removeObject(forKey: dayOffsetKey)
        inMemoryMealOverride = nil
        defaults.removeObject(forKey: mealKey)
        memoryLock.unlock()
        notifyWidgets()
    }

    public var currentDayOffset: Int {
        get {
            memoryLock.lock()
            defer { memoryLock.unlock() }
            return inMemoryDayOffset
        }
        set {
            memoryLock.lock()
            inMemoryDayOffset = newValue
            defaults.set(newValue, forKey: dayOffsetKey)
            inMemorySelectedDay = nil
            defaults.removeObject(forKey: selectedDayKey)
            inMemoryMealOverride = nil
            defaults.removeObject(forKey: mealKey)
            memoryLock.unlock()
            notifyWidgets()
        }
    }

    public func advanceDay(by offset: Int) {
        memoryLock.lock()
        let current = selectedDayOfWeekLocked().day
        let all = DayOfWeek.allCases
        if let idx = all.firstIndex(of: current) {
            let count = all.count
            let nextIdx = (idx + offset) % count
            let finalIdx = nextIdx >= 0 ? nextIdx : (nextIdx + count)
            let newDay = all[finalIdx]
            let today = DayOfWeek.from(date: Date())
            if newDay == today {
                inMemorySelectedDay = nil
                defaults.removeObject(forKey: selectedDayKey)
            } else {
                inMemorySelectedDay = newDay
                defaults.set(newDay.rawValue, forKey: selectedDayKey)
            }
        }
        inMemoryDayOffset = 0
        defaults.removeObject(forKey: dayOffsetKey)
        memoryLock.unlock()
        notifyWidgets()
    }

    public func resetDay() {
        memoryLock.lock()
        inMemorySelectedDay = nil
        defaults.removeObject(forKey: selectedDayKey)
        inMemoryDayOffset = 0
        defaults.set(0, forKey: dayOffsetKey)
        inMemoryMealOverride = nil
        defaults.removeObject(forKey: mealKey)
        memoryLock.unlock()
        notifyWidgets()
    }

    public func selectedDayOfWeek(relativeTo baseDate: Date = Date()) -> (day: DayOfWeek, isToday: Bool) {
        memoryLock.lock()
        defer { memoryLock.unlock() }
        return selectedDayOfWeekLocked(relativeTo: baseDate)
    }

    private func selectedDayOfWeekLocked(relativeTo baseDate: Date = Date()) -> (day: DayOfWeek, isToday: Bool) {
        let today = DayOfWeek.from(date: baseDate)
        if let selected = inMemorySelectedDay {
            return (day: selected, isToday: selected == today)
        }
        if let saved = defaults.string(forKey: selectedDayKey),
           let day = DayOfWeek(rawValue: saved) {
            return (day: day, isToday: day == today)
        }
        let offset = inMemoryDayOffset != 0 ? inMemoryDayOffset : defaults.integer(forKey: dayOffsetKey)
        if offset != 0 {
            let calculated = today.offset(by: offset)
            return (day: calculated, isToday: calculated == today)
        }
        return (day: today, isToday: true)
    }

    // MARK: - Meal Navigation
    public var currentMeal: MealType {
        memoryLock.lock()
        defer { memoryLock.unlock() }
        return currentMealLocked()
    }

    private func currentMealLocked() -> MealType {
        if let override = inMemoryMealOverride {
            return override
        }
        if let saved = defaults.string(forKey: mealKey),
           let meal = MealType(rawValue: saved) {
            return meal
        }
        let (_, isToday) = selectedDayOfWeekLocked()
        return defaultMealLocked(isToday: isToday)
    }

    private func defaultMealLocked(isToday: Bool) -> MealType {
        if isToday {
            let (current, next) = MealType.status(at: Date())
            return current ?? next ?? .breakfast
        }
        return .breakfast
    }

    public func selectMeal(_ meal: MealType) {
        memoryLock.lock()
        inMemoryMealOverride = meal
        defaults.set(meal.rawValue, forKey: mealKey)
        defaults.synchronize()
        memoryLock.unlock()
        notifyWidgets()
    }

    public func advanceMeal(by step: Int) {
        memoryLock.lock()
        let all = MealType.allCases
        let active = currentMealLocked()
        let currentIndex = all.firstIndex(of: active) ?? 0
        let count = all.count
        let nextIndex = (currentIndex + step) % count
        let finalIndex = nextIndex >= 0 ? nextIndex : (nextIndex + count)
        let newMeal = all[finalIndex]
        inMemoryMealOverride = newMeal
        defaults.set(newMeal.rawValue, forKey: mealKey)
        memoryLock.unlock()
        notifyWidgets()
    }

    public func resetMeal() {
        memoryLock.lock()
        inMemoryMealOverride = nil
        defaults.removeObject(forKey: mealKey)
        memoryLock.unlock()
        notifyWidgets()
    }

    // MARK: - Local Cache Persistence Helpers
    private func saveMenuLocally(_ data: Data, decoded: WeeklyMenu, timestamp: TimeInterval = Date().timeIntervalSince1970) {
        try? data.write(to: cacheFileURL, options: .atomic)
        defaults.set(data, forKey: cachedMenuDataKey)
        defaults.set(timestamp, forKey: lastUpdatedKey)
        defaults.synchronize()
        updateMemoryCache(decoded)
    }

    private func loadLocalCachedMenu() -> WeeklyMenu? {
        // 1. Check UserDefaults cached data
        if let data = defaults.data(forKey: cachedMenuDataKey),
           let decoded = try? JSONDecoder().decode(WeeklyMenu.self, from: data),
           !decoded.isEmpty {
            return decoded
        }
        // 2. Check App Group / Application Support file cache
        if let data = try? Data(contentsOf: cacheFileURL),
           let decoded = try? JSONDecoder().decode(WeeklyMenu.self, from: data),
           !decoded.isEmpty {
            return decoded
        }
        return nil
    }

    // MARK: - Loading Menu
    public func loadMenu() -> WeeklyMenu {
        // Trigger background Monday refresh if needed
        if needsMondayRefresh() {
            Task {
                await refreshFromRemote()
            }
        }

        memoryLock.lock()
        if let cached = inMemoryCache, !cached.isEmpty {
            memoryLock.unlock()
            return cached
        }
        memoryLock.unlock()

        // 1. Try Local Stored Cache (UserDefaults or Cache File from previous ru-print fetch)
        if let localCached = loadLocalCachedMenu() {
            updateMemoryCache(localCached)
            return localCached
        }

        // 2. Offline first-boot fallback (Note: does NOT set lastUpdatedKey so remote fetch still runs)
        if let data = embeddedFallbackMenuJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(WeeklyMenu.self, from: data),
           !decoded.isEmpty {
            updateMemoryCache(decoded)
            return decoded
        }

        return [:]
    }

    public func loadMenuForSelectedDay() -> (day: DayOfWeek, menu: DailyMenu, isToday: Bool, meal: MealType, todayDay: DayOfWeek, todayMenu: DailyMenu, todayMeal: MealType) {
        let (day, isToday) = selectedDayOfWeek()
        let today = DayOfWeek.from(date: Date())
        let fullMenu = loadMenu()
        let daily = fullMenu[day.rawValue] ?? DailyMenu()
        let todayDaily = fullMenu[today.rawValue] ?? DailyMenu()

        memoryLock.lock()
        let overrideMeal = inMemoryMealOverride ?? defaults.string(forKey: mealKey).flatMap(MealType.init)
        let meal = overrideMeal ?? defaultMealLocked(isToday: isToday)
        let todayMeal = overrideMeal ?? defaultMealLocked(isToday: true)
        memoryLock.unlock()

        return (day: day, menu: daily, isToday: isToday, meal: meal, todayDay: today, todayMenu: todayDaily, todayMeal: todayMeal)
    }

    // MARK: - Remote Synchronization from ru-print.vercel.app
    @discardableResult
    public func refreshFromRemote() async -> Bool {
        do {
            var homeReq = URLRequest(url: remoteMenuURL)
            homeReq.cachePolicy = .reloadIgnoringLocalCacheData
            homeReq.timeoutInterval = 10
            let (htmlData, _) = try await URLSession.shared.data(for: homeReq)
            guard let html = String(data: htmlData, encoding: .utf8) else { return false }

            let pattern = "/static/chunks/app/page-[a-f0-9]+\\.js"
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
                  let range = Range(match.range, in: html) else {
                return false
            }

            let chunkPath = String(html[range])
            let chunkURL = URL(string: "https://ru-print.vercel.app/_next" + chunkPath)!
            var chunkReq = URLRequest(url: chunkURL)
            chunkReq.cachePolicy = .reloadIgnoringLocalCacheData
            chunkReq.timeoutInterval = 10
            let (jsData, _) = try await URLSession.shared.data(for: chunkReq)
            guard let js = String(data: jsData, encoding: .utf8) else { return false }

            let startStr = "j={Monday:{breakfast:["
            var startObjIdx: Int = -1

            if let r = js.range(of: startStr) {
                startObjIdx = js.distance(from: js.startIndex, to: r.lowerBound) + 2
            } else {
                let fallbackPattern = "Monday\\s*:\\s*\\{\\s*breakfast\\s*:\\s*\\["
                if let fallbackRegex = try? NSRegularExpression(pattern: fallbackPattern),
                   let fbMatch = fallbackRegex.firstMatch(in: js, range: NSRange(js.startIndex..., in: js)),
                   let fbRange = Range(fbMatch.range, in: js) {
                    let prefix = js[..<fbRange.lowerBound]
                    if let lastBrace = prefix.lastIndex(of: "{") {
                        startObjIdx = js.distance(from: js.startIndex, to: lastBrace)
                    }
                }
            }

            guard startObjIdx >= 0 else { return false }

            let startIndex = js.index(js.startIndex, offsetBy: startObjIdx)
            var depth = 0
            var endIndex: String.Index?

            for idx in js.indices[startIndex...] {
                let ch = js[idx]
                if ch == "{" || ch == "[" {
                    depth += 1
                } else if ch == "}" || ch == "]" {
                    depth -= 1
                    if depth == 0 {
                        endIndex = js.index(after: idx)
                        break
                    }
                }
            }

            guard let end = endIndex else { return false }

            let rawObjStr = String(js[startIndex..<end])

            let keyRegex = try NSRegularExpression(pattern: "([{,]\\s*)([a-zA-Z0-9_]+)\\s*:")
            let jsonStr = keyRegex.stringByReplacingMatches(in: rawObjStr, range: NSRange(rawObjStr.startIndex..., in: rawObjStr), withTemplate: "$1\"$2\":")

            guard let jsonData = jsonStr.data(using: .utf8) else { return false }
            let decoded = try JSONDecoder().decode(WeeklyMenu.self, from: jsonData)
            guard !decoded.isEmpty else { return false }

            saveMenuLocally(jsonData, decoded: decoded, timestamp: Date().timeIntervalSince1970)
            notifyWidgets()
            return true
        } catch {
            return false
        }
    }

    private func updateMemoryCache(_ menu: WeeklyMenu) {
        memoryLock.lock()
        inMemoryCache = menu
        memoryLock.unlock()
    }

    private func notifyWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.menu")
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.today")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        NotificationCenter.default.post(name: Notification.Name("NewtonMenuUpdated"), object: nil)
    }

    // Offline fallback JSON if first launch happens without internet
    private var embeddedFallbackMenuJSON: String {
        """
        {
          "Monday": {
            "breakfast": ["Mix Fruit", "Masala Oats", "Chocos", "Kanda-Sev Poha", "Hara Chutney", "Hot Milk", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Green Salad", "Cholar Dal Coconut", "Bhandare Ke Aloo", "Vonkai Pacchadi", "Steamed Rice", "Poori", "Kesari Halwa"],
            "snacks": ["Veg Pizza", "Ketchup", "Hot Coffee", "Tea (D)"],
            "dinner": ["Cucumber Salad", "Arhar Dal Lassoni", "Matar Mushroom Makhana", "Andhra Aloo", "Rice", "Chapati"]
          },
          "Tuesday": {
            "breakfast": ["Watermelon", "Sandwich", "Muesli", "Veg Upma", "Coconut Chutney", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Cucumber-Carrot Salad", "Paneer Do-Pyaza", "Lal Malka Dal Tarka", "Ghee Rice", "Chapati"],
            "snacks": ["Samosa", "Chutney", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
            "dinner": ["Green Salad", "Chole Amritsari", "Menthi Aloo Fry", "Carrot-Beetroot Poriyal", "Ghee Rice", "Chapati", "Ice Cream"]
          },
          "Wednesday": {
            "breakfast": ["Banana", "Dalia", "Cornflakes", "Pav", "Bhaji", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Cucumber-Carrot Raita", "Pickle Onion", "Lasoon Ki Theekhi Chutney", "Dhaba Dal", "Baingan-Aloo Ka Salan", "Veg Masala Rice", "Chapati", "Coconut Ladoo"],
            "snacks": ["Bread Pakora", "Sonth Ki Chutney", "Cold Coffee", "Tea (D)"],
            "dinner": ["Cucumber Salad", "Panchratna Dal", "Gobi Capsicum Aloo Masaledar", "Pappu Charu", "Rice", "Chapati"]
          },
          "Thursday": {
            "breakfast": ["Watermelon", "Masala Oats", "Chocos", "Sada Paratha", "Desi Chana Ki Sabzi", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Green Salad", "Sindhi Kadhi", "Dum Aloo", "Onion Pacchadi", "Rice", "Chapati"],
            "snacks": ["French Fries", "Ketchup", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
            "dinner": ["Chana Sprout with Tofu Salad", "Palak Paneer", "Dal Makhni", "Plain Rice", "Tandoori Roti", "Pastry"]
          },
          "Friday": {
            "breakfast": ["Mix Fruit", "Dalia", "Muesli", "Idli", "Sambar & Chutney", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Cucumber Salad", "Dal Makhni", "Mix Veg", "Sambar", "Plain Rice", "Chapati", "Rice Kheer"],
            "snacks": ["Potato Peanut Chat", "Sev & Chutney", "Cold Coffee", "Tea (D)", "Coffee Powder"],
            "dinner": ["Green Salad", "Rajma Masala", "Soya Chaap Lababdar", "Podi Coconut Beans", "Jeera Rice", "Chapati"]
          },
          "Saturday": {
            "breakfast": ["Watermelon", "Chana Sprout with Tofu", "Cornflakes", "Aloo-Pyaaz Paratha", "Curd & Pickle", "Hot Milk (D)", "Cold Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Cucumber-Carrot Salad", "Chole Masale", "Cabbage Peas Tamatar", "Rasam", "Butter Rice", "Bhature"],
            "snacks": ["Aloo Matar Puff", "Ketchup", "Hot Milk (D)", "Tea (D)", "Coffee Powder"],
            "dinner": ["Cucumber Salad", "Lauki Kofta Curry", "Dal Bukhara", "Dondakai Koora", "Ghee Rice", "Chapati", "Kesar Jalebi"]
          },
          "Sunday": {
            "breakfast": ["Banana", "Aloo Toast", "Chocos", "Pan Cake", "Cold/Hot Milk (D)", "Tea (D)", "Coffee Powder", "Bread/Butter/Jam"],
            "lunch": ["Curd", "Mix Pasta Salad", "Sabz Kitchidi", "Jeera Aloo", "Tamata Pacchadi", "Roti"],
            "snacks": ["Gol-Gappe", "Khatta Paani", "Cold Coffee", "Tea (D)", "Coffee Powder"],
            "dinner": ["Pickle Onion", "Palak Dal", "Capsicum Aloo Dry", "Cabbage Coconut", "Steamed Rice", "Chapati"]
          }
        }
        """
    }
}

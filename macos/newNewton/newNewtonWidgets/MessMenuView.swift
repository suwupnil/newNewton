import SwiftUI
import AppIntents

public struct MessMenuView: View {
    public let day: DayOfWeek
    public let menu: DailyMenu
    public let isToday: Bool
    public let currentDate: Date
    public let selectedMeal: MealType
    public let is2x1Mode: Bool

    public var onSelectDay: ((DayOfWeek) -> Void)? = nil
    public var onSelectMeal: ((MealType) -> Void)? = nil

    public init(
        day: DayOfWeek,
        menu: DailyMenu,
        isToday: Bool,
        currentDate: Date = Date(),
        selectedMeal: MealType,
        is2x1Mode: Bool = false,
        onSelectDay: ((DayOfWeek) -> Void)? = nil,
        onSelectMeal: ((MealType) -> Void)? = nil
    ) {
        self.day = day
        self.menu = menu
        self.isToday = isToday
        self.currentDate = currentDate
        self.selectedMeal = selectedMeal
        self.is2x1Mode = is2x1Mode
        self.onSelectDay = onSelectDay
        self.onSelectMeal = onSelectMeal
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: is2x1Mode ? 8 : 10) {
            if !is2x1Mode {
                daySegmentedBar
            }

            mealHeaderView

            // Main Content Area with Vertically Centered Side Meal Icons Rail
            HStack(alignment: .center, spacing: 10) {
                // Two-column course list (Main Course ~44% | Side Course ~56%)
                courseColumnsView
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                // Side Meal Icons Rail (Interactive direct meal switcher, vertically centered)
                mealIconsRail
                    .frame(maxHeight: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.spring(response: 0.3, dampingFraction: 0.82), value: day)
        .animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedMeal)
    }

    // MARK: - Native macOS Segmented Bar for Days (2x2 Widget)
    private var daySegmentedBar: some View {
        let todayDay = DayOfWeek.from(date: currentDate)
        let allDays = DayOfWeek.allCases
        let spacing: CGFloat = 2

        return HStack(spacing: spacing) {
            ForEach(allDays) { d in
                let isSelected = (d == day)
                let isDayToday = (d == todayDay)

                daySegmentButton(for: d, isSelected: isSelected, isToday: isDayToday)
            }
        }
        .background(alignment: .leading) {
            GeometryReader { geo in
                let count = CGFloat(allDays.count)
                let totalSpacing = spacing * (count - 1)
                let segmentWidth = max(0, (geo.size.width - totalSpacing) / count)
                let selectedIndex = CGFloat(allDays.firstIndex(of: day) ?? 0)
                let xOffset = selectedIndex * (segmentWidth + spacing)

                Capsule()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: segmentWidth, height: geo.size.height)
                    .offset(x: xOffset)
                    .animation(.spring(response: 0.3, dampingFraction: 0.82), value: day)
            }
        }
        .padding(3)
        .background(
            Capsule()
                .fill(Color.white.opacity(0.06))
        )
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
        )
    }

    @ViewBuilder
    private func daySegmentButton(for d: DayOfWeek, isSelected: Bool, isToday: Bool) -> some View {
        if #available(macOS 14.0, *), onSelectDay == nil {
            Button(intent: SelectDayIntent(day: d)) {
                daySegmentContent(for: d, isSelected: isSelected, isToday: isToday)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(d.rawValue)\(isToday ? ", Today" : "")")
        } else {
            Button(action: { onSelectDay?(d) }) {
                daySegmentContent(for: d, isSelected: isSelected, isToday: isToday)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(d.rawValue)\(isToday ? ", Today" : "")")
        }
    }

    private func daySegmentContent(for d: DayOfWeek, isSelected: Bool, isToday: Bool) -> some View {
        Text(d.abbreviation)
            .font(.system(size: 11.5, weight: isSelected ? .bold : .medium, design: .rounded))
            .foregroundStyle(isSelected ? Color.white : (isToday ? NewtonTheme.orange : Color.white.opacity(0.65)))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .contentShape(Capsule())
    }

    // MARK: - Meal Header (Title Case + SF Symbol + Timing Metadata)
    private var mealHeaderView: some View {
        let badge = selectedMeal.statusBadge(at: currentDate, isToday: isToday)

        return HStack(alignment: .center, spacing: 7) {
            // Refined Vector SF Symbol (No cartoonish emojis)
            Image(systemName: selectedMeal.iconName)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(selectedMeal.accentColor)

            // Title in Title Case (e.g. Breakfast, Lunch)
            Text(selectedMeal.rawValue)
                .font(.system(size: 16.5, weight: .bold, design: .rounded))
                .foregroundStyle(Color.white)

            if is2x1Mode || isToday {
                Text("TODAY")
                    .font(.system(size: 9.5, weight: .heavy, design: .rounded))
                    .foregroundStyle(NewtonTheme.orange)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1.5)
                    .background(NewtonTheme.orange.opacity(0.16))
                    .clipShape(Capsule())
            }

            Spacer(minLength: 4)

            // Timing & Live Status Badge
            HStack(spacing: 5) {
                if badge.isServing {
                    Circle()
                        .fill(NewtonTheme.success)
                        .frame(width: 5, height: 5)
                }
                Text(badge.isServing ? "Serving Now" : selectedMeal.timeRangeString)
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(badge.isServing ? NewtonTheme.success : Color.white.opacity(0.60))
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background((badge.isServing ? NewtonTheme.success : Color.white).opacity(0.08))
            .clipShape(Capsule())
        }
    }

    // MARK: - Side Meal Icons Rail (Direct 1-Click Switcher with Smooth Gliding Indicator)
    private var mealIconsRail: some View {
        let allMeals = MealType.allCases
        let itemSize: CGFloat = 26
        let spacing: CGFloat = 5
        let selectedIndex = CGFloat(allMeals.firstIndex(of: selectedMeal) ?? 0)
        let yOffset = selectedIndex * (itemSize + spacing)

        return VStack(spacing: spacing) {
            ForEach(allMeals) { m in
                let isSelected = (m == selectedMeal)

                mealIconButton(for: m, isSelected: isSelected)
            }
        }
        .background(alignment: .top) {
            Circle()
                .fill(selectedMeal.accentColor.opacity(0.24))
                .frame(width: itemSize, height: itemSize)
                .offset(y: yOffset)
                .animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedMeal)
        }
        .padding(.horizontal, 1)
    }

    @ViewBuilder
    private func mealIconButton(for m: MealType, isSelected: Bool) -> some View {
        if #available(macOS 14.0, *), onSelectMeal == nil {
            Button(intent: SelectMealIntent(meal: m)) {
                mealIconContent(for: m, isSelected: isSelected)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(m.rawValue)
        } else {
            Button(action: { onSelectMeal?(m) }) {
                mealIconContent(for: m, isSelected: isSelected)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(m.rawValue)
        }
    }

    private func mealIconContent(for m: MealType, isSelected: Bool) -> some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.05))
                .frame(width: 26, height: 26)

            Image(systemName: m.iconName)
                .font(.system(size: 11.5, weight: isSelected ? .bold : .medium))
                .foregroundStyle(isSelected ? m.accentColor : Color.white.opacity(0.40))
        }
        .contentShape(Circle())
    }

    // MARK: - Course Columns (Main Course ~44% | Side Course ~56%)
    private var courseColumnsView: some View {
        let items = menu.items(for: selectedMeal)
        let classified = DishClassifier.classify(items)

        return HStack(alignment: .top, spacing: 0) {
            // Main Course Column
            mainCourseColumn(classified: classified)
                .frame(maxWidth: .infinity, alignment: .topLeading)

            // Subtle Vertical Divider Bar between Main & Side
            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(width: 1)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)

            // Side Course Column (Given proportional room for longer names)
            sideCourseColumn(classified: classified)
                .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    // MARK: - Main Course Column (Clean Typography, No Bullets)
    @ViewBuilder
    private func mainCourseColumn(classified: (mainCourse: [String], sideCourse: [String])) -> some View {
        let maxAllowed = is2x1Mode ? 4 : 11
        let totalCount = classified.mainCourse.count
        let showMore = totalCount > maxAllowed
        let visibleCount = showMore ? (maxAllowed - 1) : totalCount
        let visibleItems = Array(classified.mainCourse.prefix(visibleCount))
        let remaining = totalCount - visibleCount

        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text("MAIN COURSE")
                    .font(.system(size: 10.5, weight: .heavy, design: .rounded))
                    .tracking(0.5)
                    .foregroundStyle(selectedMeal.accentColor)

                Text("\(totalCount)")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(selectedMeal.accentColor)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(selectedMeal.accentColor.opacity(0.16))
                    .clipShape(Capsule())
            }
            .padding(.bottom, 2)

            if classified.mainCourse.isEmpty {
                Text("Standard staples only")
                    .font(.system(size: 12.5, weight: .medium, design: .rounded))
                    .foregroundStyle(NewtonTheme.textMuted)
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(visibleItems, id: \.self) { dish in
                        Text(dish)
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.95))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }

                    if showMore {
                        Text("+\(remaining) more")
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.60))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1.5)
                            .background(Color.white.opacity(0.08))
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer(minLength: 0)
        }
    }

    // MARK: - Side Course Column (Daily Staples, Clean Typography, No Bullets)
    @ViewBuilder
    private func sideCourseColumn(classified: (mainCourse: [String], sideCourse: [String])) -> some View {
        let maxAllowed = is2x1Mode ? 4 : 11
        let totalCount = classified.sideCourse.count
        let showMore = totalCount > maxAllowed
        let visibleCount = showMore ? (maxAllowed - 1) : totalCount
        let visibleItems = Array(classified.sideCourse.prefix(visibleCount))
        let remaining = totalCount - visibleCount

        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text("SIDE COURSE")
                    .font(.system(size: 10.5, weight: .heavy, design: .rounded))
                    .tracking(0.5)
                    .foregroundStyle(Color.white.opacity(0.55))

                Text("\(totalCount)")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.60))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(Color.white.opacity(0.08))
                    .clipShape(Capsule())
            }
            .padding(.bottom, 2)

            if classified.sideCourse.isEmpty {
                Text("None")
                    .font(.system(size: 12.5, weight: .medium, design: .rounded))
                    .foregroundStyle(NewtonTheme.textMuted)
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(visibleItems, id: \.self) { dish in
                        Text(dish)
                            .font(.system(size: 12.5, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.72))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }

                    if showMore {
                        Text("+\(remaining) more")
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.60))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1.5)
                            .background(Color.white.opacity(0.08))
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer(minLength: 0)
        }
    }
}

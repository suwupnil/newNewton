import SwiftUI
import AppIntents
#if canImport(WidgetKit)
import WidgetKit
#endif

public struct AttendanceWidgetView: View {
    public let snapshot: AttendanceSnapshot
    public let isCompactMode: Bool

    public init(snapshot: AttendanceSnapshot, isCompactMode: Bool = false) {
        self.snapshot = snapshot
        self.isCompactMode = isCompactMode
    }

    private let targets: [Int] = [75, 80, 85]

    private var selectedTargetPercent: Int {
        Int(round(snapshot.target * 100))
    }

    private var selectedTargetIndex: Int {
        targets.firstIndex(of: selectedTargetPercent) ?? 0
    }

    private var overallMeetsTarget: Bool {
        guard let pct = snapshot.overallPercentage else { return true }
        return pct + 1e-9 >= snapshot.target
    }

    private var overallStatusColor: Color {
        overallMeetsTarget ? NewtonTheme.success : NewtonTheme.warning
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: isCompactMode ? 7 : 9) {
            if !isCompactMode {
                targetSegmentedBarLarge
            }

            headerView

            if isCompactMode {
                compactGrid
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                detailedSubjectList
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                largeFooterBar
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, isCompactMode ? 10 : 11)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedTargetPercent)
    }

    // MARK: - Native macOS Capsule Segmented Bar for Safety Targets (2x2 Widget, matches MessMenuView)
    private var targetSegmentedBarLarge: some View {
        let spacing: CGFloat = 2

        return HStack(spacing: spacing) {
            ForEach(targets, id: \.self) { t in
                let isSelected = (t == selectedTargetPercent)
                targetSegmentButton(for: t, isSelected: isSelected, showSubtitle: true)
            }
        }
        .background(alignment: .leading) {
            GeometryReader { geo in
                let count = CGFloat(targets.count)
                let totalSpacing = spacing * (count - 1)
                let segmentWidth = max(0, (geo.size.width - totalSpacing) / count)
                let xOffset = CGFloat(selectedTargetIndex) * (segmentWidth + spacing)

                Capsule()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: segmentWidth, height: geo.size.height)
                    .offset(x: xOffset)
                    .animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedTargetIndex)
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

    // MARK: - Compact Inline Capsule Segmented Bar (2x1 Widget)
    private var targetSegmentedBarCompact: some View {
        let pillWidth: CGFloat = 33
        let spacing: CGFloat = 2

        return HStack(spacing: spacing) {
            ForEach(targets, id: \.self) { t in
                let isSelected = (t == selectedTargetPercent)
                targetSegmentButton(for: t, isSelected: isSelected, showSubtitle: false)
                    .frame(width: pillWidth, height: 20)
            }
        }
        .background(alignment: .leading) {
            Capsule()
                .fill(Color.white.opacity(0.18))
                .frame(width: pillWidth, height: 20)
                .offset(x: CGFloat(selectedTargetIndex) * (pillWidth + spacing))
                .animation(.spring(response: 0.3, dampingFraction: 0.82), value: selectedTargetIndex)
        }
        .padding(2.5)
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
    private func targetSegmentButton(for t: Int, isSelected: Bool, showSubtitle: Bool) -> some View {
        if #available(macOS 14.0, *) {
            Button(intent: SelectAttendanceTargetIntent(targetPercent: t)) {
                targetSegmentContent(for: t, isSelected: isSelected, showSubtitle: showSubtitle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Target \(t) percent")
        } else {
            targetSegmentContent(for: t, isSelected: isSelected, showSubtitle: showSubtitle)
        }
    }

    private func targetSegmentContent(for t: Int, isSelected: Bool, showSubtitle: Bool) -> some View {
        let tag: String = {
            switch t {
            case 75: return "Min"
            case 80: return "Safe"
            default: return "Strict"
            }
        }()

        return HStack(spacing: 3.5) {
            Text("\(t)%")
                .font(.system(size: showSubtitle ? 11.5 : 10, weight: isSelected ? .bold : .medium, design: .rounded))
                .foregroundStyle(isSelected ? Color.white : Color.white.opacity(0.65))

            if showSubtitle {
                Text(tag)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular, design: .rounded))
                    .foregroundStyle(isSelected ? NewtonTheme.brandHover : Color.white.opacity(0.42))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, showSubtitle ? 4.5 : 0)
        .contentShape(Capsule())
    }

    // MARK: - Header Row (Matches MessMenuView mealHeaderView style)
    private var headerView: some View {
        HStack(alignment: .center, spacing: 6) {
            Image(systemName: overallMeetsTarget ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: isCompactMode ? 14 : 15, weight: .bold))
                .foregroundStyle(overallStatusColor)

            Text("Attendance")
                .font(.system(size: isCompactMode ? 15 : 16.5, weight: .bold, design: .rounded))
                .foregroundStyle(Color.white)
                .lineLimit(1)

            // Overall Rollup Pill
            HStack(spacing: 4) {
                if let pct = snapshot.overallPercentage {
                    Text(String(format: "%.1f%%", pct * 100))
                        .font(.system(size: isCompactMode ? 10.5 : 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(overallStatusColor)
                } else {
                    Text("—")
                        .font(.system(size: isCompactMode ? 10.5 : 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color.white)
                }

                Text("\(snapshot.overallAttended)/\(snapshot.overallHeld)")
                    .font(.system(size: isCompactMode ? 9.5 : 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.55))
            }
            .padding(.horizontal, 6.5)
            .padding(.vertical, 2)
            .background(overallStatusColor.opacity(0.14))
            .clipShape(Capsule())

            if snapshot.isUsingSampleData && !isCompactMode {
                Text("PREVIEW")
                    .font(.system(size: 9, weight: .heavy, design: .rounded))
                    .foregroundStyle(NewtonTheme.orange)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1.5)
                    .background(NewtonTheme.orange.opacity(0.16))
                    .clipShape(Capsule())
            }

            Spacer(minLength: 4)

            if isCompactMode {
                targetSegmentedBarCompact
            } else {
                // Overall Verdict Status Pill on 2x2
                HStack(spacing: 4.5) {
                    Circle()
                        .fill(overallStatusColor)
                        .frame(width: 5, height: 5)
                    Text(overallMeetsTarget ? "On Track" : "Below \(selectedTargetPercent)%")
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(overallStatusColor)
                }
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(overallStatusColor.opacity(0.10))
                .clipShape(Capsule())
            }

            if #available(macOS 14.0, *) {
                Button(intent: RefreshPortalDataIntent()) {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.06))
                            .frame(width: isCompactMode ? 22 : 24, height: isCompactMode ? 22 : 24)
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: isCompactMode ? 10 : 10.5, weight: .bold))
                            .foregroundStyle(Color.white.opacity(0.65))
                    }
                    .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Refresh Attendance")
            }
        }
    }

    // MARK: - 2x1 Compact Grid (Medium Widget - Zero Clipping & Balanced 4th Card)
    private var compactGrid: some View {
        let displayed = Array(snapshot.subjects.prefix(4))
        return LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: 7),
                GridItem(.flexible(), spacing: 7)
            ],
            spacing: 6
        ) {
            ForEach(displayed) { subject in
                compactSubjectCard(subject)
            }

            // If exactly 3 subjects exist, fill the 4th grid cell with an Overall Semester Rollup card
            if displayed.count == 3 {
                compactOverallSummaryCard
            }
        }
    }

    private func compactSubjectCard(_ subject: AttendanceSubjectGroup) -> some View {
        let statusColor = subject.meetsTarget ? NewtonTheme.success : NewtonTheme.warning
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 4) {
                Text(subject.shortLabel)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)

                Spacer(minLength: 2)

                verdictBadge(for: subject, compact: true)

                if let pct = subject.percentage {
                    Text(String(format: "%.0f%%", pct * 100))
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .foregroundStyle(statusColor)
                }
            }

            progressBar(
                percentage: subject.percentage ?? 0,
                target: snapshot.target,
                color: statusColor,
                height: 4
            )

            HStack(spacing: 4) {
                Text(subject.countsBreakdown)
                    .font(.system(size: 9.5, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.58))
                    .lineLimit(1)

                Spacer(minLength: 2)

                Text("\(subject.attended)/\(subject.held)")
                    .font(.system(size: 9.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.45))
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.white.opacity(0.045))
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 0.5)
                )
        )
    }

    private var compactOverallSummaryCard: some View {
        let totalSkips = snapshot.subjects.reduce(0) { $0 + $1.skipsAffordable }
        let atRiskCount = snapshot.subjects.filter { !$0.meetsTarget && $0.held > 0 }.count
        let pctValue = snapshot.overallPercentage ?? 0.0

        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 4) {
                Text("Overall")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.90))
                    .lineLimit(1)

                Spacer(minLength: 2)

                Text(atRiskCount == 0 ? "+\(totalSkips) skips" : "\(atRiskCount) below")
                    .font(.system(size: 8.5, weight: .bold, design: .rounded))
                    .foregroundStyle(atRiskCount == 0 ? NewtonTheme.success : NewtonTheme.warning)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1.5)
                    .background((atRiskCount == 0 ? NewtonTheme.success : NewtonTheme.warning).opacity(0.15))
                    .clipShape(Capsule())

                Text(snapshot.overallFormatted)
                    .font(.system(size: 11.5, weight: .heavy, design: .rounded))
                    .foregroundStyle(overallStatusColor)
            }

            progressBar(
                percentage: pctValue,
                target: snapshot.target,
                color: overallStatusColor,
                height: 4
            )

            HStack(spacing: 4) {
                Text(snapshot.isUsingSampleData ? "Preview • Target \(selectedTargetPercent)%" : "Target \(selectedTargetPercent)%")
                    .font(.system(size: 9.5, weight: .medium, design: .rounded))
                    .foregroundStyle(snapshot.isUsingSampleData ? NewtonTheme.orange.opacity(0.9) : Color.white.opacity(0.55))
                    .lineLimit(1)

                Spacer(minLength: 2)

                Text("\(snapshot.overallAttended)/\(snapshot.overallHeld)")
                    .font(.system(size: 9.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.45))
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.white.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.07), lineWidth: 0.5)
                )
        )
    }

    // MARK: - 2x2 Detailed Subject List (Large Widget - Full Titles Without Truncation)
    private var detailedSubjectList: some View {
        let displayed = Array(snapshot.subjects.prefix(4))
        return VStack(spacing: 7) {
            ForEach(displayed) { subject in
                detailedSubjectRow(subject)
            }
        }
    }

    private func detailedSubjectRow(_ subject: AttendanceSubjectGroup) -> some View {
        let statusColor = subject.meetsTarget ? NewtonTheme.success : NewtonTheme.warning

        return VStack(alignment: .leading, spacing: 5.5) {
            // Row 1: Short Code Badge + Full Course Title (unobstructed!) + Percentage
            HStack(alignment: .center, spacing: 7) {
                Text(subject.shortLabel)
                    .font(.system(size: 10.5, weight: .heavy, design: .rounded))
                    .foregroundStyle(NewtonTheme.brandHover)
                    .padding(.horizontal, 6.5)
                    .padding(.vertical, 2)
                    .background(NewtonTheme.brandPrimary.opacity(0.18))
                    .clipShape(Capsule())

                Text(subject.label)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.95))
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 6)

                if let pct = subject.percentage {
                    Text(String(format: "%.1f%%", pct * 100))
                        .font(.system(size: 13.5, weight: .heavy, design: .rounded))
                        .foregroundStyle(statusColor)
                } else {
                    Text("—")
                        .font(.system(size: 13.5, weight: .heavy, design: .rounded))
                        .foregroundStyle(NewtonTheme.textMuted)
                }
            }

            // Row 2: Smooth Native Progress Bar with Target Threshold Marker
            progressBar(
                percentage: subject.percentage ?? 0,
                target: snapshot.target,
                color: statusColor,
                height: 5
            )

            // Row 3: Lecture & Lab Breakdown on Left + Verdict Capsule Badge on Right
            HStack(alignment: .center, spacing: 8) {
                ForEach(subject.units) { unit in
                    HStack(spacing: 3.5) {
                        Circle()
                            .fill(unit.isPractical ? NewtonTheme.purple : NewtonTheme.brandPrimary)
                            .frame(width: 5, height: 5)
                        Text(unit.component)
                            .font(.system(size: 10.5, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.58))
                        Text("\(unit.attended)/\(unit.held)")
                            .font(.system(size: 10.5, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.88))
                    }
                }

                if subject.units.count > 1 {
                    Text("•  \(subject.attended)/\(subject.held)")
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.42))
                }

                Spacer(minLength: 4)

                verdictBadge(for: subject, compact: false)
            }
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 8.5)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.045))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 0.5)
                )
        )
    }

    // MARK: - Progress Bar with Clean Target Marker
    private func progressBar(percentage: Double, target: Double, color: Color, height: CGFloat) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let clampedPct = CGFloat(min(max(percentage, 0.0), 1.0))
            let clampedTarget = CGFloat(min(max(target, 0.0), 1.0))

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.08))
                    .frame(height: height)

                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [color.opacity(0.82), color],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(height, width * clampedPct), height: height)

                // Subtle target marker tick
                Capsule()
                    .fill(Color.white.opacity(0.85))
                    .frame(width: 2, height: height + 2.5)
                    .offset(x: max(0, min(width - 2, width * clampedTarget)))
            }
        }
        .frame(height: height + 2)
    }

    @ViewBuilder
    private func verdictBadge(for subject: AttendanceSubjectGroup, compact: Bool) -> some View {
        let isSafe = subject.meetsTarget
        let badgeColor = isSafe ? NewtonTheme.success : NewtonTheme.warning
        let text = compact ? subject.verdictShort : subject.verdictDetailed

        Text(text)
            .font(.system(size: compact ? 8.5 : 10, weight: .bold, design: .rounded))
            .foregroundStyle(badgeColor)
            .padding(.horizontal, compact ? 5.5 : 7)
            .padding(.vertical, compact ? 1.5 : 2)
            .background(badgeColor.opacity(0.15))
            .clipShape(Capsule())
    }

    // MARK: - 2x2 Footer Bar
    private var largeFooterBar: some View {
        let totalSkips = snapshot.subjects.reduce(0) { $0 + $1.skipsAffordable }
        let totalRecover = snapshot.subjects.reduce(0) { $0 + $1.classesToRecover }

        return HStack(spacing: 6) {
            Circle()
                .fill(snapshot.isUsingSampleData ? NewtonTheme.orange : NewtonTheme.success)
                .frame(width: 5, height: 5)

            if snapshot.isUsingSampleData {
                Text("Preview Mode • Paste Auth Token in newNewton Menu Bar")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.52))
                    .lineLimit(1)
            } else {
                Text("\(snapshot.semesterTitle) • Synced with Newton LMS")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.50))
                    .lineLimit(1)
            }

            Spacer(minLength: 4)

            if totalRecover > 0 {
                Text("Need \(totalRecover) class\(totalRecover == 1 ? "" : "es")")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(NewtonTheme.warning)
            } else {
                Text("\(totalSkips) total skip\(totalSkips == 1 ? "" : "s") buffer")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(NewtonTheme.success.opacity(0.9))
            }
        }
    }
}

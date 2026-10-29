import Foundation
import SwiftUI
#if canImport(WidgetKit)
import WidgetKit
#endif

// MARK: - Attendance Models

public struct SubjectComponentUnit: Codable, Equatable, Sendable, Identifiable {
    public var id: String { courseHash }
    public let courseHash: String
    public let name: String
    public let fullName: String
    public let component: String // "Lecture" or "Lab"
    public let isPractical: Bool
    public let attended: Int
    public let held: Int

    public init(
        courseHash: String,
        name: String,
        fullName: String,
        component: String,
        isPractical: Bool,
        attended: Int,
        held: Int
    ) {
        self.courseHash = courseHash
        self.name = name
        self.fullName = fullName
        self.component = component
        self.isPractical = isPractical
        self.attended = attended
        self.held = held
    }
}

public struct SubjectAttendanceSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: String { key }
    public let key: String
    public let label: String
    public let shortLabel: String
    public let attended: Int
    public let held: Int
    public let lectureAttended: Int
    public let lectureHeld: Int
    public let labAttended: Int
    public let labHeld: Int
    public let hasLab: Bool
    public let percentage: Double?
    public let target: Double
    public let meetsTarget: Bool
    public let headline: String // "skips" | "recover" | "unreachable" | "no-data"
    public let skipsAffordable: Int
    public let classesToRecover: Int

    public init(
        key: String,
        label: String,
        shortLabel: String,
        attended: Int,
        held: Int,
        lectureAttended: Int,
        lectureHeld: Int,
        labAttended: Int,
        labHeld: Int,
        hasLab: Bool,
        percentage: Double?,
        target: Double = 0.75,
        meetsTarget: Bool,
        headline: String,
        skipsAffordable: Int,
        classesToRecover: Int
    ) {
        self.key = key
        self.label = label
        self.shortLabel = shortLabel
        self.attended = attended
        self.held = held
        self.lectureAttended = lectureAttended
        self.lectureHeld = lectureHeld
        self.labAttended = labAttended
        self.labHeld = labHeld
        self.hasLab = hasLab
        self.percentage = percentage
        self.target = target
        self.meetsTarget = meetsTarget
        self.headline = headline
        self.skipsAffordable = skipsAffordable
        self.classesToRecover = classesToRecover
    }

    public var percentageFormatted: String {
        guard let pct = percentage else { return "—" }
        return String(format: "%.1f%%", pct * 100.0)
    }

    public var verdictShort: String {
        switch headline {
        case "no-data":
            return "No classes"
        case "unreachable":
            return "Below target"
        case "recover":
            return "Need \(classesToRecover)"
        default:
            return skipsAffordable == 0 ? "On track" : "+\(skipsAffordable) skip\(skipsAffordable == 1 ? "" : "s")"
        }
    }

    public var verdictDetailed: String {
        switch headline {
        case "no-data":
            return "No classes held"
        case "unreachable":
            return "Below target"
        case "recover":
            return "Attend next \(classesToRecover)"
        default:
            return skipsAffordable == 0 ? "On track (0 skips)" : "Can skip \(skipsAffordable)"
        }
    }

    public var countsBreakdown: String {
        if hasLab && lectureHeld > 0 {
            return "Lec \(lectureAttended)/\(lectureHeld) · Lab \(labAttended)/\(labHeld)"
        }
        return "Lec \(attended)/\(held)"
    }

    public var accentColor: Color {
        guard held > 0, percentage != nil else { return NewtonTheme.textMuted }
        if headline == "unreachable" { return Color(red: 255/255, green: 107/255, blue: 107/255) }
        return meetsTarget ? NewtonTheme.success : NewtonTheme.warning
    }
}

public struct AttendanceDashboardData: Codable, Equatable, Sendable {
    public var semesterTitle: String
    public var target: Double
    public var updatedAt: TimeInterval
    public var subjects: [SubjectAttendanceSummary]

    public init(
        semesterTitle: String,
        target: Double,
        updatedAt: TimeInterval,
        subjects: [SubjectAttendanceSummary]
    ) {
        self.semesterTitle = semesterTitle
        self.target = target
        self.updatedAt = updatedAt
        self.subjects = subjects
    }

    public var overallPercentage: Double? {
        let totalAtt = subjects.reduce(0) { $0 + $1.attended }
        let totalHeld = subjects.reduce(0) { $0 + $1.held }
        guard totalHeld > 0 else { return nil }
        return Double(totalAtt) / Double(totalHeld)
    }

    public var overallFormatted: String {
        guard let pct = overallPercentage else { return "—" }
        return String(format: "%.1f%%", pct * 100.0)
    }

    public static var sample: AttendanceDashboardData {
        AttendanceDashboardData(
            semesterTitle: "Semester 1",
            target: 0.75,
            updatedAt: Date().timeIntervalSince1970,
            subjects: [
                SubjectAttendanceSummary(
                    key: "psp",
                    label: "Problem Solving & Programming",
                    shortLabel: "PSP",
                    attended: 26,
                    held: 30,
                    lectureAttended: 18,
                    lectureHeld: 21,
                    labAttended: 8,
                    labHeld: 9,
                    hasLab: true,
                    percentage: 26.0 / 30.0,
                    target: 0.75,
                    meetsTarget: true,
                    headline: "skips",
                    skipsAffordable: 4,
                    classesToRecover: 0
                ),
                SubjectAttendanceSummary(
                    key: "sai",
                    label: "System & AI Essentials",
                    shortLabel: "S&AI",
                    attended: 19,
                    held: 24,
                    lectureAttended: 13,
                    lectureHeld: 16,
                    labAttended: 6,
                    labHeld: 8,
                    hasLab: true,
                    percentage: 19.0 / 24.0,
                    target: 0.75,
                    meetsTarget: true,
                    headline: "skips",
                    skipsAffordable: 1,
                    classesToRecover: 0
                ),
                SubjectAttendanceSummary(
                    key: "maths",
                    label: "Mathematics I",
                    shortLabel: "Maths I",
                    attended: 14,
                    held: 20,
                    lectureAttended: 14,
                    lectureHeld: 20,
                    labAttended: 0,
                    labHeld: 0,
                    hasLab: false,
                    percentage: 14.0 / 20.0,
                    target: 0.75,
                    meetsTarget: false,
                    headline: "recover",
                    skipsAffordable: 0,
                    classesToRecover: 4
                )
            ]
        )
    }
}

// MARK: - Shared Persistent State Envelope (App Group + File Sync)

private struct SharedPortalDiskState: Codable {
    var authToken: String?
    var attendanceTarget: Double?
    var cachedAttendance: AttendanceDashboardData?
}

// MARK: - PortalDataManager

public final class PortalDataManager: @unchecked Sendable {
    public static let shared = PortalDataManager()

    private let appGroupID = NewtonSpecs.appGroupID
    private let authTokenKey = "newton_auth_token"
    private let attendanceTargetKey = "newton_attendance_target"
    private let attendanceCacheKey = "newton_attendance_cache_v1"

    private let lock = NSLock()

    private init() {}

    private var defaults: UserDefaults {
        if let groupDefaults = UserDefaults(suiteName: appGroupID) {
            return groupDefaults
        }
        return UserDefaults.standard
    }

    /// Candidate shared state file paths so the Menu Bar app and WidgetKit extension
    /// share token, target, and attendance cache reliably across sandbox boundaries.
    private var sharedStateFileURLs: [URL] {
        var urls: [URL] = []
        let fm = FileManager.default
        if let groupContainer = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
            urls.append(groupContainer.appendingPathComponent("newton_portal_state.json"))
        }
        urls.append(URL(fileURLWithPath: "/Users/swap/Developer/newNewton/.newton_portal_state.json"))
        urls.append(URL(fileURLWithPath: "/tmp/newton_portal_state.json"))
        return urls
    }

    private func readDiskState() -> SharedPortalDiskState? {
        for url in sharedStateFileURLs {
            if let data = try? Data(contentsOf: url),
               let decoded = try? JSONDecoder().decode(SharedPortalDiskState.self, from: data) {
                return decoded
            }
        }
        return nil
    }

    private func writeDiskState(_ mutate: (inout SharedPortalDiskState) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        var state = readDiskState() ?? SharedPortalDiskState()
        mutate(&state)
        guard let data = try? JSONEncoder().encode(state) else { return }
        for url in sharedStateFileURLs {
            try? data.write(to: url, options: .atomic)
        }
    }

    // MARK: - Auth Token Management

    public var authToken: String? {
        get {
            if let diskToken = readDiskState()?.authToken,
               let clean = Self.extractCleanAuthToken(diskToken),
               !clean.isEmpty {
                return clean
            }
            if let saved = defaults.string(forKey: authTokenKey),
               let clean = Self.extractCleanAuthToken(saved),
               !clean.isEmpty {
                return clean
            }
            if let stdSaved = UserDefaults.standard.string(forKey: authTokenKey),
               let clean = Self.extractCleanAuthToken(stdSaved),
               !clean.isEmpty {
                return clean
            }
            let devTokenPath = "/Users/swap/Developer/newNewton/auth-token"
            if let fileStr = try? String(contentsOfFile: devTokenPath, encoding: .utf8),
               let clean = Self.extractCleanAuthToken(fileStr),
               !clean.isEmpty {
                defaults.set(clean, forKey: authTokenKey)
                writeDiskState { $0.authToken = clean }
                return clean
            }
            return nil
        }
        set {
            if let raw = newValue, let clean = Self.extractCleanAuthToken(raw), !clean.isEmpty {
                defaults.set(clean, forKey: authTokenKey)
                UserDefaults.standard.set(clean, forKey: authTokenKey)
                writeDiskState { $0.authToken = clean }
            } else {
                defaults.removeObject(forKey: authTokenKey)
                UserDefaults.standard.removeObject(forKey: authTokenKey)
                writeDiskState { $0.authToken = nil }
            }
            defaults.synchronize()
            notifyWidgets()
        }
    }

    public var hasAuthToken: Bool {
        guard let t = authToken else { return false }
        return !t.isEmpty
    }

    public static func extractCleanAuthToken(_ raw: String?) -> String? {
        guard let raw = raw else { return nil }
        var str = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !str.isEmpty else { return nil }

        if str.lowercased().hasPrefix("bearer ") {
            str = String(str.dropFirst(7)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if str.hasPrefix("\"") && str.hasSuffix("\"") && str.count >= 2 {
            str = String(str.dropFirst().dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if str.hasPrefix("{"), let data = str.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for key in ["token", "access_token", "authToken", "auth_token"] {
                if let val = dict[key] as? String, !val.isEmpty {
                    return val.replacingOccurrences(of: "Bearer ", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
        }
        return str.isEmpty ? nil : str
    }

    // MARK: - Course Name Parsing & Short Alias Resolution

    /// Strips institutional prefixes, section letters, and lab suffixes to return a clean full title
    /// (e.g., "Problem Solving & Programming", "System & AI Essentials", "Mathematics I").
    public static func cleanFullCourseTitle(_ rawName: String) -> String {
        var s = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return "Course" }

        // Strip institution prefix: "Newton School of Technology'26 (RU) - "
        if let range = s.range(of: #"^Newton School of Technology\S*\s*(?:\([^)]*\)\s*)?[-–—]\s*"#, options: [.regularExpression, .caseInsensitive]) {
            s.removeSubrange(range)
        }
        // Strip trailing section: " - B", " - D"
        if let range = s.range(of: #"\s*[-–—]\s*[A-Za-z0-9]+$"#, options: .regularExpression) {
            s.removeSubrange(range)
        }
        // Strip trailing practical markers: "Lab 1", "Practical 2"
        let markersPattern = NewtonSpecs.practicalMarkers.joined(separator: "|")
        if let range = s.range(of: "\\s*[-–—:]?\\s*\\b(\(markersPattern))\\b\\s*\\d*$", options: [.regularExpression, .caseInsensitive]) {
            s.removeSubrange(range)
        }

        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? rawName : s
    }

    public static func extractShortCourseName(_ rawName: String) -> String {
        let cleaned = cleanFullCourseTitle(rawName)
        let lower = cleaned.lowercased()
        if let alias = NewtonSpecs.courseAliases[lower] {
            return alias
        }
        for (fullTitle, alias) in NewtonSpecs.courseAliases {
            if lower == fullTitle.lowercased() || lower.hasPrefix(fullTitle.lowercased()) {
                return alias
            }
        }
        if cleaned.count <= 10 {
            return cleaned
        }
        let stopWords: Set<String> = ["and", "of", "the", "in", "to", "for", "with", "on", "at", "by", "an", "a"]
        let words = cleaned
            .components(separatedBy: CharacterSet(charactersIn: " &/,-"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !stopWords.contains($0.lowercased()) }
        if words.count >= 2 {
            return words.compactMap { $0.first.map { String($0).uppercased() } }.joined()
        }
        return String(cleaned.prefix(10)).trimmingCharacters(in: .whitespaces)
    }

    public static func parseCourseComponent(_ rawName: String) -> (baseKey: String, fullLabel: String, shortLabel: String, isPractical: Bool, component: String) {
        var plain = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = plain.range(of: #"^Newton School of Technology\S*\s*(?:\([^)]*\)\s*)?[-–—]\s*"#, options: [.regularExpression, .caseInsensitive]) {
            plain.removeSubrange(range)
        }
        if let secRange = plain.range(of: #"\s*[-–—]\s*[A-Za-z0-9]+$"#, options: .regularExpression) {
            plain.removeSubrange(secRange)
        }
        plain = plain.trimmingCharacters(in: .whitespacesAndNewlines)

        let markersPattern = NewtonSpecs.practicalMarkers.joined(separator: "|")
        if let pracRange = plain.range(of: "\\s*[-–—:]?\\s*\\b(\(markersPattern))\\b\\s*\\d*$", options: [.regularExpression, .caseInsensitive]) {
            var base = plain
            base.removeSubrange(pracRange)
            base = base.trimmingCharacters(in: .whitespacesAndNewlines)
            if !base.isEmpty {
                let short = extractShortCourseName(base)
                return (baseKey: short.lowercased(), fullLabel: base, shortLabel: short, isPractical: true, component: "Lab")
            }
        }
        let full = cleanFullCourseTitle(plain)
        let short = extractShortCourseName(full)
        return (baseKey: short.lowercased(), fullLabel: full, shortLabel: short, isPractical: false, component: "Lecture")
    }

    // MARK: - Pure Attendance Math (Ported from math.js)

    public static func computeAttendanceSummary(
        key: String,
        label: String,
        shortLabel: String,
        units: [SubjectComponentUnit],
        target: Double
    ) -> SubjectAttendanceSummary {
        let eps = NewtonSpecs.attendanceEpsilon
        var totalAtt = 0
        var totalHeld = 0
        var lecAtt = 0
        var lecHeld = 0
        var labAtt = 0
        var labHeld = 0
        var hasLab = false

        for u in units {
            let h = max(0, u.held)
            let a = min(max(0, u.attended), h)
            totalAtt += a
            totalHeld += h
            if u.isPractical {
                hasLab = true
                labAtt += a
                labHeld += h
            } else {
                lecAtt += a
                lecHeld += h
            }
        }

        let pct: Double? = totalHeld > 0 ? (Double(totalAtt) / Double(totalHeld)) : nil
        let meets = pct != nil && pct! >= (target - eps)

        var skips = 0
        var recover = 0
        var headline = "no-data"

        if pct != nil {
            if meets {
                headline = "skips"
                skips = max(0, Int(floor(Double(totalAtt) / target + eps)) - totalHeld)
            } else {
                headline = "recover"
                let deficit = target * Double(totalHeld) - Double(totalAtt)
                if deficit > eps {
                    recover = max(0, Int(ceil(deficit / (1.0 - target) - eps)))
                }
            }
        }

        return SubjectAttendanceSummary(
            key: key,
            label: label,
            shortLabel: shortLabel,
            attended: totalAtt,
            held: totalHeld,
            lectureAttended: lecAtt,
            lectureHeld: lecHeld,
            labAttended: labAtt,
            labHeld: labHeld,
            hasLab: hasLab,
            percentage: pct,
            target: target,
            meetsTarget: meets,
            headline: headline,
            skipsAffordable: skips,
            classesToRecover: recover
        )
    }

    // MARK: - Attendance State & Target Switching

    public var attendanceTarget: Double {
        get {
            if let diskTarget = readDiskState()?.attendanceTarget, diskTarget > 0.1 && diskTarget < 1.0 {
                return diskTarget
            }
            let val = defaults.double(forKey: attendanceTargetKey)
            if val > 0.1 && val < 1.0 {
                return val
            }
            let stdVal = UserDefaults.standard.double(forKey: attendanceTargetKey)
            if stdVal > 0.1 && stdVal < 1.0 {
                return stdVal
            }
            return NewtonSpecs.defaultAttendanceTarget
        }
        set {
            defaults.set(newValue, forKey: attendanceTargetKey)
            UserDefaults.standard.set(newValue, forKey: attendanceTargetKey)
            writeDiskState { state in
                state.attendanceTarget = newValue
                if let existing = state.cachedAttendance {
                    state.cachedAttendance = recomputeAttendance(existing, target: newValue)
                }
            }
            if var cached = loadCachedAttendance() {
                cached = recomputeAttendance(cached, target: newValue)
                saveCachedAttendance(cached)
            }
            defaults.synchronize()
            notifyWidgets()
        }
    }

    public func recomputeAttendance(_ data: AttendanceDashboardData, target: Double) -> AttendanceDashboardData {
        let eps = NewtonSpecs.attendanceEpsilon
        let updatedSubjects = data.subjects.map { subj -> SubjectAttendanceSummary in
            let pct: Double? = subj.held > 0 ? (Double(subj.attended) / Double(subj.held)) : nil
            let meets = pct != nil && pct! >= (target - eps)
            var skips = 0
            var recover = 0
            var headline = "no-data"
            if pct != nil {
                if meets {
                    headline = "skips"
                    skips = max(0, Int(floor(Double(subj.attended) / target + eps)) - subj.held)
                } else {
                    headline = "recover"
                    let deficit = target * Double(subj.held) - Double(subj.attended)
                    if deficit > eps {
                        recover = max(0, Int(ceil(deficit / (1.0 - target) - eps)))
                    }
                }
            }
            return SubjectAttendanceSummary(
                key: subj.key,
                label: subj.label,
                shortLabel: subj.shortLabel,
                attended: subj.attended,
                held: subj.held,
                lectureAttended: subj.lectureAttended,
                lectureHeld: subj.lectureHeld,
                labAttended: subj.labAttended,
                labHeld: subj.labHeld,
                hasLab: subj.hasLab,
                percentage: pct,
                target: target,
                meetsTarget: meets,
                headline: headline,
                skipsAffordable: skips,
                classesToRecover: recover
            )
        }
        return AttendanceDashboardData(
            semesterTitle: data.semesterTitle,
            target: target,
            updatedAt: data.updatedAt,
            subjects: updatedSubjects
        )
    }

    public func loadCachedAttendance() -> AttendanceDashboardData? {
        if let diskCached = readDiskState()?.cachedAttendance, !diskCached.subjects.isEmpty {
            return diskCached
        }
        if let data = defaults.data(forKey: attendanceCacheKey),
           let decoded = try? JSONDecoder().decode(AttendanceDashboardData.self, from: data),
           !decoded.subjects.isEmpty {
            return decoded
        }
        if let stdData = UserDefaults.standard.data(forKey: attendanceCacheKey),
           let decoded = try? JSONDecoder().decode(AttendanceDashboardData.self, from: stdData),
           !decoded.subjects.isEmpty {
            return decoded
        }
        return nil
    }

    private func saveCachedAttendance(_ dashboard: AttendanceDashboardData) {
        if let data = try? JSONEncoder().encode(dashboard) {
            defaults.set(data, forKey: attendanceCacheKey)
            UserDefaults.standard.set(data, forKey: attendanceCacheKey)
            defaults.synchronize()
        }
        writeDiskState { $0.cachedAttendance = dashboard }
    }

    public func loadAttendanceForWidget() -> AttendanceDashboardData {
        let activeTarget = attendanceTarget
        if let cached = loadCachedAttendance() {
            return recomputeAttendance(cached, target: activeTarget)
        }
        return recomputeAttendance(AttendanceDashboardData.sample, target: activeTarget)
    }

    // MARK: - Live Newton LMS Attendance Fetching

    private func fetchLMSJSON(path: String, token: String) async throws -> Any {
        let urlString = path.hasPrefix("http") ? path : "\(NewtonSpecs.portalOrigin)\(path)"
        guard let url = URL(string: urlString) else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    @discardableResult
    public func syncAllPortalData() async -> Bool {
        guard let token = authToken else { return false }
        let ok = await fetchAndCacheAttendance(token: token)
        notifyWidgets()
        return ok
    }

    @discardableResult
    public func fetchAndCacheAttendance(token: String) async -> Bool {
        do {
            let appliedAny = try await fetchLMSJSON(path: "/api/v2/course/all/applied/?pagination=false&completed=false", token: token)
            guard let programs = appliedAny as? [[String: Any]] else { return false }

            var activeSemesterHash: String?
            var activeSemesterTitle = "Current Semester"

            for prog in programs {
                let children = prog["children_courses"] as? [String: Any]
                let adminCourses = (children?["admin_unit_courses"] as? [[String: Any]]) ?? (prog["admin_unit_courses"] as? [[String: Any]]) ?? []
                if let active = adminCourses.first(where: { ($0["is_active_admin_unit_course"] as? Bool) == true }) ?? adminCourses.first,
                   let hash = active["hash"] as? String {
                    activeSemesterHash = hash
                    activeSemesterTitle = (active["title"] as? String) ?? "Current Semester"
                    break
                }
            }

            guard let semHash = activeSemesterHash else { return false }
            let coursesAny = try await fetchLMSJSON(path: "/api/v2/course/h/\(semHash)/learning_course/all/?pagination=false", token: token)
            guard let coursesList = coursesAny as? [[String: Any]], !coursesList.isEmpty else { return false }

            struct RawCourseMeta: Sendable {
                let index: Int
                let hash: String
                let rawTitle: String
                let fullTitle: String
            }

            let rawMetas: [RawCourseMeta] = coursesList.enumerated().compactMap { idx, c in
                guard let cHash = c["hash"] as? String else { return nil }
                let rawTitle = (c["short_display_name"] as? String) ?? (c["title"] as? String) ?? cHash
                let fullTitle = (c["title"] as? String) ?? rawTitle
                return RawCourseMeta(index: idx, hash: cHash, rawTitle: rawTitle, fullTitle: fullTitle)
            }

            // Concurrently fetch self_performance for all learning courses
            var indexedUnits: [(Int, SubjectComponentUnit)] = []
            await withTaskGroup(of: (Int, SubjectComponentUnit).self) { group in
                for meta in rawMetas {
                    group.addTask {
                        let parsed = Self.parseCourseComponent(meta.rawTitle)
                        var held = 0
                        var attended = 0
                        if let perf = try? await self.fetchLMSJSON(path: "/api/v2/course/h/\(meta.hash)/self_performance/", token: token) as? [String: Any] {
                            held = (perf["total_lectures"] as? Int) ?? 0
                            attended = (perf["total_lectures_attended"] as? Int) ?? 0
                        }
                        let unit = SubjectComponentUnit(
                            courseHash: meta.hash,
                            name: meta.rawTitle,
                            fullName: meta.fullTitle,
                            component: parsed.component,
                            isPractical: parsed.isPractical,
                            attended: attended,
                            held: held
                        )
                        return (meta.index, unit)
                    }
                }
                for await pair in group {
                    indexedUnits.append(pair)
                }
            }

            let units = indexedUnits.sorted { $0.0 < $1.0 }.map { $0.1 }

            // Group units by parsed baseKey while preserving full human-readable label and short alias
            var groupedUnits: [String: [SubjectComponentUnit]] = [:]
            var groupLabels: [String: (full: String, short: String)] = [:]
            var order: [String] = []

            for u in units {
                let parsed = Self.parseCourseComponent(u.name)
                let key = parsed.baseKey
                if groupedUnits[key] == nil {
                    groupedUnits[key] = []
                    groupLabels[key] = (full: parsed.fullLabel, short: parsed.shortLabel)
                    order.append(key)
                } else if !parsed.isPractical {
                    // Prefer the Theory / Lecture course's full name for the group label
                    groupLabels[key] = (full: parsed.fullLabel, short: parsed.shortLabel)
                }
                groupedUnits[key]?.append(u)
            }

            let currentTarget = attendanceTarget
            let summaries: [SubjectAttendanceSummary] = order.compactMap { key in
                guard let grpUnits = groupedUnits[key],
                      let labels = groupLabels[key] else { return nil }
                return Self.computeAttendanceSummary(
                    key: key,
                    label: labels.full,
                    shortLabel: labels.short,
                    units: grpUnits,
                    target: currentTarget
                )
            }

            let dashboard = AttendanceDashboardData(
                semesterTitle: activeSemesterTitle,
                target: currentTarget,
                updatedAt: Date().timeIntervalSince1970,
                subjects: summaries
            )
            saveCachedAttendance(dashboard)
            return true
        } catch {
            return false
        }
    }

    public func notifyWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: "com.newton.enhancer.widget.attendance")
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

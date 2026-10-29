import Foundation
import SwiftUI

public typealias AttendanceSnapshot = AttendanceDashboardData
public typealias AttendanceSubjectGroup = SubjectAttendanceSummary

extension AttendanceDashboardData {
    public var overallAttended: Int {
        subjects.reduce(0) { $0 + $1.attended }
    }

    public var overallHeld: Int {
        subjects.reduce(0) { $0 + $1.held }
    }

    public var isUsingSampleData: Bool {
        !PortalDataManager.shared.hasAuthToken && PortalDataManager.shared.loadCachedAttendance() == nil
    }

    public static func sample(target: Double) -> AttendanceDashboardData {
        PortalDataManager.shared.recomputeAttendance(AttendanceDashboardData.sample, target: target)
    }
}

extension SubjectAttendanceSummary {
    public var units: [SubjectComponentUnit] {
        var list: [SubjectComponentUnit] = []
        if lectureHeld > 0 || !hasLab {
            list.append(SubjectComponentUnit(
                courseHash: "\(key)-lec",
                name: shortLabel,
                fullName: label,
                component: "Lecture",
                isPractical: false,
                attended: lectureAttended,
                held: lectureHeld
            ))
        }
        if hasLab && labHeld > 0 {
            list.append(SubjectComponentUnit(
                courseHash: "\(key)-lab",
                name: "\(shortLabel) Lab",
                fullName: "\(label) Lab",
                component: "Lab",
                isPractical: true,
                attended: labAttended,
                held: labHeld
            ))
        }
        return list
    }
}

extension PortalDataManager {
    public func loadAuthToken() -> String? {
        authToken
    }

    public func saveAuthToken(_ raw: String?) {
        authToken = raw
    }

    public func selectAttendanceTarget(_ target: Double) {
        attendanceTarget = target
    }

    public func loadAttendanceSnapshot() -> AttendanceSnapshot {
        loadAttendanceForWidget()
    }

    @discardableResult
    public func fetchLiveAttendance() async -> Bool {
        guard let token = authToken else { return false }
        return await fetchAndCacheAttendance(token: token)
    }
}

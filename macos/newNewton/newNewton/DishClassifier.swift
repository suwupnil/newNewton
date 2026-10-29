import Foundation

public struct DishClassifier {
    // Driven by Zero-Overhead Single-Spec Codegen (NewtonSpecs)
    public static func isSideCourse(_ item: String) -> Bool {
        let clean = item.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if NewtonSpecs.commonItems.contains(clean) { return true }
        return NewtonSpecs.commonKeywords.contains { clean.contains($0) }
    }

    public static func classify(_ items: [String]) -> (mainCourse: [String], sideCourse: [String]) {
        var mains: [String] = []
        var sides: [String] = []

        for rawItem in items {
            let item = rawItem.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !item.isEmpty else { continue }
            if isSideCourse(item) {
                sides.append(item)
            } else {
                mains.append(item)
            }
        }

        return (mainCourse: mains, sideCourse: sides)
    }
}

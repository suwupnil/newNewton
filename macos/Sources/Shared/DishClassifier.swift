import Foundation

public struct DishClassifier {
    // Exact list of daily mundane staples used in newton-enhancer extension
    private static let commonItems: Set<String> = [
        "hot milk", "cold milk", "tea", "coffee powder", "cold coffee", "hot coffee", "coffee",
        "bread", "butter", "jam", "bread/butter/jam", "green salad",
        "tossed salad", "cucumber salad", "onion lachha", "laccha pyaaz",
        "chana sprout salad", "moong sprout salad", "cucumber-carrot salad",
        "ketchup", "chutney", "green chutney", "pickle", "curd",
        "sambar", "rasam", "chapati", "rice", "plain rice",
        "steamed rice", "jeera rice", "ghee rice", "dum pulao sada"
    ]

    // Keywords that automatically classify an item as secondary/side course
    private static let commonKeywords: [String] = [
        "milk", "tea", "coffee", "bread", "chapati", "rice", "salad",
        "chutney", "ketchup", "rasam", "sambar", "pickle", "curd",
        "fruit", "fruits", "watermelon", "banana", "papaya", "apple", "melon",
        "cornflakes", "chocos", "sprouts", "muesli", "oats"
    ]

    public static func isSideCourse(_ item: String) -> Bool {
        let clean = item.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if commonItems.contains(clean) { return true }
        return commonKeywords.contains { clean.contains($0) }
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

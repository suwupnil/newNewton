//
//  NewtonWidgetsBundle.swift
//  newNewtonWidgets
//
//  Created by Swapnil Pradhan on 18/10/26.
//

import WidgetKit
import SwiftUI

@main
struct newNewtonWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TodayMessMenuWidget()
        WeeklyMessMenuWidget()
        AttendanceWidget()
    }
}

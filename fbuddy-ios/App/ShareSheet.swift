import SwiftUI
import UIKit

/// Share sheet hệ thống. Một trong ít chức năng native thật của app — vừa hữu ích vừa
/// là bằng chứng cho guideline 4.2 (xem `APPSTORE_CHECKLIST.md`).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

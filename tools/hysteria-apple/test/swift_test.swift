import Foundation
import Hysteria   // module = tên framework bên trong xcframework

// Cùng phép thử như link_test.m, nhưng qua Swift.
var err: NSError?
let ok = MobileServe(0, 0, "", "", &err)
print("swift/import Hysteria -> MobileServe ok=\(ok) err=\(err?.localizedDescription ?? "(nil)")")
MobileStop()
print("swift/import Hysteria -> MobileStop ok")

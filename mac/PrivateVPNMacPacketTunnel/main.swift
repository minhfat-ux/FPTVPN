import Foundation
import NetworkExtension

// Điểm vào của **system extension**: hệ thống launch gói này như một tiến trình thường (khác appex
// plugin — appex để hệ thống tự dựng lớp principal theo `NSExtensionPrincipalClass`).
//
// `NEProvider.startSystemExtensionMode()` đọc bản đồ `NetworkExtension > NEProviderClasses` trong
// Info.plist rồi instantiate `HysteriaPacketTunnelProvider` mỗi khi NetworkExtension mở tunnel;
// `dispatchMain()` giữ tiến trình phục vụ tới khi hệ thống bảo dừng.
autoreleasepool {
    NEProvider.startSystemExtensionMode()
}
dispatchMain()

import type { Dict } from "../../types";

/** Nguồn sự thật (tiếng Việt). Thêm khoá mới ở đây trước, rồi dịch sang en/zh. */
export const shell: Dict = {
  // ---- khung ứng dụng
  "shell.loadingApp": "Đang tải {app}…",
  "shell.actionMenu": "Thêm",
  "shell.openConversations": "Mở danh sách hội thoại",
  "shell.openStudio": "Mở Studio",
  "shell.brandTagline": "FlowTech · MeetFlow AI",
  "shell.theme.toggle": "Đổi sáng/tối",
  "shell.studio": "Studio",

  // ---- điều hướng (Sidebar)
  "shell.sidebar.studio": "Studio: Ảnh · PPT · Excel · Dữ liệu",
  "shell.sidebar.hub": "Chợ kỹ năng",
  "shell.sidebar.topup": "Nạp token",
  "shell.sidebar.settings": "Cài đặt & MCP",
  "shell.sidebar.newChat": "Hội thoại mới",
  "shell.sidebar.searchPlaceholder": "Tìm hội thoại…",
  "shell.sidebar.pinned": "Đã ghim",
  "shell.sidebar.conversations": "Hội thoại",
  "shell.sidebar.viewingArchived": "Đang xem lưu trữ",
  "shell.sidebar.archived": "Lưu trữ",
  "shell.sidebar.empty.search": "Không tìm thấy hội thoại",
  "shell.sidebar.empty.searchHint": "Thử từ khoá khác",
  "shell.sidebar.empty.archived": "Chưa có hội thoại lưu trữ",
  "shell.sidebar.empty.none": "Chưa có hội thoại",
  "shell.sidebar.empty.noneHint": "Bắt đầu bằng nút “Hội thoại mới”",
  "shell.sidebar.unpin": "Bỏ ghim",
  "shell.sidebar.pin": "Ghim lên đầu",
  "shell.sidebar.unarchive": "Bỏ lưu trữ",
  "shell.sidebar.archive": "Lưu trữ",
  "shell.sidebar.deleteConversation": "Xoá hội thoại",
  "shell.sidebar.deleteTitle": "Xoá hội thoại?",
  "shell.sidebar.deleteMessage": "Toàn bộ tin nhắn của “{title}” sẽ bị xoá vĩnh viễn.",
  "shell.sidebar.updateFailed": "Không cập nhật được",
  "shell.sidebar.deleteFailed": "Không xoá được",
  "shell.sidebar.deleted": "Đã xoá hội thoại",

  // ---- thời gian tương đối
  "shell.relative.justNow": "vừa xong",
  "shell.relative.minutes": "{count} phút trước",
  "shell.relative.hours": "{count} giờ trước",
  "shell.relative.days": "{count} ngày trước",

  // ---- tiêu đề/phụ đề topbar theo view
  "shell.view.studio.title": "Studio",
  "shell.view.studio.subtitle": "Sửa ảnh, tạo PPT, Excel và phân tích dữ liệu",
  "shell.view.hub.title": "Chợ kỹ năng",
  "shell.view.hub.subtitle": "Mua kỹ năng bằng token và dùng ngay trong hội thoại",
  "shell.view.topup.title": "Nạp token",
  "shell.view.topup.subtitle": "Chuyển khoản để nạp token và mua thêm kỹ năng",
  "shell.view.settings.title": "Cài đặt",
  "shell.view.settings.subtitle": "Nhà cung cấp AI, MCP server và cấu hình hệ thống",
  "shell.view.chat.newTitle": "Hội thoại mới",
  "shell.view.chat.auto": "Chế độ tự động",
  "shell.view.chat.skill": "Kỹ năng: {skill}",
  "shell.view.chat.pick": "Chọn kỹ năng và bắt đầu trò chuyện",

  // ---- đăng nhập (khung/magic link)
  "shell.auth.loginFailed": "Liên kết đăng nhập không hợp lệ",
  "shell.auth.loginSuccess": "Đăng nhập thành công: {email}",

  // ---- lỗi ở tầng state
  "shell.state.openConversationFailed": "Không mở được hội thoại",
  "shell.state.uploadFailed": "Tải tệp thất bại",
  "shell.credits.loadBalanceFailed": "Không tải được số dư credit",
  "shell.credits.loadHistoryFailed": "Không tải được lịch sử credit",

  // ---- lý do bút toán credit
  "shell.credit.reason.signup": "Token khởi tạo",
  "shell.credit.reason.adminGrant": "Được cấp",
  "shell.credit.reason.adminDeduct": "Bị trừ",
  "shell.credit.reason.chatUsage": "Dùng cho chat",
  "shell.credit.reason.requestApproved": "Duyệt yêu cầu",

  // ---- chip credit + bảng giải thích
  "shell.credits.chip": "Credit: {balance}",
  "shell.credits.turnsLeftShort": "≈ {turns} lượt còn lại",
  "shell.credits.title": "Credit & lịch sử dùng",
  "shell.credits.panelIntro":
    "1 credit = 1 token (tính cả token vào và ra). Mỗi lượt trả lời trừ credit theo tổng token đã dùng, hiện tính {per} credit cho mỗi token. Lượt còn lại là con số ước tính theo mức dùng gần đây.",
  "shell.credits.granted": "Đã cấp",
  "shell.credits.spent": "Đã dùng",
  "shell.credits.turnsLeftLabel": "≈ lượt còn lại",
  "shell.credits.recent": "Lịch sử gần đây",
  "shell.credits.emptyEntries": "Chưa có giao dịch credit nào.",
  "shell.credits.reload": "Tải lại",
  "shell.credits.topupMore": "Nạp thêm",
  "shell.credits.delta": "{sign}{amount}",

  // ---- menu tài khoản
  "shell.profile.title": "Tài khoản & token",
  "shell.profile.roleAdmin": "Quản trị viên",
  "shell.profile.roleUser": "Người dùng",
  "shell.profile.logout": "Đăng xuất",
  "shell.profile.balanceLabel": "Số dư token",
  "shell.profile.turnsLeft": "≈ {turns} lượt còn lại",
  "shell.profile.turnsUnknown": "Chưa ước tính được số lượt còn lại.",
  "shell.profile.rateNote": "1 credit = 1 token (tính cả token vào và ra)",
  "shell.profile.statGranted": "Đã cấp",
  "shell.profile.statSpent": "Đã dùng",
  "shell.profile.statEntries": "Số lần dùng",
  "shell.profile.memberSince": "Thành viên từ {date}",
  "shell.profile.buyTokens": "Mua thêm token",
  "shell.profile.requestTokens": "Xin thêm token",
  "shell.profile.fullHistory": "Toàn bộ lịch sử",
  "shell.profile.recentHistory": "Lịch sử gần đây",
  "shell.profile.viewAll": "Xem tất cả",
  "shell.profile.historyLoading": "Đang tải lịch sử…",
  "shell.profile.historyEmpty": "Chưa có giao dịch token nào.",
  "shell.ecosystem.title": "Cài app hệ sinh thái FlowTech",

  "shell.ecosystem.sub": "VPNFlow cho kết nối riêng tư · MeetFlow AI trong túi — miễn phí tải về.",

  "shell.ecosystem.subExpanded": "Chọn đúng bản cho thiết bị của anh:",

  "shell.ecosystem.showApps": "Tải app",

  "shell.ecosystem.allApps": "Trang tải & mua",

  "shell.ecosystem.dismiss": "Ẩn banner",

  "shell.ecosystem.never": "Không hiện lại",

  "shell.ecosystem.snoozeNote": "Ẩn {days} ngày",

  "shell.ecosystem.vpnflowPitch": "Kết nối riêng tư tốc độ cao, không giới hạn dung lượng.",

  "shell.ecosystem.meetflowPitch": "Trợ lý AI đa năng: hỏi đáp, viết, dịch, tạo ảnh trên điện thoại.",

  "shell.ecosystem.download.windows": "Windows",

  "shell.ecosystem.download.macos": "macOS",

  "shell.ecosystem.download.ios": "iPhone / iPad",

  "shell.ecosystem.download.android": "Android",

  "shell.ecosystem.download.other": "Tải về",
  "shell.sessions.title": "Thiết bị đang đăng nhập",

  "shell.sessions.hint": "Cùng một email có thể đăng nhập trên nhiều thiết bị. Đăng xuất ở đây chỉ ảnh hưởng thiết bị đó; hội thoại và ngữ cảnh vẫn theo tài khoản sang các máy khác.",

  "shell.sessions.current": "Thiết bị này",

  "shell.sessions.unknownDevice": "Thiết bị không xác định",

  "shell.sessions.lastSeen": "Hoạt động {time}",

  "shell.sessions.revoke": "Đăng xuất",

  "shell.sessions.logoutHere": "Đăng xuất máy này",

  "shell.sessions.revokeOthers": "Đăng xuất {count} thiết bị khác",

  "shell.sessions.revoked": "Đã đăng xuất {device}",

  "shell.sessions.othersRevoked": "Đã đăng xuất {count} thiết bị khác",

  "shell.sessions.noOthers": "Không còn thiết bị nào khác",

  "shell.sessions.loadFailed": "Không tải được danh sách thiết bị",

  "shell.sessions.revokeFailed": "Không đăng xuất được thiết bị này",

  "shell.sessions.confirmTitle": "Đăng xuất thiết bị?",

  "shell.sessions.confirmBody": "{device} sẽ phải đăng nhập lại. Các thiết bị khác không bị ảnh hưởng.",

  "shell.sessions.confirmAction": "Đăng xuất",

  "shell.sessions.confirmOthersTitle": "Đăng xuất mọi thiết bị khác?",

  "shell.sessions.confirmOthersBody": "{count} thiết bị khác sẽ phải đăng nhập lại. Thiết bị này vẫn giữ đăng nhập.",

  "shell.sessions.confirmOthersAction": "Đăng xuất các thiết bị khác",
  "shell.profile.languageLabel": "Ngôn ngữ hiển thị",

  // ---- components/ui.tsx
  "shell.ui.copyBlock": "Sao chép",
  "shell.ui.modalClose": "Đóng",
  "shell.ui.toastDismiss": "Đóng",
  "shell.ui.busy": "Đang xử lý…",
  "shell.ui.chartEmpty": "Chưa có dữ liệu biểu đồ",
  "shell.ui.chartEmptyHint": "Thêm thao tác phân tích để sinh biểu đồ.",
  "shell.profile.templatesTitle": "Mẫu của tôi (Word · Excel · PPT)",
  "shell.profile.templatesDesc": "Tải mẫu riêng của anh lên để fBuddy làm tài liệu ĐÚNG định dạng công ty.",
  "shell.profile.templatesGuide1": "Anh muốn fBuddy làm slide/Word/Excel theo mẫu của công ty? Tải mẫu lên đây trước.",
  "shell.profile.templatesGuide2": "Sau đó vào ô chat, bấm chip “Chọn mẫu” để dùng mẫu cho lượt đó.",
  "shell.profile.templatesGuide3": "Excel: fBuddy điền số liệu vào chính file mẫu (giữ công thức, định dạng, logo). Word/PPT: bám đúng bố cục và thứ tự mục của mẫu.",
};

import type { Dict } from "../../types";

/** Nguồn sự thật (tiếng Việt). Thêm khoá mới ở đây trước, rồi dịch sang en/zh. */
export const auth: Dict = {
  /* Landing (cột thương hiệu bên trái trang đăng nhập). */
  "auth.landing.tagline": "FlowTech · MeetFlow AI",
  "auth.landing.headline": "Trợ lý AI cho công việc hằng ngày của bạn",
  "auth.landing.pitch":
    "Chat, dịch trực tiếp, tạo slide và xử lý dữ liệu — tất cả trong một chỗ, chi phí kiểm soát được.",
  "auth.landing.point1": "Chat đa kỹ năng: văn bản, ảnh, bảng tính, slide",
  "auth.landing.point2": "Dịch và ghi chú cuộc họp theo thời gian thực",
  "auth.landing.point3": "Tài khoản doanh nghiệp: phân quyền, hạn mức, nhật ký",

  "auth.login.emailTitle": "Đăng nhập bằng email",
  "auth.login.emailHint": "Nhập email công ty, em sẽ gửi một mã dùng một lần. Không cần mật khẩu.",
  "auth.login.emailLabel": "Email",
  "auth.login.emailPlaceholder": "ban@congty.vn",
  "auth.login.sendCode": "Gửi mã đăng nhập",
  "auth.login.sendingCode": "Đang gửi mã…",
  "auth.login.firstUserHint":
    "Đây là lần thiết lập đầu tiên — email đăng nhập đầu tiên sẽ trở thành quản trị viên.",

  "auth.login.changeEmail": "Đổi email khác",
  "auth.login.codeTitle": "Nhập mã đăng nhập",
  "auth.login.codeSent": "Mã 6 chữ số đã gửi tới {email}. Hiệu lực {minutes} phút.",
  "auth.login.codeFor": "Mã đăng nhập cho {email}.",
  "auth.login.codeLabel": "Mã đăng nhập",
  "auth.login.codePlaceholder": "••••••",
  "auth.login.devCodeTitle": "Mã dùng ngay (chưa cấu hình email)",
  "auth.login.devCodeInfo":
    "Chưa cấu hình email nên mã hiển thị ngay bên dưới (bật Resend trong Cài đặt để gửi thật).",
  "auth.login.verifying": "Đang kiểm tra…",
  "auth.login.submit": "Đăng nhập",
  "auth.login.resendIn": "Gửi lại mã sau {seconds}s",
  "auth.login.resend": "Gửi lại mã",

  "auth.login.passwordTitle": "Đăng nhập bằng mật khẩu",
  "auth.login.passwordHint": "Dành cho tài khoản do quản trị viên tạo trực tiếp.",
  "auth.login.backToEmail": "Về đăng nhập bằng email",
  "auth.login.passwordLabel": "Mật khẩu",
  "auth.login.usePassword": "Dùng mật khẩu (dự phòng)",

  "auth.login.comingSoon": "Sắp bổ sung",
  "auth.login.googleTitle": "Sẽ dùng Firebase Authentication",
  "auth.login.facebookTitle": "Sẽ dùng Facebook Login",

  "auth.login.sent": "Đã gửi mã tới {email}. Mã có hiệu lực {minutes} phút.",
  "auth.login.sendFallback": "Nếu email hợp lệ, mã đăng nhập sẽ được gửi tới hộp thư.",
  "auth.login.sendFailed": "Không gửi được mã, thử lại sau",
  "auth.login.codeLength": "Mã gồm 6 chữ số trong email. Anh kiểm tra lại giúp em nhé.",
  "auth.login.codeWrong": "Mã không đúng, thử lại",
  "auth.login.failed": "Không đăng nhập được",
  "auth.login.success": "Đăng nhập thành công",

  /* Đăng ký tài khoản mới (bắt buộc xác thực email mới active). */
  "auth.register.open": "Chưa có tài khoản? Đăng ký",
  "auth.register.back": "Về đăng nhập",
  "auth.register.title": "Đăng ký tài khoản",
  "auth.register.hint":
    "Điền email và mật khẩu. fBuddy sẽ gửi mã xác thực — xác thực xong tài khoản mới hoạt động.",
  "auth.register.nameLabel": "Tên hiển thị (không bắt buộc)",
  "auth.register.namePlaceholder": "Anh Minh",
  "auth.register.passwordHint": "Mật khẩu tối thiểu 8 ký tự.",
  "auth.register.submit": "Đăng ký",
  "auth.register.busy": "Đang tạo tài khoản…",
  "auth.register.failed": "Không đăng ký được, thử lại sau",

  /* Xác thực email = kích hoạt tài khoản. */
  "auth.verify.title": "Kích hoạt tài khoản",
  "auth.verify.hint": "Mã 6 chữ số đã gửi tới {email}. Nhập mã để kích hoạt tài khoản.",
  "auth.verify.label": "Mã xác thực email",
  "auth.verify.submit": "Kích hoạt tài khoản",
  "auth.verify.busy": "Đang kích hoạt…",
  "auth.verify.resend": "Gửi lại mã kích hoạt",
  "auth.verify.resent": "Đã gửi lại mã kích hoạt tới {email}.",
  "auth.verify.sent": "Đã gửi mã kích hoạt tới {email}. Hiệu lực {minutes} phút.",
  "auth.verify.devTitle": "Mã kích hoạt (chưa cấu hình email)",
  "auth.verify.required": "Tài khoản chưa xác thực email. Nhập mã trong hộp thư để kích hoạt.",
  "auth.verify.wrong": "Mã xác thực không đúng, thử lại",
  "auth.verify.success": "Đã kích hoạt tài khoản",
};

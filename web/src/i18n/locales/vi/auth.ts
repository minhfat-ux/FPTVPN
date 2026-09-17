import type { Dict } from "../../types";

/** Nguồn sự thật (tiếng Việt). Thêm khoá mới ở đây trước, rồi dịch sang en/zh. */
export const auth: Dict = {
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
};

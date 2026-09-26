import type { Dict } from "../../types";

/** 本命名空间的中文翻译。 */
export const auth: Dict = {
  /* 落地页（登录页左侧品牌栏）。 */
  "auth.landing.tagline": "FlowTech · MeetFlow AI",
  "auth.landing.headline": "为你日常工作打造的 AI 助手",
  "auth.landing.pitch": "聊天、实时翻译、幻灯片与数据处理，集中在一处，成本可控。",
  "auth.landing.point1": "多技能聊天：文本、图片、表格、幻灯片",
  "auth.landing.point2": "实时翻译与会议记录",
  "auth.landing.point3": "企业账号：权限、额度与操作日志",

  "auth.login.emailTitle": "使用邮箱登录",
  "auth.login.emailHint": "请输入公司邮箱，我们会发送一次性验证码，无需密码。",
  "auth.login.emailLabel": "邮箱",
  "auth.login.emailPlaceholder": "you@company.com",
  "auth.login.sendCode": "发送登录验证码",
  "auth.login.sendingCode": "正在发送验证码…",
  "auth.login.firstUserHint": "这是首次初始化——第一个登录的邮箱将成为管理员。",

  "auth.login.changeEmail": "更换邮箱",
  "auth.login.codeTitle": "输入登录验证码",
  "auth.login.codeSent": "6 位验证码已发送至 {email}，有效期为 {minutes} 分钟。",
  "auth.login.codeFor": "{email} 的登录验证码。",
  "auth.login.codeLabel": "登录验证码",
  "auth.login.codePlaceholder": "••••••",
  "auth.login.devCodeTitle": "可立即使用的验证码（尚未配置邮箱）",
  "auth.login.devCodeInfo": "尚未配置邮箱，因此验证码直接显示在下方（在设置中开启 Resend 即可真实发送）。",
  "auth.login.verifying": "正在验证…",
  "auth.login.submit": "登录",
  "auth.login.resendIn": "{seconds} 秒后可重新发送验证码",
  "auth.login.resend": "重新发送验证码",

  "auth.login.passwordTitle": "使用密码登录",
  "auth.login.passwordHint": "适用于由管理员直接创建的账号。",
  "auth.login.backToEmail": "返回邮箱登录",
  "auth.login.passwordLabel": "密码",
  "auth.login.usePassword": "使用密码（备用）",

  "auth.login.comingSoon": "即将推出",
  "auth.login.googleTitle": "将使用 Firebase Authentication",
  "auth.login.facebookTitle": "将使用 Facebook Login",

  "auth.login.sent": "验证码已发送至 {email}，有效期为 {minutes} 分钟。",
  "auth.login.sendFallback": "如果邮箱有效，登录验证码将发送到该邮箱。",
  "auth.login.sendFailed": "无法发送验证码，请稍后重试",
  "auth.login.codeLength": "验证码是邮件中的 6 位数字，请再检查一下。",
  "auth.login.codeWrong": "验证码不正确，请重试",
  "auth.login.failed": "无法登录",
  "auth.login.success": "登录成功",

  /* 注册新账号（必须验证邮箱后账号才生效）。 */
  "auth.register.open": "还没有账号？立即注册",
  "auth.register.back": "返回登录",
  "auth.register.title": "注册账号",
  "auth.register.hint": "填写邮箱和密码。fBuddy 会发送验证码——验证通过后账号才能使用。",
  "auth.register.nameLabel": "显示名称（可选）",
  "auth.register.namePlaceholder": "Minh",
  "auth.register.passwordHint": "密码至少 8 个字符。",
  "auth.register.submit": "注册",
  "auth.register.busy": "正在创建账号…",
  "auth.register.failed": "注册失败，请稍后重试",

  /* 邮箱验证 = 激活账号。 */
  "auth.verify.title": "激活账号",
  "auth.verify.hint": "6 位验证码已发送至 {email}。请输入以激活账号。",
  "auth.verify.label": "邮箱验证码",
  "auth.verify.submit": "激活账号",
  "auth.verify.busy": "正在激活…",
  "auth.verify.resend": "重新发送验证码",
  "auth.verify.resent": "验证码已重新发送至 {email}。",
  "auth.verify.sent": "验证码已发送至 {email}，{minutes} 分钟内有效。",
  "auth.verify.devTitle": "激活码（未配置邮件服务）",
  "auth.verify.required": "账号尚未验证邮箱。请输入收件箱中的验证码以激活。",
  "auth.verify.wrong": "验证码不正确，请重试",
  "auth.verify.success": "账号已激活",
};

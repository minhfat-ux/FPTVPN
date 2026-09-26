import type { Dict } from "../../types";

/** English translations for this namespace. */
export const auth: Dict = {
  /* Landing (brand column on the sign-in page). */
  "auth.landing.tagline": "FlowTech · MeetFlow AI",
  "auth.landing.headline": "An AI assistant for your everyday work",
  "auth.landing.pitch":
    "Chat, live translation, slides and data work — all in one place, with costs you can control.",
  "auth.landing.point1": "Multi-skill chat: text, images, spreadsheets, slides",
  "auth.landing.point2": "Real-time translation and meeting notes",
  "auth.landing.point3": "Business accounts: roles, quotas and audit log",

  "auth.login.emailTitle": "Sign in with email",
  "auth.login.emailHint": "Enter your work email and we will send a one-time code. No password needed.",
  "auth.login.emailLabel": "Email",
  "auth.login.emailPlaceholder": "you@company.com",
  "auth.login.sendCode": "Send login code",
  "auth.login.sendingCode": "Sending code…",
  "auth.login.firstUserHint": "This is the first-time setup — the first email to sign in becomes the administrator.",

  "auth.login.changeEmail": "Use another email",
  "auth.login.codeTitle": "Enter the login code",
  "auth.login.codeSent": "A 6-digit code was sent to {email}. It is valid for {minutes} minutes.",
  "auth.login.codeFor": "Login code for {email}.",
  "auth.login.codeLabel": "Login code",
  "auth.login.codePlaceholder": "••••••",
  "auth.login.devCodeTitle": "Code to use now (email is not configured)",
  "auth.login.devCodeInfo":
    "Email is not configured, so the code is shown right below (turn on Resend in Settings to actually deliver it).",
  "auth.login.verifying": "Checking…",
  "auth.login.submit": "Sign in",
  "auth.login.resendIn": "Resend the code in {seconds}s",
  "auth.login.resend": "Resend code",

  "auth.login.passwordTitle": "Sign in with a password",
  "auth.login.passwordHint": "For accounts created directly by an administrator.",
  "auth.login.backToEmail": "Back to email sign-in",
  "auth.login.passwordLabel": "Password",
  "auth.login.usePassword": "Use a password (fallback)",

  "auth.login.comingSoon": "Coming soon",
  "auth.login.googleTitle": "Will use Firebase Authentication",
  "auth.login.facebookTitle": "Will use Facebook Login",

  "auth.login.sent": "Code sent to {email}. It is valid for {minutes} minutes.",
  "auth.login.sendFallback": "If the email is valid, a login code will be sent to that inbox.",
  "auth.login.sendFailed": "Could not send the code, please try again later",
  "auth.login.codeLength": "The code has 6 digits, as shown in the email. Please check it again.",
  "auth.login.codeWrong": "That code is not right, please try again",
  "auth.login.failed": "Could not sign in",
  "auth.login.success": "Signed in successfully",

  /* Sign-up (email must be verified before the account is active). */
  "auth.register.open": "No account yet? Sign up",
  "auth.register.back": "Back to sign in",
  "auth.register.title": "Create your account",
  "auth.register.hint":
    "Enter your email and a password. fBuddy sends a verification code — the account becomes active only after you verify.",
  "auth.register.nameLabel": "Display name (optional)",
  "auth.register.namePlaceholder": "Minh",
  "auth.register.passwordHint": "At least 8 characters.",
  "auth.register.submit": "Sign up",
  "auth.register.busy": "Creating account…",
  "auth.register.failed": "Could not sign up, please try again",

  /* Email verification = account activation. */
  "auth.verify.title": "Activate your account",
  "auth.verify.hint": "We sent a 6-digit code to {email}. Enter it to activate your account.",
  "auth.verify.label": "Email verification code",
  "auth.verify.submit": "Activate account",
  "auth.verify.busy": "Activating…",
  "auth.verify.resend": "Resend activation code",
  "auth.verify.resent": "Activation code sent again to {email}.",
  "auth.verify.sent": "Activation code sent to {email}. Valid for {minutes} minutes.",
  "auth.verify.devTitle": "Activation code (no mailer configured)",
  "auth.verify.required": "This account is not verified yet. Enter the code from your inbox to activate it.",
  "auth.verify.wrong": "Wrong verification code, please try again",
  "auth.verify.success": "Account activated",
};

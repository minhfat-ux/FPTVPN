import type { Dict } from "../../types";

/** English translations for this namespace. */
export const auth: Dict = {
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
};

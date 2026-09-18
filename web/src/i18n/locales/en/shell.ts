import type { Dict } from "../../types";

/** English translations for this namespace. */
export const shell: Dict = {
  // ---- app frame
  "shell.loadingApp": "Loading {app}…",
  "shell.actionMenu": "More",
  "shell.openConversations": "Open the conversation list",
  "shell.openStudio": "Open Studio",
  "shell.brandTagline": "FlowTech · MeetFlow AI",
  "shell.theme.toggle": "Switch light/dark",
  "shell.studio": "Studio",

  // ---- navigation (Sidebar)
  "shell.sidebar.studio": "Studio: Image · PPT · Excel · Data",
  "shell.sidebar.hub": "Skill marketplace",
  "shell.sidebar.topup": "Top up tokens",
  "shell.sidebar.settings": "Settings & MCP",
  "shell.sidebar.newChat": "New conversation",
  "shell.sidebar.searchPlaceholder": "Search conversations…",
  "shell.sidebar.pinned": "Pinned",
  "shell.sidebar.conversations": "Conversations",
  "shell.sidebar.viewingArchived": "Viewing archive",
  "shell.sidebar.archived": "Archive",
  "shell.sidebar.empty.search": "No conversations found",
  "shell.sidebar.empty.searchHint": "Try another keyword",
  "shell.sidebar.empty.archived": "No archived conversations",
  "shell.sidebar.empty.none": "No conversations yet",
  "shell.sidebar.empty.noneHint": "Start with the “New conversation” button",
  "shell.sidebar.unpin": "Unpin",
  "shell.sidebar.pin": "Pin to top",
  "shell.sidebar.unarchive": "Unarchive",
  "shell.sidebar.archive": "Archive",
  "shell.sidebar.deleteConversation": "Delete conversation",
  "shell.sidebar.deleteTitle": "Delete this conversation?",
  "shell.sidebar.deleteMessage": "Every message in “{title}” will be deleted permanently.",
  "shell.sidebar.updateFailed": "Could not update",
  "shell.sidebar.deleteFailed": "Could not delete",
  "shell.sidebar.deleted": "Conversation deleted",

  // ---- relative time
  "shell.relative.justNow": "just now",
  "shell.relative.minutes": "{count} minutes ago",
  "shell.relative.hours": "{count} hours ago",
  "shell.relative.days": "{count} days ago",

  // ---- topbar title/subtitle per view
  "shell.view.studio.title": "Studio",
  "shell.view.studio.subtitle": "Edit images, build PPT and Excel files, analyse data",
  "shell.view.hub.title": "Skill marketplace",
  "shell.view.hub.subtitle": "Buy skills with tokens and use them right in the conversation",
  "shell.view.topup.title": "Top up tokens",
  "shell.view.topup.subtitle": "Transfer money to top up tokens and buy more skills",
  "shell.view.settings.title": "Settings",
  "shell.view.settings.subtitle": "AI providers, MCP servers and system configuration",
  "shell.view.chat.newTitle": "New conversation",
  "shell.view.chat.auto": "Automatic mode",
  "shell.view.chat.skill": "Skill: {skill}",
  "shell.view.chat.pick": "Pick a skill and start chatting",


  // ---- login (frame / magic link)
  "shell.auth.loginFailed": "This login link is not valid",
  "shell.auth.loginSuccess": "Signed in successfully: {email}",

  // ---- state-layer errors
  "shell.state.openConversationFailed": "Could not open the conversation",
  "shell.state.uploadFailed": "File upload failed",
  "shell.credits.loadBalanceFailed": "Could not load the credit balance",
  "shell.credits.loadHistoryFailed": "Could not load the credit history",

  // ---- credit ledger reasons
  "shell.credit.reason.signup": "Signup tokens",
  "shell.credit.reason.adminGrant": "Granted",
  "shell.credit.reason.adminDeduct": "Deducted",
  "shell.credit.reason.chatUsage": "Chat usage",
  "shell.credit.reason.requestApproved": "Request approved",

  // ---- credit chip + panel
  "shell.credits.chip": "Credit: {balance}",
  "shell.credits.turnsLeftShort": "≈ {turns} turns left",
  "shell.credits.title": "Credit & usage history",
  "shell.credits.panelIntro":
    "1 credit = 1 token (input and output tokens alike). Every reply deducts credit for the total tokens used; it currently charges {per} credit per token. Turns left is an estimate based on recent usage.",
  "shell.credits.granted": "Granted",
  "shell.credits.spent": "Used",
  "shell.credits.turnsLeftLabel": "≈ turns left",
  "shell.credits.recent": "Recent history",
  "shell.credits.emptyEntries": "No credit transactions yet.",
  "shell.credits.reload": "Reload",
  "shell.credits.topupMore": "Top up",
  "shell.credits.delta": "{sign}{amount}",

  // ---- profile menu
  "shell.profile.title": "Account & tokens",
  "shell.profile.roleAdmin": "Administrator",
  "shell.profile.roleUser": "User",
  "shell.profile.logout": "Sign out",
  "shell.profile.balanceLabel": "Token balance",
  "shell.profile.turnsLeft": "≈ {turns} turns left",
  "shell.profile.turnsUnknown": "Turns left cannot be estimated yet.",
  "shell.profile.rateNote": "1 credit = 1 token (input and output tokens alike)",
  "shell.profile.statGranted": "Granted",
  "shell.profile.statSpent": "Used",
  "shell.profile.statEntries": "Usage count",
  "shell.profile.memberSince": "Member since {date}",
  "shell.profile.buyTokens": "Buy more tokens",
  "shell.profile.requestTokens": "Request more tokens",
  "shell.profile.fullHistory": "Full history",
  "shell.profile.recentHistory": "Recent history",
  "shell.profile.viewAll": "View all",
  "shell.profile.historyLoading": "Loading history…",
  "shell.profile.historyEmpty": "No token transactions yet.",
  "shell.ecosystem.title": "Get the FlowTech apps",

  "shell.ecosystem.sub": "VPNFlow for a private connection · MeetFlow AI in your pocket — free downloads.",

  "shell.ecosystem.subExpanded": "Pick the build for this device:",

  "shell.ecosystem.showApps": "Download apps",

  "shell.ecosystem.allApps": "Downloads & pricing",

  "shell.ecosystem.dismiss": "Hide banner",

  "shell.ecosystem.never": "Don't show again",

  "shell.ecosystem.snoozeNote": "Hidden for {days} days",

  "shell.ecosystem.vpnflowPitch": "Fast private connection, unlimited data.",

  "shell.ecosystem.meetflowPitch": "A pocket AI assistant: chat, write, translate, create images.",

  "shell.ecosystem.download.windows": "Windows",

  "shell.ecosystem.download.macos": "macOS",

  "shell.ecosystem.download.ios": "iPhone / iPad",

  "shell.ecosystem.download.android": "Android",

  "shell.ecosystem.download.other": "Download",
  "shell.sessions.title": "Signed-in devices",

  "shell.sessions.hint": "The same email can be signed in on several devices. Signing out here only affects that device; conversations and context follow the account to the others.",

  "shell.sessions.current": "This device",

  "shell.sessions.unknownDevice": "Unknown device",

  "shell.sessions.lastSeen": "Active {time}",

  "shell.sessions.revoke": "Sign out",

  "shell.sessions.logoutHere": "Sign out this device",

  "shell.sessions.revokeOthers": "Sign out {count} other devices",

  "shell.sessions.revoked": "Signed out {device}",

  "shell.sessions.othersRevoked": "Signed out {count} other devices",

  "shell.sessions.noOthers": "No other devices",

  "shell.sessions.loadFailed": "Could not load the device list",

  "shell.sessions.revokeFailed": "Could not sign that device out",

  "shell.sessions.confirmTitle": "Sign this device out?",

  "shell.sessions.confirmBody": "{device} will have to sign in again. Other devices are not affected.",

  "shell.sessions.confirmAction": "Sign out",

  "shell.sessions.confirmOthersTitle": "Sign out all other devices?",

  "shell.sessions.confirmOthersBody": "{count} other devices will have to sign in again. This device stays signed in.",

  "shell.sessions.confirmOthersAction": "Sign out other devices",
  "shell.profile.languageLabel": "Display language",

  // ---- components/ui.tsx
  "shell.ui.copyBlock": "Copy",
  "shell.ui.modalClose": "Close",
  "shell.ui.toastDismiss": "Close",
  "shell.ui.busy": "Working…",
  "shell.ui.chartEmpty": "No chart data yet",
  "shell.ui.chartEmptyHint": "Add an analysis step to generate a chart.",
};

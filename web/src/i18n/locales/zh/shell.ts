import type { Dict } from "../../types";

/** 本命名空间的中文翻译。 */
export const shell: Dict = {
  // ---- 应用框架
  "shell.loadingApp": "正在加载 {app}…",
  "shell.actionMenu": "更多",
  "shell.openConversations": "打开会话列表",
  "shell.openStudio": "打开 Studio",
  "shell.brandTagline": "FlowTech · MeetFlow AI",
  "shell.theme.toggle": "切换深色/浅色",
  "shell.studio": "Studio",

  // ---- 导航（侧边栏）
  "shell.sidebar.studio": "Studio：图片 · PPT · Excel · 数据",
  "shell.sidebar.hub": "技能市场",
  "shell.sidebar.topup": "充值代币",
  "shell.sidebar.settings": "设置与 MCP",
  "shell.sidebar.newChat": "新建会话",
  "shell.sidebar.searchPlaceholder": "搜索会话…",
  "shell.sidebar.pinned": "已置顶",
  "shell.sidebar.conversations": "会话",
  "shell.sidebar.viewingArchived": "正在查看归档",
  "shell.sidebar.archived": "归档",
  "shell.sidebar.empty.search": "未找到会话",
  "shell.sidebar.empty.searchHint": "换个关键词试试",
  "shell.sidebar.empty.archived": "没有已归档的会话",
  "shell.sidebar.empty.none": "还没有会话",
  "shell.sidebar.empty.noneHint": "点击“新建会话”按钮开始",
  "shell.sidebar.unpin": "取消置顶",
  "shell.sidebar.pin": "置顶",
  "shell.sidebar.unarchive": "取消归档",
  "shell.sidebar.archive": "归档",
  "shell.sidebar.deleteConversation": "删除会话",
  "shell.sidebar.deleteTitle": "删除该会话？",
  "shell.sidebar.deleteMessage": "“{title}”的全部消息将被永久删除。",
  "shell.sidebar.updateFailed": "无法更新",
  "shell.sidebar.deleteFailed": "无法删除",
  "shell.sidebar.deleted": "会话已删除",

  // ---- 相对时间
  "shell.relative.justNow": "刚刚",
  "shell.relative.minutes": "{count} 分钟前",
  "shell.relative.hours": "{count} 小时前",
  "shell.relative.days": "{count} 天前",

  // ---- 各视图的顶栏标题/副标题
  "shell.view.studio.title": "Studio",
  "shell.view.studio.subtitle": "修图、生成 PPT 与 Excel、数据分析",
  "shell.view.hub.title": "技能市场",
  "shell.view.hub.subtitle": "用代币购买技能，并直接在会话中使用",
  "shell.view.topup.title": "充值代币",
  "shell.view.topup.subtitle": "通过银行转账充值代币并购买更多技能",
  "shell.view.settings.title": "设置",
  "shell.view.settings.subtitle": "AI 提供商、MCP 服务器与系统配置",
  "shell.view.chat.newTitle": "新会话",
  "shell.view.chat.auto": "自动模式",
  "shell.view.chat.skill": "技能：{skill}",
  "shell.view.chat.pick": "选择技能并开始对话",

  // ---- 登录（框架 / 魔法链接）
  "shell.auth.loginFailed": "登录链接无效",
  "shell.auth.loginSuccess": "登录成功：{email}",

  // ---- 状态层错误
  "shell.state.openConversationFailed": "无法打开会话",
  "shell.state.uploadFailed": "文件上传失败",
  "shell.credits.loadBalanceFailed": "无法加载额度余额",
  "shell.credits.loadHistoryFailed": "无法加载额度记录",

  // ---- 额度流水原因
  "shell.credit.reason.signup": "初始代币",
  "shell.credit.reason.adminGrant": "已发放",
  "shell.credit.reason.adminDeduct": "已扣除",
  "shell.credit.reason.chatUsage": "聊天消耗",
  "shell.credit.reason.requestApproved": "申请已批准",

  // ---- 额度徽标与面板
  "shell.credits.chip": "额度：{balance}",
  "shell.credits.turnsLeftShort": "≈ 剩余 {turns} 轮",
  "shell.credits.title": "额度与使用记录",
  "shell.credits.panelIntro":
    "1 额度 = 1 个代币（输入和输出代币都计算）。每轮回复按使用的代币总量扣减额度，目前每个代币扣 {per} 额度。剩余轮数是根据近期用量估算的数值。",
  "shell.credits.granted": "已发放",
  "shell.credits.spent": "已使用",
  "shell.credits.turnsLeftLabel": "≈ 剩余轮数",
  "shell.credits.recent": "最近记录",
  "shell.credits.emptyEntries": "还没有额度交易。",
  "shell.credits.reload": "重新加载",
  "shell.credits.topupMore": "充值",
  "shell.credits.delta": "{sign}{amount}",

  // ---- 账号菜单
  "shell.profile.title": "账号与代币",
  "shell.profile.roleAdmin": "管理员",
  "shell.profile.roleUser": "用户",
  "shell.profile.logout": "退出登录",
  "shell.profile.balanceLabel": "代币余额",
  "shell.profile.turnsLeft": "≈ 剩余 {turns} 轮",
  "shell.profile.turnsUnknown": "暂时无法估算剩余轮数。",
  "shell.profile.rateNote": "1 额度 = 1 个代币（输入和输出代币都计算）",
  "shell.profile.statGranted": "已发放",
  "shell.profile.statSpent": "已使用",
  "shell.profile.statEntries": "使用次数",
  "shell.profile.memberSince": "加入时间 {date}",
  "shell.profile.buyTokens": "购买更多代币",
  "shell.profile.requestTokens": "申请更多代币",
  "shell.profile.fullHistory": "全部记录",
  "shell.profile.recentHistory": "最近记录",
  "shell.profile.viewAll": "查看全部",
  "shell.profile.historyLoading": "正在加载记录…",
  "shell.profile.historyEmpty": "还没有代币交易。",
  "shell.sessions.title": "已登录设备",

  "shell.sessions.hint": "同一邮箱可以同时登录多台设备。在此退出只影响该设备；会话与上下文会跟随账号同步到其他设备。",

  "shell.sessions.current": "本设备",

  "shell.sessions.unknownDevice": "未知设备",

  "shell.sessions.lastSeen": "活跃于 {time}",

  "shell.sessions.revoke": "退出登录",

  "shell.sessions.logoutHere": "退出本设备",

  "shell.sessions.revokeOthers": "退出其他 {count} 台设备",

  "shell.sessions.revoked": "已退出 {device}",

  "shell.sessions.othersRevoked": "已退出其他 {count} 台设备",

  "shell.sessions.noOthers": "没有其他设备",

  "shell.sessions.loadFailed": "无法加载设备列表",

  "shell.sessions.revokeFailed": "无法退出该设备",

  "shell.sessions.confirmTitle": "退出该设备？",

  "shell.sessions.confirmBody": "{device} 需要重新登录。其他设备不受影响。",

  "shell.sessions.confirmAction": "退出登录",

  "shell.sessions.confirmOthersTitle": "退出所有其他设备？",

  "shell.sessions.confirmOthersBody": "其他 {count} 台设备需要重新登录。本设备保持登录。",

  "shell.sessions.confirmOthersAction": "退出其他设备",
  "shell.profile.languageLabel": "显示语言",

  // ---- components/ui.tsx
  "shell.ui.copyBlock": "复制",
  "shell.ui.modalClose": "关闭",
  "shell.ui.toastDismiss": "关闭",
  "shell.ui.busy": "处理中…",
  "shell.ui.chartEmpty": "暂无图表数据",
  "shell.ui.chartEmptyHint": "添加分析步骤以生成图表。",
};

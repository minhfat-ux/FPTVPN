import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { all, audit, count, DEFAULT_APP_SETTINGS, getById, remove } from "./db.js";
import {
  authenticate,
  changePassword,
  countUsers,
  createUser,
  currentUser,
  findUserByEmail,
  publicUser,
  requestLoginToken,
  requireAdmin,
  requireAuth,
  startSession,
  updateProfile,
  verifyLoginToken,
  authLimiter,
} from "./auth.js";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "./sessions.js";
import {
  creditSettings,
  creditSummary,
  getBalance,
  grantCredits,
  listLedger,
} from "./credits.js";
import {
  createCreditRequest,
  decideCreditRequest,
  decisionPageHtml,
  listCreditRequests,
  notifyTelegram,
  verifyDecisionToken,
} from "./credit-requests.js";
import { mailerStatus, sendTestEmail } from "./mailer.js";
import {
  applyAppSettingsPatch,
  createProvider,
  createMcpServer,
  deleteMcpServer,
  deleteProvider,
  getMcpRow,
  getMcpRuntimeConfig,
  getProviderRow,
  listMcpServers,
  listModelsForUi,
  listProviders,
  publicAppSettings,
  readAppSettings,
  updateMcpServer,
  updateProvider,
  KEEP_SECRET,
} from "./settings.js";
import { PROVIDER_KINDS, toRuntimeProvider, testProvider, providerModels } from "./providers/index.js";
import { resolveVoiceConfig } from "./settings.js";
import { synthesizeSpeech, transcribeAudio } from "./voice/index.js";
import { TOOL_DEFINITIONS, publicSkillCatalog } from "./skills/index.js";
import {
  MAX_SELECTABLE_SKILLS,
  listInstalledSkillIds,
  listInstalledSkills,
  setInstalledSkills,
} from "./skills/installed.js";
import {
  bankInfo,
  cancelTopupOrder,
  confirmTopupOrder,
  createTopupOrder,
  listTopupOrders,
  markTopupAsTransferred,
  topupPackages,
  topupPageHtml,
  verifyConfirmToken,
} from "./topup.js";
import {
  HUB_CATEGORIES,
  createHubSkill,
  deleteHubSkill,
  getHubSkill,
  listHubSkills,
  purchaseHubSkill,
  updateHubSkill,
} from "./skills/hub.js";
import {
  WINDOWS_DOWNLOAD_URL,
  desktopPageHtml,
  desktopStatusFor,
  escapeHtml,
  issueAndEmailDesktopCode,
  reissueFormHtml,
  verifyActivationLink,
} from "./desktop.js";
import { listAllTools, refreshServer, testServerConfig } from "./mcp.js";
import {
  applyTransaction,
  pendingOrders,
  pollOnce,
  recordPoll,
  sepayConfig,
  sepayStatus,
  verifySepayApiKey,
  verifySepaySignature,
} from "./sepay.js";
import {
  createConversation,
  deleteConversation,
  duplicateConversation,
  getLastConversationId,
  getOwnedConversation,
  listConversations,
  listMessages,
  listMessagesAfter,
  publicConversation,
  setLastConversationId,
  updateConversation,
} from "./chat-store.js";
import { runChatTurn, sseChannel, prepareTurn } from "./agent.js";
import {
  deleteFile,
  getOwnedFile,
  isAllowed,
  listFiles,
  publicArtifact,
  publicFile,
  readFileBuffer,
  saveBuffer,
} from "./files.js";
import {
  ApiError,
  asyncHandler,
  badRequest,
  notFound,
  rateLimited,
  RateLimiter,
  truncate,
} from "./util.js";

const chatLimiter = new RateLimiter({ limit: 60, windowMs: 60 * 1000 });
const uploadLimiter = new RateLimiter({ limit: 40, windowMs: 60 * 1000 });
const voiceLimiter = new RateLimiter({ limit: 120, windowMs: 60 * 1000 });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 5 },
});

/** Voice clips are short (MediaRecorder chunks); a separate limit keeps them cheap. */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

function clientKey(req) {
  return `${req.user?.id ?? "anon"}:${req.ip}`;
}

/**
 * Thân request dạng nguyên văn, để kiểm chữ ký HMAC của SePay.
 *
 * `index.js` gắn `express.raw` cho đúng route webhook nên `req.body` là Buffer;
 * các trường hợp còn lại (test gọi thẳng router, body đã parse) được chấp nhận
 * với điều kiện dựng lại được chuỗi JSON — chữ ký chỉ khớp khi chuỗi đó đúng
 * nguyên văn bên gửi, nên sai thì bị từ chối chứ không xác thực nhầm.
 */
function rawBodyOf(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  if (typeof req.rawBody === "string") return req.rawBody;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return "";
}

export function createApiRouter() {
  const router = express.Router();

  // ------------------------------------------------------------- meta/health

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      version: config.version,
      uptimeSec: Math.round(process.uptime()),
      providerCount: listProviders().filter((p) => p.enabled).length,
      mcpCount: listMcpServers().filter((s) => s.enabled).length,
    });
  });

  router.get("/meta", (_req, res) => {
    const settings = readAppSettings();
    res.json({
      appName: settings.appName,
      version: config.version,
      allowSignup: Boolean(settings.allowSignup),
      firstUserIsAdmin: countUsers() === 0,
      hasProvider: listProviders().some((p) => p.enabled),
      hasUsers: countUsers() > 0,
      authMethods: {
        emailToken: true,
        password: Boolean(settings.passwordLoginEnabled),
        // Wired but not enabled yet — Firebase / Facebook SSO comes later.
        sso: { firebase: false, facebook: false },
      },
      mailer: mailerStatus(settings),
      loginTokenTtlMin: settings.loginTokenTtlMin,
      credits: {
        enabled: Boolean(settings.creditsEnabled),
        perToken: settings.creditsPerToken,
        vndPerCredit: settings.vndPerCredit,
        signupCredits: settings.signupCredits,
        buyUrl: settings.creditBuyUrl,
      },
      /** Timing the promo popup uses (public — it runs before React mounts). */
      promo: {
        reminderMinutes: settings.promoReminderMinutes,
        creditSnoozeMinutes: settings.promoCreditSnoozeMinutes,
      },
    });
  });

  // ------------------------------------------- passwordless login by email

  router.post(
    "/auth/request-token",
    asyncHandler(async (req, res) => {
      const gate = authLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      const settings = readAppSettings();
      const result = await requestLoginToken({
        email: req.body?.email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        settings,
      });
      audit(null, "auth.request_token", null, {
        email: String(req.body?.email ?? "").toLowerCase().slice(0, 200),
        delivered: result.delivered,
      });
      res.json(result);
    }),
  );

  router.post(
    "/auth/verify-token",
    asyncHandler(async (req, res) => {
      const user = verifyLoginToken({ email: req.body?.email, token: req.body?.token });
      const { token } = startSession({ user, ip: clientKey(req), userAgent: req.headers["user-agent"] });
      setAuthCookie(res, token);
      audit(user.id, "auth.login_token", null, { email: user.email });
      res.json({ user: publicUser(user), token });
    }),
  );

  // -------------------------------------------------------------------- auth

  router.post(
    "/auth/register",
    asyncHandler(async (req, res) => {
      const gate = authLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      const settings = readAppSettings();
      const firstUser = countUsers() === 0;
      if (!firstUser && !settings.allowSignup) {
        throw new ApiError(403, "forbidden", "Hệ thống đang đóng đăng ký. Liên hệ quản trị viên.");
      }
      const user = createUser({
        email: req.body?.email,
        password: req.body?.password,
        name: req.body?.name ?? null,
      });
      audit(user.id, "auth.register", null, { email: user.email });
      const { token } = startSession({ user, ip: clientKey(req), userAgent: req.headers["user-agent"] });
      setAuthCookie(res, token);
      res.status(201).json({ user: publicUser(user), token });
    }),
  );

  router.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const gate = authLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      const settings = readAppSettings();
      if (!settings.passwordLoginEnabled) {
        throw new ApiError(
          403,
          "forbidden",
          "Đăng nhập bằng mật khẩu đang tắt. Hãy dùng mã đăng nhập gửi qua email.",
        );
      }
      const user = authenticate({ email: req.body?.email, password: req.body?.password });
      // A new device gets its own session — signing in here never logs the
      // other devices out (that is the whole point of `auth_sessions`).
      const { session, token } = startSession({ user, ip: clientKey(req), userAgent: req.headers["user-agent"] });
      setAuthCookie(res, token);
      audit(user.id, "auth.login", session.id, { label: session.label, ip: session.ip });
      res.json({ user: publicUser(user), token });
    }),
  );

  /** Ends THIS device's session only; other devices stay signed in. */
  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      res.setHeader("Set-Cookie", "fbuddy_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
      const user = currentUser(req);
      if (user && req.sessionId) {
        revokeSession({ sessionId: req.sessionId, userId: user.id, reason: "logout" });
        audit(user.id, "auth.logout", req.sessionId, {});
      }
      res.json({ ok: true });
    }),
  );

  /** The device list behind "Thiết bị đang đăng nhập". */
  router.get("/auth/sessions", requireAuth, (req, res) => {
    res.json({ items: listSessions(req.user.id, req.sessionId ?? null) });
  });

  router.delete("/auth/sessions/:id", requireAuth, (req, res) => {
    const result = revokeSession({ sessionId: req.params.id, userId: req.user.id, reason: "revoked_by_user" });
    if (!result.ok) throw notFound("Không tìm thấy phiên đăng nhập");
    audit(req.user.id, "auth.session_revoke", req.params.id, { current: req.params.id === req.sessionId });
    if (req.params.id === req.sessionId) {
      res.setHeader("Set-Cookie", "fbuddy_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    }
    res.json({ ok: true, current: req.params.id === req.sessionId, ...result });
  });

  /** "Đăng xuất mọi thiết bị khác" — the calling device keeps working. */
  router.post("/auth/sessions/revoke-others", requireAuth, (req, res) => {
    const result = revokeOtherSessions({
      userId: req.user.id,
      keepSessionId: req.sessionId ?? null,
      reason: "revoked_other_devices",
    });
    audit(req.user.id, "auth.session_revoke_others", null, { revoked: result.revoked });
    res.json({ ok: true, ...result, items: listSessions(req.user.id, req.sessionId ?? null) });
  });

  router.get("/auth/me", (req, res, next) => {
    // Kept as an arrow with an explicit next so the response can carry the
    // device's session id and the account's last opened conversation.
    requireAuth(req, res, (err) => {
      if (err) return next(err);
      res.json({
        user: publicUser(req.user),
        sessionId: req.sessionId ?? null,
        lastConversationId: getLastConversationId(req.user.id),
      });
    });
  });

  router.patch(
    "/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (req.body?.password) {
        changePassword(req.user.id, {
          currentPassword: req.body?.currentPassword,
          newPassword: req.body.password,
        });
      }
      const updated = updateProfile(req.user.id, { name: req.body?.name });
      res.json({ user: publicUser(updated) });
    }),
  );

  // ----------------------------------------------------------- conversations

  router.get("/conversations/search", requireAuth, (req, res) => {
    res.json({ items: listConversations(req.user.id, { q: String(req.query.q ?? "").trim(), archived: req.query.archived === "1" }) });
  });

  router.get("/conversations", requireAuth, (req, res) => {
    res.json({ items: listConversations(req.user.id, { archived: req.query.archived === "1" }) });
  });

  router.post(
    "/conversations",
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = createConversation({
        userId: req.user.id,
        title: req.body?.title ?? null,
        skill: req.body?.skill ?? "auto",
        providerId: req.body?.providerId ?? null,
        model: req.body?.model ?? null,
      });
      res.status(201).json({ conversation: publicConversation(row) });
    }),
  );

  // NOTE: registered before `/conversations/:id` so "active" is not read as an id.
  /**
   * Remembers which conversation this account is working on, so opening fBuddy
   * on another device continues the same thread (per user, not per session).
   */
  router.post(
    "/conversations/:id/active",
    requireAuth,
    asyncHandler(async (req, res) => {
      getOwnedConversation(req.params.id, req.user.id);
      setLastConversationId(req.user.id, req.params.id);
      res.json({ ok: true, lastConversationId: req.params.id });
    }),
  );

  /** Leaves the thread without opening another one (used by "chat mới"). */
  router.delete(
    "/conversations/active",
    requireAuth,
    asyncHandler(async (req, res) => {
      setLastConversationId(req.user.id, null);
      res.json({ ok: true, lastConversationId: null });
    }),
  );

  router.get(
    "/conversations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = getOwnedConversation(req.params.id, req.user.id);
      // `?since=<messageId>` returns only newer messages, so another device can
      // poll cheaply and follow the same thread (see docs §13).
      const since = typeof req.query.since === "string" && req.query.since ? req.query.since : null;
      const messages = since ? listMessagesAfter(row.id, since) : listMessages(row.id);
      res.json({ conversation: publicConversation(row), messages, partial: Boolean(since) });
    }),
  );

  router.patch(
    "/conversations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      getOwnedConversation(req.params.id, req.user.id);
      res.json({ conversation: updateConversation(req.params.id, req.body ?? {}) });
    }),
  );

  router.delete(
    "/conversations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      getOwnedConversation(req.params.id, req.user.id);
      res.json(deleteConversation(req.params.id));
    }),
  );

  router.post(
    "/conversations/:id/duplicate",
    requireAuth,
    asyncHandler(async (req, res) => {
      getOwnedConversation(req.params.id, req.user.id);
      res.status(201).json({ conversation: duplicateConversation(req.params.id, req.user.id) });
    }),
  );

  // -------------------------------------------------------------------- chat

  router.post(
    "/chat/stream",
    requireAuth,
    asyncHandler(async (req, res) => {
      const gate = chatLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited(`Chậm lại một chút nhé (tối đa 60 lượt/phút).`);

      const channel = sseChannel(res);
      const controller = new AbortController();
      channel.onClose(() => controller.abort());

      try {
        const turn = await prepareTurn({ user: req.user, body: req.body ?? {}, channel });
        turn.toolMode = ["auto", "off", "required"].includes(req.body?.toolMode) ? req.body.toolMode : "auto";
        if (controller.signal.aborted) return channel.close();
        await runChatTurn({ user: req.user, turn, channel, signal: controller.signal });
      } catch (err) {
        const code = err?.code ?? "internal_error";
        const message = err?.message ?? String(err);
        channel.send("error", { code, message });
      } finally {
        channel.close();
      }
    }),
  );

  // ------------------------------------------------------------------- files

  router.post(
    "/files",
    requireAuth,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const gate = uploadLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      if (!req.file) throw badRequest("Thiếu tệp (field name: file)");
      const settings = readAppSettings();
      const maxBytes = (Number(settings.maxUploadMb) || 25) * 1024 * 1024;
      if (req.file.size > maxBytes) throw badRequest(`Tệp vượt quá ${settings.maxUploadMb}MB`);
      const original = String(req.file.originalname ?? "file");
      if (!isAllowed(req.file.mimetype, original)) {
        throw badRequest(
          `Định dạng không hỗ trợ: ${req.file.mimetype}. Nhận: ảnh, PDF, CSV/Excel, PPTX, DOCX, JSON, văn bản.`,
        );
      }
      const row = await saveBuffer({
        userId: req.user.id,
        conversationId: req.body?.conversationId || null,
        name: original,
        mime: req.file.mimetype,
        buffer: req.file.buffer,
        origin: "upload",
      });
      res.status(201).json({ file: publicFile(row) });
    }),
  );

  router.get(
    "/files/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ file: publicFile(getOwnedFile(req.params.id, req.user.id)) });
    }),
  );

  router.get(
    "/files/:id/content",
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = getOwnedFile(req.params.id, req.user.id);
      const { buffer } = await readFileBuffer(row);
      const inline = req.query.inline === "1" && row.kind === "image";
      res.setHeader("Content-Type", row.mime);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(row.name)}"`,
      );
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.end(buffer);
    }),
  );

  router.delete(
    "/files/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = getOwnedFile(req.params.id, req.user.id);
      await deleteFile(row);
      res.json({ ok: true });
    }),
  );

  router.get(
    "/artifacts",
    requireAuth,
    (req, res) => {
      const rows = listFiles(req.user.id, { origin: "artifact", limit: 100 });
      res.json({ items: rows.map(publicArtifact) });
    },
  );

  // ------------------------------------------------------------ skills/models

  router.get("/skills", requireAuth, (req, res) => {
    res.json({
      // `items` = what the quick dropdown shows (installed, in the user's order).
      items: listInstalledSkills(req.user.id),
      installed: listInstalledSkillIds(req.user.id),
      // `catalog` = everything that exists, including what the marketplace will sell.
      catalog: publicSkillCatalog(),
      maxSelectable: MAX_SELECTABLE_SKILLS,
      tools: TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        label: tool.label,
        skill: tool.skill,
        description: tool.description,
      })),
    });
  });

  /** The "Thêm kỹ năng" picker (and, later, the skill marketplace) writes here. */
  router.put(
    "/skills/installed",
    requireAuth,
    asyncHandler(async (req, res) => {
      const installed = setInstalledSkills(req.user.id, req.body?.ids, { role: req.user.role });
      audit(req.user.id, "skills.update", null, { installed });
      res.json({ installed, items: listInstalledSkills(req.user.id) });
    }),
  );

  router.get("/models", requireAuth, (_req, res) => {
    res.json({ items: listModelsForUi() });
  });

  // ------------------------------------------------------------------- voice

  router.get("/voice/config", requireAuth, (_req, res) => {
    const config = resolveVoiceConfig();
    res.json({
      config,
      // The client falls back to these when the server side is not configured.
      browserHint:
        "Trình duyệt tự lo phần này miễn phí. Trên Microsoft Edge có sẵn giọng tiếng Việt natural " +
        "(Hoài My / Nam Minh); Chrome cần cài thêm gói giọng nói của Windows.",
    });
  });

  router.post(
    "/voice/transcribe",
    requireAuth,
    audioUpload.single("audio"),
    asyncHandler(async (req, res) => {
      const gate = voiceLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      const config = resolveVoiceConfig();
      if (config.stt.mode !== "server") {
        throw badRequest(
          "Nhận dạng giọng nói đang dùng trình duyệt (miễn phí), không cần gọi server. " +
            "Vào Cài đặt → Giọng nói để chọn nhà cung cấp nếu muốn chất lượng cao hơn.",
        );
      }
      if (!req.file?.buffer?.length) throw badRequest("Thiếu dữ liệu âm thanh (field name: audio)");
      const row = getProviderRow(config.stt.providerId);
      if (!row) throw badRequest("Nhà cung cấp STT đã bị xoá — chọn lại trong Cài đặt → Giọng nói");
      const provider = toRuntimeProvider(row);
      const result = await transcribeAudio({
        provider,
        model: config.stt.model,
        audio: { buffer: req.file.buffer, mime: req.file.mimetype, name: req.file.originalname },
        language: String(req.body?.language || config.language).split("-")[0],
        hint: req.body?.hint ? String(req.body.hint).slice(0, 300) : "",
      });
      res.json({
        text: result.text,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
      });
    }),
  );

  router.post(
    "/voice/speech",
    requireAuth,
    asyncHandler(async (req, res) => {
      const gate = voiceLimiter.check(clientKey(req));
      if (!gate.ok) throw rateLimited();
      const config = resolveVoiceConfig();
      if (config.tts.mode !== "server") {
        throw badRequest(
          "Đọc văn bản đang dùng giọng của trình duyệt (miễn phí). " +
            "Vào Cài đặt → Giọng nói để chọn nhà cung cấp nếu muốn giọng khác.",
        );
      }
      const row = getProviderRow(config.tts.providerId);
      if (!row) throw badRequest("Nhà cung cấp TTS đã bị xoá — chọn lại trong Cài đặt → Giọng nói");
      const provider = toRuntimeProvider(row);
      const result = await synthesizeSpeech({
        provider,
        model: config.tts.model,
        voice: req.body?.voice || config.tts.voice,
        text: req.body?.text,
      });
      res.setHeader("Content-Type", result.mime);
      res.setHeader("Content-Length", String(result.buffer.length));
      res.setHeader("Cache-Control", "no-store");
      res.end(result.buffer);
    }),
  );

  router.post(
    "/settings/voice/test",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const config = resolveVoiceConfig();
      if (config.tts.mode !== "server") {
        return res.json({
          ok: false,
          message:
            "Đang dùng giọng của trình duyệt nên không cần server. Chọn một nhà cung cấp TTS rồi thử lại.",
        });
      }
      const row = getProviderRow(config.tts.providerId);
      if (!row) throw badRequest("Nhà cung cấp TTS đã bị xoá");
      const provider = toRuntimeProvider(row);
      const text = String(req.body?.text ?? "Xin chào, em là fBuddy. Giọng đọc này đang chạy tốt.");
      const started = Date.now();
      const result = await synthesizeSpeech({
        provider,
        model: config.tts.model,
        voice: req.body?.voice || config.tts.voice,
        text,
      });
      audit(req.user.id, "voice.test_tts", result.provider, { model: result.model, bytes: result.buffer.length });
      res.setHeader("Content-Type", result.mime);
      res.setHeader("Content-Length", String(result.buffer.length));
      res.setHeader("X-Voice-Provider", encodeURIComponent(result.provider));
      res.setHeader("X-Voice-Latency-Ms", String(Date.now() - started));
      res.setHeader("Cache-Control", "no-store");
      res.end(result.buffer);
    }),
  );

  // ---------------------------------------------------------------- settings

  router.get("/settings/provider-kinds", requireAdmin, (_req, res) => {
    res.json({ items: PROVIDER_KINDS });
  });

  router.get("/settings/app", requireAdmin, (_req, res) => {
    res.json({
      settings: publicAppSettings(),
      defaults: publicAppSettings(DEFAULT_APP_SETTINGS),
      mailer: mailerStatus(readAppSettings()),
    });
  });

  router.put(
    "/settings/app",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const patch = req.body?.settings ?? req.body ?? {};
      applyAppSettingsPatch(patch);
      audit(req.user.id, "settings.update", null, { keys: Object.keys(patch) });
      res.json({ settings: publicAppSettings(), mailer: mailerStatus(readAppSettings()) });
    }),
  );

  router.post(
    "/settings/mailer/test",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const to = String(req.body?.to ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw badRequest("Email nhận không hợp lệ");
      const settings = readAppSettings();
      const status = mailerStatus(settings);
      if (!status.configured) {
        return res.json({
          ok: false,
          message: "Chưa có Resend API key — dán key vào ô bên trên rồi lưu trước khi gửi thử.",
        });
      }
      const result = await sendTestEmail({ settings, to });
      audit(req.user.id, "mailer.test", null, { to, sent: result.sent });
      return res.json({
        ok: Boolean(result.sent),
        message: result.sent
          ? `Đã gửi email kiểm tra tới ${to}`
          : `Gửi thất bại: ${result.detail ?? result.reason}`,
      });
    }),
  );

  router.get("/settings/providers", requireAdmin, (_req, res) => {
    res.json({ items: listProviders() });
  });

  router.post(
    "/settings/providers",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const provider = createProvider(req.body ?? {});
      audit(req.user.id, "provider.create", provider.id, { kind: provider.kind, name: provider.name });
      res.status(201).json({ provider });
    }),
  );

  router.patch(
    "/settings/providers/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const provider = updateProvider(req.params.id, req.body ?? {});
      audit(req.user.id, "provider.update", provider.id, { keys: Object.keys(req.body ?? {}) });
      res.json({ provider });
    }),
  );

  router.delete(
    "/settings/providers/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = deleteProvider(req.params.id);
      audit(req.user.id, "provider.delete", req.params.id);
      res.json(result);
    }),
  );

  router.post(
    "/settings/providers/:id/test",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = getProviderRow(req.params.id);
      if (!row) throw notFound("Không tìm thấy nhà cung cấp");
      const provider = toRuntimeProvider(row);
      const model = req.body?.model || provider.defaultModel;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const result = await testProvider({ provider, model, signal: controller.signal });
        let models = null;
        if (req.body?.listModels) {
          models = await providerModels({ provider, signal: controller.signal }).catch(() => null);
        }
        res.json({ ok: true, model, models, latencyMs: result.latencyMs, message: `Kết nối OK (${result.latencyMs}ms)` });
      } catch (err) {
        res.json({ ok: false, model, message: truncate(err?.message ?? String(err), 400) });
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  router.get("/settings/mcp", requireAdmin, (_req, res) => {
    res.json({ items: listMcpServers() });
  });

  router.post(
    "/settings/mcp",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const server = createMcpServer(req.body ?? {});
      audit(req.user.id, "mcp.create", server.id, { transport: server.transport, name: server.name });
      res.status(201).json({ server });
    }),
  );

  router.patch(
    "/settings/mcp/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const server = updateMcpServer(req.params.id, req.body ?? {});
      audit(req.user.id, "mcp.update", server.id, { keys: Object.keys(req.body ?? {}) });
      res.json({ server });
    }),
  );

  router.delete(
    "/settings/mcp/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      if (!getMcpRow(req.params.id)) throw notFound("Không tìm thấy MCP server");
      const result = deleteMcpServer(req.params.id);
      audit(req.user.id, "mcp.delete", req.params.id);
      res.json(result);
    }),
  );

  router.post(
    "/settings/mcp/:id/test",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = getMcpRow(req.params.id);
      if (!row) throw notFound("Không tìm thấy MCP server");
      const merged = { ...getMcpRuntimeConfig(row), ...(req.body?.override ?? {}) };
      try {
        const result = await testServerConfig(merged);
        res.json({ ok: true, tools: result.tools, latencyMs: result.latencyMs, message: `Kết nối OK — ${result.tools.length} tool` });
      } catch (err) {
        res.json({ ok: false, tools: [], message: truncate(err?.message ?? String(err), 500) });
      }
    }),
  );

  router.post(
    "/settings/mcp/:id/refresh",
    requireAdmin,
    asyncHandler(async (req, res) => {
      await refreshServer(req.params.id);
      const items = listMcpServers();
      res.json({ server: items.find((item) => item.id === req.params.id) ?? null });
    }),
  );

  router.get(
    "/mcp/tools",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      res.json({ items: await listAllTools() });
    }),
  );

  // ---------------------------------------------------------------- credits

  router.get("/credits", requireAuth, (req, res) => {
    res.json({ credits: creditSummary(req.user.id) });
  });

  router.get("/credits/ledger", requireAuth, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));
    res.json({
      items: listLedger(req.user.id, { limit }),
      balance: getBalance(req.user.id),
      credits: creditSummary(req.user.id),
    });
  });

  /** Admin: hand credits to an account (or take them back with a negative number). */
  router.post(
    "/admin/credits",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount === 0) throw badRequest("`amount` phải là số khác 0");
      const target = req.body?.userId
        ? getById("users", String(req.body.userId))
        : req.body?.email
          ? findUserByEmail(String(req.body.email))
          : null;
      if (!target) throw notFound("Không tìm thấy người dùng (cần `email` hoặc `userId`)");
      const balance = grantCredits({
        userId: target.id,
        amount,
        reason: amount > 0 ? "admin_grant" : "admin_deduct",
        note: req.body?.note ? String(req.body.note).slice(0, 200) : null,
        actorId: req.user.id,
      });
      audit(req.user.id, "credits.grant", target.id, { amount, balance });
      res.json({ user: publicUser(target), balance, credits: creditSummary(target.id) });
    }),
  );

  // ------------------------------------------- xin thêm token (chờ owner duyệt)

  router.post(
    "/credits/request",
    requireAuth,
    asyncHandler(async (req, res) => {
      const gate = authLimiter.check(`credit-request:${req.user.id}`);
      if (!gate.ok) throw rateLimited("Gửi yêu cầu hơi nhanh — thử lại sau một phút nhé.");
      const request = createCreditRequest({
        user: req.user,
        amount: req.body?.amount ?? undefined,
        note: req.body?.note ?? null,
      });
      const telegram = await notifyTelegram(request);
      audit(req.user.id, "credits.request", request.id, { amount: request.amount, telegram: telegram.sent });
      res.status(201).json({ request, telegram });
    }),
  );

  router.get("/credits/requests", requireAuth, (req, res) => {
    res.json({ items: listCreditRequests({ userId: req.user.id, limit: 20 }) });
  });

  router.get("/admin/credit-requests", requireAdmin, (req, res) => {
    const status = req.query.status === "pending" ? "pending" : null;
    res.json({ items: listCreditRequests({ status, limit: 100 }) });
  });

  router.post(
    "/admin/credit-requests/:id/decide",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = decideCreditRequest({
        requestId: req.params.id,
        approve: req.body?.approve !== false,
        amount: req.body?.amount ?? null,
        decidedBy: req.user.email ?? req.user.id,
        note: req.body?.note ?? null,
      });
      audit(req.user.id, "credits.decide", req.params.id, {
        approve: req.body?.approve !== false,
        balance: result.balance,
      });
      res.json(result);
    }),
  );

  /**
   * Signed link from the Telegram buttons — no session on purpose (the owner taps
   * it inside Telegram). Single use, expires after 7 days.
   */
  router.get(
    "/credits/requests/:id/decide",
    asyncHandler(async (req, res) => {
      const action = req.query.action === "reject" ? "reject" : "approve";
      const token = String(req.query.t ?? "");
      const check = verifyDecisionToken(req.params.id, action, token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!check.ok) {
        return res.status(check.reason === "expired" ? 410 : 403).send(
          decisionPageHtml({
            ok: false,
            title: check.reason === "expired" ? "Liên kết đã hết hạn" : "Liên kết không hợp lệ",
            detail: "Hãy mở fBuddy → Cài đặt → Người dùng để duyệt yêu cầu này.",
          }),
        );
      }
      try {
        const result = decideCreditRequest({
          requestId: req.params.id,
          approve: action === "approve",
          decidedBy: "telegram",
        });
        if (result.alreadyDecided) {
          return res.send(
            decisionPageHtml({
              ok: false,
              title: "Yêu cầu đã được xử lý",
              detail: `Trạng thái hiện tại: ${
                result.request.status === "approved" ? "đã duyệt" : "đã từ chối"
              } (${result.request.decidedAt ?? ""}).`,
            }),
          );
        }
        return res.send(
          decisionPageHtml({
            ok: action === "approve",
            title: action === "approve" ? "Đã duyệt ✅" : "Đã từ chối",
            detail:
              action === "approve"
                ? `Đã cấp ${Number(result.request.grantedAmount ?? 0).toLocaleString("vi-VN")} token cho ${
                    result.request.email
                  }. Số dư mới: <b>${Number(result.balance ?? 0).toLocaleString("vi-VN")}</b> token.`
                : `Yêu cầu của ${result.request.email} đã bị từ chối.`,
          }),
        );
      } catch (err) {
        return res
          .status(err?.status ?? 400)
          .send(
            decisionPageHtml({
              ok: false,
              title: "Không xử lý được",
              detail: String(err?.message ?? err),
            }),
          );
      }
    }),
  );

  router.get("/admin/credit-requests/:id", requireAdmin, (req, res) => {
    const request = listCreditRequests({ limit: 200 }).find((item) => item.id === req.params.id);
    if (!request) throw notFound("Không tìm thấy yêu cầu");
    res.json({ request, balance: getBalance(request.userId) });
  });

  // --------------------------------------------------------------- skill hub

  router.get("/hub", requireAuth, (req, res) => {
    const items = listHubSkills({ userId: req.user.id });
    res.json({
      items,
      categories: HUB_CATEGORIES,
      balance: getBalance(req.user.id),
      currency: "token",
      ownedCount: items.filter((skill) => skill.owned).length,
    });
  });

  router.get("/hub/:id", requireAuth, (req, res) => {
    const skill = getHubSkill(req.params.id, { userId: req.user.id });
    if (!skill || skill.state === "hidden") throw notFound("Không tìm thấy kỹ năng");
    res.json({ skill, balance: getBalance(req.user.id) });
  });

  /** Buys a skill with credits (free skills are recorded as owned for 0). */
  router.post(
    "/hub/:id/purchase",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = purchaseHubSkill({ user: req.user, idOrSlug: req.params.id });
      audit(req.user.id, "hub.purchase", result.skill?.id ?? req.params.id, {
        price: result.pricePaid,
        balance: result.balance,
      });
      res.json(result);
    }),
  );

  router.get("/admin/hub", requireAdmin, (_req, res) => {
    res.json({
      items: listHubSkills({ includeHidden: true, withContent: true }),
      categories: HUB_CATEGORIES,
    });
  });

  router.post(
    "/admin/hub",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const skill = createHubSkill(req.body ?? {});
      audit(req.user.id, "hub.create", skill.id, { name: skill.name, price: skill.price });
      res.status(201).json({ skill });
    }),
  );

  router.patch(
    "/admin/hub/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const skill = updateHubSkill(req.params.id, req.body ?? {});
      audit(req.user.id, "hub.update", skill.id, { keys: Object.keys(req.body ?? {}) });
      res.json({ skill });
    }),
  );

  router.delete(
    "/admin/hub/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = deleteHubSkill(req.params.id);
      audit(req.user.id, "hub.delete", req.params.id);
      res.json(result);
    }),
  );

  // ------------------------------------------------------- nạp token (top-up)

  router.get("/topup", requireAuth, (req, res) => {
    const orders = listTopupOrders({ userId: req.user.id, limit: 20 });
    res.json({
      packages: topupPackages(),
      bank: bankInfo(),
      orders,
      balance: getBalance(req.user.id),
      credits: creditSummary(req.user.id),
    });
  });

  router.post(
    "/topup/orders",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = createTopupOrder({ user: req.user, packageId: req.body?.packageId });
      audit(req.user.id, "topup.create", result.order.id, { packageId: result.order.packageId, reused: result.reused });
      res.status(201).json(result);
    }),
  );

  /** "Tôi đã chuyển khoản" → the owner gets a Telegram message with a confirm link. */
  router.post(
    "/topup/orders/:id/transferred",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await markTopupAsTransferred({
        user: req.user,
        orderId: req.params.id,
        bankTxnRef: req.body?.bankTxnRef ?? null,
      });
      audit(req.user.id, "topup.transferred", req.params.id, { telegram: result.telegram?.sent });
      res.json(result);
    }),
  );

  router.post(
    "/topup/orders/:id/cancel",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json({ order: cancelTopupOrder({ orderId: req.params.id, userId: req.user.id }) });
    }),
  );

  /** Signed link from the Telegram button — the owner confirms the money arrived. */
  router.get(
    "/topup/orders/:id/confirm",
    asyncHandler(async (req, res) => {
      const check = verifyConfirmToken(req.params.id, String(req.query.t ?? ""));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!check.ok) {
        return res.status(check.reason === "expired" ? 410 : 403).send(
          topupPageHtml({
            ok: false,
            title: check.reason === "expired" ? "Liên kết đã hết hạn" : "Liên kết không hợp lệ",
            detail: "Mở fBuddy → Cài đặt → Đơn nạp token để xác nhận thủ công.",
          }),
        );
      }
      try {
        const result = confirmTopupOrder({ orderId: req.params.id, confirmedBy: "telegram" });
        if (result.alreadyPaid) {
          return res.send(
            topupPageHtml({
              ok: false,
              title: "Đơn đã được xác nhận",
              detail: `Đơn ${result.order.transferNote} đã cộng token trước đó.`,
            }),
          );
        }
        return res.send(
          topupPageHtml({
            ok: true,
            title: "Đã cộng token ✅",
            detail: `${Number(result.order.tokens).toLocaleString("vi-VN")} token cho ${
              result.order.email ?? ""
            }. Số dư mới: <b>${Number(result.balance ?? 0).toLocaleString("vi-VN")}</b> token.`,
          }),
        );
      } catch (err) {
        return res
          .status(err?.status ?? 400)
          .send(topupPageHtml({ ok: false, title: "Không xử lý được", detail: String(err?.message ?? err) }));
      }
    }),
  );

  // ------------------------------------------- bản Windows (service flowdesk)

  /**
   * Trạng thái cho trang `?view=desktop`: đã có đơn paid chưa, backend bản
   * Windows có sống không, và những máy đã kích hoạt (thu hồi được).
   */
  router.get(
    "/desktop/status",
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await desktopStatusFor({ user: req.user }));
    }),
  );

  /**
   * Người dùng bấm "lấy mã kích hoạt": phát mã MỚI (mã cũ hết hiệu lực) + gửi
   * email. Đây là đường duy nhất trả mã gốc ra giao diện, và chỉ cho chính chủ.
   */
  router.post(
    "/desktop/code",
    requireAuth,
    asyncHandler(async (req, res) => {
      const result = await issueAndEmailDesktopCode({ user: req.user, reason: "user_request" });
      if (!result.ok) {
        throw new ApiError(503, result.error ?? "desktop_unavailable", result.message ?? "Chưa lấy được mã kích hoạt");
      }
      audit(req.user.id, "desktop.code", result.invitation?.id ?? null, { emailed: result.emailed });
      res.status(201).json({
        code: result.code,
        expiresAt: result.invitation?.expiresAt ?? null,
        emailed: result.emailed,
        mailReason: result.mailReason ?? null,
        downloadUrl: WINDOWS_DOWNLOAD_URL,
      });
    }),
  );

  /**
   * Trang công khai mở từ email (liên kết ký HMAC, sống 30 ngày): xem hướng dẫn
   * và lấy lại mã. Cố ý KHÔNG cần đăng nhập — khách vừa mua thường mở email trên
   * máy khác, và bắt đăng nhập lại chỉ tổ chặn họ.
   */
  router.get(
    "/desktop",
    asyncHandler(async (req, res) => {
      const userId = String(req.query.u ?? "");
      const token = String(req.query.t ?? "");
      const check = verifyActivationLink(userId, token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (!check.ok) {
        return res.status(check.reason === "expired" ? 410 : 403).send(
          desktopPageHtml({
            ok: false,
            title: check.reason === "expired" ? "Liên kết đã hết hạn" : "Liên kết không hợp lệ",
            detail: "Đăng nhập fBuddy rồi mở mục <b>Bản Windows</b> để lấy mã kích hoạt mới.",
          }),
        );
      }
      const user = getById("users", userId);
      if (!user) {
        return res.status(404).send(
          desktopPageHtml({ ok: false, title: "Không tìm thấy tài khoản", detail: "Liên kết này không còn dùng được." }),
        );
      }
      const email = escapeHtml(user.email);
      if (req.query.action !== "new") {
        return res.send(
          desktopPageHtml({
            ok: true,
            title: "Kích hoạt MeetFlow AI trên Windows",
            detail: `Mã kích hoạt đã được gửi tới <b>${email}</b>. Nếu không thấy email — hoặc cần mã mới — bấm nút bên dưới.`,
            reissueForm: reissueFormHtml({ userId, token }),
          }),
        );
      }
      const result = await issueAndEmailDesktopCode({ user: { id: user.id, email: user.email }, reason: "public_link" });
      if (!result.ok) {
        return res.status(503).send(
          desktopPageHtml({
            ok: false,
            title: "Chưa lấy được mã",
            detail: escapeHtml(result.message ?? result.error ?? "Không rõ nguyên nhân"),
            reissueForm: reissueFormHtml({ userId, token, label: "Thử lại" }),
          }),
        );
      }
      return res.send(
        desktopPageHtml({
          ok: true,
          title: "Mã kích hoạt của bạn",
          code: result.code,
          expiresAt: result.invitation?.expiresAt ?? null,
          detail: `Đã gửi kèm email tới <b>${email}</b>. Mã cũ (nếu có) đã hết hiệu lực.${
            result.emailed ? "" : " <b>Email chưa gửi được</b> — hãy dùng mã ở trên."
          }`,
          reissueForm: reissueFormHtml({ userId, token, label: "Lấy mã khác" }),
        }),
      );
    }),
  );

  // ------------------------------------------------- SePay: xác nhận tự động

  /**
   * SePay gọi vào đây mỗi khi tài khoản có tiền vào (chế độ `webhook`).
   *
   * Không dùng `requireAuth`: SePay không có phiên đăng nhập, nó xác thực bằng
   * chữ ký HMAC (`X-SePay-Signature` + `X-SePay-Timestamp`) hoặc `Authorization:
   * Apikey <webhook secret>`. Credit chỉ được cộng qua `confirmTopupOrder` (đã
   * idempotent) nên webhook gửi lại nhiều lần cũng không cộng hai lần.
   */
  router.post(
    "/topup/sepay",
    asyncHandler(async (req, res) => {
      const cfg = sepayConfig();
      if (!cfg.enabled) {
        throw new ApiError(403, "sepay_disabled", "SePay đang tắt trong Cài đặt → Hệ thống");
      }

      const rawBody = rawBodyOf(req);
      const authorized =
        verifySepaySignature({
          rawBody,
          signature: req.get("x-sepay-signature"),
          timestamp: req.get("x-sepay-timestamp"),
          secret: cfg.webhookSecret,
        }) || verifySepayApiKey({ header: req.get("authorization"), secret: cfg.webhookSecret });
      if (!authorized) throw new ApiError(401, "unauthorized", "Chữ ký SePay không hợp lệ");

      let payload;
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw badRequest("Thân request không phải JSON hợp lệ");
      }

      const incoming = Array.isArray(payload?.transactions) ? payload.transactions : [payload];
      const orders = pendingOrders();
      const results = incoming
        .filter((entry) => entry && typeof entry === "object")
        .map((transaction) => applyTransaction({ transaction, orders }));

      const applied = results.filter((item) => item.matched && !item.alreadyPaid && !item.error);
      const failed = results.filter((item) => item.error);
      const credits = applied.reduce((sum, item) => sum + Number(item.tokens ?? 0), 0);
      if (applied.length || failed.length) {
        console.log(
          `[fbuddy] SePay webhook: ${incoming.length} giao dịch, khớp ${applied.length} đơn` +
            (credits ? ` → ${credits.toLocaleString("vi-VN")} credit` : "") +
            (failed.length ? `, ${failed.length} lỗi` : ""),
        );
      }

      // Đã xác thực thì luôn trả 200: giao dịch không khớp đơn nào (tiền vào vì
      // việc khác) là bình thường, trả lỗi chỉ khiến SePay gửi lại vô ích.
      res.json({
        ok: true,
        checked: incoming.length,
        applied: applied.length,
        orders: applied.map((item) => ({
          orderId: item.orderId,
          transferNote: item.transferNote,
          credits: item.tokens,
        })),
        ...(failed.length
          ? { errors: failed.map((item) => ({ orderId: item.orderId, message: item.error })) }
          : {}),
      });
    }),
  );

  router.get("/admin/topup-orders", requireAdmin, (req, res) => {
    const status = ["pending", "awaiting_confirmation", "paid", "cancelled"].includes(String(req.query.status))
      ? String(req.query.status)
      : null;
    res.json({ items: listTopupOrders({ status, limit: 100 }) });
  });

  router.post(
    "/admin/topup-orders/:id/confirm",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const result = confirmTopupOrder({
        orderId: req.params.id,
        confirmedBy: req.user.email ?? req.user.id,
        tokens: req.body?.tokens ?? null,
      });
      audit(req.user.id, "topup.confirm", req.params.id, { balance: result.balance, tokens: result.order.tokens });
      res.json(result);
    }),
  );

  // ------------------------------------------------------- admin: SePay

  router.get("/admin/sepay/status", requireAdmin, (_req, res) => {
    res.json(sepayStatus());
  });

  /**
   * Chạy một vòng poll ngay (nút "Kiểm tra ngay" ở control panel) — dùng khi
   * poller chưa bật, hoặc khi khách báo đã chuyển khoản mà muốn đối chiếu liền.
   */
  router.post(
    "/admin/sepay/poll",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const cfg = sepayConfig();
      if (!cfg.apiToken) {
        throw badRequest("Chưa có SePay API token — dán vào Cài đặt → Hệ thống → SePay rồi lưu trước.");
      }
      let result;
      try {
        result = await pollOnce({ token: cfg.apiToken, limit: Number(req.body?.limit) || 50 });
      } catch (err) {
        recordPoll(null, err);
        throw new ApiError(502, "sepay_api_error", `SePay API lỗi: ${err?.message ?? err}`);
      }
      recordPoll(result);
      audit(req.user.id, "sepay.poll", null, { checked: result.checked, applied: result.applied.length });
      res.json({ ...result, status: sepayStatus() });
    }),
  );

  // ------------------------------------------------------------------- admin

  router.get("/admin/users", requireAdmin, (_req, res) => {
    const users = all("users", "", [], { order: "created_at ASC" }).map((row) => ({
      ...publicUser(row),
      conversationCount: count("conversations", "user_id = ?", [row.id]),
      creditBalance: getBalance(row.id),
    }));
    res.json({ items: users });
  });

  router.post(
    "/admin/users",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const user = createUser({
        email: req.body?.email,
        password: req.body?.password,
        name: req.body?.name ?? null,
        role: req.body?.role === "admin" ? "admin" : "user",
      });
      audit(req.user.id, "admin.user.create", user.id, { email: user.email });
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  router.delete(
    "/admin/users/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      if (req.params.id === req.user.id) throw badRequest("Không thể tự xoá tài khoản đang đăng nhập");
      const row = getById("users", req.params.id);
      if (!row) throw notFound("Không tìm thấy người dùng");
      remove("users", req.params.id);
      audit(req.user.id, "admin.user.delete", req.params.id);
      res.json({ ok: true });
    }),
  );

  router.get("/admin/stats", requireAdmin, (_req, res) => {
    res.json({
      users: count("users"),
      conversations: count("conversations"),
      messages: count("messages"),
      files: count("files"),
      providers: listProviders().length,
      mcpServers: listMcpServers().length,
    });
  });

  return router;
}

function setAuthCookie(res, token) {
  const maxAge = 60 * 60 * 24 * 30;
  const secure = config.publicUrl.startsWith("https://") ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `fbuddy_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
  );
}

export { KEEP_SECRET };

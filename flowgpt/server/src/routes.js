import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { all, audit, count, DEFAULT_APP_SETTINGS, getById, remove } from "./db.js";
import {
  authenticate,
  changePassword,
  countUsers,
  createUser,
  issueToken,
  publicUser,
  requestLoginToken,
  requireAdmin,
  requireAuth,
  updateProfile,
  verifyLoginToken,
  authLimiter,
} from "./auth.js";
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
import { listAllTools, refreshServer, testServerConfig } from "./mcp.js";
import {
  createConversation,
  deleteConversation,
  duplicateConversation,
  getOwnedConversation,
  listConversations,
  listMessages,
  publicConversation,
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
      const token = issueToken(user);
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
      const token = issueToken(user);
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
      const token = issueToken(user);
      setAuthCookie(res, token);
      res.json({ user: publicUser(user), token });
    }),
  );

  router.post("/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", "flowgpt_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    res.json({ ok: true });
  });

  router.get("/auth/me", requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
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

  router.get(
    "/conversations/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const row = getOwnedConversation(req.params.id, req.user.id);
      res.json({ conversation: publicConversation(row), messages: listMessages(row.id) });
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
      const installed = setInstalledSkills(req.user.id, req.body?.ids);
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
      const text = String(req.body?.text ?? "Xin chào, em là FlowGpt. Giọng đọc này đang chạy tốt.");
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

  // ------------------------------------------------------------------- admin

  router.get("/admin/users", requireAdmin, (_req, res) => {
    const users = all("users", "", [], { order: "created_at ASC" }).map((row) => ({
      ...publicUser(row),
      conversationCount: count("conversations", "user_id = ?", [row.id]),
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
    `flowgpt_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
  );
}

export { KEEP_SECRET };

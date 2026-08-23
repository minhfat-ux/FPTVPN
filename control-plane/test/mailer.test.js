import test from "node:test";
import assert from "node:assert/strict";
import { createSendOtpEmail } from "../src/mailer.js";

function makeFakeTransporter() {
  const sent = [];
  let fail = false;
  const transporter = {
    sendMail: async (message) => {
      if (fail) throw new Error("SMTP 550 rejected");
      sent.push(message);
      return { messageId: "mock-id" };
    },
  };
  return { transporter, sent, setFail: (v) => { fail = v; } };
}

function withEnv(values, fn) {
  const keys = Object.keys(values);
  const prev = keys.map((key) => [key, process.env[key]]);
  keys.forEach((key) => { process.env[key] = values[key]; });
  try {
    return fn();
  } finally {
    prev.forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test("dev: returns devCode and performs no network call", async () => {
  const { transporter, sent } = makeFakeTransporter();
  const sendOtpEmail = createSendOtpEmail({ transporter });
  await withEnv({ NODE_ENV: "development", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" }, async () => {
    const result = await sendOtpEmail({ email: "dev@example.com", code: "123456" });
    assert.deepEqual(result, { sent: false, devCode: "123456" });
    assert.equal(sent.length, 0);
  });
});

test("dev: no NODE_ENV / no SMTP config also skips the network call", async () => {
  const { transporter, sent } = makeFakeTransporter();
  const sendOtpEmail = createSendOtpEmail({ transporter });
  await withEnv({ NODE_ENV: "", SMTP_HOST: "", SMTP_PASS: "" }, async () => {
    const result = await sendOtpEmail({ email: "dev@example.com", code: "654321" });
    assert.deepEqual(result, { sent: false, devCode: "654321" });
    assert.equal(sent.length, 0);
  });
});

test("production: sends via SMTP and returns sent: true", async () => {
  const { transporter, sent } = makeFakeTransporter();
  const sendOtpEmail = createSendOtpEmail({ transporter });
  await withEnv(
    {
      NODE_ENV: "production",
      SMTP_HOST: "mail92231.maychuemail.com",
      SMTP_PORT: "465",
      SMTP_USER: "no-reply@meetflowai.site",
      SMTP_PASS: "smtp-secret",
      FROM_EMAIL: "FlowVPN <no-reply@meetflowai.site>",
    },
    async () => {
      const result = await sendOtpEmail({ email: "user@example.com", code: "483920" });
      assert.deepEqual(result, { sent: true });
      assert.equal(sent.length, 1);
      const message = sent[0];
      assert.equal(message.from, "FlowVPN <no-reply@meetflowai.site>");
      assert.equal(message.to, "user@example.com");
      assert.equal(message.subject, "Your FlowVPN login code");
      assert.match(message.html, /483920/);
      assert.match(message.html, /expires in 10 minutes/);
    }
  );
});

test("production: FROM_EMAIL defaults when unset", async () => {
  const { transporter, sent } = makeFakeTransporter();
  const sendOtpEmail = createSendOtpEmail({ transporter });
  await withEnv({ NODE_ENV: "production", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" }, async () => {
    await sendOtpEmail({ email: "user@example.com", code: "111111" });
    assert.equal(sent[0].from, "FlowVPN <no-reply@meetflowai.site>");
  });
});

test("production: send failure surfaces a safe message and never logs the code", async () => {
  const { transporter, setFail } = makeFakeTransporter();
  setFail(true);
  const sendOtpEmail = createSendOtpEmail({ transporter });

  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    await withEnv({ NODE_ENV: "production", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" }, async () => {
      await assert.rejects(
        () => sendOtpEmail({ email: "user@example.com", code: "222222" }),
        (err) => {
          assert.equal(err.message, "Failed to send login code email");
          assert.equal(err.statusCode, 500);
          return true;
        }
      );
    });
  } finally {
    console.error = originalError;
  }

  assert.ok(logged.length > 0, "expected a redacted error to be logged");
  assert.ok(
    !logged.some((line) => line.includes("222222")),
    "the OTP code must never be logged"
  );
});

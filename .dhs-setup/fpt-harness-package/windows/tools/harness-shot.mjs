#!/usr/bin/env node
/**
 * harness-shot.mjs - DOM screenshot / DOM dump for the DSH Harness Web GUI.
 *
 * Zero dependencies: talks Chrome DevTools Protocol over the global WebSocket and
 * fetch() of Node 22+. Uses the Harness' own browser-session cookie (signed with the
 * durable secret in $DSH_HOME/.credentials.yaml) so the page loads authenticated
 * without touching the URL printed by `dsh web`.
 *
 * Usage:
 *   node harness-shot.mjs                                  # screenshot the GUI root
 *   node harness-shot.mjs --click "button[title=Attach]"   # click first, then shoot
 *   node harness-shot.mjs --dom "[class*=millerRow]" --dom-out dom.json
 *   node harness-shot.mjs --color-scheme dark --width 1600 --height 1000
 *   node harness-shot.mjs --eval "location.hash='#/settings'"
 *   node harness-shot.mjs --keep-open                      # leave Chrome up for more shots
 *
 * Options:
 *   --url <url>            page to capture (default: $DSH_WEB_URL or http://127.0.0.1:3080)
 *   --path <p>             path appended to origin (e.g. /settings)
 *   --out <file>           PNG output (default: .shots/shot-<timestamp>.png)
 *   --width <n>            viewport width  (default 1440)
 *   --height <n>           viewport height (default 900)
 *   --scale <n>            device scale factor (default 1)
 *   --color-scheme <s>     light | dark | system (default system = browser default)
 *   --wait <ms>            settle time after load before capture (default 2500)
 *   --eval <js>            run in the page before capture (repeatable, ordered with --click)
 *   --eval-file <file>     run a JS file in the page (avoids shell quoting limits)
 *   --click <selector>     click the element's center before capture (repeatable)
 *   --click-text <text>    click the smallest visible element starting with this text
 *   --dom <selector>       dump matching elements (text, computed colors, outerHTML)
 *   --dom-out <file>       where the DOM dump goes (default: sibling of --out, .json)
 *   --full                 capture the whole scrollable page, not just the viewport
 *   --root <dir>           workspace root used for relative defaults (default: cwd)
 *   --port <n>             CDP port (default 9222)
 *   --browser <path>       browser executable ($HARNESS_SHOT_BROWSER wins if set)
 *   --profile <dir>        browser profile dir (default: <root>/.shots/profile)
 *   --headful              show the browser window (default: headless)
 *   --keep-open            leave the browser running and print the CDP endpoint
 *   --timeout <ms>         per-step timeout (default 30000)
 *   --json                 print only the machine-readable result object
 */

import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT = 30_000;

function parseArgs(argv) {
	const opts = {
		url: process.env.DSH_WEB_URL ?? "http://127.0.0.1:3080",
		path: "/",
		out: undefined,
		width: 1440,
		height: 900,
		scale: 1,
		colorScheme: "system",
		wait: 2500,
		evals: [],
		clicks: [],
		dom: [],
		domOut: undefined,
		full: false,
		root: process.cwd(),
		port: 9222,
		browser: process.env.HARNESS_SHOT_BROWSER,
		profile: undefined,
		headful: false,
		keepOpen: false,
		timeout: DEFAULT_TIMEOUT,
		json: false
	};
	// --eval and --click keep their relative order, so steps run as one ordered script.
	opts.steps = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = () => {
			const value = argv[i + 1];
			if (value === undefined) throw new Error(`${arg} needs a value`);
			i += 1;
			return value;
		};
		switch (arg) {
			case "--url": opts.url = next(); break;
			case "--path": opts.path = next(); break;
			case "--out": opts.out = next(); break;
			case "--width": opts.width = Number(next()); break;
			case "--height": opts.height = Number(next()); break;
			case "--scale": opts.scale = Number(next()); break;
			case "--color-scheme": opts.colorScheme = next(); break;
			case "--wait": opts.wait = Number(next()); break;
			case "--eval": { const js = next(); opts.evals.push(js); opts.steps.push({ kind: "eval", js }); break; }
			case "--eval-file": { const file = next(); const js = readFileSync(file, "utf8"); opts.evals.push(js); opts.steps.push({ kind: "eval", js }); break; }
			case "--click": { const sel = next(); opts.clicks.push(sel); opts.steps.push({ kind: "click", sel }); break; }
			case "--click-text": { const text = next(); opts.clicks.push(text); opts.steps.push({ kind: "clickText", text }); break; }
			case "--dom": opts.dom.push(next()); break;
			case "--dom-out": opts.domOut = next(); break;
			case "--full": opts.full = true; break;
			case "--root": opts.root = next(); break;
			case "--port": opts.port = Number(next()); break;
			case "--browser": opts.browser = next(); break;
			case "--profile": opts.profile = next(); break;
			case "--headful": opts.headful = true; break;
			case "--keep-open": opts.keepOpen = true; break;
			case "--timeout": opts.timeout = Number(next()); break;
			case "--json": opts.json = true; break;
			case "--help":
			case "-h":
				console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*?/, "").trim());
				process.exit(0);
				break;
			default:
				throw new Error(`unknown option ${arg}`);
		}
	}
	return opts;
}

const log = (msg) => process.stderr.write(`[harness-shot] ${msg}\n`);

/** base64url without padding, matching the Harness' own encoding. */
const b64url = (buf) => Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

/**
 * Read the browser-session signing secret from the Harness credential store.
 * The record is `<scope>/<id>` followed by its indented `payload.secret`.
 */
function readSessionSecret(credentialsFile) {
	const text = readFileSync(credentialsFile, "utf8");
	const lines = text.split(/\r?\n/u);
	const head = lines.findIndex((line) => /^\s*client-connection\/browser-session:\s*$/u.test(line));
	if (head === -1) throw new Error(`${credentialsFile} has no client-connection/browser-session record`);
	const indent = lines[head].match(/^\s*/u)[0].length;
	for (let i = head + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.trim() === "") continue;
		if (line.match(/^\s*/u)[0].length <= indent) break;
		const match = /^\s*secret:\s*(\S+)\s*$/u.exec(line);
		if (match) return Buffer.from(match[1].replaceAll("-", "+").replaceAll("_", "/"), "base64");
	}
	throw new Error(`${credentialsFile} has no secret in the browser-session record`);
}

/** Mint the authority-bound cookie the Host accepts (see dsh-client-connection BrowserAuth). */
function mintCookie(origin, secret, maxAgeDays = 30) {
	const authority = new URL(origin).host;
	const issuedAt = Date.now();
	const expiresAt = issuedAt + maxAgeDays * 24 * 60 * 60 * 1000;
	const body = b64url(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }), "utf8"));
	const signature = b64url(createHmac("sha256", secret).update(body).digest());
	return {
		name: `dsh-auth-${b64url(createHash("sha256").update(authority).digest())}`,
		value: `v1.${body}.${signature}`,
		expiresAt,
		authority
	};
}

/** Locate an installed Chromium-family browser. */
function findBrowser(explicit) {
	const candidates = [
		explicit,
		process.env["ProgramFiles"] && path.join(process.env["ProgramFiles"], "Google", "Chrome", "Application", "chrome.exe"),
		process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
		process.env["ProgramFiles"] && path.join(process.env["ProgramFiles"], "Microsoft", "Edge", "Application", "msedge.exe"),
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser"
	].filter(Boolean);
	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found) throw new Error("no Chromium-family browser found; pass --browser <path> or set HARNESS_SHOT_BROWSER");
	return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal CDP client: one WebSocket, id-correlated commands, awaited events. */
class Cdp {
	constructor(socket) {
		this.socket = socket;
		this.nextId = 1;
		this.pending = new Map();
		this.waiters = [];
		socket.addEventListener("message", (event) => this.onMessage(event.data));
		socket.addEventListener("close", () => {
			for (const { reject } of this.pending.values()) reject(new Error("CDP socket closed"));
			this.pending.clear();
		});
	}
	static async connect(wsUrl) {
		const socket = new WebSocket(wsUrl);
		await new Promise((resolve, reject) => {
			socket.addEventListener("open", resolve, { once: true });
			socket.addEventListener("error", () => reject(new Error(`cannot open ${wsUrl}`)), { once: true });
		});
		return new Cdp(socket);
	}
	onMessage(raw) {
		const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
		if (msg.id !== undefined) {
			const entry = this.pending.get(msg.id);
			if (!entry) return;
			this.pending.delete(msg.id);
			if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
			else entry.resolve(msg.result);
			return;
		}
		for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
			const waiter = this.waiters[i];
			if (waiter.method === msg.method && (!waiter.sessionId || waiter.sessionId === msg.sessionId)) {
				this.waiters.splice(i, 1);
				waiter.resolve(msg.params);
			}
		}
	}
	send(method, params = {}, sessionId) {
		const id = this.nextId++;
		const payload = { id, method, params };
		if (sessionId) payload.sessionId = sessionId;
		this.socket.send(JSON.stringify(payload));
		return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
	}
	event(method, sessionId, timeoutMs) {
		return new Promise((resolve, reject) => {
			const waiter = { method, sessionId, resolve };
			this.waiters.push(waiter);
			setTimeout(() => {
				const at = this.waiters.indexOf(waiter);
				if (at !== -1) {
					this.waiters.splice(at, 1);
					reject(new Error(`timeout waiting for ${method}`));
				}
			}, timeoutMs).unref?.();
		});
	}
	close() {
		try {
			this.socket.close();
		} catch {
			/* already gone */
		}
	}
}

async function fetchJson(url, timeoutMs) {
	const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
	return response.json();
}

/** Launch the browser and return { child, port, cdp } once the CDP endpoint answers. */
async function launchBrowser(opts, origin) {
	const exe = findBrowser(opts.browser);
	const profile = opts.profile ?? path.join(opts.root, ".shots", "profile");
	mkdirSync(profile, { recursive: true });
	const args = [
		`--remote-debugging-port=${opts.port}`,
		`--user-data-dir=${profile}`,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-extensions",
		"--disable-sync",
		"--hide-scrollbars",
		"--metrics-recording-only",
		"--mute-audio",
		`--window-size=${opts.width},${opts.height}`,
		"about:blank"
	];
	if (!opts.headful) args.unshift("--headless", "--disable-gpu");
	log(`browser: ${exe}`);
	const child = spawn(exe, args, { stdio: "ignore", detached: false });
	const deadline = Date.now() + opts.timeout;
	let version;
	for (;;) {
		try {
			version = await fetchJson(`http://127.0.0.1:${opts.port}/json/version`, 2000);
			break;
		} catch (error) {
			if (Date.now() > deadline) {
				child.kill();
				throw new Error(`CDP endpoint did not come up on port ${opts.port}: ${error.message}`);
			}
			await sleep(250);
		}
	}
	const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
	return { child, cdp, origin, exe, profile };
}

/** Attach a fresh page target and return its session id. */
async function openPage(cdp, timeoutMs) {
	const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
	const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
	await cdp.send("Page.enable", {}, sessionId);
	await cdp.send("Runtime.enable", {}, sessionId);
	return { targetId, sessionId };
}

async function evaluate(cdp, sessionId, expression) {
	const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
	if (result.exceptionDetails) {
		throw new Error(`page eval failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
	}
	return result.result?.value;
}

/** Click the center of the first element matching the selector. */
async function clickSelector(cdp, sessionId, selector) {
	const box = await evaluate(cdp, sessionId, `(() => {
		const el = document.querySelector(${JSON.stringify(selector)});
		if (!el) return null;
		el.scrollIntoView({ block: "center", inline: "center" });
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	})()`);
	if (!box) throw new Error(`--click found no element: ${selector}`);
	return clickPoint(cdp, sessionId, box);
}

/**
 * Click the smallest visible element whose trimmed text starts with `text`.
 * Menu items and list rows are easier to hit by text than by generated class names.
 */
async function clickText(cdp, sessionId, text) {
	const box = await evaluate(cdp, sessionId, `(() => {
		const wanted = ${JSON.stringify(text)}.trim().toLowerCase();
		const hits = [];
		for (const el of document.querySelectorAll("body *")) {
			const own = (el.textContent || "").trim().toLowerCase();
			if (!own.startsWith(wanted)) continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
			hits.push({ el, r });
		}
		if (hits.length === 0) return null;
		hits.sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height);
		const { el, r } = hits[0];
		el.scrollIntoView({ block: "center", inline: "center" });
		const after = el.getBoundingClientRect();
		return { x: after.left + after.width / 2, y: after.top + after.height / 2, text: (el.textContent || "").trim().slice(0, 60) };
	})()`);
	if (!box) throw new Error(`--click-text found no element starting with: ${text}`);
	log(`  matched text "${box.text}"`);
	return clickPoint(cdp, sessionId, box);
}

async function clickPoint(cdp, sessionId, box) {
	const point = { x: Math.round(box.x), y: Math.round(box.y), button: "left", clickCount: 1 };
	await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point }, sessionId);
	await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point }, sessionId);
	await sleep(300);
	return point;
}

/** Collect tag, text, computed colors and (truncated) markup for the DOM dump. */
const DOM_DUMP_FN = `(selector) => Array.from(document.querySelectorAll(selector)).slice(0, 40).map((el) => {
	const cs = getComputedStyle(el);
	const r = el.getBoundingClientRect();
	return {
		tag: el.tagName.toLowerCase(),
		class: el.className && String(el.className),
		text: (el.textContent || "").trim().slice(0, 160),
		color: cs.color,
		backgroundColor: cs.backgroundColor,
		backgroundImage: cs.backgroundImage === "none" ? "none" : "set",
		fontSize: cs.fontSize,
		fontWeight: cs.fontWeight,
		opacity: cs.opacity,
		rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
		html: el.outerHTML.slice(0, 600)
	};
})`;

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const base = new URL(opts.url);
	const origin = base.origin;
	const target = new URL(opts.path, origin).toString();
	const shotsDir = path.join(opts.root, ".shots");
	const out = opts.out ?? path.join(shotsDir, `shot-${new Date().toISOString().replace(/[:.]/gu, "-")}.png`);
	mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

	const dshHome = process.env.DSH_HOME ?? path.join(homedir(), ".dsh");
	const credentialsFile = path.join(dshHome, ".credentials.yaml");
	const cookie = mintCookie(origin, readSessionSecret(credentialsFile));
	log(`origin ${origin} | cookie ${cookie.name.slice(0, 18)}… | target ${target}`);

	const { child, cdp, profile, exe } = await launchBrowser(opts, origin);
	let sessionId;
	try {
		const page = await openPage(cdp, opts.timeout);
		sessionId = page.sessionId;
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: opts.width,
			height: opts.height,
			deviceScaleFactor: opts.scale,
			mobile: false
		}, sessionId);
		if (opts.colorScheme !== "system") {
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: opts.colorScheme }]
			}, sessionId);
		}
		await cdp.send("Network.enable", {}, sessionId);
		await cdp.send("Network.setCookie", {
			name: cookie.name,
			value: cookie.value,
			url: `${origin}/`,
			path: "/",
			httpOnly: true,
			expires: Math.floor(cookie.expiresAt / 1000)
		}, sessionId);

		const loaded = cdp.event("Page.loadEventFired", sessionId, opts.timeout).catch(() => undefined);
		await cdp.send("Page.navigate", { url: target }, sessionId);
		await loaded;
		log(`loaded, settling ${opts.wait} ms`);
		await sleep(opts.wait);

		const body = await evaluate(cdp, sessionId, "document.body ? document.body.innerText.slice(0, 200) : ''");
		if (/authentication required/u.test(body ?? "")) throw new Error("page rendered the 401 text; cookie was rejected");

		for (const step of opts.steps) {
			if (step.kind === "eval") {
				const value = await evaluate(cdp, sessionId, step.js);
				log(`eval -> ${JSON.stringify(value)?.slice(0, 200)}`);
			} else if (step.kind === "clickText") {
				const point = await clickText(cdp, sessionId, step.text);
				log(`click-text "${step.text}" -> ${point.x},${point.y}`);
			} else {
				const point = await clickSelector(cdp, sessionId, step.sel);
				log(`click ${step.sel} -> ${point.x},${point.y}`);
			}
			await sleep(400);
		}

		let domOut;
		if (opts.dom.length > 0) {
			domOut = opts.domOut ?? path.join(path.dirname(path.resolve(out)), `${path.basename(out, ".png")}.dom.json`);
			const dump = {};
			for (const selector of opts.dom) {
				dump[selector] = await evaluate(cdp, sessionId, `(${DOM_DUMP_FN})(${JSON.stringify(selector)})`);
			}
			writeFileSync(domOut, `${JSON.stringify(dump, null, 2)}\n`, "utf8");
			log(`dom dump -> ${domOut}`);
		}

		const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: opts.full }, sessionId);
		writeFileSync(out, Buffer.from(shot.data, "base64"));
		const summary = {
			ok: true,
			png: path.resolve(out),
			bytes: Buffer.from(shot.data, "base64").length,
			dom: domOut ? path.resolve(domOut) : null,
			url: target,
			viewport: { width: opts.width, height: opts.height },
			colorScheme: opts.colorScheme,
			browser: exe,
			profile,
			cdpPort: opts.port
		};
		if (opts.json) console.log(JSON.stringify(summary));
		else {
			log(`png -> ${summary.png} (${summary.bytes} bytes)`);
			console.log(JSON.stringify(summary, null, 2));
		}
		if (opts.keepOpen) {
			log(`--keep-open: browser left on port ${opts.port}; kill PID ${child.pid} when done`);
			child.unref();
			cdp.close();
			return;
		}
	} finally {
		if (!opts.keepOpen) {
			cdp.close();
			child.kill();
		}
	}
}

main().catch((error) => {
	log(`ERROR: ${error.message}`);
	process.exit(1);
});

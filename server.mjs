import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDouyinPage } from "./platforms/douyin.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const tasksRoot = join(root, "tasks");
const localRoot = join(root, "local");
const captureProfilePath = join(localRoot, "capture-browser-profile");
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9222);
const supportedHosts = ["tiktok.com", "instagram.com", "facebook.com", "douyin.com", "kuaishou.com"];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function chromePath() {
  return process.env.CHROME_PATH || (process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local", "Google", "Chrome", "Application", "chrome.exe")
    : "google-chrome");
}

function platformFor(url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  return supportedHosts.find((item) => host === item || host.endsWith(`.${item}`)) || null;
}

function safeTaskId() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function parseMetric(text, labels) {
  const escaped = labels.join("|");
  const match = text.match(new RegExp(`(?:${escaped})[^\\d]{0,24}([\\d,.]+\\s*[KkMm万亿]?)`, "i"));
  if (!match) return null;
  const raw = match[1].replace(/\\s/g, "").replace(/,/g, "");
  const unit = raw.slice(-1).toLowerCase();
  const number = Number.parseFloat(unit.match(/[k万m亿]/) ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(number)) return null;
  const multiplier = { k: 1e3, m: 1e6, 万: 1e4, 亿: 1e8 }[unit] || 1;
  return Math.round(number * multiplier);
}

function parsePage(dom) {
  const body = dom.match(/<body[\s\S]*?<\/body>/i)?.[0] || dom;
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const title = dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const description = dom.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] || "";
  const likes = parseMetric(text, ["likes?", "赞", "点赞"]);
  const comments = parseMetric(text, ["comments?", "评论"]);
  const shares = parseMetric(text, ["shares?", "转发", "分享"]);
  const views = parseMetric(text, ["views?", "播放", "观看"]);
  const metrics = { likes, comments, shares, views };
  const available = [likes, comments, shares].filter((value) => value !== null);
  return { title, description, metrics, interaction: available.length ? available.reduce((sum, value) => sum + value, 0) : null, metricStatus: available.length ? "partial-or-complete" : "not-read" };
}

function blockingReason(dom) {
  const title = dom.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const text = dom.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/验证码中间页|安全验证|人机验证/.test(`${title} ${text}`)) {
    return "页面触发了平台安全验证。请在采集浏览器中自行完成验证并关闭窗口后重试。";
  }
  return null;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function commandDevTools(webSocketUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const requestId = 1;
    const timer = setTimeout(() => { socket.close(); reject(new Error("采集浏览器响应超时。")); }, 30000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ id: requestId, method, params })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) reject(new Error(message.error.message || "浏览器执行失败。"));
      else resolve(message.result || {});
    });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("无法连接采集浏览器。")); });
  });
}

async function captureVisibleChrome(url, platform, screenshotPath, domPath, logPath) {
  let targets;
  try {
    const response = await fetch(`http://127.0.0.1:${chromeDebugPort}/json/list`);
    if (!response.ok) throw new Error("debug endpoint unavailable");
    targets = await response.json();
  } catch {
    throw new Error("未连接到采集浏览器。请点击“打开采集浏览器”，完成登录后保持该窗口打开，再开始采集。");
  }
  const target = targets.find((item) => item.type === "page" && item.url.includes(platform)) || targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("采集浏览器中没有可用页面。请保持采集浏览器窗口打开后重试。");
  try {
    await commandDevTools(target.webSocketDebuggerUrl, "Page.bringToFront");
    await commandDevTools(target.webSocketDebuggerUrl, "Page.navigate", { url });
    let dom = "";
    let videoReady = platform !== "douyin.com";
    let pageReady = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await delay(5000);
      const domResult = await commandDevTools(target.webSocketDebuggerUrl, "Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
      dom = domResult.result?.value || "";
      const videoResult = await commandDevTools(target.webSocketDebuggerUrl, "Runtime.evaluate", { expression: "(() => { const video = document.querySelector('video'); if (video) { video.muted = true; video.play().catch(() => {}); } return { readyState: video?.readyState || 0, width: video?.videoWidth || 0, currentTime: video?.currentTime || 0 }; })()", returnByValue: true });
      const video = videoResult.result?.value || {};
      videoReady = platform !== "douyin.com" || (video.readyState >= 2 && video.width > 0 && video.currentTime > 0);
      pageReady = platform === "douyin.com" ? dom.includes('data-e2e="detail-video-info"') : dom.length > 180;
      if (pageReady && videoReady) break;
    }
    if (!pageReady) {
      throw new Error("页面在 30 秒内仍未加载完成。请确认采集浏览器中的作品可以正常播放后重试。");
    }
    const screenshotResult = await commandDevTools(target.webSocketDebuggerUrl, "Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await Promise.all([writeFile(domPath, dom), writeFile(logPath, ""), writeFile(screenshotPath, Buffer.from(screenshotResult.data || "", "base64"))]);
    if (!dom || !screenshotResult.data) throw new Error("采集浏览器未返回页面内容或截图。");
    return { dom, videoReady };
  } catch (error) {
    await writeFile(logPath, String(error.message || error));
    throw error;
  }
}

function platformHome(platform) {
  return {
    tiktok: "https://www.tiktok.com/",
    instagram: "https://www.instagram.com/",
    facebook: "https://www.facebook.com/",
    douyin: "https://www.douyin.com/",
    kuaishou: "https://www.kuaishou.com/",
  }[platform] || "https://www.facebook.com/";
}

async function openLoginBrowser(request, response) {
  let payload;
  try { payload = await jsonBody(request); } catch { payload = {}; }
  await mkdir(captureProfilePath, { recursive: true });
  const child = spawn(chromePath(), ["--no-first-run", "--no-default-browser-check", `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${chromeDebugPort}`, `--user-data-dir=${captureProfilePath}`, platformHome(payload.platform)], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ message: "已打开采集浏览器。请自行登录并保持该窗口打开，再开始采集。" }));
}

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function capture(request, response) {
  let payload;
  try { payload = await jsonBody(request); } catch { response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: "请求格式无效。" })); return; }
  let url;
  try { url = new URL(payload.url); } catch { response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: "请输入有效的作品链接。" })); return; }
  if (!["http:", "https:"].includes(url.protocol) || !platformFor(url.href)) { response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: "当前只支持 TikTok、Instagram、Facebook、抖音和快手作品链接。" })); return; }
  const taskId = safeTaskId();
  const taskDir = join(tasksRoot, taskId);
  const screenshotsDir = join(taskDir, "screenshots");
  const dataDir = join(taskDir, "task_data");
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const screenshotPath = join(screenshotsDir, "work-001.png");
  const domPath = join(dataDir, "page.html");
  const logPath = join(dataDir, "browser.log");
  try {
    await mkdir(captureProfilePath, { recursive: true });
    const { dom, videoReady } = await captureVisibleChrome(url.href, platformFor(url.href), screenshotPath, domPath, logPath);
    if (/ERR_NETWORK_ACCESS_DENIED|Internet 访问被阻止|Your Internet access is blocked/i.test(dom)) {
      throw new Error("页面无法访问，当前网络或防火墙阻止了浏览器打开该平台。");
    }
    const blocked = blockingReason(dom);
    if (blocked) throw new Error(blocked);
    const screenshot = await stat(screenshotPath);
    const genericParsed = parsePage(dom);
    const parsed = platformFor(url.href) === "douyin.com" ? parseDouyinPage(dom, genericParsed) : genericParsed;
    const note = !videoReady && platformFor(url.href) === "douyin.com"
      ? "作品页面和互动数据已读取，但截图时视频画面尚未解码完成。"
      : parsed.metricStatus === "not-read"
        ? "页面已打开，但没有可靠读取到公开互动数据；未填入 0。"
        : "互动数据仅来自页面当前可见内容。";
    const result = { taskId, url: url.href, platform: platformFor(url.href), screenshotPath: `/tasks/${taskId}/screenshots/work-001.png`, screenshotBytes: screenshot.size, ...parsed, videoReady, loginStatus: "not-determined", note };
    await (await import("node:fs/promises")).writeFile(join(dataDir, "result.json"), JSON.stringify(result, null, 2));
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ taskId, error: error.message, loginStatus: "not-determined" }));
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/browser/open-login") { await openLoginBrowser(request, response); return; }
  if (request.method === "POST" && request.url === "/api/capture") { await capture(request, response); return; }
  const requestedPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const baseDir = requestedPath.startsWith("/tasks/") ? tasksRoot : join(root, "public");
  const filePath = normalize(join(baseDir, requestedPath.startsWith("/tasks/") ? requestedPath.slice("/tasks/".length) : requestedPath));

  if (!filePath.startsWith(normalize(baseDir))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Creator content tool running at http://127.0.0.1:${port}`);
});

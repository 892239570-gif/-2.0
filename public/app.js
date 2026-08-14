const STORAGE_KEY = "creator-content-tasks";
const app = document.querySelector("#app");

const navigation = [
  ["home", "⌂", "首页"],
  ["new", "+", "新建采集"],
  ["update", "↻", "更新已有数据"],
  ["history", "▤", "任务记录"],
  ["settings", "⚙", "设置"],
];

const readTasks = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const saveTasks = (tasks) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
const formatDate = (value) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const platformLabel = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", douyin: "抖音", kuaishou: "快手" };

function layout(page, content) {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">达</div><div><strong>达人内容工作台</strong><span>Content studio</span></div></div>
      <nav class="nav" aria-label="主导航">${navigation.map(([id, icon, label]) => `<button class="${page === id ? "active" : ""}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join("")}</nav>
      <div class="sidebar-note"><strong>开始前提醒</strong>请先在浏览器中登录需要采集的平台。工具不会保存你的社交平台密码。</div>
    </aside>
    <div class="content"><header class="topbar"><div class="breadcrumb">工作台 / ${navigation.find(([id]) => id === page)?.[2] || "首页"}</div><div class="user-pill"><span>本地工作区</span><div class="avatar">我</div></div></header><main class="main">${content}</main></div>
  </div>`;
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
}

function homePage() {
  const tasks = readTasks();
  const rows = tasks.slice(0, 5).map((task) => `<div class="task-row"><div><div class="task-name">${escapeHtml(task.name)}</div><div class="task-meta">${formatDate(task.createdAt)}</div></div><div class="task-meta">${platformLabel[task.platform] || "未识别"}</div><div class="task-meta">${task.modeLabel}</div><span class="status ${task.status === "completed" ? "ready" : ""}">${task.statusLabel || "待开始"}</span><div class="task-meta">${task.itemCount} 条</div></div>`).join("");
  layout("home", `<section class="hero"><div><div class="eyebrow">轻松整理每一条内容</div><h1>把达人内容，<br><span style="color: var(--primary)">收集成清晰资产。</span></h1><p class="lead">从真实作品链接开始，逐步完成截图、数据读取、审核和 Word 输出。现在先创建你的第一个采集任务。</p></div><div class="hero-orb" aria-hidden="true"></div></section>
    <section class="grid"><article class="card action-card"><div><div class="card-icon">✦</div><h3>采集新内容</h3><p>从达人 ID、主页或作品链接采集内容、截图和互动数据。</p></div><button class="card-link" data-action="new">创建采集任务 →</button></article><article class="card action-card"><div><div class="card-icon">↗</div><h3>更新已有数据</h3><p>上传历史 Word，通过已有作品链接刷新最新互动数据。</p></div><button class="card-link" data-action="update">进入更新流程 →</button></article></section>
    <section class="section"><div class="section-heading"><h2>最近任务</h2><span>${tasks.length ? `共 ${tasks.length} 个本地任务` : "还没有任务"}</span></div>${rows ? `<div class="task-list">${rows}</div>` : `<div class="empty">你的任务会出现在这里<br><span>创建一个采集任务，开始建立本地内容记录。</span></div>`}</section>`);
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.action)));
}

function newTaskPage() {
  layout("new", `<section class="page-title"><div class="eyebrow">Phase 2 · 单作品闭环</div><h1>采集一条作品</h1><p class="lead">工具连接独立的本机 Chrome 采集配置，直接在可见浏览器中打开作品、读取页面并保存真实截图。首次使用时，请自行登录；工具不会要求或保存你的密码。</p></section><section class="card form-card"><div class="notice"><strong>开始前</strong><br>选择平台后点击“打开采集浏览器”，在新窗口自行登录。<strong>采集期间请保持该窗口打开。</strong><div class="form-actions"><button class="secondary-button" type="button" id="open-login-browser">打开采集浏览器</button></div></div><form id="task-form"><div class="field"><label for="task-name">任务名称</label><input id="task-name" name="name" placeholder="例如：单条作品验收" required maxlength="80" /></div><div class="field"><label for="source">作品链接</label><input id="source" name="source" type="url" placeholder="粘贴 TikTok / Instagram / Facebook / 抖音 / 快手作品链接" required /></div><div class="field"><label for="platform">平台</label><select id="platform" name="platform"><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="douyin">抖音</option><option value="kuaishou">快手</option></select></div><div class="form-actions"><button class="primary-button" type="submit">开始真实采集</button><button class="secondary-button" type="button" data-page="home">取消</button></div></form><div class="notice">当前阶段只支持单条作品链接。采集失败会显示真实失败原因，不会用示例截图或固定数据代替。</div></section><div id="capture-result"></div>`);
  document.querySelector("#task-form").addEventListener("submit", captureTask);
  document.querySelector("#open-login-browser").addEventListener("click", openLoginBrowser);
}

async function openLoginBrowser() { const button = document.querySelector("#open-login-browser"); button.disabled = true; try { const response = await fetch("/api/browser/open-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: document.querySelector("#platform").value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "无法打开采集浏览器"); showToast(result.message); } catch (error) { renderCaptureError(error.message); } finally { button.disabled = false; } }

async function captureTask(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const button = event.currentTarget.querySelector("button[type=submit]"); const name = form.get("name"); const source = form.get("source"); const platform = form.get("platform"); button.disabled = true; button.textContent = "正在打开页面…"; const task = { id: crypto.randomUUID(), name, mode: "work", modeLabel: "单条作品", platform, source, itemCount: 1, status: "running", statusLabel: "采集中", createdAt: new Date().toISOString() }; saveTasks([task, ...readTasks()]); try { const response = await fetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "采集失败"); task.status = "completed"; task.statusLabel = "已完成"; task.result = result; saveTasks([task, ...readTasks().filter((item) => item.id !== task.id)]); renderCaptureResult(result); } catch (error) { task.status = "failed"; task.statusLabel = "失败"; task.error = error.message; saveTasks([task, ...readTasks().filter((item) => item.id !== task.id)]); renderCaptureError(error.message); } finally { button.disabled = false; button.textContent = "再次采集"; } }
function renderCaptureResult(result) { document.querySelector("#capture-result").innerHTML = `<section class="section"><div class="section-heading"><h2>采集结果</h2><span class="status ready">真实完成</span></div><div class="card result-card"><div class="result-preview"><img src="${result.screenshotPath}" alt="作品页面真实截图" /></div><div class="result-data"><h3>${escapeHtml(result.title || "未读取到页面标题")}</h3><p class="task-meta">${escapeHtml(result.platform)} · 登录状态：未判断</p><div class="metric-grid">${metric("点赞量", result.metrics.likes)}${metric("评论量", result.metrics.comments)}${metric("转发量", result.metrics.shares)}${metric("互动量", result.interaction)}${metric("播放量", result.metrics.views)}</div><p class="task-meta">${escapeHtml(result.note)}</p><a class="card-link" href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">打开原始链接 ↗</a></div></div></section>`; }
function renderCaptureError(message) { document.querySelector("#capture-result").innerHTML = `<section class="section"><div class="notice error-notice"><strong>采集失败</strong><br>${escapeHtml(message)}<br><span>任务已记录为失败，可再次点击采集。</span></div></section>`; }
function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value === null || value === undefined ? "" : Number(value).toLocaleString("zh-CN")}</strong><small>${value === null || value === undefined ? "未获取到" : "页面可见数据"}</small></div>`; }

function simplePage(page, eyebrow, title, message) { layout(page, `<section class="page-title"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="lead">${message}</p></section><div class="empty">此模块将在对应 Phase 实现。当前没有可执行的真实功能。</div>`); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function showToast(message) { const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 2300); }
function navigate(page) { if (page === "home") homePage(); else if (page === "new") newTaskPage(); else if (page === "update") simplePage("update", "Phase 7 · 历史数据", "更新已有数据", "上传历史 Word，通过原有作品链接更新互动数据。字段级保护和对比 Word 将在后续阶段实现。"); else if (page === "history") simplePage("history", "本地记录", "任务记录", "这里将集中展示本地任务、截图和导出记录。"); else simplePage("settings", "工作区设置", "设置", "这里将提供最大采集条数、浏览器说明和默认输出位置。"); }
navigate("home");

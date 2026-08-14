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
  const rows = tasks.slice(0, 5).map((task) => `<div class="task-row"><div><div class="task-name">${escapeHtml(task.name)}</div><div class="task-meta">${formatDate(task.createdAt)}</div></div><div class="task-meta">${platformLabel[task.platform]}</div><div class="task-meta">${task.modeLabel}</div><span class="status ready">待开始</span><div class="task-meta">${task.itemCount} 条</div></div>`).join("");
  layout("home", `<section class="hero"><div><div class="eyebrow">轻松整理每一条内容</div><h1>把达人内容，<br><span style="color: var(--primary)">收集成清晰资产。</span></h1><p class="lead">从真实作品链接开始，逐步完成截图、数据读取、审核和 Word 输出。现在先创建你的第一个采集任务。</p></div><div class="hero-orb" aria-hidden="true"></div></section>
    <section class="grid"><article class="card action-card"><div><div class="card-icon">✦</div><h3>采集新内容</h3><p>从达人 ID、主页或作品链接采集内容、截图和互动数据。</p></div><button class="card-link" data-action="new">创建采集任务 →</button></article><article class="card action-card"><div><div class="card-icon">↗</div><h3>更新已有数据</h3><p>上传历史 Word，通过已有作品链接刷新最新互动数据。</p></div><button class="card-link" data-action="update">进入更新流程 →</button></article></section>
    <section class="section"><div class="section-heading"><h2>最近任务</h2><span>${tasks.length ? `共 ${tasks.length} 个本地任务` : "还没有任务"}</span></div>${rows ? `<div class="task-list">${rows}</div>` : `<div class="empty">你的任务会出现在这里<br><span>创建一个采集任务，开始建立本地内容记录。</span></div>`}</section>`);
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.action)));
}

function newTaskPage() {
  layout("new", `<section class="page-title"><div class="eyebrow">Phase 1 · 任务基础</div><h1>创建采集任务</h1><p class="lead">先记录任务信息，后续阶段会在此基础上接入真实作品访问、截图和数据采集。</p></section><section class="card form-card"><form id="task-form"><div class="field"><label for="task-name">任务名称</label><input id="task-name" name="name" placeholder="例如：7 月达人内容整理" required maxlength="80" /><small>给这次工作起一个容易识别的名字。</small></div><div class="field"><label for="task-mode">采集方式</label><select id="task-mode" name="mode"><option value="work">单条作品链接</option><option value="profile">达人主页链接</option><option value="id">达人 ID</option><option value="import">批量导入（Phase 4 开放）</option></select></div><div class="field"><label for="platform">平台</label><select id="platform" name="platform"><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="douyin">抖音</option><option value="kuaishou">快手</option></select></div><div class="field"><label for="source">来源信息（可选）</label><input id="source" name="source" placeholder="可先填写作品或主页链接" /><small>当前阶段只保存任务信息，不会访问链接或伪造采集结果。</small></div><div class="form-actions"><button class="primary-button" type="submit">保存任务</button><button class="secondary-button" type="button" data-page="home">取消</button></div></form><div class="notice">真实采集功能将在 Phase 2 接入。当前保存后会生成一个本地“待开始”任务，数据保存在此浏览器的本地工作区中。</div></section>`);
  document.querySelector("#task-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const modes = { work: "单条作品", profile: "达人主页", id: "达人 ID", import: "批量导入" }; const task = { id: crypto.randomUUID(), name: form.get("name"), mode: form.get("mode"), modeLabel: modes[form.get("mode")], platform: form.get("platform"), source: form.get("source"), itemCount: 0, status: "pending", createdAt: new Date().toISOString() }; saveTasks([task, ...readTasks()]); showToast("任务已保存到本地工作区"); setTimeout(() => navigate("home"), 500); });
}

function simplePage(page, eyebrow, title, message) { layout(page, `<section class="page-title"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="lead">${message}</p></section><div class="empty">此模块将在对应 Phase 实现。当前没有可执行的真实功能。</div>`); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function showToast(message) { const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; document.body.append(toast); setTimeout(() => toast.remove(), 2300); }
function navigate(page) { if (page === "home") homePage(); else if (page === "new") newTaskPage(); else if (page === "update") simplePage("update", "Phase 7 · 历史数据", "更新已有数据", "上传历史 Word，通过原有作品链接更新互动数据。字段级保护和对比 Word 将在后续阶段实现。"); else if (page === "history") simplePage("history", "本地记录", "任务记录", "这里将集中展示本地任务、截图和导出记录。"); else simplePage("settings", "工作区设置", "设置", "这里将提供最大采集条数、浏览器说明和默认输出位置。"); }
navigate("home");

function toNumber(raw) {
  if (!raw) return null;
  const value = raw.replace(/\s/g, "");
  const unit = value.slice(-1);
  const number = Number.parseFloat(/[万亿]/.test(unit) ? value.slice(0, -1) : value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * ({ 万: 1e4, 亿: 1e8 }[unit] || 1));
}

function metricNearE2e(dom, e2e) {
  const start = dom.indexOf(`data-e2e="${e2e}"`);
  if (start < 0) return null;
  const next = dom.indexOf("data-e2e=", start + e2e.length + 12);
  const fragment = dom.slice(start, next < 0 ? start + 6000 : next);
  const values = [...fragment.matchAll(/>([\d.]+(?:万|亿)?)<\/(?:div|span)>/g)].map((match) => toNumber(match[1])).filter((value) => value !== null);
  return values.at(-1) ?? null;
}

function captionFromDetail(dom) {
  const start = dom.indexOf('data-e2e="detail-video-info"');
  if (start < 0) return "";
  const fragment = dom.slice(start, start + 5000);
  const heading = fragment.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  return heading.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseDouyinPage(dom, fallback) {
  const likes = metricNearE2e(dom, "video-player-digg");
  const comments = metricNearE2e(dom, "feed-comment-icon");
  const shares = metricNearE2e(dom, "video-share-icon-container");
  const available = [likes, comments, shares].filter((value) => value !== null);
  const caption = captionFromDetail(dom);
  return {
    ...fallback,
    title: caption || fallback.title,
    description: caption || fallback.description,
    metrics: { likes, comments, shares, views: null },
    interaction: available.length ? available.reduce((sum, value) => sum + value, 0) : null,
    metricStatus: available.length ? "partial-or-complete" : "not-read",
  };
}

function textFromHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function discoverDouyinWorks(dom) {
  const works = new Map();
  const workTabStart = dom.indexOf('data-e2e="user-work-tab"');
  const nextTabStart = workTabStart < 0 ? -1 : dom.indexOf('data-e2e="user-like-tab"', workTabStart + 1);
  const workDom = workTabStart < 0 ? "" : dom.slice(workTabStart, nextTabStart < 0 ? workTabStart + 500000 : nextTabStart);
  const videoLinks = /href=["'](?:https?:)?\/\/www\.douyin\.com\/video\/(\d+)[^"']*["']/g;
  let match;
  while ((match = videoLinks.exec(workDom))) {
    const videoId = match[1];
    if (works.has(videoId)) continue;
    const fragment = workDom.slice(match.index, match.index + 3500);
    const anchor = fragment.match(/<a[^>]*href=["'](?:https?:)?\/\/www\.douyin\.com\/video\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || "";
    works.set(videoId, {
      id: videoId,
      url: `https://www.douyin.com/video/${videoId}`,
      title: textFromHtml(anchor) || "未读取到作品标题",
    });
  }
  return [...works.values()];
}

export function douyinPublishedDate(dom) {
  const match = dom.match(/publish-time[^>]*>\s*发布时间：\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] || null;
}

function visit(value, results) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((item) => visit(item, results)); return; }
  if ((value.aweme_id || value.awemeId) && (value.create_time || value.createTime)) results.push(value);
  Object.values(value).forEach((item) => visit(item, results));
}

export function discoverDouyinWorksFromResponses(responses) {
  const rawWorks = [];
  responses.forEach((response) => visit(response, rawWorks));
  const works = new Map();
  rawWorks.forEach((work) => {
    const id = String(work.aweme_id || work.awemeId);
    const timestamp = Number(work.create_time || work.createTime);
    if (!id || !Number.isFinite(timestamp) || works.has(id)) return;
    const publishedAt = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const title = String(work.desc || work.description || work.title || "未读取到作品标题").replace(/\s+/g, " ").trim();
    works.set(id, { id, url: `https://www.douyin.com/video/${id}`, title, publishedAt });
  });
  return [...works.values()];
}

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

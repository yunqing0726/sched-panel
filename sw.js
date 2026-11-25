/* 待办日程面板 · Service Worker
 *
 * 目的只有一个：让「添加到主屏幕」的页面在没有网络时也能打开上一次的内容。
 * 策略是 network-first（永远先要新数据，断网才回缓存），因为面板每 60 秒会
 * 自己拉 version.txt 判断要不要刷新——缓存优先会让它永远看到旧版。
 *
 * 任何以 /api/ 开头的请求、非 GET 请求、跨域请求（ntfy 中继等）一律不碰。
 */
const CACHE = "dsh-sched-2026-11-25";
const OFFLINE_FALLBACK = "index.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_FALLBACK, "manifest.json"])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheable(req, res) {
  if (!res || !res.ok || res.status !== 200) return false;
  if (res.type !== "basic") return false;          // 只缓存同源
  const url = new URL(req.url);
  if (url.pathname.indexOf("/api/") === 0) return false;
  if (url.pathname.endsWith("/version.txt")) return false; // 版本探测永远走网络
  return true;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (cacheable(req, res)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match(OFFLINE_FALLBACK))
      )
  );
});

// 오프라인 사용을 위한 앱 셸 캐싱. 파일을 바꾸면 CACHE_NAME 버전을 올려야 갱신됨.
const CACHE_NAME = "clinometer-v27";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/app.js",
  "./src/sensors.js",
  "./src/geology.js",
  "./src/symbol.js",
  "./src/declination.js",
  "./src/wmm-coefficients.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // 온라인일 때는 항상 최신 파일을 받아오고, 실패했을 때(오프라인)만 캐시로 대체한다.
  // (예전 cache-first 방식은 배포 후에도 예전 화면이 계속 보이는 문제가 있었음.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 실패 응답(404/500 등)은 캐시에 남기지 않는다 — 한 번의 배포/네트워크 오류가
        // 오프라인에서 계속 재생되는 것을 막는다.
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

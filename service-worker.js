// 오프라인 사용을 위한 앱 셸 캐싱. 파일을 바꾸면 CACHE_NAME 버전을 올려야 갱신됨.
const CACHE_NAME = "clinometer-v20";
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
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

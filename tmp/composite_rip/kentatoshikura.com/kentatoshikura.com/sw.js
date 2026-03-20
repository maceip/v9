//
const CACHE_NAME = "v130";
const START_PAGE = "/";
const PFFLINE_PAGE = "/offline.html";
const FILES_TO_CACHE = [START_PAGE, PFFLINE_PAGE];
const NEVER_CACHE = [/preview=true/];

//=============================
// INSTALL
//=============================
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      FILES_TO_CACHE.map(function (url) {
        return cache.add(url).catch(function (reason) {
          return console.log(String(reason) + " " + url);
        });
      });
    })
  );
});

//=============================
// ACTIVATE
//=============================
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keyList) {
      return Promise.all(
        keyList.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

//=============================
// FETCH
//=============================
self.addEventListener("fetch", function (e) {
  if (!NEVER_CACHE.every(checkNeverCacheList, e.request.url)) {
    return;
  }
  if (!e.request.url.match(/^(http|https):\/\//i)) return;
  if (new URL(e.request.url).origin !== location.origin) return;
  if (e.request.method !== "GET") {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(PFFLINE_PAGE);
      })
    );
    return;
  }
  if (e.request.mode === "navigate" && navigator.onLine) {
    e.respondWith(
      fetch(e.request).then(function (response) {
        return caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, response.clone());
          return response;
        });
      })
    );
    return;
  }
  e.respondWith(
    caches
      .match(e.request)
      .then(function (response) {
        return (
          response ||
          fetch(e.request).then(function (response) {
            return caches.open(CACHE_NAME).then(function (cache) {
              cache.put(e.request, response.clone());
              return response;
            });
          })
        );
      })
      .catch(function () {
        return caches.match(PFFLINE_PAGE);
      })
  );
});

function checkNeverCacheList(url) {
  if (this.match(url)) {
    return false;
  }
  return true;
}

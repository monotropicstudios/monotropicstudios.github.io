var PARTS = [
  "audio/witness-me-audiobook.m4b.part-00",
  "audio/witness-me-audiobook.m4b.part-01",
  "audio/witness-me-audiobook.m4b.part-02"
];
var TOTAL = "206990256";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  var path = new URL(event.request.url).pathname;
  if (!/\/witness-me-audiobook\.m4b$/.test(path)) return;
  event.respondWith(serve());
});

function serve() {
  var stream = new ReadableStream({
    start: function (controller) {
      var chain = Promise.resolve();
      PARTS.forEach(function (part) {
        chain = chain.then(function () {
          return fetch(part).then(function (res) {
            if (!res.ok || !res.body) throw new Error(part);
            var reader = res.body.getReader();
            function pump() {
              return reader.read().then(function (step) {
                if (step.done) return;
                controller.enqueue(step.value);
                return pump();
              });
            }
            return pump();
          });
        });
      });
      return chain.then(function () {
        controller.close();
      }, function (err) {
        controller.error(err);
      });
    }
  });
  var headers = {
    "Content-Type": "audio/mp4",
    "Content-Disposition": 'attachment; filename="witness-me-audiobook.m4b"'
  };
  try {
    headers["Content-Length"] = TOTAL;
    return new Response(stream, { headers: headers });
  } catch (e) {
    delete headers["Content-Length"];
    return new Response(stream, { headers: headers });
  }
}

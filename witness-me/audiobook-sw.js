var PARTS = [
  "/r/587aa8de1de0ba31/witness-me/audio/witness-me-audiobook.m4b.part-00",
  "/r/587aa8de1de0ba31/witness-me/audio/witness-me-audiobook.m4b.part-01",
  "/r/587aa8de1de0ba31/witness-me/audio/witness-me-audiobook.m4b.part-02",
  "/r/587aa8de1de0ba31/witness-me/audio/witness-me-audiobook.m4b.part-03"
];
var TOTAL = "339925342";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  var path = new URL(event.request.url).pathname;
  if (path !== "/witness-me/audio/witness-me-audiobook.m4b") return;
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

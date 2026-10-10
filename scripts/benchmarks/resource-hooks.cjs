// Diagnostic-only hooks appended to a temporary copy by resources-macos.cjs.
// This file and all benchmark scripts are excluded from application packages.
const resourceInspector = new (require("node:inspector").Session)();
const resourceCaptures = [];
const resourcePerformance = require("node:perf_hooks").performance;
const resourceErrors = [];
process.removeAllListeners("uncaughtException");
process.on("uncaughtException", (error) => {
  resourceErrors.push(error.stack);
  console.error("RESOURCE_ERROR", error.stack);
});
resourceInspector.connect();
const resourcePost = (method, params = {}) =>
  new Promise((resolve, reject) =>
    resourceInspector.post(method, params, (err, data) =>
      err ? reject(err) : resolve(data)
    )
  );
ipc.handle("resource-profile-start", async () => {
  await resourcePost("Profiler.enable");
  await resourcePost("Profiler.setSamplingInterval", { interval: 1000 });
  await resourcePost("Profiler.start");
});
ipc.handle("resource-profile-stop", async (e, name) => {
  const { profile } = await resourcePost("Profiler.stop");
  const file = path.join(
    process.env.SVELTO_RESOURCE_PROFILE_DIR,
    name + ".cpuprofile"
  );
  fs.writeFileSync(file, JSON.stringify(profile));
  return { file, samples: profile.samples.length };
});
ipc.handle("resource-metrics", async () => ({
  heap: process.memoryUsage(),
  processes: app.getAppMetrics(),
  cacheBytes: await session.fromPartition("persist:webcontent").getCacheSize(),
  captures: resourceCaptures,
  errors: resourceErrors,
  views: Object.keys(viewMap).map((id) => ({
    id,
    pid: viewMap[id].webContents.getOSProcessId(),
  })),
}));
ipc.removeAllListeners("getCapture");
ipc.on("getCapture", (e, data) => {
  const view = viewMap[data.id];
  if (!view) return;
  const contents = view.webContents,
    begin = resourcePerformance.now(),
    cpu = process.cpuUsage();
  contents
    .capturePage()
    .then((img) => {
      if (viewMap[data.id] !== view || contents.isDestroyed()) return;
      const captureEnd = resourcePerformance.now(),
        size = img.getSize();
      if (!size.width || !size.height) return;
      img = img.resize({ width: data.width, height: data.height });
      const resized = resourcePerformance.now(),
        url = img.toDataURL(),
        end = resourcePerformance.now();
      const consumed = process.cpuUsage(cpu);
      resourceCaptures.push({
        begin,
        captureMs: captureEnd - begin,
        resizeMs: resized - captureEnd,
        encodeMs: end - resized,
        wallMs: end - begin,
        cpuMicroseconds: consumed.user + consumed.system,
        size,
        bytes: url.length,
      });
      if (!e.sender.isDestroyed())
        e.sender.send("captureData", { id: data.id, url });
    })
    .catch((error) => resourceCaptures.push({ begin, error: error.message }));
});

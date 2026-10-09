// Packaged macOS benchmark. Browser plugin absent: CDP controls renderers without the Node inspector.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')
const { once } = require('node:events')
const { performance } = require('node:perf_hooks')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const root = path.resolve(__dirname, '../..')
const buildPath = path.join(root, 'output/build-path.txt')
const bundle = fs.existsSync(buildPath)
  ? fs.readFileSync(buildPath, 'utf8').trim()
  : path.join(root, 'dist/app/mac-arm64/Svelto.app')
const executable = process.env.SVELTO_TEST_EXECUTABLE || path.join(bundle, 'Contents/MacOS/Svelto')
const measuredBundle = path.resolve(path.dirname(executable), '../..')
const repeats = Number(process.env.SVELTO_BENCH_REPEATS || 3),
  startupRepeats = Number(process.env.SVELTO_BENCH_STARTUPS || 5)
const settleMs = Number(process.env.SVELTO_BENCH_SETTLE_MS || 10000),
  sampleSeconds = Number(process.env.SVELTO_BENCH_SAMPLE_SECONDS || 15)
const counts = (process.env.SVELTO_BENCH_COUNTS || '0,10,30,50').split(',').map(Number)
assert.equal(process.platform, 'darwin')
assert.ok(
  repeats > 0 &&
    startupRepeats > 0 &&
    sampleSeconds >= 2 &&
    counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 50)
)
const output = path.resolve(
  process.env.SVELTO_BENCH_OUTPUT || path.join(root, 'output/performance-macos.json')
)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'svelto-benchmark-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
const fixture =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Svelto benchmark fixture</title><style>body{font:16px system-ui;margin:32px;background:#f6f7f4;color:#202821}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{padding:16px;background:white;border:1px solid #ddd;border-radius:8px}</style><h1>Svelto loaded-tab benchmark</h1><p>Static local document: no timers, media, remote assets or service workers.</p><main>' +
  Array.from(
    { length: 200 },
    (_, i) =>
      '<article><h2>Card ' +
      i +
      '</h2><p>A repeatable document for browser baseline measurements.</p></article>'
  ).join('') +
  '</main><script>document.documentElement.dataset.fixtureReady="true"</script></html>'
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
  res.end(fixture)
})
let current
const results = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  startup: [],
  resources: [],
  failures: [],
  method: {
    startup: 'spawn to loaded GUI with selected tab and toolbar; includes CDP readiness/connection',
    cache:
      'fresh user-data profiles versus immediate repeat launch; OS filesystem caches are not flushed',
    control: 'renderer CDP; no --inspect, --debug-browser or DevTools window',
    footprint:
      'macOS footprint --noCategories total footprint across exactly the sampled app PIDs, measured after the CPU window; bytes converted to MiB',
    resources:
      'sum of RSS and CPU time deltas for the launched process and recursive children; fixture server/observer and other Svelto instances excluded',
    rss: 'MiB (1024^2 bytes); shared pages can be counted multiple times; not physical footprint',
    cpu: '100% equals one fully occupied logical CPU; aggregate may exceed 100%',
    loadedTabs:
      'all fixture documents loaded in separate WebContentsViews; one foreground tab, remaining tabs background; no explicit suspension',
    settleMs,
    sampleSeconds,
    repeats,
    startupRepeats,
    fixtureBytes: Buffer.byteLength(fixture),
    fixtureCards: 200
  }
}
function save() {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(results, null, 2))
}
async function wait(fn, label, timeout = 60000) {
  const end = performance.now() + timeout
  while (performance.now() < end) {
    if (current?.child.exitCode !== null || current?.child.signalCode !== null) throw Error('App exited during ' + label)
    if (await fn()) return
    await sleep(25)
  }
  throw Error('Timed out: ' + label)
}
function profile(name) {
  const dir = path.join(work, name)
  fs.mkdirSync(dir)
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ startupTabOption: 1, darkTheme: false })
  )
  fs.writeFileSync(
    path.join(dir, 'sessionRestore.json'),
    JSON.stringify({
      version: 2,
      state: {
        tasks: [
          {
            id: 'benchmark-task',
            name: 'Benchmark',
            tabs: [{ id: 'benchmark-blank', url: '', selected: true }],
            tabHistory: { stack: [] }
          }
        ]
      }
    })
  )
  return dir
}
async function launch(dir) {
  const socket = http.createServer()
  await new Promise((r) => socket.listen(0, '127.0.0.1', r))
  const port = socket.address().port
  await new Promise((r) => socket.close(r))
  const started = performance.now(),
    child = spawn(
      executable,
      ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port],
      {
        cwd: root,
        env: { ...process.env, SVELTO_USER_DATA_DIR: dir },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
  const active = (current = { child, dir, logs: '', browser: null })
  child.stderr.on('data', (data) => {
    active.logs = (active.logs + data).slice(-16000)
  })
  child.stdout.resume()
  let endpoint
  await wait(async () => {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/version')
      endpoint = await response.json()
      return !!endpoint.webSocketDebuggerUrl
    } catch {
      return false
    }
  }, 'CDP endpoint')
  const browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl)
  current.browser = browser
  let ui
  await wait(async () => {
    ui = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url() === 'min://app/index.html')
    return (
      ui &&
      (await ui.evaluate(
        () =>
          document.readyState === 'complete' &&
          !!window.tasks?.getSelected() &&
          document.querySelectorAll('.tab-item').length > 0 &&
          !!document.getElementById('switch-task-button')
      ))
    )
  }, 'meaningful toolbar')
  const readyMs = performance.now() - started
  const errors = []
  for (const p of browser.contexts()[0].pages()) p.on('pageerror', (e) => errors.push(e.message))
  browser.contexts()[0].on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)))
  current.ui = ui
  current.errors = errors
  return readyMs
}
async function stop() {
  if (!current) return
  const active = current
  const exit = once(active.child, 'exit')
  try {
    await active.ui.evaluate(() => ipc.send('quit'))
    await Promise.race([
      exit,
      sleep(10000).then(() => {
        if (active.child.exitCode === null) throw Error('Quit timed out')
      })
    ])
  } finally {
    if (active.child.exitCode === null) active.child.kill('SIGKILL')
    await active.browser?.close().catch(() => {})
    current = null
  }
}
function seconds(text) {
  const parts = text.split(':').map(Number)
  return parts.reduce((sum, n) => sum * 60 + n, 0)
}
function snapshot(pid) {
  const all = run('/bin/ps', ['-axo', 'pid=,ppid=,rss=,time=,comm='])
    .trim()
    .split('\n')
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
      if (!match) return null
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKiB: Number(match[3]),
        cpuSeconds: seconds(match[4]),
        command: match[5]
      }
    })
    .filter(Boolean)
  const ids = new Set([pid])
  let size
  do {
    size = ids.size
    for (const p of all) if (ids.has(p.ppid)) ids.add(p.pid)
  } while (ids.size !== size)
  const processes = all.filter((p) => ids.has(p.pid))
  assert.ok(
    processes.some((p) => p.pid === pid),
    'Root app process missing'
  )
  return {
    atMs: performance.now(),
    rssMiB: processes.reduce((s, p) => s + p.rssKiB, 0) / 1024,
    processes
  }
}
async function resources(count, repeat, origin) {
  const dir = profile('resources-' + count + '-' + repeat)
  const readyMs = await launch(dir)
  for (let i = 0; i < count; i++) {
    await current.ui.evaluate((url) => ipc.emit('addTab', null, { url }), origin + '/fixture/' + i)
    await wait(async () => {
      const p = current.browser
        .contexts()[0]
        .pages()
        .find((p) => p.url() === origin + '/fixture/' + i)
      return p && (await p.evaluate(() => document.documentElement.dataset.fixtureReady === 'true'))
    }, 'fixture ' + i)
  }
  assert.equal(await current.ui.evaluate(() => tabs.count()), Math.max(1, count))
  const loaded = count
    ? current.browser
        .contexts()[0]
        .pages()
        .filter((p) => p.url().startsWith(origin + '/fixture/')).length
    : 0
  assert.equal(loaded, count)
  await sleep(settleMs)
  const samples = [snapshot(current.child.pid)]
  for (let i = 0; i < sampleSeconds; i++) {
    await sleep(1000)
    samples.push(snapshot(current.child.pid))
  }
  const cpuIntervals = []
  for (let i = 1; i < samples.length; i++) {
    const previous = new Map(samples[i - 1].processes.map((p) => [p.pid, p.cpuSeconds]))
    const cpuDelta = samples[i].processes.reduce(
      (sum, p) => sum + Math.max(0, p.cpuSeconds - (previous.get(p.pid) || 0)),
      0
    )
    cpuIntervals.push((cpuDelta / ((samples[i].atMs - samples[i - 1].atMs) / 1000)) * 100)
  }
  const last = samples.at(-1),
    footprintPath = path.join(work, 'footprint-' + count + '-' + repeat + '.json')
  let footprintRaw, footprintError, footprintMiB
  try {
    run('/usr/bin/footprint', [
      '--noCategories',
      '-j',
      footprintPath,
      ...last.processes.map((p) => String(p.pid))
    ])
    footprintRaw = JSON.parse(fs.readFileSync(footprintPath, 'utf8'))
    assert.equal(footprintRaw.unit, 'byte')
    assert.deepEqual(footprintRaw.errors, [])
    assert.ok(Number.isFinite(footprintRaw['total footprint']))
    footprintMiB = footprintRaw['total footprint'] / 1024 ** 2
  } catch (e) {
    footprintError = String(e.message).slice(0, 2000)
  }
  if (footprintError) throw Error('Footprint collection failed: ' + footprintError)
  assert.deepEqual(footprintRaw.processes.map(p => p.pid).sort((a,b)=>a-b), last.processes.map(p => p.pid).sort((a,b)=>a-b))
  if (process.env.SVELTO_BENCH_CAPTURE && repeat === 0) {
    await current.ui.screenshot({ path: '/private/tmp/svelto-benchmark-' + count + '.png' })
  }
  assert.deepEqual(current.errors, [])
  results.resources.push({
    count,
    repeat,
    readyMs,
    loaded,
    processCount: last.processes.length,
    rssMedianMiB: median(samples.map((s) => s.rssMiB)),
    rssMinMiB: Math.min(...samples.map((s) => s.rssMiB)),
    rssMaxMiB: Math.max(...samples.map((s) => s.rssMiB)),
    cpuMeanPercent: cpuIntervals.reduce((s, n) => s + n, 0) / cpuIntervals.length,
    cpuPeakPercent: Math.max(...cpuIntervals),
    samples,
    cpuIntervals,
    footprintMiB,
    footprintRaw,
    footprintError,
    hostLoadAverage: os.loadavg(),
    uiSize: await current.ui.evaluate(() => ({ width: innerWidth, height: innerHeight })),
    logs: current.logs,
    errors: current.errors
  })
  save()
  console.log(
    'RESOURCE',
    JSON.stringify({
      count,
      repeat,
      footprintMiB,
      rssMiB: results.resources.at(-1).rssMedianMiB,
      cpuPercent: results.resources.at(-1).cpuMeanPercent,
      processes: last.processes.length
    })
  )
  await stop()
}
function median(values) {
  const list = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(list.length / 2)
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2
}
;(async () => {
  results.environment = {
    platform: os.platform(),
    arch: os.arch(),
    logicalCPUs: os.cpus().length,
    cpu: os.cpus()[0].model,
    totalMemoryGiB: os.totalmem() / 1024 ** 3,
    loadAverageStart: os.loadavg(),
    os: run('/usr/bin/sw_vers', []).trim(),
    model: run('/usr/sbin/sysctl', ['-n', 'hw.model']).trim(),
    sourceCommit:
      process.env.SVELTO_BENCH_SOURCE_COMMIT || run('git', ['rev-parse', 'HEAD']).trim(),
    electron: require('../../package.json').electronVersion,
    executable,
    bundleHash: require('node:crypto')
      .createHash('sha256')
      .update(fs.readFileSync(path.join(measuredBundle, 'Contents/Resources/app/main.build.js')))
      .digest('hex')
  }
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = 'http://127.0.0.1:' + server.address().port
  for (let i = 0; i < startupRepeats; i++) {
    const dir = profile('startup-' + i)
    for (const kind of ['freshProfile', 'repeatProfile']) {
      const readyMs = await launch(dir)
      results.startup.push({ kind, repeat: i, readyMs, errors: current.errors, logs: current.logs })
      console.log('STARTUP', kind, i, readyMs.toFixed(1))
      save()
      await stop()
    }
  }
  for (let repeat = 0; repeat < repeats; repeat++) {
    const ordered = repeat % 2 ? counts.slice().reverse() : counts
    for (const count of ordered) await resources(count, repeat, origin)
  }
  results.summary = {
    startup: Object.fromEntries(
      ['freshProfile', 'repeatProfile'].map((kind) => [
        kind,
        {
          medianMs: median(results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs)),
          minMs: Math.min(...results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs)),
          maxMs: Math.max(...results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs))
        }
      ])
    ),
    resources: counts.map((count) => {
      const rows = results.resources.filter((r) => r.count === count)
      return {
        count,
        footprintMedianMiB: median(rows.map((r) => r.footprintMiB)),
        footprintRangeMiB: [
          Math.min(...rows.map((r) => r.footprintMiB)),
          Math.max(...rows.map((r) => r.footprintMiB))
        ],
        cpuRangePercent: [
          Math.min(...rows.map((r) => r.cpuMeanPercent)),
          Math.max(...rows.map((r) => r.cpuMeanPercent))
        ],
        rssMedianMiB: median(rows.map((r) => r.rssMedianMiB)),
        cpuMedianPercent: median(rows.map((r) => r.cpuMeanPercent)),
        processCount: rows.map((r) => r.processCount)
      }
    })
  }
  results.status = 'complete'
  save()
  console.log(JSON.stringify(results.summary))
})()
  .catch((e) => {
    results.status = 'failed'
    results.failures.push({ error: e.stack, logs: current?.logs })
    save()
    console.error(e.stack)
    process.exitCode = 1
  })
  .finally(async () => {
    await stop().catch(() => {})
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
    fs.rmSync(work, { recursive: true, force: true })
  })

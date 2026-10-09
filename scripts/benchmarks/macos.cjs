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
const backgroundMode = process.env.SVELTO_BENCH_BACKGROUND === '1'
const visibilityControlMode = process.env.SVELTO_BENCH_VISIBILITY_CONTROL === '1'
const repeats = Number(process.env.SVELTO_BENCH_REPEATS || 3),
  startupRepeats = Number(process.env.SVELTO_BENCH_STARTUPS || 5)
const settleMs = Number(process.env.SVELTO_BENCH_SETTLE_MS || 10000),
  sampleSeconds = Number(process.env.SVELTO_BENCH_SAMPLE_SECONDS || 15)
const counts = (process.env.SVELTO_BENCH_COUNTS || (backgroundMode ? '50' : '0,10,30,50'))
  .split(',')
  .map(Number)
assert.equal(process.platform, 'darwin')
assert.ok(
  repeats > 0 &&
    startupRepeats > 0 &&
    sampleSeconds >= 2 &&
    counts.every((n) => Number.isInteger(n) && n >= 0 && n <= 50)
)
assert.ok(
  !backgroundMode || counts.every((n) => n >= 5),
  'Background analysis needs at least five loaded tabs'
)
const output = path.resolve(
  process.env.SVELTO_BENCH_OUTPUT ||
    path.join(
      root,
      visibilityControlMode
        ? 'output/background-memory-native-control.json'
        : backgroundMode
        ? 'output/background-memory-macos.json'
        : 'output/performance-macos.json'
    )
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
    backgroundAnalysis: backgroundMode
      ? 'Map tab renderer PIDs and heap, switch without unloading, close background tabs to five/one and observe release after 10/30 seconds; no automatic suspension'
      : null,
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
    if (current?.child.exitCode !== null || current?.child.signalCode !== null)
      throw Error('App exited during ' + label)
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
  assert.ok(!current, 'Previous benchmark instance must be stopped')
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
  const active = (current = { child, dir, port, logs: '', browser: null })
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
  assert.deepEqual(
    footprintRaw.processes.map((p) => p.pid).sort((a, b) => a - b),
    last.processes.map((p) => p.pid).sort((a, b) => a - b)
  )
  if (process.env.SVELTO_BENCH_CAPTURE && repeat === 0) {
    await current.ui.screenshot({ path: '/private/tmp/svelto-benchmark-' + count + '.png' })
  }
  assert.deepEqual(current.errors, [])
  const background = backgroundMode ? await analyzeBackground(origin, footprintRaw) : undefined
  assert.deepEqual(current.errors, [])
  results.resources.push({
    background,
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
async function tabPids() {
  return current.ui.evaluate(async () => {
    const data = tabs.get()
    // The normal view dispatcher owns its callback IDs. Route profiling replies separately,
    // forwarding all normal replies unchanged and restoring listeners before leaving this probe.
    const original = ipc.listeners('async-call-result')
    const callbacks = new Map()
    const timers = []
    function dispatch(event, reply) {
      if (callbacks.has(reply.callId)) callbacks.get(reply.callId)(reply)
      else original.forEach((listener) => listener.call(ipc, event, reply))
    }
    ipc.removeAllListeners('async-call-result')
    ipc.on('async-call-result', dispatch)
    try {
      return await Promise.all(
        data.map(
          (tab) =>
            new Promise((resolve, reject) => {
              const callId = 'memory-profile-' + tab.id
              const timeout = setTimeout(() => reject(Error('Renderer PID timed out')), 10000)
              timers.push(timeout)
              callbacks.set(callId, (reply) => {
                clearTimeout(timeout)
                if (reply.error) reject(Error('Renderer PID lookup failed'))
                else
                  resolve({ id: tab.id, url: tab.url, selected: tab.selected, pid: reply.result })
              })
              ipc.send('callViewMethod', { id: tab.id, method: 'getOSProcessId', args: [], callId })
            })
        )
      )
    } finally {
      timers.forEach(clearTimeout)
      ipc.removeListener('async-call-result', dispatch)
      original.forEach((listener) => ipc.on('async-call-result', listener))
    }
  })
}
async function mappedFootprint(name, origin) {
  const state = await tabPids()
  const sample = snapshot(current.child.pid)
  const file = path.join(work, 'background-' + name + '-' + current.child.pid + '.json')
  run('/usr/bin/footprint', [
    '--noCategories',
    '-j',
    file,
    ...sample.processes.map((p) => String(p.pid))
  ])
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(raw.unit, 'byte')
  assert.deepEqual(raw.errors, [])
  assert.deepEqual(
    raw.processes.map((p) => p.pid).sort((a, b) => a - b),
    sample.processes.map((p) => p.pid).sort((a, b) => a - b)
  )
  const memory = new Map(raw.processes.map((p) => [p.pid, p.footprint / 1024 ** 2]))
  const browserSession = await current.browser.newBrowserCDPSession()
  const types = await browserSession.send('SystemInfo.getProcessInfo')
  await browserSession.detach()
  const tabIds = new Set(state.map((t) => t.pid))
  const selected = new Set(state.filter((t) => t.selected).map((t) => t.pid))
  const background = new Set(state.filter((t) => !t.selected).map((t) => t.pid))
  assert.equal(state.filter((t) => t.selected).length, 1)
  assert.equal(
    tabIds.size,
    state.length,
    'Fixture renderer sharing changed; aggregate groups must not double count'
  )
  const phases = {
    name,
    tabs: state.length,
    processCount: sample.processes.length,
    footprintMiB: raw['total footprint'] / 1024 ** 2,
    activeRendererMiB: [...selected].reduce((sum, pid) => sum + memory.get(pid), 0),
    backgroundRenderersMiB: [...background].reduce((sum, pid) => sum + memory.get(pid), 0),
    gpuMiB: types.processInfo
      .filter((p) => p.type === 'GPU')
      .reduce((sum, p) => sum + (memory.get(p.id) || 0), 0),
    mainMiB: memory.get(current.child.pid),
    otherMiB: raw.processes
      .filter(
        (p) =>
          !tabIds.has(p.pid) &&
          p.pid !== current.child.pid &&
          types.processInfo.find((t) => t.id === p.pid)?.type !== 'GPU'
      )
      .reduce((sum, p) => sum + p.footprint / 1024 ** 2, 0),
    state,
    processTypes: types.processInfo,
    snapshot: sample,
    footprintRaw: raw
  }
  assert.ok(
    [phases.footprintMiB, phases.activeRendererMiB, phases.backgroundRenderersMiB].every(
      Number.isFinite
    )
  )
  assert.equal(
    current.browser
      .contexts()[0]
      .pages()
      .filter((p) => p.url().startsWith(origin + '/fixture/')).length,
    state.length
  )
  console.log(
    'BACKGROUND',
    JSON.stringify({
      phase: name,
      tabs: state.length,
      footprintMiB: phases.footprintMiB,
      backgroundRenderersMiB: phases.backgroundRenderersMiB,
      gpuMiB: phases.gpuMiB,
      processes: phases.processCount
    })
  )
  return phases
}
async function analyzeBackground(origin, baseline) {
  const mapped = await tabPids()
  const heap = []
  for (const tab of mapped) {
    const page = current.browser
      .contexts()[0]
      .pages()
      .find((p) => p.url() === tab.url)
    assert.ok(page)
    const session = await current.browser.contexts()[0].newCDPSession(page)
    const memory = await session.send('Runtime.getHeapUsage')
    const document = await page.evaluate(() => ({
      visibility: document.visibilityState,
      nodes: document.getElementsByTagName('*').length
    }))
    await session.detach()
    heap.push({
      ...tab,
      heapUsedMiB: memory.usedSize / 1024 ** 2,
      heapAllocatedMiB: memory.totalSize / 1024 ** 2,
      document
    })
  }
  const phases = [await mappedFootprint('loaded', origin)]
  const oldest = mapped[0]
  const originalPage = current.browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === oldest.url)
  await originalPage.evaluate(() => {
    window.__sveltoMemoryToken = 'draft-preserved'
    const input = document.createElement('input')
    input.id = 'memory-draft'
    input.value = 'Unsaved local draft'
    document.body.append(input)
  })
  await current.ui.evaluate(
    (id) => document.querySelector('.tab-item[data-tab="' + id + '"]').click(),
    oldest.id
  )
  await wait(
    () => current.ui.evaluate((id) => tabs.getSelected() === id, oldest.id),
    'switch oldest'
  )
  await sleep(settleMs)
  assert.equal(await originalPage.evaluate(() => window.__sveltoMemoryToken), 'draft-preserved')
  phases.push(await mappedFootprint('switched', origin))
  const keep = new Set([oldest.id, ...mapped.slice(-4).map((t) => t.id)])
  const close = async (ids) => {
    for (const id of ids)
      await current.ui.evaluate(
        (id) =>
          document.querySelector('.tab-item[data-tab="' + id + '"] .tab-close-button').click(),
        id
      )
    await sleep(settleMs)
  }
  await close(mapped.filter((t) => !keep.has(t.id)).map((t) => t.id))
  assert.equal(await current.ui.evaluate(() => tabs.count()), Math.min(5, mapped.length))
  phases.push(await mappedFootprint('closedToFive', origin))
  await close(mapped.filter((t) => keep.has(t.id) && t.id !== oldest.id).map((t) => t.id))
  assert.equal(await current.ui.evaluate(() => tabs.count()), 1)
  phases.push(await mappedFootprint('closedToOne10s', origin))
  await sleep(20000)
  phases.push(await mappedFootprint('closedToOne30s', origin))
  const gone = new Set(mapped.filter((t) => t.id !== oldest.id).map((t) => t.pid))
  assert.ok(
    phases.at(-1).snapshot.processes.every((p) => !gone.has(p.pid)),
    'Closed tab renderer survived'
  )
  assert.equal(await originalPage.evaluate(() => window.__sveltoMemoryToken), 'draft-preserved')
  assert.equal(await originalPage.locator('#memory-draft').inputValue(), 'Unsaved local draft')
  return {
    heap,
    phases,
    initialFootprintMiB: baseline['total footprint'] / 1024 ** 2,
    checks: {
      loadedCount: true,
      uniquePids: true,
      switchPreservesDocument: true,
      closedRenderersExit: true,
      activeDraftPreserved: true
    }
  }
}
async function visibilityControl(origin, repetition) {
  const count = Number(process.env.SVELTO_BENCH_CONTROL_TABS || 50)
  assert.ok(Number.isInteger(count) && count >= 5 && count <= 50)
  await launch(profile('visibility-control-' + repetition))
  for (let i = 0; i < count; i++) {
    const url = origin + '/fixture/' + i
    await current.ui.evaluate((url) => ipc.emit('addTab', null, { url }), url)
    await wait(async () => {
      const page = current.browser
        .contexts()[0]
        .pages()
        .find((p) => p.url() === url)
      return (
        page &&
        (await page.evaluate(() => document.documentElement.dataset.fixtureReady === 'true'))
      )
    }, 'control fixture')
  }
  await sleep(settleMs)
  const attachedFootprint = await mappedFootprint('controlAttached', origin)
  const attached = []
  for (const page of current.browser
    .contexts()[0]
    .pages()
    .filter((p) => p.url().startsWith(origin))) {
    attached.push({
      url: page.url(),
      visibility: await page.evaluate(() => document.visibilityState)
    })
  }
  // Drop every Playwright target connection. Reconnect only to the trusted GUI target,
  // which reads website visibility through existing main-process view calls.
  await current.browser.close()
  assert.equal(current.child.exitCode, null)
  await sleep(1000)
  const targets = await (await fetch('http://127.0.0.1:' + current.port + '/json/list')).json()
  const target = targets.find((t) => t.url === 'min://app/index.html')
  assert.ok(target)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    const callback = pending.get(data.id)
    if (callback) {
      pending.delete(data.id)
      callback(data)
    }
  })
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(Error('Control CDP timed out'))
      }, 15000)
      pending.set(id, (reply) => {
        clearTimeout(timer)
        reply.error ? reject(Error(JSON.stringify(reply.error))) : resolve(reply.result)
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const expression = `(async () => {
    const original = ipc.listeners('async-call-result'), callbacks = new Map(), timers = [];
    function dispatch(event,reply){if(callbacks.has(reply.callId))callbacks.get(reply.callId)(reply);else original.forEach(fn=>fn.call(ipc,event,reply))}
    ipc.removeAllListeners('async-call-result');ipc.on('async-call-result',dispatch);
    try{return await Promise.all(tabs.get().map(tab=>new Promise((resolve,reject)=>{
      const callId='visibility-control-'+tab.id;
      const timer=setTimeout(()=>reject(Error('Visibility reply timed out')),10000);timers.push(timer);
      callbacks.set(callId,reply=>{clearTimeout(timer);if(reply.error)reject(Error('Visibility read failed'));else resolve({id:tab.id,url:tab.url,selected:tab.selected,visibility:reply.result})});
      ipc.send('callViewMethod',{id:tab.id,method:'executeJavaScript',args:['document.visibilityState'],callId});
    })))}finally{timers.forEach(clearTimeout);ipc.removeListener('async-call-result',dispatch);original.forEach(fn=>ipc.on('async-call-result',fn))}
  })()`
  const reply = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  assert.ok(!reply.exceptionDetails, JSON.stringify(reply.exceptionDetails))
  const guiOnly = reply.result.value
  assert.equal(guiOnly.length, count)
  assert.ok(guiOnly.every((t) => t.visibility === (t.selected ? 'visible' : 'hidden')))
  await sleep(settleMs)
  const samples = [snapshot(current.child.pid)]
  for (let i = 0; i < sampleSeconds; i++) {
    await sleep(1000)
    samples.push(snapshot(current.child.pid))
  }
  const cpuIntervals = samples.slice(1).map((sample, i) => {
    const previous = new Map(samples[i].processes.map((p) => [p.pid, p.cpuSeconds]))
    return (
      (sample.processes.reduce(
        (sum, p) => sum + Math.max(0, p.cpuSeconds - (previous.get(p.pid) || 0)),
        0
      ) /
        ((sample.atMs - samples[i].atMs) / 1000)) *
      100
    )
  })
  const last = samples.at(-1),
    file = path.join(work, 'native-memory-' + repetition + '.json')
  run('/usr/bin/footprint', [
    '--noCategories',
    '-j',
    file,
    ...last.processes.map((p) => String(p.pid))
  ])
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(raw.unit, 'byte')
  assert.deepEqual(raw.errors, [])
  assert.deepEqual(
    raw.processes.map((p) => p.pid).sort((a, b) => a - b),
    last.processes.map((p) => p.pid).sort((a, b) => a - b)
  )
  const memory = new Map(raw.processes.map((p) => [p.pid, p.footprint / 1024 ** 2]))
  const gpuPids = new Set(
    attachedFootprint.processTypes.filter((p) => p.type === 'GPU').map((p) => p.id)
  )
  const backgroundPids = new Set(
    attachedFootprint.state.filter((t) => !t.selected).map((t) => t.pid)
  )
  const activePid = attachedFootprint.state.find((t) => t.selected).pid
  assert.ok([...backgroundPids, activePid].every((pid) => memory.has(pid)))
  const native = {
    count,
    footprintMiB: raw['total footprint'] / 1024 ** 2,
    activeRendererMiB: memory.get(activePid),
    backgroundRenderersMiB: [...backgroundPids].reduce((sum, pid) => sum + memory.get(pid), 0),
    gpuMiB: [...gpuPids].reduce((sum, pid) => sum + (memory.get(pid) || 0), 0),
    mainMiB: memory.get(current.child.pid),
    cpuMeanPercent: cpuIntervals.reduce((sum, n) => sum + n, 0) / cpuIntervals.length,
    samples,
    cpuIntervals,
    footprintRaw: raw,
    processCount: last.processes.length
  }
  socket.close()
  const endpoint = await (await fetch('http://127.0.0.1:' + current.port + '/json/version')).json()
  current.browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl)
  current.ui = current.browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === 'min://app/index.html')
  const control = {
    repetition,
    attached,
    guiOnly,
    attachedFootprint,
    native,
    method:
      'Website debugger connections detached; only GUI Runtime client attached; website reads through existing trusted view IPC'
  }
  console.log(
    'VISIBILITY_CONTROL',
    JSON.stringify({
      repetition,
      count,
      backgroundHidden: guiOnly.filter((t) => t.visibility === 'hidden').length,
      footprintMiB: native.footprintMiB,
      gpuMiB: native.gpuMiB,
      backgroundRenderersMiB: native.backgroundRenderersMiB,
      cpuMeanPercent: native.cpuMeanPercent
    })
  )
  assert.deepEqual(current.errors, [])
  await stop()
  return control
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
  if (visibilityControlMode) {
    results.visibilityControls = []
    for (let repetition = 0; repetition < repeats; repetition++) {
      results.visibilityControls.push(await visibilityControl(origin, repetition))
      save()
    }
    results.status = 'complete'
    save()
    return
  }
  for (let i = 0; i < (backgroundMode ? 0 : startupRepeats); i++) {
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
    startup: backgroundMode
      ? null
      : Object.fromEntries(
          ['freshProfile', 'repeatProfile'].map((kind) => [
            kind,
            {
              medianMs: median(
                results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs)
              ),
              minMs: Math.min(
                ...results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs)
              ),
              maxMs: Math.max(
                ...results.startup.filter((r) => r.kind === kind).map((r) => r.readyMs)
              )
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

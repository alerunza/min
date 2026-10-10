// Browser plugin not available. GUI-only CDP avoids inspecting website targets during resource windows.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os')
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { chromium } = require('playwright')
const b = require('./macos.cjs')
const mode = process.env.SVELTO_USAGE_MODE || 'cpu'
assert.ok(['cpu', 'sites', 'latency', 'soak', 'resources'].includes(mode))
const result = {
  mode,
  createdAt: new Date().toISOString(),
  status: 'running',
  sourceCommit:
    process.env.SVELTO_BENCH_SOURCE_COMMIT || b.run('git', ['rev-parse', 'HEAD']).trim(),
  environment: {
    cpu: os.cpus()[0].model,
    ramGiB: os.totalmem() / 1024 ** 3,
    os: b.run('/usr/bin/sw_vers', []),
    executable: b.executable
  },
  observations: [],
  failures: []
}
const output = path.resolve(
  process.env.SVELTO_USAGE_OUTPUT || path.join(b.root, 'output/usage-' + mode + '-macos.json')
)
const save = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(result, null, 2))
}
result.environment.mainBuildSHA256 = require('node:crypto')
  .createHash('sha256')
  .update(
    fs.readFileSync(path.resolve(path.dirname(b.executable), '../Resources/app/main.build.js'))
  )
  .digest('hex')
result.runnerSHA256 = require('node:crypto')
  .createHash('sha256')
  .update(fs.readFileSync(__filename))
  .digest('hex')
result.helperSHA256 = require('node:crypto')
  .createHash('sha256')
  .update(fs.readFileSync(require.resolve('./macos.cjs')))
  .digest('hex')
let gui
async function connectGUI() {
  const targets = await (
    await fetch('http://127.0.0.1:' + b.getCurrent().port + '/json/list')
  ).json()
  const target = targets.find((t) => t.url === 'min://app/index.html')
  assert.ok(target)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    socket.addEventListener('open', r, { once: true })
    socket.addEventListener('error', j, { once: true })
  })
  let seq = 0
  const pending = new Map()
  socket.addEventListener('message', (e) => {
    const v = JSON.parse(e.data)
    const p = pending.get(v.id)
    if (p) {
      pending.delete(v.id)
      clearTimeout(p.timer)
      v.error ? p.reject(Error(JSON.stringify(v.error))) : p.resolve(v.result)
    }
  })
  socket.addEventListener('close', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(Error('GUI connection closed'))
    }
    pending.clear()
  })
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        timer = setTimeout(() => {
          pending.delete(id)
          reject(Error('GUI timeout: ' + method))
        }, 20000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  gui = {
    socket,
    send,
    evaluate: async (expression) => {
      const v = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      })
      if (v.exceptionDetails) throw Error(JSON.stringify(v.exceptionDetails))
      return v.result.value
    }
  }
  return gui
}
async function launch(name, dir) {
  await b.launch(dir || b.profile(name))
  await b.getCurrent().browser.close()
  await connectGUI()
  await gui.evaluate(
    `window.__usageErrors=[];window.addEventListener('error',e=>__usageErrors.push(e.message));window.addEventListener('unhandledrejection',e=>__usageErrors.push(String(e.reason)));
 window.__usageIPC={original:ipc.listeners('async-call-result'),pending:new Map(),late:[]};
 ipc.removeAllListeners('async-call-result');ipc.on('async-call-result',function(event,reply){
   if(typeof reply.callId==='string' && reply.callId.startsWith('usage-')){
     const callback=__usageIPC.pending.get(reply.callId);
     if(callback){__usageIPC.pending.delete(reply.callId);callback(reply)}else __usageIPC.late.push({callId:reply.callId,error:String(reply.error||'')});
   }else __usageIPC.original.forEach(fn=>fn.call(ipc,event,reply));
 });true`
  )
}
async function finish() {
  if (gui) {
    result.instrumentation = await gui
      .evaluate('({lateReplies:__usageIPC.late,pending:__usageIPC.pending.size})')
      .catch(() => null)
    gui.socket.close()
    gui = null
  }
  if (!b.getCurrent()) return
  if (b.getCurrent().child.exitCode === null && !b.getCurrent().child.signalCode) {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:' + b.getCurrent().port)
    b.getCurrent().browser = browser
    b.getCurrent().ui = browser
      .contexts()[0]
      .pages()
      .find((p) => p.url() === 'min://app/index.html')
  }
  await b.stop().catch(() => {})
}
const state = () =>
  gui.evaluate(`tabs.get().map(t=>({id:t.id,url:t.url,title:t.title,selected:t.selected}))`)
const view = (id, method, args = []) =>
  gui.evaluate(`new Promise((resolve,reject)=>{
 const callId='usage-'+Math.random();const timer=setTimeout(()=>{__usageIPC.pending.delete(callId);reject(Error('View reply timeout'))},15000);
 __usageIPC.pending.set(callId,reply=>{clearTimeout(timer);reply.error?reject(Error(String(reply.error))):resolve(reply.result)});
 ipc.send('callViewMethod',{id:${JSON.stringify(id)},method:${JSON.stringify(
    method
  )},args:${JSON.stringify(args)},callId});
})`)
const page = (id, expression) => view(id, 'executeJavaScript', [expression])
async function add(url) {
  const before = new Set((await state()).map((t) => t.id))
  await gui.evaluate(`ipc.emit('addTab',null,{url:${JSON.stringify(url)}})`)
  const t = (await state()).find((t) => !before.has(t.id))
  assert.ok(t)
  await b.wait(
    async () => {
      try {
        return await page(
          t.id,
          `document.readyState!=='loading' && document.body?.innerText.length>50`
        )
      } catch {
        return false
      }
    },
    'meaningful page ' + url,
    90000
  )
  return t
}
async function select(id) {
  await gui.evaluate(
    `document.querySelector('.tab-item[data-tab="'+${JSON.stringify(id)}+'"]').click()`
  )
  assert.equal((await state()).find((t) => t.id === id).selected, true)
}
async function memory(label) {
  const s = b.snapshot(b.getCurrent().child.pid),
    f = path.join(b.work, 'footprint-' + Date.now() + '.json')
  b.run('/usr/bin/footprint', ['--noCategories', '-j', f, ...s.processes.map((p) => String(p.pid))])
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
  assert.equal(raw.unit, 'byte')
  assert.deepEqual(raw.errors, [])
  assert.deepEqual(
    raw.processes.map((p) => p.pid).sort((a, b) => a - b),
    s.processes.map((p) => p.pid).sort((a, b) => a - b)
  )
  return {
    label,
    elapsedSeconds: (performance.now() - started) / 1000,
    footprintMiB: raw['total footprint'] / 1024 ** 2,
    snapshot: s,
    raw
  }
}
let started
function cpuDelta(a, z) {
  const old = new Map(a.processes.map((p) => [p.pid, p.cpuSeconds]))
  const elapsed = (z.atMs - a.atMs) / 1000
  return {
    elapsed,
    processes: z.processes.map((p) => ({
      pid: p.pid,
      command: p.command,
      percent: old.has(p.pid) ? (Math.max(0, p.cpuSeconds - old.get(p.pid)) / elapsed) * 100 : null
    })),
    exited: a.processes.filter((p) => !z.processes.some((q) => q.pid === p.pid)).map((p) => p.pid)
  }
}
async function windowCPU(seconds) {
  let last = b.snapshot(b.getCurrent().child.pid)
  const intervals = []
  for (let i = 0; i < seconds; i++) {
    await b.sleep(1000)
    const next = b.snapshot(b.getCurrent().child.pid)
    intervals.push(cpuDelta(last, next))
    last = next
  }
  return {
    intervals,
    meanPercent:
      intervals.reduce((s, v) => s + v.processes.reduce((n, p) => n + (p.percent || 0), 0), 0) /
      intervals.length
  }
}
async function cpu() {
  const reps = Number(process.env.SVELTO_USAGE_REPEATS || 2),
    seconds = Number(process.env.SVELTO_USAGE_CPU_SECONDS || 180)
  for (let r = 0; r < reps; r++) {
    await launch('usage-cpu-' + r)
    started = performance.now()
    const tabs = []
    for (let i = 0; i < 50; i++) tabs.push(await add(origin + '/fixture/' + i))
    const mapping = []
    for (const t of tabs) mapping.push({ ...t, pid: await view(t.id, 'getOSProcessId') })
    const visibility = []
    for (const t of tabs) visibility.push(await page(t.id, 'document.visibilityState'))
    assert.equal(visibility.filter((v) => v === 'hidden').length, 49)
    const initial = await memory('after-load')
    gui.socket.close()
    gui = null
    let previous = b.snapshot(b.getCurrent().child.pid)
    const intervals = []
    let stack = null
    for (let i = 0; i < seconds; i++) {
      await b.sleep(1000)
      const next = b.snapshot(b.getCurrent().child.pid),
        delta = cpuDelta(previous, next)
      delta.second = i + 1
      intervals.push(delta)
      previous = next
      const top = delta.processes
        .filter((p) => p.percent !== null)
        .sort((a, z) => z.percent - a.percent)[0]
      if (!stack && top.percent > 15) {
        const file = path.join(path.dirname(output), 'cpu-stack-' + r + '.txt')
        try {
          b.run('/usr/bin/sample', [String(top.pid), '2', '10', '-file', file])
          stack = { pid: top.pid, second: i + 1, file }
          delta.stackCollection = true
          previous = b.snapshot(b.getCurrent().child.pid)
        } catch (e) {
          stack = { error: e.message }
        }
      }
      if ((i + 1) % 30 === 0) {
        console.log('CPU_PROGRESS', JSON.stringify({ repeat: r, seconds: i + 1, total: seconds }))
        result.observations[r] = { repeat: r, mapping, visibility, initial, intervals, stack }
        save()
      }
    }
    const final = await memory('end')
    result.observations[r] = { repeat: r, mapping, visibility, initial, intervals, stack, final }
    save()
    await finish()
  }
}
const urls = [
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video',
  'https://github.com/minbrowser/min',
  'https://www.electronjs.org/docs/latest/tutorial/performance'
]
async function activate() {
  const executable = path.join(b.work, 'activate-macos')
  if (!fs.existsSync(executable))
    b.run('/usr/bin/swiftc', [path.join(__dirname, 'activate-macos.swift'), '-o', executable])
  const activation = JSON.parse(b.run(executable, [String(b.getCurrent().child.pid)]))
  assert.equal(activation.frontmost, true)
  await b.wait(
    () => gui.evaluate("document.body.classList.contains('focused')"),
    'foreground benchmark window'
  )
  result.activation = activation
}
async function realSites() {
  await launch('usage-sites')
  await activate()
  started = performance.now()
  for (const url of process.env.SVELTO_USAGE_VIDEO_ONLY === '1' ? [] : urls) {
    const start = performance.now()
    let t
    try {
      t = await add(url)
      const identity = await page(
        t.id,
        `({url:location.href,title:document.title,text:document.body.innerText.length,height:document.documentElement.scrollHeight,visibility:document.visibilityState})`
      )
      assert.ok(identity.text > 100)
      assert.ok(!identity.url.startsWith('min://'))
      const loadMs = performance.now() - start
      const scroll = await page(
        t.id,
        `(async()=>{const gaps=[];let last=performance.now();for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const now=performance.now();gaps.push(now-last);last=now;scrollBy(0,8)}return{scrollY,gaps}})()`
      )
      assert.ok(scroll.scrollY > 0)
      const resources = await windowCPU(15)
      result.observations.push({
        url,
        tab: t,
        loadMs,
        identity,
        scroll,
        resources,
        status: 'passed'
      })
    } catch (e) {
      result.observations.push({ url, status: 'failed', error: e.stack, tab: t })
      result.failures.push({ scope: url, error: e.message })
    }
    save()
    console.log('SITE', url, result.observations.at(-1).status)
  }
  // Public MDN sample, streamed into an isolated local document.
  const videoTab = await add(origin + '/video')
  await activate()
  const bufferStart = performance.now()
  await page(
    videoTab.id,
    `(async()=>{const v=document.querySelector('video');v.preload='auto';await v.play();return true})()`
  )
  await b.wait(
    () =>
      page(
        videoTab.id,
        `(()=>{const v=document.querySelector('video');return v.duration>0 && v.buffered.length>0 && v.buffered.end(v.buffered.length-1)>=v.duration-0.1})()`
      ),
    'fully buffered short video',
    60000
  )
  const bufferWaitMs = performance.now() - bufferStart
  const videoStart = await page(
    videoTab.id,
    `(async()=>{const v=document.querySelector('video');v.pause();v.currentTime=0;window.__videoEvents=[];for(const event of ['waiting','stalled','ended'])v.addEventListener(event,()=>__videoEvents.push({event,time:v.currentTime,at:performance.now()}));window.__videoStart=performance.now();window.__videoFrames=v.getVideoPlaybackQuality().totalVideoFrames;window.__videoDropped=v.getVideoPlaybackQuality().droppedVideoFrames;await v.play();return{time:v.currentTime,paused:v.paused,duration:v.duration,readyState:v.readyState,bufferedEnd:v.buffered.end(v.buffered.length-1),visibility:document.visibilityState}})()`
  )
  await b.sleep(10000)
  const videoEnd = await page(
    videoTab.id,
    `(()=>{const v=document.querySelector('video');return{time:v.currentTime,paused:v.paused,error:v.error?.code,elapsedMs:performance.now()-__videoStart,duration:v.duration,readyState:v.readyState,visibility:document.visibilityState,events:__videoEvents,quality:{frames:v.getVideoPlaybackQuality().totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames,startFrames:__videoFrames,startDropped:__videoDropped}}})()`
  )
  assert.ok(
    !videoEnd.paused && !videoEnd.error && videoEnd.quality.frames > videoEnd.quality.startFrames
  )
  assert.equal(videoEnd.visibility, 'visible')
  const videoCPU = await windowCPU(20)
  await page(videoTab.id, `document.querySelector('video').pause();true`)
  result.video = {
    bufferWaitMs,
    videoStart,
    videoEnd,
    videoCPU
  }
  result.memory = await memory('after-sites-and-video')
  result.guiErrors = await gui.evaluate('__usageErrors')
  result.instrumentation = await gui.evaluate(
    '({lateReplies:__usageIPC.late,pending:__usageIPC.pending.size})'
  )
  assert.deepEqual(result.guiErrors, [])
  // Only after resource windows attach website targets to capture visual evidence.
  gui.socket.close()
  gui = null
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + b.getCurrent().port)
  b.getCurrent().browser = browser
  b.getCurrent().ui = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === 'min://app/index.html')
  const wiki = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().startsWith(urls[0]))
  if (wiki) await wiki.screenshot({ path: '/private/tmp/svelto-real-site.png' })
  await finish()
}
async function latency() {
  await launch('usage-latency')
  await activate()
  started = performance.now()
  for (let i = 0; i < 30; i++) await add(origin + '/latency/' + i)
  // GUI-only page events timestamp DOM state to next animation frame; external dispatch overhead is recorded separately.
  gui.socket.close()
  gui = null
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + b.getCurrent().port)
  b.getCurrent().browser = browser
  const ui = (b.getCurrent().ui = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === 'min://app/index.html'))
  const historyService = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().endsWith('/js/places/placesService.html'))
  assert.ok(historyService)
  const historyReadyStart = performance.now()
  await historyService.waitForFunction(
    (url) => historyInMemoryCache.some((item) => item.url === url),
    origin + '/latency/29',
    { timeout: 60000, polling: 100 }
  )
  result.historyReadyMs = performance.now() - historyReadyStart
  await ui.evaluate(() => {
    window.__latency = []
    window.__paint = []
    window.__domSuggestions = []
    window.__lastInput = null
    new MutationObserver(() => {
      const q = window.__lastInput
      if (
        q &&
        document
          .querySelector('[data-plugin=searchSuggestions]')
          ?.textContent.includes('Svelto suggestion ' + q.value) &&
        !__domSuggestions.some((v) => v.value === q.value)
      )
        __domSuggestions.push({ value: q.value, ms: performance.now() - q.start })
    }).observe(document.getElementById('searchbar'), {
      childList: true,
      subtree: true,
      characterData: true
    })
    document.addEventListener(
      'input',
      (e) => {
        if (e.target.id !== 'tab-editor-input') return
        const start = performance.now(),
          value = e.target.value
        window.__lastInput = { value, start }
        requestAnimationFrame(() => __paint.push({ value, ms: performance.now() - start }))
      },
      true
    )
    window.__oldFetch = window.fetch
    window.fetch = (url, ...args) =>
      String(url).includes('ac.duckduckgo.com')
        ? Promise.resolve({
            json: async () => ['query', ['Svelto suggestion ' + new URL(url).searchParams.get('q')]]
          })
        : __oldFetch(url, ...args)
  })
  await connectGUI()
  const nativeKey = async (keyCode, modifiers = []) => {
    const id = await ui.evaluate(() => tabs.getSelected())
    await view(id, 'sendInputEvent', [{ type: 'keyDown', keyCode, modifiers }])
    await view(id, 'sendInputEvent', [{ type: 'keyUp', keyCode, modifiers }])
  }
  const ids = await ui.evaluate(() => tabs.get().map((t) => t.id))
  const trials = Number(process.env.SVELTO_USAGE_LATENCY_TRIALS || 30)
  for (let i = 0; i < trials; i++) {
    const open = performance.now()
    await nativeKey('l', ['meta'])
    await ui.locator('#tab-editor-input').waitFor({ state: 'visible' })
    const focusMs = performance.now() - open
    assert.equal(await ui.evaluate(() => document.activeElement.id), 'tab-editor-input')
    assert.equal(
      await ui.evaluate(() => document.hasFocus() && document.body.classList.contains('focused')),
      true
    )
    await ui.locator('#tab-editor-input').fill('')
    const start = performance.now()
    await ui.keyboard.type('quartzlatency' + i)
    const dispatchMs = performance.now() - start
    await ui.waitForFunction(
      () =>
        document
          .querySelector('[data-plugin=searchSuggestions]')
          ?.textContent.includes('Svelto suggestion'),
      null,
      { timeout: 10000, polling: 5 }
    )
    const suggestionMs = performance.now() - start
    await ui.waitForFunction(
      (query) => __domSuggestions.some((v) => v.value === query),
      'quartzlatency' + i,
      { timeout: 10000, polling: 5 }
    )
    const suggestionDOMMs = await ui.evaluate(
      (query) => __domSuggestions.find((v) => v.value === query).ms,
      'quartzlatency' + i
    )
    await ui.waitForFunction(
      (query) => __paint.some((v) => v.value === query),
      'quartzlatency' + i,
      { timeout: 10000, polling: 5 }
    )
    await ui.keyboard.press('ArrowDown')
    const selected = await ui.evaluate(() =>
      document.activeElement.classList.contains('searchbar-item')
    )
    assert.ok(selected)
    await nativeKey('Escape')
    assert.ok(await ui.evaluate(() => document.getElementById('searchbar').hidden))
    await nativeKey('l', ['meta'])
    const historyStart = performance.now()
    await ui.locator('#tab-editor-input').fill('Svelto benchmark fixture')
    await ui.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-plugin=places] .searchbar-item')).some((item) =>
          item.dataset.url?.includes('/latency/')
        ),
      null,
      { timeout: 10000 }
    )
    const historyMs = performance.now() - historyStart
    await nativeKey('Escape')
    const switchStart = performance.now(),
      switchId = ids[i % ids.length]
    await ui.locator('.tab-item[data-tab="' + switchId + '"]').click()
    await ui.waitForFunction((id) => tabs.getSelected() === id, switchId)
    const tabSwitchMs = performance.now() - switchStart
    result.observations.push({
      trial: i,
      focusMs,
      dispatchMs,
      suggestionMs,
      suggestionDOMMs,
      historyMs,
      tabSwitchMs
    })
    save()
  }
  if (process.env.SVELTO_USAGE_LIVE_SEARCH === '1') {
    await ui.evaluate(() => {
      window.__liveNetwork = []
      window.fetch = (url, ...args) => {
        if (!String(url).includes('ac.duckduckgo.com')) return __oldFetch(url, ...args)
        const start = performance.now(),
          query = new URL(url).searchParams.get('q')
        return __oldFetch(url, { ...args[0], signal: AbortSignal.timeout(20000) })
          .then((response) => ({
            json: async () => {
              const data = await response.json()
              __liveNetwork.push({
                query,
                requestToJSONMs: performance.now() - start,
                status: response.status,
                data
              })
              return data
            }
          }))
          .catch((error) => {
            __liveNetwork.push({
              query,
              error: String(error),
              requestToJSONMs: performance.now() - start
            })
            throw error
          })
      }
    })
    result.liveSuggestions = []
    for (const query of ['lightweight browser', 'web standards', 'macOS browser']) {
      await nativeKey('l', ['meta'])
      const start = performance.now()
      await ui.locator('#tab-editor-input').fill(query)
      await ui.waitForFunction((q) => __liveNetwork.some((r) => r.query === q), query, {
        timeout: 25000,
        polling: 25
      })
      const network = await ui.evaluate((q) => __liveNetwork.find((r) => r.query === q), query)
      let domMs = null
      if (!network.error && network.data?.[1]?.length) {
        await ui.waitForFunction(
          (text) =>
            document.querySelector('[data-plugin=searchSuggestions]')?.textContent.includes(text),
          network.data[1][0],
          { timeout: 10000, polling: 5 }
        )
        domMs = performance.now() - start
      }
      result.liveSuggestions.push({ query, network, dispatchToResultsMs: domMs })
      await nativeKey('Escape')
      save()
    }
    await ui.evaluate(() => (window.fetch = window.__oldFetch))
  }
  result.inputToFrame = await ui.evaluate(() => __paint)
  result.suggestionDOM = await ui.evaluate(() => __domSuggestions)
  await nativeKey('l', ['meta'])
  await ui.locator('#tab-editor-input').fill('Svelto latency')
  await ui.screenshot({ path: '/private/tmp/svelto-input-latency.png' })
  await nativeKey('Escape')
  await ui.evaluate(() => (window.fetch = window.__oldFetch))
  result.guiErrors = await ui.evaluate(() => __usageErrors)
  assert.deepEqual(result.guiErrors, [])
  await finish()
}
async function soak() {
  const duration = Number(process.env.SVELTO_USAGE_SOAK_SECONDS || 7200)
  assert.ok(duration >= 60)
  const dir = b.profile('usage-soak')
  await launch('usage-soak', dir)
  started = performance.now()
  const tabs = []
  for (const url of urls) {
    try {
      const t = await add(url)
      const identity = await page(
        t.id,
        '({url:location.href,title:document.title,text:document.body.innerText.length})'
      )
      assert.ok(identity.text > 100)
      tabs.push(t)
    } catch (e) {
      result.failures.push({ scope: url, error: e.message })
    }
  }
  for (let i = 0; i < 16; i++) tabs.push(await add(origin + '/soak/' + i))
  const draft = tabs.at(-1)
  await page(
    draft.id,
    `window.__token='surviving-document';const input=document.createElement('input');input.id='soak-draft';input.value='Unsaved long-session draft';document.body.prepend(input);true`
  )
  result.initialState = await state()
  result.initial = await memory('initial')
  save()
  console.log(
    'SOAK_STARTED',
    JSON.stringify({ tabs: tabs.length, seconds: duration, profile: dir })
  )
  const originStarted = performance.now()
  let cycle = 0
  while ((performance.now() - originStarted) / 1000 < duration) {
    const deadline = Math.min(originStarted + duration * 1000, originStarted + (cycle + 1) * 300000)
    while (performance.now() < deadline)
      await b.sleep(Math.min(30000, deadline - performance.now()))
    const t = tabs[cycle % tabs.length]
    await select(t.id)
    const health = await page(
      t.id,
      '({title:document.title,text:document.body.innerText.length,url:location.href})'
    )
    assert.ok(health.text > 50)
    await page(t.id, 'scrollBy(0,300);true')
    const mem = await memory('cycle-' + cycle)
    const draftState = await page(
      draft.id,
      `({token:window.__token,draft:document.getElementById('soak-draft')?.value})`
    )
    assert.equal(draftState.token, 'surviving-document')
    assert.equal(draftState.draft, 'Unsaved long-session draft')
    result.observations.push({
      cycle,
      health,
      memory: mem,
      draftState,
      guiErrors: await gui.evaluate('__usageErrors')
    })
    assert.deepEqual(result.observations.at(-1).guiErrors, [])
    save()
    console.log(
      'SOAK_PROGRESS',
      JSON.stringify({
        cycle,
        elapsedSeconds: (performance.now() - originStarted) / 1000,
        footprintMiB: mem.footprintMiB
      })
    )
    cycle++
  }
  result.elapsedSeconds = (performance.now() - originStarted) / 1000
  result.finalState = await state()
  assert.equal(result.finalState.length, result.initialState.length)
  gui.socket.close()
  gui = null
  const child = b.getCurrent().child
  const exit = new Promise((r) => child.once('exit', r))
  child.kill('SIGKILL')
  await exit
  await finish()
  await launch('soak-restored', dir)
  await b.sleep(10000)
  const restored = await state()
  assert.deepEqual(
    restored.map((t) => ({ id: t.id, url: t.url })),
    result.finalState.map((t) => ({ id: t.id, url: t.url }))
  )
  assert.equal(restored.find((t) => t.selected).id, result.finalState.find((t) => t.selected).id)
  const selected = restored.find((t) => t.selected)
  await b.wait(
    async () => {
      try {
        return await page(
          selected.id,
          "document.readyState!=='loading' && document.body?.innerText.length>50"
        )
      } catch {
        return false
      }
    },
    'restored selected content',
    90000
  )
  const health = await page(
    selected.id,
    '({url:location.href,title:document.title,text:document.body.innerText.length})'
  )
  assert.equal(health.url, result.finalState.find((t) => t.selected).url)
  result.recovery = { passed: true, restored, selectedHealth: health }
  await finish()
}
async function resources() {
  // All target inspection is disconnected except the trusted GUI during CPU/footprint windows.
  // Same process, alternating capture policy; suppression is a diagnostic intervention only.
  await launch("resources");
  started = performance.now();
  const loaded = [];
  const lifecycleOnly = process.env.SVELTO_RESOURCE_LIFECYCLE_ONLY === "1";
  const count = Number(process.env.SVELTO_RESOURCE_COUNTS || 50);
  for (let i = 0; i < count; i++)
    loaded.push(await add(origin + "/fixture/" + i));
  for (const t of loaded) t.pid = await view(t.id, "getOSProcessId");
  result.loaded = loaded;
  await b.sleep(30000);
  await gui.evaluate(
    `window.__captures={drop:false,requests:[],replies:[]};const originalSend=ipc.send.bind(ipc);ipc.send=function(channel,...args){if(channel==='getCapture'){__captures.requests.push({at:performance.now(),drop:__captures.drop,id:args[0].id});if(__captures.drop)return}return originalSend(channel,...args)};ipc.on('captureData',(e,d)=>__captures.replies.push({at:performance.now(),id:d.id,bytes:d.url.length}));true`
  );
  result.phases = [];
  const measure = async (label) => {
    const m = await memory(label);
    const pids = m.snapshot.processes.map((p) => p.pid);
    m.processArguments = b.run("/bin/ps", [
      "-p",
      pids.join(","),
      "-o",
      "pid=,args=",
    ]);
    m.metrics = await gui.evaluate("ipc.invoke('resource-metrics')");
    assert.deepEqual(m.metrics.errors, []);
    return m;
  };
  for (const drop of lifecycleOnly ? [] : [false, true, false, true]) {
    await gui.evaluate(`__captures.drop=${drop};true`);
    const pre = await measure(drop ? "suppressed-start" : "normal-start");
    const before = await gui.evaluate(
      "({requests:__captures.requests.length,replies:__captures.replies.length,at:performance.now()})"
    );
    await gui.evaluate("ipc.invoke('resource-profile-start')");
    const cpu = await windowCPU(
      Number(process.env.SVELTO_RESOURCE_SECONDS || 90)
    );
    const profile = await gui.evaluate(
      `ipc.invoke('resource-profile-stop','phase-${result.phases.length}')`
    );
    const after = await gui.evaluate(
      "({requests:__captures.requests,replies:__captures.replies,errors:__usageErrors,at:performance.now()})"
    );
    const post = await measure(drop ? "suppressed-end" : "normal-end");
    assert.deepEqual(after.errors, []);
    result.phases.push({ drop, pre, post, before, after, cpu, profile });
    save();
    console.log(
      "RESOURCE phase",
      drop ? "suppressed" : "normal",
      cpu.meanPercent.toFixed(3),
      post.footprintMiB.toFixed(1)
    );
  }
  if (!lifecycleOnly) {
    // Amplified capture workload isolates the same pipeline; it is not representative idle CPU.
    await gui.evaluate(
      '__captures.drop=false;window.__captureBurst=setInterval(()=>ipc.send("getCapture",{id:tabs.getSelected(),width:110,height:76}),250);true'
    );
    await gui.evaluate("ipc.invoke('resource-profile-start')");
    const burst = await windowCPU(15);
    const burstProfile = await gui.evaluate(
      "ipc.invoke('resource-profile-stop','burst')"
    );
    await gui.evaluate("clearInterval(__captureBurst);true");
    result.burst = {
      cpu: burst,
      profile: burstProfile,
      metrics: await gui.evaluate("ipc.invoke('resource-metrics')"),
      captures: await gui.evaluate("__captures"),
    };
    save();
  }
  await gui.evaluate("__captures.drop=true;true");
  result.beforeSleep = await measure("before-sleep");
  result.slept = [];
  const ordered = await state();
  for (const t of loaded.filter(
    (t) => !ordered.find((a) => a.id === t.id).selected
  )) {
    const response = await gui.evaluate(
      `ipc.invoke('sleepTab',${JSON.stringify(t.id)})`
    );
    assert.equal(response.ok, true, JSON.stringify(response));
    result.slept.push(t.id);
  }
  await b.sleep(10000);
  result.afterSleep = await measure("after-sleep");
  assert.deepEqual(await state(), ordered);
  result.sleepCPU = await windowCPU(lifecycleOnly ? 20 : 60);
  const toWake = loaded[0];
  await select(toWake.id);
  await b.wait(
    async () => await page(toWake.id, "document.body.innerText.length>50"),
    "woken resource tab"
  );
  result.afterWake = await measure("after-wake");
  assert.deepEqual(await gui.evaluate("__usageErrors"), []);
  result.tabsAfterWake = await gui.evaluate(
    "tabs.get().map(t=>({id:t.id,sleeping:t.sleeping,hasWebContents:t.hasWebContents}))"
  );
  result.lifecycle = [];
  for (let round = 0; round < 2; round++) {
    for (const t of loaded.slice(0, 10)) {
      await select(t.id);
      await b.wait(
        async () => await page(t.id, "document.body.innerText.length>50"),
        "repeated wake"
      );
    }
    await select(loaded[loaded.length - 1].id);
    for (const t of loaded.slice(0, 10)) {
      const r = await gui.evaluate(
        `ipc.invoke('sleepTab',${JSON.stringify(t.id)})`
      );
      assert.equal(r.ok, true);
    }
    await b.sleep(10000);
    const m = await measure("repeat-sleep-" + round);
    assert.equal(m.metrics.views.length, 1);
    result.lifecycle.push(m);
    save();
  }
  await finish();
}
let origin
;(async () => {
  b.server.removeAllListeners('request')
  b.server.on('request', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
    res.end(
      req.url === '/video'
        ? `<!doctype html><title>Svelto media workload</title><h1>Public MDN sample video</h1><p>Isolated playback workload with public media, native controls and no account or DRM.</p><video muted controls loop width="640" src="https://developer.mozilla.org/shared-assets/videos/flower.mp4"></video>`
        : b.fixture
    )
  })
  await new Promise((r) => b.server.listen(0, '127.0.0.1', r))
  origin = 'http://127.0.0.1:' + b.server.address().port
  if (process.env.SVELTO_USAGE_ROUTER_PILOT === '1') {
    await launch('router-pilot')
    started = performance.now()
    const t = await add(origin + '/router')
    await assert.rejects(
      page(t.id, "new Promise(resolve=>setTimeout(()=>resolve('late-read'),16000))"),
      /View reply timeout/
    )
    await b.sleep(2000)
    const check = await gui.evaluate('({late:__usageIPC.late,errors:__usageErrors})')
    assert.equal(check.late.length, 1)
    assert.deepEqual(check.errors, [])
    assert.match(await view(t.id, 'getTitle'), /Svelto/)
    result.routerPilot = check
    await finish()
    result.status = 'complete'
    save()
    console.log('ROUTER_PILOT passed')
    return
  }
  await { cpu, sites: realSites, latency, soak, resources }[mode]()
  result.status = result.failures.length ? 'complete-with-failures' : 'complete'
  save()
  console.log('FINISHED', mode, result.status)
})()
  .catch((e) => {
    result.status = 'failed'
    result.failures.push({ error: e.stack, logs: b.getCurrent()?.logs })
    save()
    console.error(e.stack)
    process.exitCode = 1
  })
  .finally(async () => {
    await finish()
    b.server.closeAllConnections()
    await new Promise((r) => b.server.close(r))
    fs.rmSync(b.work, { recursive: true, force: true })
  })

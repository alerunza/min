// Exercises the packaged Svelto app with a disposable profile and local web fixtures.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { _electron } = require('playwright')
const root = path.resolve(__dirname, '..')
const buildPathFile = path.join(root, 'output/build-path.txt')
const appBundle = fs.existsSync(buildPathFile) ? fs.readFileSync(buildPathFile, 'utf8').trim() : path.join(root, process.arch === 'arm64' ? 'dist/app/mac-arm64/Svelto.app' : 'dist/app/mac/Svelto.app')
const executablePath = process.env.SVELTO_TEST_EXECUTABLE || path.join(appBundle, 'Contents/MacOS/Svelto')
const output = path.join(root, 'output')
fs.mkdirSync(output, { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'svelto-smoke-profile-'))
const downloadPath = path.join(profile, 'svelto-download.txt')
const checks = []
let application
let baseURL
const server = http.createServer((request, response) => {
 if (request.url === '/download') {
  response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="svelto-download.txt"' })
  response.end('Svelto download fixture\n')
 } else {
  const label = request.url === '/two' ? 'Second page' : 'First page'
  response.writeHead(200, { 'Content-Type': 'text/html' })
  response.end(`<html lang="en"><head><title>${label}</title></head><body><h1>${label}</h1><a href="/two">Next page</a><a href="/download">Download</a></body></html>`)
 }
})
function pass (name, detail) { checks.push({ name, status: 'passed', detail }); console.log('PASS', name, detail || '') }
async function waitFor (callback, label, timeout = 20000) {
 const start = Date.now()
 while (Date.now() - start < timeout) {
  try {
   if (await callback()) return
  } catch (error) {
   // These polling callbacks only read state; never retry actions after a lost inspector reply.
   if (!error.message.includes('Resulting promise was garbage collected')) throw error
   console.warn('Retrying transient Playwright inspector collection:', label)
  }
  await new Promise(resolve => setTimeout(resolve, 200))
 }
 throw new Error('Timed out: ' + label)
}
async function ui (source) {
 return application.evaluate(async ({ webContents }, code) => {
  const contents = webContents.getAllWebContents().find(contents => contents.getURL() === 'min://app/index.html')
  if (!contents) throw new Error('Browser interface not loaded')
  return contents.executeJavaScript(code, true)
 }, source)
}
async function selectedState () { return ui('({count: tabs.count(), selected: tabs.get(tabs.getSelected()), state: tasks.getStringifyableState(), title: document.title})') }
async function navigate (url) {
 await ui(`(() => {
  const current = document.querySelector('.tab-item.active'); current.click();
  const input = document.getElementById('tab-editor-input');
  input.value = ${JSON.stringify(url)};
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(url)} }));
  input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'Enter', keyCode: 13, charCode: 13, which: 13 }));
 })()`)
 await waitFor(async () => (await selectedState()).selected.url === url, 'address navigation')
 await waitFor(async () => application.evaluate(({ webContents }, url) => webContents.getAllWebContents().some(contents => contents.getURL() === url && !contents.isLoading()), url), 'page loaded')
}
async function launch () {
 application = await _electron.launch({ executablePath, cwd: root, args: ['--debug-browser'], env: { ...process.env, SVELTO_USER_DATA_DIR: profile }, timeout: 60000 })
 await waitFor(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().some(contents => contents.getURL() === 'min://app/index.html' && !contents.isLoading())), 'Svelto UI ready')
 await waitFor(async () => { try { return (await selectedState()).count > 0 } catch { return false } }, 'initial tab')
}
async function quit () {
 const closed = application.waitForEvent('close', { timeout: 20000 })
 await application.evaluate(({ app }) => { setTimeout(() => app.quit(), 100) })
 await closed
 application = null
}
;(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
 baseURL = 'http://127.0.0.1:' + server.address().port
 await launch()
 const identity = await application.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), userAgent: app.userAgentFallback }))
 assert.equal(identity.name, 'Svelto')
 assert.equal(identity.userData, profile)
 assert.equal(identity.sessionData, profile)
 assert.ok(!/Svelto\/|Min\/|Electron\//.test(identity.userAgent))
 pass('Independent identity and profile', identity)
 assert.match((await selectedState()).title, /Svelto/)
 assert.equal(await ui('getCurrentLanguage()'), 'en-US')
 pass('English interface and Svelto window title')
 await waitFor(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().some(contents => contents.getURL() === 'min://app/pages/welcome/index.html' && !contents.isLoading())), 'welcome page')
 pass('Independent welcome page')
 // Native fullscreen must honor both boolean values, including exit.
 await ui("ipc.invoke('setFullScreen', true)")
 await waitFor(() => application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().some(window => window.isVisible() && window.isFullScreen())), 'native fullscreen entry')
 await waitFor(() => ui("document.body.classList.contains('fullscreen')"), 'renderer fullscreen entry')
 await ui("ipc.invoke('setFullScreen', false)")
 await waitFor(() => application.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().filter(window => window.isVisible()).every(window => !window.isFullScreen())), 'native fullscreen exit')
 await waitFor(async () => !(await ui("document.body.classList.contains('fullscreen')")), 'renderer fullscreen exit')
 pass('Fullscreen IPC enters and exits with synchronized UI state')
 // Reproduce rejected preview captures and async view calls without a GPU race.
 const captureTab = (await selectedState()).selected.id
 await application.evaluate((_electron, tabId) => {
  const contents = global.getView(tabId).webContents
  const errors = []
  const listener = error => errors.push(error.message)
  global.sveltoCaptureRegression = { contents, original: contents.capturePage, errors, listener }
  process.on('unhandledRejection', listener)
  contents.capturePage = () => Promise.reject(new Error('UnknownVizError'))
  contents.sveltoRejectedMethod = () => Promise.reject(new Error('Svelto fixture rejection'))
 }, captureTab)
 try {
  await ui(`ipc.send('getCapture', {id: ${JSON.stringify(captureTab)}, width: 10, height: 10})`)
  await ui(`ipc.send('callViewMethod', {id: ${JSON.stringify(captureTab)}, method: 'sveltoRejectedMethod', args: []})`)
  await application.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)))
  assert.deepEqual(await application.evaluate(() => global.sveltoCaptureRegression.errors), [])
 } finally {
  await application.evaluate(() => {
   const regression = global.sveltoCaptureRegression
   regression.contents.capturePage = regression.original
   delete regression.contents.sveltoRejectedMethod
   process.removeListener('unhandledRejection', regression.listener)
   delete global.sveltoCaptureRegression
  })
 }
 pass('Rejected preview captures and async view calls are handled')
 await ui("document.getElementById('add-tab-button').click()")
 assert.equal((await selectedState()).count, 2)
 pass('New tab from toolbar')
 await navigate(baseURL + '/one')
 await waitFor(async () => (await selectedState()).selected.title === 'First page', 'first page title')
 pass('Address-bar navigation and page title')
 await application.evaluate(({ webContents }, origin) => webContents.getAllWebContents().find(contents => contents.getURL() === origin + '/one').executeJavaScript("document.querySelector('a[href=\"/two\"]').click()", true), baseURL)
 await waitFor(async () => (await selectedState()).selected.url === baseURL + '/two', 'link navigation')
 await waitFor(() => application.evaluate(({ webContents }, url) => webContents.getAllWebContents().some(contents => contents.getURL() === url && !contents.isLoading()), baseURL + '/two'), 'linked page loaded')
 pass('Page link navigation')
 await waitFor(async () => !(await ui("document.getElementById('back-button').disabled")), 'back button enabled')
 await ui("document.getElementById('back-button').click()")
 await waitFor(async () => (await selectedState()).selected.url === baseURL + '/one', 'history back')
 pass('Back navigation')
 const tabIds = await ui('tabs.get().map(tab => tab.id)')
 await ui(`document.querySelector('.tab-item[data-tab="${tabIds[0]}"]').click()`)
 assert.equal((await selectedState()).selected.id, tabIds[0])
 await ui(`document.querySelector('.tab-item[data-tab="${tabIds[1]}"]').click()`)
 assert.equal((await selectedState()).selected.id, tabIds[1])
 pass('Switch tabs')
 await ui("document.getElementById('add-tab-button').click()")
 const removable = (await selectedState()).selected.id
 await ui(`document.querySelector('.tab-item[data-tab="${removable}"] .tab-close-button').click()`)
 assert.equal((await selectedState()).count, 2)
 // A capture already in flight may return after its tab has been closed.
 await ui(`ipc.emit('captureData', null, {id: ${JSON.stringify(removable)}, url: 'data:image/png;base64,'})`)
 assert.equal((await selectedState()).count, 2)
 pass('Close tab without losing other tabs; late captures ignored')
 // Resolve the save destination only for this test download, keeping real dialogs unchanged.
 await application.evaluate(({ session }, savePath) => {
  session.fromPartition('persist:webcontent').once('will-download', (_event, item) => item.setSavePath(savePath))
 }, downloadPath)
 await application.evaluate(({ webContents }, origin) => webContents.getAllWebContents().find(contents => contents.getURL() === origin + '/one').executeJavaScript("document.querySelector('a[href=\"/download\"]').click()", true), baseURL)
 await waitFor(() => fs.existsSync(downloadPath) && fs.readFileSync(downloadPath, 'utf8') === 'Svelto download fixture\n', 'download completion')
 await waitFor(async () => (await selectedState()).selected.url === baseURL + '/one', 'page address after attachment download')
 assert.equal((await selectedState()).selected.isFileView, false)
 pass('Download handler, file contents and retained page address', downloadPath)
 await ui("ipc.emit('addPrivateTab')")
 assert.equal((await selectedState()).selected.private, true)
 await navigate(baseURL + '/private')
 pass('Private tab navigation')
 const stateBefore = (await selectedState()).state
 await quit()
 const saved = JSON.parse(fs.readFileSync(path.join(profile, 'sessionRestore.json'), 'utf8'))
 assert.equal(saved.version, 2)
 assert.ok(saved.state.tasks.some(task => task.tabs.some(tab => tab.url === baseURL + '/one')))
 assert.ok(saved.state.tasks.every(task => task.tabs.every(tab => !tab.private && tab.url !== baseURL + '/private')))
 pass('Session written immediately on quit; private tabs excluded')
 await launch()
 const restored = (await selectedState()).state
 const oldUrls = stateBefore.tasks.flatMap(task => task.tabs.filter(tab => !tab.private).map(tab => tab.url)).filter(Boolean)
 const restoredUrls = restored.tasks.flatMap(task => task.tabs.map(tab => tab.url))
 for (const url of oldUrls) assert.ok(restoredUrls.includes(url), 'Missing restored URL: ' + url)
 pass('Session restored after restart', oldUrls)
 await application.evaluate(({ BaseWindow }) => {
  const window = BaseWindow.getAllWindows().find(window => window.contentView.children.some(view => view.webContents && view.webContents.getURL() === 'min://app/index.html'))
  window.close()
 })
 await waitFor(() => application.evaluate(({ webContents }) => !webContents.getAllWebContents().some(contents => contents.getURL() === 'min://app/index.html')), 'UI renderer released after window close')
 const afterClose = JSON.parse(fs.readFileSync(path.join(profile, 'sessionRestore.json'), 'utf8'))
 assert.ok(afterClose.state.tasks.some(task => task.tabs.some(tab => tab.url === baseURL + '/one')))
 pass('Window close saves the session and releases the UI renderer')
 await application.evaluate(({ app }) => app.emit('activate'))
 await waitFor(() => application.evaluate(({ webContents }) => webContents.getAllWebContents().some(contents => contents.getURL() === 'min://app/index.html' && !contents.isLoading())), 'window reopened from Dock activation')
 await waitFor(async () => { try { return (await selectedState()).count > 0 } catch { return false } }, 'tabs after Dock activation')
 const afterReopen = (await selectedState()).state
 for (const url of oldUrls) assert.ok(afterReopen.tasks.some(task => task.tabs.some(tab => tab.url === url)))
 pass('Dock activation reopens a window with retained tasks')

 // Tasks must save pasted names and preserve a no-result search during state sync.
 await ui("document.getElementById('switch-task-button').click()")
 await waitFor(() => ui('!document.getElementById("task-overlay").hidden'), 'Tasks open')
 const namedTask = await ui('tasks.getSelected().id')
 await ui(`(() => {
  const input = document.querySelector('.task-container[data-task="${namedTask}"] .task-name');
  input.value = 'Svelto task fixture';
  input.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertFromPaste'}));
 })()`)
 assert.equal(await ui(`tasks.get('${namedTask}').name`), 'Svelto task fixture')
 await ui("(() => { const search = document.getElementById('task-search-input'); search.value = 'zzzz-no-fixture'; search.dispatchEvent(new Event('input', {bubbles:true})); tasks.emit('state-sync-change') })()")
 await waitFor(() => ui('document.querySelectorAll(".task-container:not([hidden])").length === 0'), 'no Tasks matches')
 assert.equal(await ui('document.querySelectorAll(".task-tab-item.fakefocus").length'), 0)
 assert.equal(await ui('document.getElementById("task-search-status").hidden'), false)
 await ui("document.getElementById('switch-task-button').click()")
 assert.equal(await ui('document.getElementById("task-overlay").inert'), true)
 pass('Tasks save pasted names, preserve filtering on sync and release hidden controls')

 // Exercise preferences through real controls and reload to verify persisted values.
 const preferencesURL = 'min://app/pages/settings/index.html'
 await navigate(preferencesURL)
 const preferences = source => application.evaluate(({ webContents }, source) => {
  const contents = webContents.getAllWebContents().find(contents => contents.getURL() === 'min://app/pages/settings/index.html')
  return contents.executeJavaScript(source, true)
 }, source)
 await waitFor(() => preferences('settings.loaded && document.querySelector("#key-map-list input") !== null'), 'preferences ready')
 assert.equal(await preferences('document.querySelectorAll("main section").length'), 8)
 await preferences("document.getElementById('add-custom-bang').click(); document.querySelector('.custom-bang-delete-button').click()")
 assert.equal(await preferences('document.querySelectorAll("#custom-bangs li").length'), 0)
 pass('Preferences retain all sections and delete an unsaved custom command')
 await preferences(`(() => {
  const pac = document.getElementById('pac-url-input');
  pac.value = 'https://example.com/svelto-fixture.pac';
  pac.dispatchEvent(new Event('change', {bubbles: true}));
  document.getElementById('checkbox-show-divider').click();
 })()`)
 await waitFor(() => preferences("settings.list.proxy.pacScript === 'https://example.com/svelto-fixture.pac'"), 'PAC URL saved')
 const dividerBeforeReload = await preferences("document.getElementById('checkbox-show-divider').checked")
 await preferences('location.reload()')
 await waitFor(() => preferences('settings.loaded && document.querySelector("#key-map-list input") !== null'), 'preferences reload')
 assert.equal(await preferences("document.getElementById('pac-url-input').value"), 'https://example.com/svelto-fixture.pac')
 assert.equal(await preferences("document.getElementById('checkbox-show-divider').checked"), dividerBeforeReload)
 pass('Preferences persist proxy configuration URL and appearance through reload')

 await quit()
 const savedTasks = JSON.parse(fs.readFileSync(path.join(profile, 'sessionRestore.json'), 'utf8'))
 assert.ok(savedTasks.state.tasks.some(task => task.id === namedTask && task.name === 'Svelto task fixture'))
 pass('Task name persists in saved session')
 fs.writeFileSync(path.join(output, 'smoke-results.json'), JSON.stringify({ executablePath, profile, checks, status: 'passed' }, null, 2))
 console.log('Smoke checks passed:', checks.length)
})().catch(async error => {
 if (application) {
  console.error('Failure state:', JSON.stringify(await selectedState().catch(() => null), (key,value) => key === 'previewImage' ? undefined : value))
  console.error('Native history:', JSON.stringify(await application.evaluate(({ webContents }) => webContents.getAllWebContents().map(contents => ({ url: contents.getURL(), history: contents.navigationHistory.getAllEntries().map(entry => ({url: entry.url, title: entry.title})), index: contents.navigationHistory.getActiveIndex() }))).catch(() => null)))
 }
 checks.push({ name: 'Smoke failure', status: 'failed', detail: error.stack })
 fs.writeFileSync(path.join(output, 'smoke-results.json'), JSON.stringify({ executablePath, profile, checks, status: 'failed' }, null, 2))
 console.error(error)
 if (application) await application.close().catch(() => {})
 process.exitCode = 1
}).finally(() => server.close())

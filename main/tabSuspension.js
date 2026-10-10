/* global ipc, viewMap, viewStateMap, windows, getWindowWebContents, activeTabDownloads, pendingPermissions, grantedPermissions */
// Modified for Svelto: opt-in sleeping tabs; no automatic eviction.
// History stays in memory only and is removed when the tab is closed.
const sleepingTabHistory = new Map()
const closingSleepTabs = new Map()

function sleepBlockReason (id, view) {
  const contents = view?.webContents
  if (!contents || contents.isDestroyed() || viewMap[id] !== view) return 'This page is no longer available'
  if (windows.getAll().some(win => windows.getState(win).activeTab === id)) return 'This tab is active in a window'
  if (viewStateMap[id].partition !== 'persist:webcontent') return 'Private tabs stay awake'
  if (!/^https?:\/\//.test(contents.getURL())) return 'This page stays awake'
  if (contents.isLoading()) return 'This page is loading'
  if (contents.isCurrentlyAudible() || viewStateMap[id].playingMedia) return 'This tab is playing media'
  if (activeTabDownloads.has(contents)) return 'This tab has a download in progress'
  if (pendingPermissions.some(p => p.contents === contents) || grantedPermissions.some(p => p.contents === contents && ['media', 'display-capture', 'pointerLock'].includes(p.permission))) return 'This tab has an active permission request or capture'
  return null
}

const sleepPageProbe = `(() => {
  if (!['text/html', 'application/xhtml+xml'].includes(document.contentType)) return { reason: 'This document stays awake' }
  if (document.readyState !== 'complete') return { reason: 'This page is loading' }
  if (document.querySelector('iframe, frame, canvas, object, embed, [contenteditable]:not([contenteditable="false"])')) return { reason: 'This page may contain unsaved work' }
  for (const el of document.querySelectorAll('input, textarea, select')) {
    if (el.tagName === 'SELECT' ? Array.from(el.options).some(o => o.selected !== o.defaultSelected) :
      el.type === 'checkbox' || el.type === 'radio' ? el.checked !== el.defaultChecked :
      el.type === 'file' ? el.files.length > 0 : el.value !== el.defaultValue) return { reason: 'This page has unsaved form changes' }
  }
  if (Array.from(document.querySelectorAll('audio, video')).some(el => !el.paused && !el.ended)) return { reason: 'This tab is playing media' }
  return { url: location.href, scrollPosition: window.scrollY }
})()`

ipc.handle('sleepTab', async function (e, id) {
  if (e.senderFrame !== e.sender.mainFrame || e.sender.getURL() !== 'min://app/index.html') return { ok: false, reason: 'Unavailable' }
  const view = viewMap[id]
  let reason = sleepBlockReason(id, view)
  if (reason || closingSleepTabs.has(id)) return { ok: false, reason: reason || 'This tab is already going to sleep' }
  const generation = viewStateMap[id].navigationGeneration
  let page, timer
  try {
    page = await Promise.race([
      view.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: sleepPageProbe }]),
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 3000) })
    ])
  } catch (error) {
    return { ok: false, reason: 'This page could not be checked safely' }
  } finally { clearTimeout(timer) }
  reason = sleepBlockReason(id, view) || page?.reason
  if (reason) return { ok: false, reason }
  if (!page || page.url !== view.webContents.getURL() || generation !== viewStateMap[id].navigationGeneration) return { ok: false, reason: 'This page changed while being checked' }
  const contents = view.webContents
  const history = { entries: view.webContents.navigationHistory.getAllEntries(), index: view.webContents.navigationHistory.getActiveIndex() }
  // Chromium runs beforeunload too: a site's veto is respected, without a forced destroy.
  const completion = new Promise(resolve => {
    const blocked = () => {
      contents.removeListener('destroyed', closed)
      closingSleepTabs.delete(id)
      resolve({ ok: false, reason: 'This page needs to keep unsaved work' })
    }
    const closed = () => {
      contents.removeListener('will-prevent-unload', blocked)
      closingSleepTabs.delete(id)
      if (viewMap[id] === view && !viewStateMap[id]?.discarded) {
        sleepingTabHistory.set(id, history)
        delete viewMap[id]
        delete viewStateMap[id]
        windows.getAll().forEach(win => {
          getWindowWebContents(win).send('tab-slept', { id, scrollPosition: page.scrollPosition })
        })
      }
      resolve({ ok: true })
    }
    contents.once('will-prevent-unload', blocked)
    contents.once('destroyed', closed)
  })
  closingSleepTabs.set(id, completion)
  contents.close({ waitForBeforeUnload: true })
  return completion
})

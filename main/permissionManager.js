/* globals windows, sendIPCToWindow, getTabIDFromWebContents, getWindowFromViewContents, app, session, ipc */
// Svelto: temporary grants belong to an exact origin and browser session; pending callbacks always settle.
var pendingPermissions = []
var grantedPermissions = []
var nextPermissionId = 1
const watchedPermissionContents = new WeakSet()

function permissionOrigin (url) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null
  } catch (e) { return null }
}
function sendPermissionsToRenderers () {
  windows.getAll().forEach(function (win) {
    sendIPCToWindow(win, 'updatePermissions', pendingPermissions.concat(grantedPermissions).map(p => ({
      permissionId: p.permissionId,
      tabId: p.tabId,
      origin: p.origin,
      permission: p.permission,
      details: { mediaTypes: p.details.mediaTypes || [] },
      granted: !!p.granted
    })))
  })
}
function removePermissionsForContents (contents) {
  const removed = pendingPermissions.filter(p => p.contents === contents)
  pendingPermissions = pendingPermissions.filter(p => p.contents !== contents)
  grantedPermissions = grantedPermissions.filter(p => p.contents !== contents)
  removed.forEach(p => p.callback(false))
  sendPermissionsToRenderers()
}
function watchPermissionContents (contents) {
  if (watchedPermissionContents.has(contents)) return
  watchedPermissionContents.add(contents)
  contents.on('did-start-navigation', function (event, url, isInPlace, isMainFrame) {
    if (isMainFrame && !isInPlace) removePermissionsForContents(contents)
  })
  contents.once('destroyed', function () { removePermissionsForContents(contents) })
}
function isPermissionGrantedForOrigin (origin, permission, details, contents) {
  if (!origin || !contents || contents.isDestroyed()) return false
  const matching = grantedPermissions.filter(p => p.origin === origin && p.permission === permission && p.contents.session === contents.session && !p.contents.isDestroyed())
  if (permission === 'media') {
    const types = new Set(matching.flatMap(p => p.details.mediaTypes || []))
    if (details.mediaTypes?.length) return details.mediaTypes.every(type => types.has(type))
    if (details.mediaType && details.mediaType !== 'unknown') return types.has(details.mediaType)
    return types.size > 0
  }
  return ['notifications', 'pointerLock', 'display-capture'].includes(permission) && matching.length > 0
}
function rememberPermissionGrant (request) {
  const existing = grantedPermissions.find(p => p.contents === request.contents && p.origin === request.origin && p.permission === request.permission)
  if (existing) {
    existing.details.mediaTypes = [...new Set(existing.details.mediaTypes.concat(request.details.mediaTypes))]
  } else {
    grantedPermissions.push({ permissionId: request.permissionId, tabId: request.tabId, contents: request.contents, origin: request.origin, pageURL: request.pageURL, permission: request.permission, details: request.details, granted: true })
  }
}
function pagePermissionRequestHandler (contents, permission, respond, details = {}) {
  const origin = permissionOrigin(details.requestingUrl)
  if (!contents || contents.isDestroyed() || !getTabIDFromWebContents(contents) || !details.isMainFrame || !origin || origin !== permissionOrigin(contents.getURL())) {
    respond(false)
    return
  }
  if (['fullscreen', 'clipboard-sanitized-write'].includes(permission)) { respond(true); return }
  if (!['media', 'notifications', 'pointerLock', 'display-capture'].includes(permission) ||
      (permission === 'media' && (!details.mediaTypes?.length || details.mediaTypes.some(type => !['audio', 'video'].includes(type))))) {
    respond(false)
    return
  }
  watchPermissionContents(contents)
  let settled = false
  const request = {
    permissionId: nextPermissionId++,
    tabId: getTabIDFromWebContents(contents),
    contents,
    origin,
    pageURL: contents.getURL(),
    permission,
    details: { mediaTypes: [...(details.mediaTypes || [])] },
    granted: false,
    callback: function (allow) {
      if (settled) return
      settled = true
      respond(allow)
    }
  }
  // Display selection still requires the native picker on every capture request.
  if (permission !== 'display-capture' && isPermissionGrantedForOrigin(origin, permission, details, contents)) {
    request.granted = true
    rememberPermissionGrant(request)
    request.callback(true)
  } else {
    pendingPermissions.push(request)
  }
  sendPermissionsToRenderers()
}
function pagePermissionCheckHandler (contents, permission, requestingOrigin, details = {}) {
  const origin = permissionOrigin(details.securityOrigin || requestingOrigin)
  if (!contents || contents.isDestroyed() || !getTabIDFromWebContents(contents) || !origin || origin !== permissionOrigin(contents.getURL())) return false
  if (!details.isMainFrame && origin !== permissionOrigin(details.embeddingOrigin)) return false
  if (['fullscreen', 'clipboard-sanitized-write'].includes(permission)) return true
  return isPermissionGrantedForOrigin(origin, permission, details, contents)
}
function configurePermissionSession (ses) {
  ses.setPermissionRequestHandler(pagePermissionRequestHandler)
  ses.setPermissionCheckHandler(pagePermissionCheckHandler)
  // macOS 15+ shows its own source picker. Unsupported systems deny rather than capturing an arbitrary screen.
  ses.setDisplayMediaRequestHandler(function (request, callback) { callback(null) }, { useSystemPicker: process.platform === 'darwin' })
}
app.once('ready', function () { configurePermissionSession(session.defaultSession) })
app.on('session-created', configurePermissionSession)
function resolvePagePermission (event, permissionId, allow) {
  const owner = windows.windowFromContents(event.sender)
  if (!owner || event.sender.getURL() !== 'min://app/index.html' || (event.senderFrame && event.senderFrame !== event.sender.mainFrame)) return
  const index = pendingPermissions.findIndex(p => p.permissionId === permissionId)
  if (index === -1) return
  const request = pendingPermissions[index]
  if (request.contents.isDestroyed() || getWindowFromViewContents(request.contents) !== owner.win) return
  pendingPermissions.splice(index, 1)
  const valid = request.pageURL === request.contents.getURL() && request.origin === permissionOrigin(request.contents.getURL())
  request.granted = !!allow && valid
  if (request.granted) rememberPermissionGrant(request)
  request.callback(request.granted)
  sendPermissionsToRenderers()
}
ipc.on('permissionGranted', function (event, id) { resolvePagePermission(event, id, true) })
ipc.on('permissionDenied', function (event, id) { resolvePagePermission(event, id, false) })

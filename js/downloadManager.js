/* global ipc electron */
// Svelto: named keyboard actions, bounded progress and visible file-open failures.
var webviews = require('webviews.js')

function getFileSizeString (bytes) {
  const prefixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

  let size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  let prefixIndex = 0

  while (size > 900 && prefixIndex < prefixes.length - 1) { // prefer "0.9 KB" to "949 bytes"
    size /= 1024
    prefixIndex++
  }

  return (Math.round(size * 10) / 10) + ' ' + prefixes[prefixIndex]
}

const downloadManager = {
  isShown: false,
  bar: document.getElementById('download-bar'),
  container: document.getElementById('download-container'),
  closeButton: document.getElementById('download-close-button'),
  height: 40,
  lastDownloadCompleted: null,
  downloadItems: {},
  downloadBarElements: {},
  nextItemId: 0,
  show: function () {
    if (!downloadManager.isShown) {
      downloadManager.isShown = true
      downloadManager.bar.hidden = false
      webviews.adjustMargin([0, 0, downloadManager.height, 0])
    }
  },
  hide: function () {
    if (downloadManager.isShown) {
      const restoreFocus = downloadManager.bar.contains(document.activeElement)
      downloadManager.isShown = false
      downloadManager.bar.hidden = true
      webviews.adjustMargin([0, 0, downloadManager.height * -1, 0])

      // remove all completed or failed items
      for (const item in downloadManager.downloadItems) {
        if (downloadManager.downloadItems[item].status !== 'progressing') {
          downloadManager.removeItem(item)
        }
      }
      if (restoreFocus) webviews.focus()
    }
  },
  removeItem: function (path) {
    const restoreFocus = downloadManager.downloadBarElements[path]?.container.contains(document.activeElement)
    if (downloadManager.downloadBarElements[path]) {
      downloadManager.downloadBarElements[path].container.remove()
    }

    delete downloadManager.downloadBarElements[path]
    delete downloadManager.downloadItems[path]

    if (Object.keys(downloadManager.downloadItems).length === 0) {
      downloadManager.hide()
    }
    if (restoreFocus) {
      const nextButton = downloadManager.container.querySelector('button:not(:disabled):not([hidden])')
      if (downloadManager.isShown && nextButton) nextButton.focus()
      else webviews.focus()
    }
  },
  openFolder: function (path) {
    ipc.invoke('showItemInFolder', path)
  },
  onItemClicked: async function (path) {
    if (downloadManager.downloadItems[path].status === 'completed') {
      let error
      try {
        error = await electron.shell.openPath(path)
      } catch (e) {
        error = e.message
      }
      const elements = downloadManager.downloadBarElements[path]
      if (!elements) return
      if (error) {
        elements.infoBox.textContent = l('downloadOpenFailed')
        elements.detailedInfoBox.textContent = l('downloadOpenFailed')
        elements.infoBox.setAttribute('role', 'status')
        elements.container.classList.add('open-failed')
      } else {
        downloadManager.removeItem(path)
      }
    }
  },
  onItemDragged: function (path) {
    ipc.invoke('startFileDrag', path)
  },
  onDownloadCompleted: function () {
    downloadManager.lastDownloadCompleted = Date.now()
    setTimeout(function () {
      if (Date.now() - downloadManager.lastDownloadCompleted >= 120000 && Object.values(downloadManager.downloadItems).filter(i => i.status === 'progressing').length === 0 && !downloadManager.bar.querySelector('.open-failed')) {
        downloadManager.hide()
      }
    }, 120 * 1000)
  },
  createItem: function (downloadItem) {
    const container = document.createElement('div')
    container.className = 'download-item'
    container.setAttribute('role', 'listitem')
    container.setAttribute('draggable', 'true')

    const openFile = document.createElement('button')
    openFile.className = 'download-file-button'
    openFile.setAttribute('aria-label', l('downloadOpenFile').replace('%s', downloadItem.name))
    openFile.disabled = true
    container.appendChild(openFile)

    const title = document.createElement('div')
    title.className = 'download-title'
    title.textContent = downloadItem.name
    title.title = downloadItem.name
    openFile.appendChild(title)

    const infoBox = document.createElement('div')
    infoBox.className = 'download-info'
    infoBox.id = 'download-status-' + downloadManager.nextItemId++
    openFile.setAttribute('aria-describedby', infoBox.id)
    openFile.appendChild(infoBox)

    const detailedInfoBox = document.createElement('div')
    detailedInfoBox.className = 'download-info detailed'
    openFile.appendChild(detailedInfoBox)

    const progress = document.createElement('div')
    progress.className = 'download-progress'
    progress.setAttribute('role', 'progressbar')
    progress.setAttribute('aria-label', downloadItem.name)
    progress.setAttribute('aria-valuemin', '0')
    progress.setAttribute('aria-valuemax', '100')
    container.appendChild(progress)

    const dropdown = document.createElement('button')
    dropdown.className = 'download-action-button i carbon:close'
    dropdown.setAttribute('aria-label', l('downloadCancelFile'))
    dropdown.title = l('downloadCancelFile')
    container.appendChild(dropdown)

    const openFolder = document.createElement('button')
    openFolder.className = 'download-action-button i carbon:folder'
    openFolder.hidden = true
    openFolder.setAttribute('aria-label', l(window.platformType === 'mac' ? 'downloadShowInFolder' : 'downloadShowInFolderOther'))
    openFolder.title = openFolder.getAttribute('aria-label')
    container.appendChild(openFolder)

    openFile.addEventListener('click', function () {
      downloadManager.onItemClicked(downloadItem.path)
    })
    container.addEventListener('dragstart', function (e) {
      e.preventDefault()
      downloadManager.onItemDragged(downloadItem.path)
    })

    dropdown.addEventListener('click', function (e) {
      e.stopPropagation()
      ipc.send('cancelDownload', downloadItem.path)
      downloadManager.removeItem(downloadItem.path)
    })

    openFolder.addEventListener('click', function (e) {
      e.stopPropagation()
      downloadManager.openFolder(downloadItem.path)
      downloadManager.removeItem(downloadItem.path)
    })

    downloadManager.container.appendChild(container)
    downloadManager.downloadBarElements[downloadItem.path] = { container, openFile, title, infoBox, detailedInfoBox, progress, dropdown, openFolder }
  },
  updateItem: function (downloadItem) {
    const elements = downloadManager.downloadBarElements[downloadItem.path]
    elements.openFile.disabled = downloadItem.status !== 'completed'
    elements.title.textContent = downloadItem.name || elements.title.textContent

    if (downloadItem.status === 'completed') {
      elements.container.classList.remove('loading')
      elements.container.classList.add('completed')
      elements.progress.hidden = true
      elements.dropdown.hidden = true
      elements.openFolder.hidden = false
      elements.infoBox.textContent = l('downloadStateCompleted')
      elements.detailedInfoBox.textContent = l('downloadStateCompleted')
    } else if (downloadItem.status === 'interrupted') {
      elements.container.classList.remove('loading')
      elements.container.classList.remove('completed')
      elements.progress.hidden = true
      elements.dropdown.hidden = true
      elements.openFolder.hidden = true
      elements.infoBox.textContent = l('downloadStateFailed')
      elements.detailedInfoBox.textContent = l('downloadStateFailed')
    } else {
      elements.container.classList.add('loading')
      elements.container.classList.remove('completed')
      elements.progress.hidden = false
      elements.dropdown.hidden = false
      elements.openFolder.hidden = true
      const knownSize = Number.isFinite(downloadItem.size.total) && downloadItem.size.total > 0
      elements.infoBox.textContent = knownSize ? getFileSizeString(downloadItem.size.total) : l('downloadStateProgressing')
      elements.detailedInfoBox.textContent = getFileSizeString(downloadItem.size.received) + (knownSize ? ' / ' + getFileSizeString(downloadItem.size.total) : '')

      // the progress bar has a minimum width so that it's visible even if there's 0 download progress
      const ratio = knownSize ? Math.max(0, Math.min(1, downloadItem.size.received / downloadItem.size.total || 0)) : 1
      const adjustedProgress = 0.025 + ratio * 0.975
      elements.progress.style.transform = 'scaleX(' + adjustedProgress + ')'
      elements.progress.classList.toggle('indeterminate', !knownSize)
      if (knownSize) elements.progress.setAttribute('aria-valuenow', Math.round(ratio * 100))
      else elements.progress.removeAttribute('aria-valuenow')
    }
  },
  initialize: function () {
    downloadManager.bar.setAttribute('aria-label', l('downloadHeading'))
    downloadManager.closeButton.setAttribute('aria-label', l('downloadHide'))
    downloadManager.closeButton.title = l('downloadHide')
    this.closeButton.addEventListener('click', function () {
      downloadManager.hide()
    })

    ipc.on('download-info', function (e, info) {
      if (!info.path) {
        // download save location hasn't been chosen yet
        return
      }

      if (info.status === 'cancelled') {
        downloadManager.removeItem(info.path)
        return
      }

      if (info.status === 'completed') {
        downloadManager.onDownloadCompleted()
      }

      if (!downloadManager.downloadItems[info.path]) {
        downloadManager.show()
        downloadManager.createItem(info)
      }
      downloadManager.updateItem(info)

      downloadManager.downloadItems[info.path] = info
    })
  }
}

module.exports = downloadManager

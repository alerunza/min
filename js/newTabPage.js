/* globals fs, ipc, Blob */
// Svelto: handle cancelled dialogs, file failures and out-of-order background reads.
const path = require('path')
const statistics = require('js/statistics.js')

const newTabPage = {
  background: document.getElementById('ntp-background'),
  hasBackground: false,
  picker: document.getElementById('ntp-image-picker'),
  deleteBackground: document.getElementById('ntp-image-remove'),
  imagePath: path.join(window.globalArgs['user-data-path'], 'newTabBackground'),
  blobInstance: null,
  revision: 0,
  reloadBackground: function () {
    const revision = ++newTabPage.revision
    fs.readFile(newTabPage.imagePath, function (err, data) {
      if (revision !== newTabPage.revision) return
      if (newTabPage.blobInstance) {
        URL.revokeObjectURL(newTabPage.blobInstance)
        newTabPage.blobInstance = null
      }
      if (err) {
        newTabPage.background.hidden = true
        newTabPage.hasBackground = false
        document.body.classList.remove('ntp-has-background')
        newTabPage.deleteBackground.hidden = true
      } else {
        const blob = new Blob([data], { type: 'application/octet-binary' })
        const url = URL.createObjectURL(blob)
        newTabPage.blobInstance = url
        newTabPage.background.src = url

        newTabPage.background.hidden = false
        newTabPage.hasBackground = true
        document.body.classList.add('ntp-has-background')
        newTabPage.deleteBackground.hidden = false
      }
    })
  },
  clearError: function () {
    document.getElementById('ntp-background-error').hidden = true
  },
  showError: function () {
    const error = document.getElementById('ntp-background-error')
    error.textContent = l('tabBackgroundError')
    error.hidden = false
  },
  initialize: function () {
    newTabPage.reloadBackground()
    newTabPage.background.addEventListener('error', function () {
      newTabPage.background.hidden = true
      newTabPage.hasBackground = false
      document.body.classList.remove('ntp-has-background')
      newTabPage.showError()
    })

    newTabPage.picker.addEventListener('click', async function () {
      try {
        var filePath = await ipc.invoke('showOpenDialog', {
          filters: [
            { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
          ]
        })

        if (!filePath || !filePath[0]) {
          return
        }

        await fs.promises.copyFile(filePath[0], newTabPage.imagePath)
        newTabPage.clearError()
        newTabPage.reloadBackground()
      } catch (e) {
        newTabPage.showError()
      }
    })

    newTabPage.deleteBackground.addEventListener('click', async function () {
      try {
        await fs.promises.unlink(newTabPage.imagePath).catch(function (e) { if (e.code !== 'ENOENT') throw e })
        newTabPage.clearError()
        newTabPage.reloadBackground()
        newTabPage.picker.focus()
      } catch (e) {
        newTabPage.showError()
      }
    })

    statistics.registerGetter('ntpHasBackground', function () {
      return newTabPage.hasBackground
    })
  }
}

module.exports = newTabPage

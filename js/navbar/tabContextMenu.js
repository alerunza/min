// Modified for Svelto: sleep/wake menu and safe reload of sleeping tabs.
/* global ipc */
const remoteMenu = require('remoteMenuRenderer.js')
const browserUI = require('browserUI.js')
const webviews = require('webviews.js')
const readerView = require('readerView.js')
const urlParser = require('util/urlParser.js')

const tabContextMenu = {
  show: function (tabId) {
    const tabMenu = [
      [
        {
          label: l('appMenuDuplicateTab'),
          click: function () {
            const sourceTab = tabs.get(tabId)
            // strip tab id so that a new one is generated
            const newTab = tabs.add({ ...sourceTab, id: undefined })

            browserUI.addTab(newTab, { enterEditMode: false })
          }
        },
        {
          label: l('tabMenuNewWindow'),
          click: function () {
            // insert after current task
            let index
            if (tasks.getSelected()) {
              index = tasks.getIndex(tasks.getSelected().id) + 1
            }
            const newTask = tasks.get(tasks.add({}, index))

            const targetTab = tabs.get(tabId)
            tabs.destroy(targetTab.id)

            newTask.tabs.add(targetTab)

            ipc.send('newWindow', { initialTask: newTask.id })

            browserUI.switchToTask(tasks.getSelected().id)
          }
        }
      ]
    ]

    if (tabs.get(tabId).url && (readerView.isReader(tabId) || !urlParser.isInternalURL(tabs.get(tabId).url))) {
      if (!readerView.isReader(tabId)) {
        tabMenu[0].push({
          label: l('enterReaderView'),
          enabled: !tabs.get(tabId).sleeping,
          click: function () {
            readerView.enter(tabId, tabs.get(tabId).url)
          }
        })
      } else {
        tabMenu[0].push({
          label: l('exitReaderView'),
          click: function () {
            readerView.exit(tabId)
          }
        })
      }
    }

    tabMenu[0].push( {
      label: l('tabMenuReload'),
      click: function () {
        if (!webviews.hasViewForTab(tabId)) {
          browserUI.switchToTab(tabId)
          return
        }
        if (tabs.get(tabId).url.startsWith(webviews.internalPages.error)) {
          // reload the original page rather than show the error page again
          webviews.update(tabId, new URL(tabs.get(tabId).url).searchParams.get('url'))
        } else {
          // this can't be an error page, use the normal reload method
          webviews.callAsync(tabId, 'reload')
        }
      }
    })

    const tab = tabs.get(tabId)
    tabMenu.push([
      {
        label: tab.sleeping ? 'Wake tab' : 'Sleep tab — reloads when reopened',
        enabled: !!tab.sleeping || (!!tab.hasWebContents && !tab.selected && !tab.private && !tab.isFileView && !tab.hasAudio && /^https?:\/\//.test(tab.url)),
        click: async function () {
          if (tabs.get(tabId)?.sleeping) {
            browserUI.switchToTab(tabId)
            return
          }
          try {
            const result = await ipc.invoke('sleepTab', tabId)
            const task = tasks.getTaskContainingTab(tabId)
            if (task && !result.ok) task.tabs.update(tabId, { sleepReason: result.reason })
          } catch (error) {
            const task = tasks.getTaskContainingTab(tabId)
            if (task) task.tabs.update(tabId, { sleepReason: 'This page could not be checked safely' })
          }
        }
      },
      ...(tab.sleepReason ? [{ label: tab.sleepReason, enabled: false }] : [])
    ])
    remoteMenu.open(tabMenu)
  },
  initialize: function () {
    const container = document.getElementById('tabs-inner')
    container.addEventListener('contextmenu', function (e) {
      let node = e.target

      while (node) {
        if (node.classList.contains('tab-item')) {
          tabContextMenu.show(node.getAttribute('data-tab'))
          e.stopPropagation()
          break
        }
        node = node.parentNode
      }
    })
  }
}

module.exports = tabContextMenu

// Svelto: isolate editor instances and persist trimmed, unique tags safely.
var places = require('places/places.js')
var autocomplete = require('util/autocomplete.js')
const remoteMenu = require('remoteMenuRenderer.js')
var { ipcRenderer } = require('electron')

const bookmarkEditor = {
  currentInstance: null,
  removeBookmark: function (url) {
    return places.updateItem(url, { isBookmarked: false, tags: [] })
  },
  getTagElement: function (tag, selected, onClick, options = {}) {
    var el = document.createElement('button')
    el.className = 'tag'
    el.textContent = tag
    el.tabIndex = -1
    if (selected) {
      el.classList.add('selected')
      el.setAttribute('aria-pressed', true)
    } else {
      el.classList.add('suggested')
      el.setAttribute('aria-pressed', false)
    }
    el.addEventListener('click', function () {
      onClick()
      if (el.classList.contains('selected') && options.autoRemove !== false) {
        el.remove()
      } else {
        el.classList.remove('suggested')
        el.classList.add('selected')
        el.setAttribute('aria-pressed', true)
      }
    })
    if (options.onModify) {
      el.addEventListener('contextmenu', function () {
        remoteMenu.open([
          [
            {
              label: l('bookmarksRenameTag'),
              click: async function () {
                const res = ipcRenderer.sendSync('prompt', {
                  text: '',
                  values: [{ placeholder: l('bookmarksRenameTag'), id: 'name', type: 'text' }],
                  ok: l('dialogConfirmButton'),
                  cancel: l('dialogSkipButton'),
                  width: 500,
                  height: 140
                })

                if (!res || !res.name) {
                  return
                }

                const newName = res.name

                const items = await places.getAllItems()

                items.forEach(function (item) {
                  if (item.tags.includes(tag)) {
                    item.tags = item.tags.filter(t => t !== tag)
                    item.tags.push(newName)
                    places.updateItem(item.url, { tags: item.tags })
                  }
                })
                setTimeout(function () {
                  options.onModify()
                }, 50)
              }
            },
            {
              label: l('bookmarksDeleteTag'),
              click: async function () {
                const items = await places.getAllItems()
                items.forEach(function (item) {
                  if (item.tags.includes(tag)) {
                    item.tags = item.tags.filter(t => t !== tag)
                    places.updateItem(item.url, { tags: item.tags })
                  }
                })
                setTimeout(function () {
                  options.onModify()
                }, 50)
              }
            },
            {
              label: l('deleteBookmarksWithTag'),
              click: async function () {
                const items = await places.getAllItems()
                items.forEach(function (item) {
                  if (item.tags.includes(tag)) {
                    bookmarkEditor.removeBookmark(item.url)
                  }
                })
                setTimeout(function () {
                  options.onModify()
                }, 50)
              }
            }
          ]
        ])
      })
    }
    return el
  },
  render: async function (url, options = {}) {
    const instance = { pendingEdits: Promise.resolve() }
    bookmarkEditor.currentInstance = instance
    instance.bookmark = await places.getItem(url)
    if (bookmarkEditor.currentInstance !== instance || !instance.bookmark) {
      return null
    }
    const selectedTags = new Set(instance.bookmark.tags)
    const editor = document.createElement('div')
    editor.className = 'bookmark-editor searchbar-item'
    instance.editor = editor

    function setTag (tag, selected) {
      if (selected) selectedTags.add(tag)
      else selectedTags.delete(tag)
      const tags = Array.from(selectedTags)
      instance.bookmark.tags = tags
      instance.pendingEdits = instance.pendingEdits.then(() => places.updateItem(url, { tags }))
    }
    function finish (bookmark) {
      editor.remove()
      if (bookmarkEditor.currentInstance === instance) bookmarkEditor.currentInstance = null
      if (!bookmark) instance.pendingEdits = instance.pendingEdits.then(() => bookmarkEditor.removeBookmark(url))
      instance.pendingEdits.then(() => instance.onClose(bookmark))
    }
    function tagElement (tag, selected) {
      return bookmarkEditor.getTagElement(tag, selected, () => setTag(tag, !selectedTags.has(tag)))
    }

    if (options.simplified) editor.classList.add('simplified')
    if (!options.simplified) {
      const title = document.createElement('span')
      title.className = 'title wide'
      title.textContent = instance.bookmark.title
      editor.appendChild(title)
      const urlSpan = document.createElement('div')
      urlSpan.className = 'bookmark-url'
      urlSpan.textContent = instance.bookmark.url
      editor.appendChild(urlSpan)
    }
    const tagArea = document.createElement('div')
    tagArea.className = 'tag-edit-area'
    editor.appendChild(tagArea)

    if (!options.simplified) {
      const saveButton = document.createElement('button')
      saveButton.className = 'action-button always-visible i carbon:checkmark'
      saveButton.tabIndex = -1
      saveButton.setAttribute('aria-label', l('bookmarkDone'))
      saveButton.title = l('bookmarkDone')
      editor.appendChild(saveButton)
      saveButton.addEventListener('click', () => finish(instance.bookmark))
    }
    const delButton = document.createElement('button')
    delButton.className = 'action-button always-visible bookmark-delete-button i carbon:trash-can'
    delButton.tabIndex = -1
    delButton.setAttribute('aria-label', l('bookmarkDelete'))
    delButton.title = l('bookmarkDelete')
    editor.appendChild(delButton)
    delButton.addEventListener('click', () => finish(null))

    // The search group's Enter handling must not also activate the enclosing row.
    editor.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'BUTTON') e.stopPropagation()
    })
    selectedTags.forEach(tag => tagArea.appendChild(tagElement(tag, true)))

    places.getSuggestedTags(url).then(function (suggestions) {
      if (bookmarkEditor.currentInstance !== instance || !editor.isConnected) return
      Array.from(new Set(suggestions)).filter(tag => !selectedTags.has(tag)).slice(0, 3)
        .forEach(tag => tagArea.appendChild(tagElement(tag, false)))

      const newTagInput = document.createElement('input')
      newTagInput.className = 'tag-input'
      newTagInput.placeholder = l('bookmarksAddTag')
      newTagInput.setAttribute('aria-label', l('bookmarksAddTag'))
      newTagInput.spellcheck = false
      tagArea.appendChild(newTagInput)

      function commitTag () {
        const tag = newTagInput.value.trim().replace(/\s+/g, '-')
        if (tag && !selectedTags.has(tag)) {
          setTag(tag, true)
          tagArea.insertBefore(tagElement(tag, true), tagArea.firstElementChild)
        }
        newTagInput.value = ''
      }
      newTagInput.addEventListener('input', function (e) {
        if (e.isComposing || (e.inputType || '').includes('delete')) return
        const value = newTagInput.value
        places.getAllTagsRanked(url).then(function (results) {
          if (bookmarkEditor.currentInstance === instance && newTagInput.isConnected && newTagInput.value === value) {
            autocomplete.autocomplete(newTagInput, results.map(r => [r.tag]))
          }
        })
      })
      newTagInput.addEventListener('change', commitTag)
      newTagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault()
          e.stopPropagation()
          commitTag()
        }
      })
      if (options.autoFocus) newTagInput.focus()
    })
    return editor
  },
  show: function (url, replaceItem, onClose, options) {
    if (bookmarkEditor.currentInstance) {
      if (bookmarkEditor.currentInstance.editor && bookmarkEditor.currentInstance.editor.parentNode) {
        bookmarkEditor.currentInstance.editor.remove()
      }
      if (bookmarkEditor.currentInstance.replaceItem?.isConnected) bookmarkEditor.currentInstance.replaceItem.hidden = false
      bookmarkEditor.currentInstance = null
    }
    const rendering = bookmarkEditor.render(url, options)
    const instance = bookmarkEditor.currentInstance
    rendering.then(function (editor) {
      if (!editor || bookmarkEditor.currentInstance !== instance || !replaceItem.isConnected) return
      replaceItem.hidden = true
      replaceItem.parentNode.insertBefore(editor, replaceItem)
      instance.onClose = onClose
      instance.replaceItem = replaceItem
    })
  }
}

module.exports = bookmarkEditor

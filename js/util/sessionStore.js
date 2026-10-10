// Svelto: validate snapshots before replacing them and retain one known-good generation.
const fs = require('fs')
const writeFileAtomic = require('write-file-atomic')

function parse (text) {
  const data = JSON.parse(text)
  if (!data || (data.version !== undefined && data.version !== 2) || !Array.isArray(data.state?.tasks)) throw new Error('Invalid session format')
  const taskIds = new Set()
  const tabIds = new Set()
  const validateTab = tab => {
    if (!tab || typeof tab.id !== 'string' || !tab.id || typeof tab.url !== 'string' || (tab.title !== undefined && typeof tab.title !== 'string')) throw new Error('Invalid saved tab')
  }
  for (const task of data.state.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || taskIds.has(task.id) || !Array.isArray(task.tabs)) throw new Error('Invalid saved task')
    if (task.name !== undefined && task.name !== null && typeof task.name !== 'string') throw new Error('Invalid task name')
    taskIds.add(task.id)
    for (const tab of task.tabs) {
      validateTab(tab)
      if (tabIds.has(tab.id)) throw new Error('Duplicate saved tab')
      tabIds.add(tab.id)
    }
    if (task.tabHistory) {
      if (!Array.isArray(task.tabHistory.stack)) throw new Error('Invalid closed-tab history')
      task.tabHistory.stack.forEach(validateTab)
    }
  }
  return data
}

function write (savePath, text) {
  parse(text)
  let previous
  try { previous = fs.readFileSync(savePath, 'utf8'); parse(previous) } catch (error) {
    if (error.code && error.code !== 'ENOENT') throw error
    previous = null
  }
  if (previous) writeFileAtomic.sync(savePath + '.previous', previous, {})
  // All writes are synchronous, so a queued old async snapshot cannot overwrite a quit save.
  writeFileAtomic.sync(savePath, text, {})
}

function load (savePath) {
  let original
  let primaryError
  try { original = fs.readFileSync(savePath, 'utf8'); return { data: parse(original), recovered: false } } catch (error) { primaryError = error }
  let damagedPath
  if (original !== undefined) {
    damagedPath = savePath.replace(/\.json$/, '') + 'Backup-' + Date.now() + '.json'
    try { writeFileAtomic.sync(damagedPath, original, {}) } catch (error) { console.warn('Could not preserve damaged session:', error) }
  }
  try {
    const previous = fs.readFileSync(savePath + '.previous', 'utf8')
    const data = parse(previous)
    // Preserve the previous generation; replacing the damaged primary is best effort.
    try { writeFileAtomic.sync(savePath, previous, {}) } catch (error) { console.warn('Could not repair session:', error) }
    return { data, recovered: true, damagedPath }
  } catch (error) {
    if (primaryError.code === 'ENOENT' && error.code === 'ENOENT') return null
    primaryError.backupPath = damagedPath
    throw primaryError
  }
}

module.exports = { parse, write, load }

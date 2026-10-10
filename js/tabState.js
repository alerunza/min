const TaskList = require('tabState/task.js')

// Keep subscribed UI/sync/checkpoint listeners when discarding a failed restore.
function initialize (preserveListeners = false) {
  if (preserveListeners && window.tasks) {
    window.tasks.tasks = []
    window.tasks.pendingCallbacks = []
  } else {
    window.tasks = new TaskList()
  }
  window.tabs = undefined
}

module.exports = { initialize }

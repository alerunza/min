// Snapshot validation and interrupted-write recovery without launching the user's profile.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const store = require('../js/util/sessionStore.js')
const atomic = require('write-file-atomic')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelto-session-store-'))
const file = path.join(dir, 'sessionRestore.json')
let checks = 0
const snapshot = name => JSON.stringify({ version: 2, state: { tasks: [{ id: 'task', name, tabs: [{ id: 'tab', url: 'https://example.com/' }], tabHistory: { stack: [] } }] } })
function pass (name) { checks++; console.log('PASS', name) }
try {
  assert.equal(store.load(file), null); pass('Missing snapshots create a first-run session')
  store.write(file, snapshot('First')); store.write(file, snapshot('Second'))
  assert.equal(store.load(file).data.state.tasks[0].name, 'Second')
  assert.equal(store.parse(fs.readFileSync(file + '.previous', 'utf8')).state.tasks[0].name, 'First')
  pass('Atomic replacement retains the last known-good generation')
  for (const text of ['null', '{}', '{', JSON.stringify({state:{tasks:[{id:'a',name:{},tabs:[]}]}}), JSON.stringify({state:{tasks:[{id:'a',tabs:[{id:'b',url:'',title:{}}]}]}}), JSON.stringify({version: 9, state: {tasks: []}}), JSON.stringify({state:{tasks:[{id:'a',tabs:[{id:'b',url:4}]}]}}), JSON.stringify({state:{tasks:[{id:'a',tabs:[{id:'b',url:''},{id:'b',url:''}]}]}})]) assert.throws(() => store.parse(text))
  pass('Malformed JSON, unsupported versions, invalid shapes and duplicate IDs reject before restoration')
  fs.writeFileSync(file, '{damaged'); const result = store.load(file)
  assert.equal(result.recovered, true); assert.equal(result.data.state.tasks[0].name, 'First')
  assert.equal(fs.readFileSync(result.damagedPath, 'utf8'), '{damaged')
  pass('Damaged primary is preserved and the valid previous generation recovers')
  fs.unlinkSync(file); assert.equal(store.load(file).recovered, true)
  pass('Missing primary recovers the previous generation')
  const sync = atomic.sync
  atomic.sync = (destination, ...args) => { if (destination === file) throw Object.assign(new Error('simulated disk refusal'), {code:'EACCES'}); return sync(destination, ...args) }
  try { assert.throws(() => store.write(file, snapshot('Not written'))); assert.equal(store.load(file).data.state.tasks[0].name, 'First') } finally { atomic.sync = sync }
  pass('Failed primary write leaves the existing checkpoint readable')
  fs.writeFileSync(file, '{broken'); fs.writeFileSync(file + '.previous', '{}'); assert.throws(() => store.load(file))
  pass('Two invalid generations report an error instead of inventing recovered tasks')
  console.log(JSON.stringify({status:'passed',checks}))
} finally { fs.rmSync(dir,{recursive:true,force:true}) }

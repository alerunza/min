// Browser plugin not available: Playwright Electron verifies isolated process-kill and multi-window recovery.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http')
const { _electron } = require('playwright')
const root = path.resolve(__dirname, '..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'svelto-session-qa-'))
const bundleFile = path.join(root, 'output/build-path.txt'), bundle = fs.existsSync(bundleFile) ? fs.readFileSync(bundleFile,'utf8').trim() : path.join(root,'dist/app/mac-arm64/Svelto.app')
const executablePath = process.env.SVELTO_TEST_EXECUTABLE || path.join(bundle,'Contents/MacOS/Svelto')
const file = path.join(profile,'sessionRestore.json'), checks = [], errors = []
let app, origin
const server = http.createServer((req,res) => {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Session fixture '+req.url+'</title><h1>Session recovery</h1><p>'+req.url+'</p>')})
const pass = name => {checks.push({name,status:'passed'});console.log('PASS',name)}
async function wait(fn,label,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return}catch(e){if(!e.message.includes('Resulting promise was garbage collected'))throw e}await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
async function uis(){return app.evaluate(({webContents})=>webContents.getAllWebContents().filter(c=>c.getURL()==='min://app/index.html').map(c=>c.id))}
async function ui(code,id){const result=await app.evaluate(({webContents},{code,id})=>{const c=webContents.getAllWebContents().find(c=>id?c.id===id:c.getURL()==='min://app/index.html');return c.executeJavaScript('try{'+code+'}catch(e){({__qaError:e.stack})}',true)}, {code,id});if(result?.__qaError)throw Error(result.__qaError);return result}
function disk(){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return null}}
function projection(state){return state.tasks.filter(t=>t.name?.startsWith('Session QA')).map(t=>({id:t.id,name:t.name,collapsed:t.collapsed,tabs:t.tabs.filter(t=>!t.private).map(t=>({id:t.id,url:t.url,title:t.title,muted:t.muted,selected:t.selected})),history:t.tabHistory.stack.map(t=>({id:t.id,url:t.url}))}))}
async function launch(){app=await _electron.launch({executablePath,cwd:root,args:['--debug-browser'],env:{...process.env,SVELTO_USER_DATA_DIR:profile},timeout:60000});await wait(async()=>{const ids=await uis();return ids.length&&await ui('!!tasks.getSelected()')},'restored UI');for(const p of app.context().pages())p.on('pageerror',e=>errors.push(e.message))}
async function kill(){const closed=app.waitForEvent('close',{timeout:20000});app.process().kill('SIGKILL');await closed;app=null}
async function quit(){const closed=app.waitForEvent('close',{timeout:20000});await app.evaluate(({app})=>{setTimeout(()=>app.quit(),50)});await closed;app=null}
;(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({startupTabOption:1}))
 await launch();assert.equal(await ui('document.title.includes("Svelto") && document.querySelectorAll(".tab-item").length>0'),true)
 const taskIds=await ui(`(()=>{const ids=[];for(let n=0;n<3;n++){document.getElementById('add-task').click();const task=tasks.getSelected();tasks.update(task.id,{name:'Session QA '+n,collapsed:n===1});ids.push(task.id);ipc.emit('addTab',null,{url:${JSON.stringify(origin)}+'/task-'+n+'/tab-0'});for(let i=1;i<16;i++)tabs.add({url:${JSON.stringify(origin)}+'/task-'+n+'/tab-'+i,title:'Saved tab '+n+'/'+i,muted:i===4},{atEnd:true});document.getElementById('switch-task-button').click();document.querySelector('.task-container[data-task="'+task.id+'"] .task-tab-item').click()}return ids})()`)
 await wait(()=>disk()?.state.tasks.filter(t=>t.name?.startsWith('Session QA')).flatMap(t=>t.tabs).length===48,'48-tab checkpoint',8000)
 pass('48 tabs across three named Tasks checkpoint without waiting for the old 30-second timer')
 await ui("ipc.send('newWindow');true");await wait(async()=> (await uis()).length===2,'second window')
 const ids=await uis(), second=ids[1]
 await ui(`document.getElementById('switch-task-button').click();document.querySelector('.task-container[data-task="'+${JSON.stringify(taskIds[0])}+'"] .task-tab-item').click();true`,second)
 await ui(`tasks.update(${JSON.stringify(taskIds[1])},{name:'Session QA shared edit'});true`,ids[0])
 await ui(`tabs.update(tabs.getAtIndex(3).id,{url:${JSON.stringify(origin+'/changed-in-window-two')}});true`,second)
 await wait(async()=>{const a=await ui('tasks.getStringifyableState()',ids[0]),b=await ui('tasks.getStringifyableState()',second);return JSON.stringify(projection(a))===JSON.stringify(projection(b))},'cross-window state')
 await wait(()=>disk()?.state.tasks.some(t=>t.tabs.some(t=>t.url===origin+'/changed-in-window-two')),'cross-window checkpoint',8000)
 pass('Two windows synchronize edits and checkpoint their combined Tasks')
 await ui(`(()=>{const id=tabs.add({url:${JSON.stringify(origin+'/private-secret')},private:true});document.getElementById('switch-task-button').click();document.querySelector('.task-tab-item[data-tab="'+id+'"]').click();document.querySelector('.tab-item.active .tab-close-button').click();return true})()`,second)
 await ui(`ipc.emit('addTab',null,{url:${JSON.stringify(origin+'/recently-closed')}});document.querySelector('.tab-item.active .tab-close-button').click();true`,second)
 await app.evaluate(({BaseWindow})=>BaseWindow.getAllWindows().forEach(w=>w.blur()))
 await ui(`tasks.update(${JSON.stringify(taskIds[0])},{name:'Session QA background saved'});true`,second)
 await wait(()=>disk()?.state.tasks.some(t=>t.name==='Session QA background saved'),'background checkpoint',8000)
 assert.ok(disk().state.tasks.some(t=>t.tabHistory.stack.some(t=>t.url===origin+'/recently-closed')));
 assert.ok(!fs.readFileSync(file,'utf8').includes('private-secret'));assert.ok(!fs.readFileSync(file+'.previous','utf8').includes('private-secret'))
 pass('Background changes are checkpointed; private URLs are absent from open and closed-tab snapshots')
 const expected=projection(disk().state);await kill();await launch()
 assert.deepEqual(projection(await ui('tasks.getStringifyableState()')),expected)
 await ui(`document.getElementById('switch-task-button').click();document.querySelector('.task-container[data-task="'+${JSON.stringify(taskIds[0])}+'"] .task-tab-item').click();true`)
 assert.equal(await ui('document.querySelectorAll(".tab-item").length'),16)
 await wait(()=>app.evaluate(({webContents},url)=>webContents.getAllWebContents().some(c=>c.getURL()===url&&!c.isLoading()),expected[0].tabs.find(t=>t.selected).url),'restored page')
 if(process.env.SVELTO_CAPTURE_SESSIONS){await app.evaluate(({BaseWindow})=>BaseWindow.getAllWindows().find(w=>w.isVisible()).setContentSize(1024,720));const p=app.context().pages().find(p=>p.url()==='min://app/index.html');await ui("document.getElementById('switch-task-button').click();true");await p.waitForTimeout(350);await p.screenshot({path:'/private/tmp/svelto-session-recovered-tasks.png'});await ui("document.getElementById('switch-task-button').click();true")}
 pass('SIGKILL restart restores ordered tab IDs/URLs, mute states, selected tabs, Task names and collapse states')
 await ui("ipc.send('newWindow');true");await wait(async()=> (await uis()).length===2,'second window after restart')
 const beforeClose=projection(await ui('tasks.getStringifyableState()'))
 await app.evaluate(({BaseWindow})=>{const ws=BaseWindow.getAllWindows().filter(w=>w.isVisible());ws[ws.length-1].close()})
 await wait(async()=> (await uis()).length===1,'native close');assert.deepEqual(projection(await ui('tasks.getStringifyableState()')),beforeClose)
 await quit();await launch();assert.deepEqual(projection(await ui('tasks.getStringifyableState()')),beforeClose)
 pass('Closing one of two windows and quitting preserves the other window and all Tasks')
 await wait(()=>fs.existsSync(file+'.previous'),'backup generation');await quit()
 const backup=JSON.parse(fs.readFileSync(file+'.previous','utf8'));fs.writeFileSync(file,'{truncated-session')
 await launch();assert.deepEqual(projection(await ui('tasks.getStringifyableState()')),projection(backup.state))
 assert.ok(fs.readdirSync(profile).filter(n=>n.startsWith('sessionRestoreBackup-')).some(n=>fs.readFileSync(path.join(profile,n),'utf8')==='{truncated-session'))
 pass('A truncated primary file recovers its valid previous generation and retains the damaged original')
 await quit();fs.writeFileSync(file,'{both-broken');fs.writeFileSync(file+'.previous','{}')
 await launch();assert.equal(await ui('tasks.getSelected().tabs.get().some(t=>t.url.startsWith("min://app/pages/sessionRestoreError/"))'),true)
 assert.equal(await ui('document.querySelectorAll(".tab-item").length'),1)
 await wait(()=>disk()?.state.tasks.some(t=>t.tabs.some(t=>t.url.startsWith("min://app/pages/sessionRestoreError/"))),'initial error checkpoint')
 await new Promise(r=>setTimeout(r,450))
 await ui("document.getElementById('add-task').click();tasks.update(tasks.getSelected().id,{name:'Session QA after recovery error'});true")
 await wait(()=>disk()?.state.tasks.some(t=>t.name==='Session QA after recovery error'),'checkpoint after error',8000)
 pass('Two damaged snapshots open the recovery explanation and new Tasks still checkpoint')
 assert.deepEqual(errors,[]);pass('Session recovery renders meaningful UI without renderer JavaScript errors')
 await quit();fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/session-results.json'),JSON.stringify({status:'passed',checks,errors,tabs:48,windows:2,crash:'SIGKILL main process; no graceful save'},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}))
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{if(app){app.process().kill('SIGKILL');await app.waitForEvent('close',{timeout:10000}).catch(()=>{})};server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true})})

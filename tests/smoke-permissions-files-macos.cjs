// Svelto: real file upload/save and fake media capture in a disposable profile.
// Browser plugin not available; Playwright Electron/CDP validates embedded views. No physical device access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http')
const {_electron,chromium}=require('playwright')
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'svelto-permissions-profile-'))
const buildFile=path.join(root,'output/build-path.txt'),bundle=fs.existsSync(buildFile)?fs.readFileSync(buildFile,'utf8').trim():path.join(root,'dist/app/mac-arm64/Svelto.app')
const executablePath=process.env.SVELTO_TEST_EXECUTABLE||path.join(bundle,'Contents/MacOS/Svelto')
let app,browser,page,origin,secondOrigin,uploadData=''
const checks=[],errors=[]
const html='<!doctype html><html lang="en"><title>Svelto permissions and files</title><body><h1>Permissions and files</h1><p>Local verification with fake media devices.</p><label for="files">Upload files</label><input id="files" type="file" multiple><button id="upload">Upload</button><p id="upload-status" role="status"></p><a href="/download">Download fixture</a><script>document.getElementById("upload").onclick=async()=>{const data=new FormData();for(const file of document.getElementById("files").files)data.append("files",file);const result=await fetch("/upload",{method:"POST",body:data});document.getElementById("upload-status").textContent=await result.text()}</script></body></html>'
function handler(req,res){if(req.url==='/upload'){let data=[];req.on('data',chunk=>data.push(chunk));req.on('end',()=>{uploadData=Buffer.concat(data).toString();res.end('Upload received')})}else if(req.url==='/download'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="svelto-native-download.txt"'});res.end('Svelto download fixture')}else{res.writeHead(200,{'Content-Type':'text/html'});res.end(html.replace('<body>','<body data-fixture-origin="http://'+req.headers.host+'">'))}}
const server=http.createServer(handler),second=http.createServer(handler)
function pass(name){checks.push({name,status:'passed'});console.log('PASS',name)}
async function wait(fn,label,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return}catch(e){if(!e.message.includes('Resulting promise was garbage collected'))throw e}await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
async function ui(code){return app.evaluate(({webContents},code)=>webContents.getAllWebContents().find(c=>c.getURL()==='min://app/index.html').executeJavaScript(code,true),code)}
async function navigate(url){await ui(`(()=>{document.querySelector('.tab-item.active').click();const input=document.getElementById('tab-editor-input');input.value=${JSON.stringify(url)};input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));input.dispatchEvent(new KeyboardEvent('keypress',{bubbles:true,key:'Enter',keyCode:13,charCode:13,which:13}))})()`);await wait(()=>app.evaluate(({webContents},url)=>webContents.getAllWebContents().some(c=>c.getURL()===url&&!c.isLoading()),url),'loaded '+url);return browser.contexts()[0].pages().find(p=>p.url()===url)}
async function media(content,constraints){await content.evaluate(constraints=>{window.mediaResult='pending';navigator.mediaDevices.getUserMedia(constraints).then(stream=>{window.mediaResult={granted:true,types:stream.getTracks().map(t=>t.kind)};stream.getTracks().forEach(t=>t.stop())},error=>{window.mediaResult={granted:false,name:error.name}});return true},constraints)}
async function capture(name){if(process.env.SVELTO_CAPTURE_PERMISSIONS){await page.waitForTimeout(250);await page.screenshot({path:'/private/tmp/svelto-'+name+'.png',clip:{x:0,y:0,width:await page.evaluate(()=>innerWidth),height:52}})}}
;(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
 await new Promise(r=>second.listen(0,'127.0.0.1',r));secondOrigin='http://127.0.0.1:'+second.address().port
 const debug=http.createServer();await new Promise(r=>debug.listen(0,'127.0.0.1',r));const port=debug.address().port;await new Promise(r=>debug.close(r))
 app=await _electron.launch({executablePath,cwd:root,args:['--debug-browser','--remote-debugging-port='+port,'--use-fake-device-for-media-stream'],env:{...process.env,SVELTO_USER_DATA_DIR:profile},timeout:60000})
 await wait(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().some(c=>c.getURL()==='min://app/index.html'&&!c.isLoading())),'UI')
 page=app.context().pages().find(p=>p.url()==='min://app/index.html');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port)
 page.on('pageerror',e=>errors.push(e.message));browser.contexts()[0].on('page',p=>p.on('pageerror',e=>errors.push(e.message)))
 await app.evaluate(({BaseWindow})=>BaseWindow.getAllWindows().find(w=>w.isVisible()).setContentSize(1024,720))
 await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',false)");assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark-mode')),false)
 let content=await navigate(origin+'/page')
 const files=[path.join(profile,'one.txt'),path.join(profile,'two.txt')];fs.writeFileSync(files[0],'Svelto upload one');fs.writeFileSync(files[1],'Svelto upload two')
 await content.getByLabel('Upload files').setInputFiles(files);await content.getByRole('button',{name:'Upload',exact:true}).click();await wait(()=>content.getByRole('status').textContent().then(t=>t==='Upload received'),'real upload')
 assert.ok(uploadData.includes('one.txt')&&uploadData.includes('two.txt')&&uploadData.includes('Svelto upload one')&&uploadData.includes('Svelto upload two'))
 await content.getByLabel('Upload files').setInputFiles([]);assert.equal(await content.getByLabel('Upload files').evaluate(el=>el.files.length),0)
 pass('Multiple-file upload sends the chosen bytes to localhost; clearing selection leaves no files')
 await media(content,{audio:true});await page.getByRole('button',{name:'Deny microphone for '+origin,exact:true}).waitFor()
 await capture('permissions-pending-light');await page.getByRole('button',{name:'Deny microphone for '+origin,exact:true}).focus();await page.keyboard.press('Enter')
 await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'denial');assert.deepEqual(await content.evaluate(()=>mediaResult),{granted:false,name:'NotAllowedError'})
 await wait(()=>page.locator('.permission-request-icon').count().then(n=>n===0),'denial removes controls')
 pass('Keyboard Deny rejects getUserMedia and removes the pending indicator')
 await media(content,{audio:true});await page.getByRole('button',{name:'Allow microphone for '+origin,exact:true}).focus();await page.keyboard.press('Enter')
 await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'fake microphone');assert.deepEqual(await content.evaluate(()=>mediaResult),{granted:true,types:['audio']})
 await media(content,{video:true});await page.getByRole('button',{name:'Allow camera for '+origin,exact:true}).click()
 await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'fake camera');assert.deepEqual(await content.evaluate(()=>mediaResult),{granted:true,types:['video']})
 await media(content,{audio:true,video:true});await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'combined media');assert.equal(await content.evaluate(()=>mediaResult.granted),true)
 assert.equal(await page.locator('.permission-deny-icon').count(),0);await capture('permissions-granted')
 pass('Explicit camera/microphone grants allow fake streams; combined access reuses only granted types')
 const reloaded=content.waitForEvent('load')
 await page.getByRole('button',{name:'Reset microphone + camera for '+origin+' and reload',exact:true}).click()
 await reloaded;await wait(()=>page.locator('.permission-request-icon').count().then(n=>n===0),'reset clears grants')
 await media(content,{audio:true});await page.getByRole('button',{name:'Deny microphone for '+origin,exact:true}).click();await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'reset permission denied')
 pass('Reset reloads the page and the next media request requires a fresh decision')
 await media(content,{video:true});await page.getByRole('button',{name:'Allow camera for '+origin,exact:true}).waitFor()
 for(const w of [320,390]){await app.evaluate(({BaseWindow},w)=>BaseWindow.getAllWindows().find(win=>win.isVisible()).setContentSize(w,720),w);await capture('permissions-'+w);assert.ok(await ui('document.documentElement.scrollWidth<=innerWidth+1'))}
 await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',true)");await capture('permissions-pending-dark');await page.getByRole('button',{name:'Deny camera for '+origin,exact:true}).click()
 await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',false)");await app.evaluate(({BaseWindow})=>BaseWindow.getAllWindows().find(w=>w.isVisible()).setContentSize(1024,720))
 pass('Permission controls render in light/dark and narrow toolbar layouts')
 content=await navigate(secondOrigin+'/page');await media(content,{audio:true});await page.getByRole('button',{name:'Deny microphone for '+secondOrigin,exact:true}).click();await wait(()=>content.evaluate(()=>mediaResult!=='pending'),'second origin denial')
 pass('A different localhost port has its own visible origin and permission decision')
 // Real savePage with controlled native dialog responses. Delay the dialog to reproduce tab switching.
 content=await navigate(origin+'/page');const originalTab=await ui('tabs.getSelected()'),savePath=path.join(profile,'saved-page')
 await ui("window.savedInvoke=ipc.invoke;window.saveReply=undefined;ipc.invoke=(name,...args)=>name==='showSaveDialog'?Promise.resolve(saveReply):savedInvoke.call(ipc,name,...args);true")
 await ui("ipc.emit('saveCurrentPage')");await page.waitForTimeout(200);assert.equal(fs.existsSync(savePath+'.html'),false)
 pass('Cancelling Save Page writes no file')
 await ui("ipc.invoke=(name,...args)=>name==='showSaveDialog'?new Promise(resolve=>{window.resolveSave=resolve}):savedInvoke.call(ipc,name,...args);ipc.emit('saveCurrentPage');true")
 await wait(()=>ui("typeof resolveSave==='function'"),'delayed save dialog')
 await page.locator('#add-tab-button').click();await navigate(secondOrigin+'/other')
 await ui('resolveSave('+JSON.stringify(savePath)+');true')
 await wait(()=>fs.existsSync(savePath+'.html'),'saved original page')
 assert.ok(fs.readFileSync(savePath+'.html','utf8').includes('Permissions and files'))
 assert.match(fs.readFileSync(savePath+'.html','utf8'),new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
 assert.notEqual(await ui('tabs.getSelected()'),originalTab)
 pass('Save Page writes the originally requested tab even after switching tabs during the dialog')
 const changedPath=path.join(profile,'changed-document.html')
 await ui("ipc.emit('saveCurrentPage');true");await wait(()=>ui("typeof resolveSave==='function'"),'second delayed dialog')
 await navigate(secondOrigin+'/changed');await ui('resolveSave('+JSON.stringify(changedPath)+');true');await page.waitForTimeout(200);assert.equal(fs.existsSync(changedPath),false)
 pass('A document that navigates during Save Page is not saved under the old request')
 await ui("ipc.invoke=(name,...args)=>name==='showSaveDialog'?Promise.reject(new Error('fixture dialog failure')):savedInvoke.call(ipc,name,...args);window.saveAlerts=[];window.originalSaveAlert=window.alert;window.alert=value=>saveAlerts.push(value);ipc.emit('saveCurrentPage');true")
 await wait(()=>ui('saveAlerts.length===1'),'save error');assert.match(await ui('saveAlerts[0]'),/Could not save/)
 await ui('ipc.invoke=savedInvoke;window.alert=originalSaveAlert;true')
 pass('Save dialog failures have a localized error instead of an unhandled rejection')
 // Native screen selection is manual; permission policy and fallback denial are covered by permission-policy.cjs.
 assert.deepEqual(errors,[]);pass('No renderer JavaScript errors in permission/file fixtures')
 fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/permissions-files-results.json'),JSON.stringify({status:'passed',checks,errors,physicalDevices:'not accessed',nativeScreenPicker:'requires manual acceptance/cancellation verification'},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}))
})().catch(e=>{console.error(e.stack);console.error(JSON.stringify({checks,errors}));process.exitCode=1}).finally(async()=>{if(browser)await browser.close().catch(()=>{});if(app)await app.close().catch(()=>{});for(const s of [server,second]){s.closeAllConnections();await new Promise(r=>s.close(r))}fs.rmSync(profile,{recursive:true,force:true})})

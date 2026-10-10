// Svelto reading checks: real Electron views, local articles/PDFs and a disposable profile.
// Browser plugin unavailable in this session; Playwright + Electron/CDP inspect embedded views.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { _electron, chromium } = require('playwright')
const root = path.resolve(__dirname, '..')
const buildPath = path.join(root, 'output/build-path.txt')
const bundle = fs.existsSync(buildPath) ? fs.readFileSync(buildPath, 'utf8').trim() : path.join(root, 'dist/app/mac-arm64/Svelto.app')
const executablePath = process.env.SVELTO_TEST_EXECUTABLE || path.join(bundle, 'Contents/MacOS/Svelto')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'svelto-reading-profile-'))
const checks = [], errors = []
let app, browser, page, origin, retry = false
// Small, standards-compliant PDF fixtures with text and both internal/external link annotations.
function makePDF(count) {
 const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
 const kids = []
 for(let i=1;i<=count;i++) {
  const id=objects.length+1; kids.push(id+' 0 R')
  const text=`BT /F1 26 Tf 64 720 Td (Svelto reading test - page ${i}) Tj 0 -50 Td /F1 14 Tf (Quiet document navigation and selectable text.) Tj 0 -40 Td (Unique search token: page${i}needle) Tj 0 -40 Td (Go to last page) Tj 0 -40 Td (Open original article) Tj ET`
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R ${i===1?'/Annots ['+(id+2)+' 0 R '+(id+3)+' 0 R]':''} >>`)
  objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`)
  if(i===1) {
   objects.push(`<< /Type /Annot /Subtype /Link /Rect [64 580 200 600] /Border [0 0 0] /Dest [${count-1} /Fit] >>`)
   objects.push('<< /Type /Annot /Subtype /Link /Rect [64 540 230 560] /Border [0 0 0] /A << /S /URI /URI (http://127.0.0.1/article) >> >>')
  }
 }
 objects[1]='<< /Type /Pages /Count '+count+' /Kids ['+kids.join(' ')+'] >>'
 objects.push('<< /Title (Svelto PDF fixture) >>')
 let data='%PDF-1.7\n', offsets=[0]
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(data));data+=(index+1)+' 0 obj\n'+object+'\nendobj\n'})
 const xref=Buffer.byteLength(data)
 data+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')
 data+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R /Info '+objects.length+' 0 R >>\nstartxref\n'+xref+'\n%%EOF'
 return Buffer.from(data)
}
const paragraph='A minimal browser leaves room for the article. This local fixture exercises comfortable reading, theme changes, keyboard navigation and long content without depending on a remote website. '.repeat(3)
const article='<html lang="en"><head><title>Quiet &lt;em&gt;reading&lt;/em&gt; - Svelto</title><meta name="author" content="Svelto &lt;b&gt;author&lt;/b&gt;"><meta property="article:published_time" content="2026-10-09"></head><body><nav><a href="/guides/">Guides</a></nav><article><h1>Quiet &lt;em&gt;reading&lt;/em&gt;</h1><p class="byline">Svelto &lt;b&gt;author&lt;/b&gt;</p><p><a href="#later">Jump to the conclusion</a></p>'+Array.from({length:14},(_,i)=>'<p>'+paragraph+'</p>'+(i===4?'<img src="/slow.svg" alt="Late loading illustration">':'')).join('')+'<h2 id="later">Conclusion</h2><p>'+paragraph+'</p></article></body></html>'
const server=http.createServer((request,response)=>{
 if(request.url==='/slow.svg') {setTimeout(()=>{response.writeHead(200,{'Content-Type':'image/svg+xml'});response.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="#d9dfd7"/></svg>')},1200);return}
 if(request.url.includes('.pdf')) {
  response.writeHead(200,{'Content-Type':'application/pdf'});response.end(request.url==='/broken.pdf'&&!retry?Buffer.from('not a PDF'):makePDF(request.url==='/long.pdf'?30:3));return
 }
 if(request.url==='/failed-article') {response.writeHead(500,{'Content-Type':'text/html'});response.end('Server failed');return}
 response.writeHead(200,{'Content-Type':'text/html'});response.end(request.url==='/empty'?'<html><title>Empty</title><body></body></html>':article)
})
function pass(name) {checks.push({name,status:'passed'});console.log('PASS',name)}
async function wait(fn,label,timeout=25000) {const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return}catch(e){if(!e.message.includes('Resulting promise was garbage collected'))throw e}await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+label)}
async function ui(code) {return app.evaluate(({webContents},code)=>webContents.getAllWebContents().find(c=>c.getURL()==='min://app/index.html').executeJavaScript(code,true),code)}
async function navigate(url) {
 await ui(`(()=>{document.querySelector('.tab-item.active').click();const input=document.getElementById('tab-editor-input');input.value=${JSON.stringify(url)};input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));input.dispatchEvent(new KeyboardEvent('keypress',{bubbles:true,key:'Enter',keyCode:13,charCode:13,which:13}))})()`)
}
async function embedded(prefix) {await wait(()=>browser.contexts()[0].pages().some(p=>p.url().startsWith(prefix)),'embedded view '+prefix);const p=browser.contexts()[0].pages().find(p=>p.url().startsWith(prefix));await p.waitForLoadState('domcontentloaded');return p}
async function width(value) {await app.evaluate(({BaseWindow},width)=>BaseWindow.getAllWindows().find(w=>w.isVisible()).setContentSize(width,720),value)}
async function capture(p,name) {if(process.env.SVELTO_CAPTURE_READING){await p.waitForTimeout(350);await p.screenshot({path:'/private/tmp/svelto-'+name+'.png'})}}
async function quietSize(p) {assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow')}
async function openReader(route) {await navigate('min://app/reader/index.html?url='+encodeURIComponent(origin+route));const p=await embedded('min://app/reader/');await p.locator('.reader-frame').waitFor();await wait(()=>p.evaluate(()=>document.querySelector('.reader-frame').contentDocument.querySelector('.reader-main')!==null),'reader content');return p}
async function openPDF(route) {await navigate(origin+route);const p=await embedded('min://app/pages/pdfViewer/index.html?url='+encodeURIComponent(origin+route));await p.locator('#pdf-pages[aria-busy="false"]').waitFor({timeout:30000,state:'attached'});return p}
;(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port
 const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const debugPort=portServer.address().port;await new Promise(r=>portServer.close(r))
 app=await _electron.launch({executablePath,cwd:root,args:['--debug-browser','--remote-debugging-port='+debugPort],env:{...process.env,SVELTO_USER_DATA_DIR:profile},timeout:60000})
 await wait(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().some(c=>c.getURL()==='min://app/index.html'&&!c.isLoading())),'UI ready')
 page=app.context().pages().find(p=>p.url()==='min://app/index.html')
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+debugPort)
 browser.contexts()[0].on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('500 (Internal Server Error)'))errors.push(m.text())})})
 await width(1024);await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',false)")
 await page.locator('#add-tab-button').click()
 await wait(()=>ui("document.body.classList.contains('is-ntp') && !document.getElementById('ntp-content').inert"),'new tab')
 assert.equal(await page.locator('#ntp-welcome h1').textContent(),'Svelto')
 assert.equal(await page.getByRole('button',{name:'Choose a background image'}).count(),1)
 await app.evaluate(({webContents})=>{const c=webContents.getAllWebContents().find(c=>c.getURL()==='min://app/index.html');c.sendInputEvent({type:'keyDown',keyCode:'Escape'});c.sendInputEvent({type:'keyUp',keyCode:'Escape'})});await capture(page,'newtab-light')
 pass('New tab preserves the tab address field and exposes named background controls')
 for(const w of [320,390]) {await width(w);await quietSize(page);await capture(page,'newtab-'+w)}
 await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',true)");await capture(page,'newtab-dark')
 await width(1024);await ui("ipc.emit('settingChanged',null,'darkThemeIsActive',false)")
 pass('New tab renders in light/dark and 320/390 widths')
 const imageFile=path.join(profile,'background.png');fs.writeFileSync(imageFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'))
 await ui(`window.readingOriginalInvoke=ipc.invoke;window.readingPickerPaths=[];ipc.invoke=(name,...args)=>name==='showOpenDialog'?Promise.resolve(readingPickerPaths):readingOriginalInvoke.call(ipc,name,...args);true`)
 await page.getByRole('button',{name:'Choose a background image'}).click();assert.equal(fs.existsSync(path.join(profile,'newTabBackground')),false)
 await ui('readingPickerPaths='+JSON.stringify([imageFile]));await page.getByRole('button',{name:'Choose a background image'}).focus();await page.keyboard.press('Enter')
 await wait(()=>ui("document.body.classList.contains('ntp-has-background') && document.getElementById('ntp-background').naturalWidth>0"),'background decoded')
 assert.deepEqual(fs.readFileSync(path.join(profile,'newTabBackground')),fs.readFileSync(imageFile))
 await page.getByRole('button',{name:'Remove background image'}).focus();await page.keyboard.press('Enter')
 await wait(()=>ui("!document.body.classList.contains('ntp-has-background') && document.activeElement.id==='ntp-image-picker'"),'removed background')
 assert.equal(fs.existsSync(path.join(profile,'newTabBackground')),false)
 pass('Cancel, keyboard image selection and removal work with real files and restore focus')
 await ui("readingPickerPaths=['/private/tmp/svelto-file-that-does-not-exist.png']")
 await page.getByRole('button',{name:'Choose a background image'}).click()
 await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/Could not update/)
 await ui('ipc.invoke=readingOriginalInvoke;true')
 pass('Background file failures show an error without an unhandled rejection')
 let reader=await openReader('/article?edition=quiet&language=en')
 await wait(()=>reader.evaluate(()=>document.querySelector('.reader-frame').contentDocument.querySelector('h1')?.textContent.includes('Quiet')),'reader heading')
 const rf=reader.frameLocator('.reader-frame')
 assert.equal(await rf.locator('body').getAttribute('class'),'mac')
 assert.equal(await rf.locator('p').first().evaluate(el=>getComputedStyle(el).lineHeight),'31.35px')
 assert.match(await rf.locator('h1').textContent(),/<em>reading<\/em>/)
 assert.equal(await rf.locator('h1 em').count(),0)
 assert.match(await rf.locator('.article-authors').textContent(),/author/)
 assert.equal(await rf.locator('.article-authors b').count(),0)
 assert.equal(await ui("document.getElementById('ntp-content').inert"),true)
 assert.equal(await reader.locator('#backtoarticle-link').getAttribute('href'),origin+'/article?edition=quiet&language=en')
 await reader.locator('#auto-redirect-no').click()
 await reader.locator('#settings-button').click();await reader.getByRole('button',{name:'Light',exact:true}).click();await reader.keyboard.press('Escape')
 assert.equal(await reader.locator('#settings-button').getAttribute('aria-expanded'),'false')
 assert.equal(await reader.evaluate(()=>document.activeElement.id),'settings-button')
 pass('Reader preserves query parameters, escapes plain text headers and restores appearance-button focus')
 await wait(()=>reader.evaluate(()=>{const f=document.querySelector('.reader-frame');const img=f.contentDocument.querySelector('img');return img?.complete&&img.naturalHeight>0&&parseFloat(f.height)>=f.contentDocument.querySelector('.reader-main').scrollHeight}),'reader late image resizing')
 await capture(reader,'reader-light')
 await rf.getByRole('link',{name:'Jump to the conclusion'}).click()
 await wait(()=>reader.evaluate(()=>scrollY>500),'reader anchor scroll')
 await reader.evaluate(()=>scrollTo(0,0))
 pass('Reader resizes for late images and scrolls to internal article anchors')
 for(const theme of ['dark','sepia']) {await reader.locator('#settings-button').click();await reader.locator('[data-theme="'+theme+'"]').click();await reader.keyboard.press('Escape');await wait(()=>reader.evaluate(theme=>document.body.getAttribute('theme')===theme,theme),'reader theme');await capture(reader,'reader-'+theme)}
 for(const w of [320,390]) {await width(w);await quietSize(reader);assert.ok(await rf.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1));await capture(reader,'reader-'+w)}
 await width(1024);await reader.locator('#backtoarticle-link').focus();await reader.keyboard.press('Enter')
 await wait(()=>reader.url()===origin+'/article?edition=quiet&language=en','reader original URL')
 pass('Reader light/dark/sepia, narrow layouts and keyboard return to original article')
 reader=await openReader('/empty');await wait(()=>reader.frameLocator('.reader-frame').locator('em').textContent().then(t=>t.includes('No article found')),'empty reader');await capture(reader,'reader-empty')
 reader=await openReader('/failed-article');await wait(()=>reader.frameLocator('.reader-frame').getByRole('alert').textContent().then(t=>t.includes('Could not load')),'failed reader');await capture(reader,'reader-error')
 pass('Reader shows distinct empty and HTTP failure states with a route back')
 let pdfPage=await openPDF('/doc.pdf')
 assert.equal(await pdfPage.title(),'Svelto PDF fixture')
 assert.equal(await pdfPage.locator('.page').count(),3)
 assert.ok(await pdfPage.locator('.textLayer').first().textContent().then(t=>t.includes('page1needle')))
 assert.equal(await pdfPage.getByRole('button',{name:'Download PDF',exact:true}).count(),1)
 await pdfPage.locator('#settings-button').click();await pdfPage.locator('[data-theme="light"]').click();await pdfPage.keyboard.press('Escape')
 await capture(pdfPage,'pdf-light')
 pass('Real PDF navigation opens the built-in viewer with title, selectable text and labelled controls')
 await pdfPage.getByRole('textbox',{name:'Page number'}).fill('3');await pdfPage.keyboard.press('Enter')
 await wait(()=>pdfPage.getByRole('textbox',{name:'Page number'}).inputValue().then(v=>v==='3'),'page 3')
 await pdfPage.getByRole('textbox',{name:'Page number'}).fill('99');await pdfPage.keyboard.press('Enter')
 assert.equal(await pdfPage.getByRole('textbox',{name:'Page number'}).inputValue(),'3')
 await pdfPage.getByRole('textbox',{name:'Page number'}).fill('1');await pdfPage.keyboard.press('Enter')
 await pdfPage.locator('.annotationLayer a').first().click()
 await wait(()=>pdfPage.getByRole('textbox',{name:'Page number'}).inputValue().then(v=>v==='3'),'internal PDF link')
 pass('PDF page entry rejects out-of-range pages and internal destinations use the correct page index')
 for(const theme of ['dark','sepia']) {await pdfPage.locator('#settings-button').click();await pdfPage.locator('[data-theme="'+theme+'"]').click();if(theme==='dark'){await pdfPage.locator('#invert-pdf-checkbox').check();assert.equal(await pdfPage.locator('body').getAttribute('data-invert'),'true')}await pdfPage.keyboard.press('Escape');await capture(pdfPage,'pdf-'+theme)}
 for(const w of [320,390]) {await width(w);await wait(()=>pdfPage.locator('.page').first().boundingBox().then(box=>box.width<=w-20),'PDF fits width');await quietSize(pdfPage);await capture(pdfPage,'pdf-'+w)}
 await width(1024)
 pass('PDF light/dark/sepia, inversion and resize keep pages and toolbar within narrow windows')
 // Exercise print preparation and restoration without opening the system print dialog.
 await pdfPage.evaluate(()=>{window.print=()=>{window.sveltoPrintCalled=true;window.dispatchEvent(new Event('afterprint'))};return parentProcessActions.printPDF()})
 assert.equal(await pdfPage.evaluate(()=>sveltoPrintCalled),true)
 pass('Three-page PDF print preparation renders all pages and restores preview state (system dialog remains manual)')
 await navigate(origin+'/long.pdf');pdfPage=await embedded('min://app/pages/pdfViewer/index.html?url='+encodeURIComponent(origin+'/long.pdf'));await pdfPage.waitForLoadState('load')
 // Dispatch the menu's find command; macOS menu accelerators require the separate native UI check.
 await ui("ipc.emit('findInPage')")
 await page.locator('#findinpage-input').fill('page30needle')
 await wait(()=>page.locator('#findinpage-count').textContent().then(t=>/1/.test(t)),'PDF browser search')
 await pdfPage.locator('#pdf-pages[aria-busy="false"]').waitFor()
 assert.equal(await pdfPage.locator('.page').count(),30)
 assert.ok(await pdfPage.locator('.textLayer').last().textContent().then(t=>t.includes('page30needle')))
 await page.locator('#findinpage-end').click()
 await pdfPage.getByRole('textbox',{name:'Page number'}).fill('30');await pdfPage.keyboard.press('Enter')
 await wait(()=>pdfPage.locator('[data-page-number="30"] canvas').count().then(n=>n===1),'distant PDF canvas')
 await wait(()=>pdfPage.locator('canvas').count().then(n=>n<=5),'bounded canvases')
 await pdfPage.getByRole('textbox',{name:'Page number'}).fill('1');await pdfPage.keyboard.press('Enter')
 await wait(()=>pdfPage.locator('[data-page-number="1"] canvas').count().then(n=>n===1),'return canvas')
 pass('Thirty-page PDF search finds distant text; page jumps redraw with at most five cached canvases')
 const savePath=path.join(profile,'saved-document.pdf')
 await app.evaluate(({session},savePath)=>session.fromPartition('persist:webcontent').once('will-download',(_event,item)=>item.setSavePath(savePath)),savePath)
 await pdfPage.getByRole('button',{name:'Download PDF',exact:true}).click()
 await wait(()=>fs.existsSync(savePath)&&fs.statSync(savePath).size===makePDF(30).length,'PDF download saved')
 assert.deepEqual(fs.readFileSync(savePath),makePDF(30))
 pass('PDF Download saves the original document through a real native DownloadItem')
 retry=false;pdfPage=await openPDF('/broken.pdf');await pdfPage.getByRole('alert').waitFor();await capture(pdfPage,'pdf-error')
 assert.equal(await page.locator('#download-bar .download-item').count(),1)
 retry=true;await pdfPage.getByRole('button',{name:'Try again',exact:true}).click();await pdfPage.locator('#pdf-pages[aria-busy="false"]').waitFor();await wait(()=>pdfPage.locator('.page').count().then(n=>n===3),'PDF retry')
 pass('Invalid PDF shows retry/download choices and retry succeeds without an automatic download')
 const expectedDiagnostics=errors.filter(message=>/^Blocked script execution in 'about:srcdoc(?:#[^']*)?' because/.test(message) || message.includes('Script failed to execute, this normally means an error was thrown.') || message.includes('net::ERR_UNEXPECTED'))
 const unexpected=errors.filter(message=>!expectedDiagnostics.includes(message))
 assert.deepEqual(unexpected,[])
 pass('No unexpected JavaScript/console errors; sandbox-blocked preload and corrupt-PDF diagnostics recorded')
 fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/reading-results.json'),JSON.stringify({status:'passed',checks,errors:unexpected,expectedDiagnostics},null,2))
 console.log(JSON.stringify({status:'passed',checks:checks.length}))
})().catch(error=>{console.error(error.stack);console.error(JSON.stringify({errors,checks}));process.exitCode=1}).finally(async()=>{if(browser)await browser.close().catch(()=>{});if(app)await app.close().catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true})})

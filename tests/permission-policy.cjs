// Svelto policy regressions: callbacks and session/origin boundaries without real devices.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const win={}, otherWin={}, regular={}, privateSession={}
let id=0, checks=0
class Contents extends EventEmitter {
 constructor(url,ses=regular,owner=win){super();this.id=String(++id);this.url=url;this.session=ses;this.owner=owner;this.dead=false;this.mainFrame={}}
 getURL(){return this.url} isDestroyed(){return this.dead}
}
const ui=new Contents('min://app/index.html'), otherUI=new Contents('min://app/index.html',regular,otherWin)
const ses={setPermissionRequestHandler(fn){this.request=fn},setPermissionCheckHandler(fn){this.check=fn},setDisplayMediaRequestHandler(fn,opts){this.display=fn;this.opts=opts}}
const app=new EventEmitter(),ipc=new EventEmitter()
const context={URL,console,process:{platform:'darwin'},app,ipc,session:{defaultSession:ses},windows:{getAll:()=>[win,otherWin],windowFromContents:c=>c===ui?{win}:c===otherUI?{win:otherWin}:undefined},sendIPCToWindow(){},getTabIDFromWebContents:c=>[ui,otherUI].includes(c)?undefined:c.id,getWindowFromViewContents:c=>c.owner}
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../main/permissionManager.js'),'utf8'),context)
app.emit('ready')
function run(name,fn){fn();checks++;console.log('PASS',name)}
function request(c,permission='media',mediaTypes=['audio'],extra={}) {const results=[];ses.request(c,permission,value=>results.push(value),{isMainFrame:true,requestingUrl:c.url,mediaTypes,...extra});return results}
function pending(c){return vm.runInContext('pendingPermissions',context).find(p=>p.contents===c)}
function allow(c,sender=ui,frame=sender.mainFrame){const p=pending(c);assert.ok(p);ipc.emit('permissionGranted',{sender,senderFrame:frame},p.permissionId)}
function check(c,type,origin=c.url){return ses.check(c,'media',origin,{isMainFrame:true,mediaType:type})}
run('Camera is denied until the user grants it',()=>{const c=new Contents('https://example.com/page');assert.equal(check(c,'video'),false);const r=request(c,'media',['video']);assert.deepEqual(r,[]);allow(c);assert.deepEqual(r,[true]);assert.equal(check(c,'video'),true);assert.equal(check(c,'audio'),false)})
run('Audio/video grants combine without adding unrequested types',()=>{const c=new Contents('https://combined.test');let r=request(c);allow(c);assert.deepEqual(r,[true]);r=request(c,'media',['video']);allow(c);assert.deepEqual(r,[true]);assert.deepEqual(request(c,'media',['audio','video']),[true]);assert.equal(check(c,'unknown'),true)})
run('Exact scheme/port origins do not inherit a grant',()=>{const c=new Contents('http://localhost:8080');request(c);allow(c);for(const url of ['http://localhost:8081','https://localhost:8080'])assert.equal(check(new Contents(url),'audio'),false)})
run('Private sessions do not inherit or export regular grants',()=>{const c=new Contents('https://private.test');request(c);allow(c);assert.equal(check(new Contents(c.url,privateSession),'audio'),false);const p=new Contents('https://private-only.test',privateSession);request(p);allow(p);assert.equal(check(new Contents(p.url),'audio'),false)})
run('Same origin tabs in the same session retain Min grant reuse',()=>{const c=new Contents('https://same.test/one');request(c);allow(c);assert.deepEqual(request(new Contents('https://same.test/two')),[true])})
run('Deny resolves the callback once and removes the request',()=>{const c=new Contents('https://deny.test');const r=request(c);const p=pending(c);ipc.emit('permissionDenied',{sender:ui,senderFrame:ui.mainFrame},p.permissionId);ipc.emit('permissionGranted',{sender:ui},p.permissionId);assert.deepEqual(r,[false]);assert.equal(pending(c),undefined);assert.equal(check(c,'audio'),false)})
run('Navigation rejects pending work and revokes document grants',()=>{const c=new Contents('https://navigate.test');const r=request(c);c.emit('did-start-navigation',{},'https://next.test',false,true);assert.deepEqual(r,[false]);const q=request(c);allow(c);assert.deepEqual(q,[true]);c.emit('did-start-navigation',{},'https://next.test',false,true);assert.equal(check(c,'audio'),false)})
run('Closing a tab settles all concurrent pending callbacks',()=>{const c=new Contents('https://close.test');const one=request(c),two=request(c,'media',['video']);c.dead=true;c.emit('destroyed');assert.deepEqual(one,[false]);assert.deepEqual(two,[false])})
run('Permission navigation listeners are installed only once',()=>{const c=new Contents('https://listeners.test');for(let i=0;i<20;i++)request(c);assert.equal(c.listenerCount('did-start-navigation'),1);assert.equal(c.listenerCount('destroyed'),1)})
run('Other windows and website senders cannot grant a request',()=>{const c=new Contents('https://owner.test');const r=request(c);allow(c,otherUI);assert.deepEqual(r,[]);allow(c,c);assert.deepEqual(r,[]);allow(c,ui,{});assert.deepEqual(r,[]);allow(c);assert.deepEqual(r,[true])})
run('A changed URL cannot accept a stale decision',()=>{const c=new Contents('https://stale.test/one');const r=request(c);c.url='https://stale.test/two';allow(c);assert.deepEqual(r,[false])})
run('Unsupported, opaque, mismatched and subframe requests reject immediately',()=>{const c=new Contents('https://reject.test');assert.deepEqual(request(c,'geolocation'),[false]);assert.deepEqual(request(c,'media',[]),[false]);assert.deepEqual(request(c,'media',['other']),[false]);assert.deepEqual(request(c,'media',['audio'],{isMainFrame:false}),[false]);assert.deepEqual(request(c,'media',['audio'],{requestingUrl:'https://other.test'}),[false]);assert.deepEqual(request(new Contents('file:///tmp/a.html')),[false])})
run('Cross-origin and ambiguous subframe media checks remain denied',()=>{const c=new Contents('https://frame.test');request(c);allow(c);assert.equal(ses.check(c,'media',c.url,{isMainFrame:false,embeddingOrigin:'https://other.test',mediaType:'audio'}),false);assert.equal(ses.check(c,'media',c.url,{isMainFrame:false,mediaType:'audio'}),false)})
run('Screen requests have explicit denial and no automatic source fallback',()=>{const c=new Contents('https://share.test');const r=request(c,'display-capture',[]);const p=pending(c);ipc.emit('permissionDenied',{sender:ui},p.permissionId);assert.deepEqual(r,[false]);let result='pending';ses.display({},value=>{result=value});assert.equal(result,null);assert.equal(ses.opts.useSystemPicker,true)})
console.log(JSON.stringify({status:'passed',checks}))

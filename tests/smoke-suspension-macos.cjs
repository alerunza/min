// Browser plugin unavailable: Playwright Electron, isolated profile and local fixtures.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http");
const { _electron } = require("playwright");
const root = path.resolve(__dirname, ".."),
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "svelto-sleep-qa-"));
const executablePath =
  process.env.SVELTO_TEST_EXECUTABLE ||
  path.join(root, "dist/app/mac-arm64/Svelto.app/Contents/MacOS/Svelto");
const checks = [],
  errors = [];
let app, origin, primaryUI;
const server = http.createServer((req, res) => {
  if (req.url === "/delayed") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(
      "<!doctype html><title>Delayed fixture</title><h1>Loading fixture</h1>"
    );
    setTimeout(
      () =>
        res.end(
          "<p>Finished local loading fixture for the sleeping tab test.</p>"
        ),
      1000
    );
    return;
  }
  if (req.url === "/download") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="sleep-qa.bin"',
      "Content-Length": 1048576,
    });
    res.write(Buffer.alloc(1024));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<!doctype html><title>Sleep fixture " +
      req.url +
      "</title><h1>Sleeping tab verification</h1><p>" +
      req.url +
      '</p><div style="height:6000px;background:linear-gradient(#fff,#d7e1ed)"></div>'
  );
});
const pass = (name) => {
  checks.push({ name, status: "passed" });
  console.log("PASS", name);
};
async function wait(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch (e) {
      if (!e.message.includes("garbage collected")) throw e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + label);
}
async function ui(code, id) {
  return app.evaluate(
    ({ webContents }, { code, id }) =>
      webContents
        .getAllWebContents()
        .find((c) => (id ? c.id === id : c.getURL() === "min://app/index.html"))
        .executeJavaScript(code, true),
    { code, id: id || primaryUI }
  );
}
async function page(id, code) {
  return app.evaluate(
    ({}, { id, code }) =>
      global.getView(id).webContents.executeJavaScript(code, true),
    { id, code }
  );
}
async function loaded(id) {
  await wait(
    () =>
      app.evaluate(
        ({}, id) =>
          !!global.getView(id) &&
          !global.getView(id).webContents.isLoading() &&
          global.getView(id).webContents.getURL().startsWith("http"),
        id
      ),
    "loaded " + id
  );
}
async function add(url) {
  const id = await ui(
    `(()=>{ipc.emit(${JSON.stringify("addTab")},null,{url:${JSON.stringify(
      url
    )}});return tabs.getSelected()})()`
  );
  await loaded(id);
  return id;
}
async function select(id) {
  await ui(
    `if(tabs.getSelected()!==${JSON.stringify(
      id
    )})document.querySelector('.tab-item[data-tab="'+${JSON.stringify(
      id
    )}+'"]').click();true`
  );
  await loaded(id);
}
async function sleep(id) {
  return ui(`ipc.invoke('sleepTab',${JSON.stringify(id)})`);
}
async function checkBlocked(id, reason) {
  const r = await sleep(id);
  assert.equal(r.ok, false);
  assert.match(r.reason, reason);
  assert.equal(
    await app.evaluate(
      ({}, id) => !global.getView(id).webContents.isDestroyed(),
      id
    ),
    true
  );
}
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  origin = "http://127.0.0.1:" + server.address().port;
  fs.writeFileSync(
    path.join(profile, "settings.json"),
    JSON.stringify({ startupTabOption: 1 })
  );
  app = await _electron.launch({
    executablePath,
    cwd: root,
    args: ["--debug-browser", "--use-fake-device-for-media-stream"],
    env: { ...process.env, SVELTO_USER_DATA_DIR: profile },
    timeout: 60000,
  });
  app.process().stderr.on("data", (d) => {
    if (String(d).includes("QA_MAIN")) console.error(String(d));
  });
  await app.evaluate(() => {
    global.qaMainErrors = [];
    process.removeAllListeners("uncaughtException");
    process.on("uncaughtException", (e) => {
      qaMainErrors.push(e.stack);
      console.error("QA_MAIN", e.stack);
    });
    return true;
  });
  await wait(() => ui("!!tasks.getSelected()"), "UI");
  primaryUI = await app.evaluate(
    ({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((c) => c.getURL() === "min://app/index.html").id
  );
  const observe = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.dismiss().catch(() => {}));
  };
  for (const p of app.context().pages()) observe(p);
  app.context().on("page", observe);
  assert.equal(
    await ui(
      'document.title.includes("Svelto") && document.querySelectorAll(".tab-item").length>0'
    ),
    true
  );
  const target = await add(origin + "/first"),
    anchor = await add(origin + "/anchor");
  await checkBlocked(anchor, /active/);
  pass("The active tab is protected");
  const privateId = await ui("ipc.emit('addPrivateTab');tabs.getSelected()");
  await app.evaluate(
    ({}, { id, url }) => global.getView(id).webContents.loadURL(url),
    { id: privateId, url: origin + "/private" }
  );
  await loaded(privateId);
  await select(anchor);
  await checkBlocked(privateId, /Private/);
  pass("Private tabs stay awake");
  await page(
    target,
    `document.body.insertAdjacentHTML('afterbegin','<input id="draft"><textarea id="text"></textarea>');document.getElementById('draft').value='Unsaved draft';true`
  );
  await checkBlocked(target, /unsaved/);
  assert.equal(
    await page(target, "document.getElementById('draft').value"),
    "Unsaved draft"
  );
  pass("Changed form values are retained and block sleep");
  await page(
    target,
    "document.querySelectorAll('input,textarea').forEach(e=>e.remove());document.body.insertAdjacentHTML('afterbegin','<div contenteditable>Editor</div>');true"
  );
  await checkBlocked(target, /unsaved/);
  await page(
    target,
    "document.querySelector('[contenteditable]').remove();document.body.insertAdjacentHTML('afterbegin','<iframe src=\"about:blank\"></iframe>');true"
  );
  await checkBlocked(target, /unsaved/);
  await page(
    target,
    "document.querySelector('iframe').remove();document.body.insertAdjacentHTML('afterbegin','<canvas></canvas>');true"
  );
  await checkBlocked(target, /unsaved/);
  await page(target, "document.querySelector('canvas').remove();true");
  pass("Editors, embedded frames and canvas pages fail closed");
  await page(target, "window.onbeforeunload=()=> 'Keep this draft';true");
  await checkBlocked(target, /unsaved/);
  await page(target, "window.onbeforeunload=null;true");
  pass("A native beforeunload veto prevents destruction");
  await page(
    target,
    `(()=>{const ac=new AudioContext();const osc=ac.createOscillator();osc.connect(ac.destination);osc.start();window.qaAudio={ac,osc};return ac.resume()})()`
  );
  await wait(
    () =>
      app.evaluate(
        ({}, id) => global.getView(id).webContents.isCurrentlyAudible(),
        target
      ),
    "audible"
  );
  await checkBlocked(target, /media/);
  await page(target, "qaAudio.osc.stop();qaAudio.ac.close();true");
  await new Promise((r) => setTimeout(r, 2500));
  pass("Active Web Audio is protected");
  await app.evaluate(
    ({}, { id, url }) => global.getView(id).webContents.loadURL(url),
    { id: target, url: origin + "/permission" }
  );
  await loaded(target);
  await select(target);
  // Pending camera permission stops sleep before any native grant is given.
  await page(
    target,
    "navigator.mediaDevices.getUserMedia({video:true}).catch(()=>{});true"
  );
  await wait(
    () =>
      ui(
        `!!document.querySelector('.tab-item[data-tab="${target}"] .permission-request-icon')`
      ),
    "permission request"
  );
  await select(anchor);
  await checkBlocked(target, /permission/);
  pass("Pending capture permission protects the page");
  await app.evaluate(
    ({}, { id, url }) => global.getView(id).webContents.loadURL(url),
    { id: target, url: origin + "/first" }
  );
  await loaded(target);
  await app.evaluate(
    ({}, { id, file }) => {
      const c = global.getView(id).webContents;
      c.session.once("will-download", (e, item) => item.setSavePath(file));
      c.downloadURL(c.getURL().replace("/first", "/download"));
    },
    { id: target, file: path.join(profile, "download.bin") }
  );
  await new Promise((r) => setTimeout(r, 500));
  await checkBlocked(target, /download/);
  await ui(
    `ipc.send('cancelDownload',${JSON.stringify(
      path.join(profile, "download.bin")
    )});true`
  );
  await new Promise((r) => setTimeout(r, 500));
  pass("A live download protects its source tab");
  await select(target);
  await page(
    target,
    `location.href=${JSON.stringify(origin + "/second")};true`
  );
  await wait(() => page(target, 'location.pathname==="/second"'), "second URL");
  await loaded(target);
  await page(target, `location.href=${JSON.stringify(origin + "/third")};true`);
  await wait(() => page(target, 'location.pathname==="/third"'), "third URL");
  await loaded(target);
  await app.evaluate(
    ({}, id) => global.getView(id).webContents.navigationHistory.goBack(),
    target
  );
  await wait(() => page(target, 'location.pathname==="/second"'), "back URL");
  await loaded(target);
  await page(target, 'window.scrollTo(0,900);window.qaEphemeral="live";true');
  await app.evaluate(
    ({}, id) => global.getView(id).webContents.setAudioMuted(true),
    target
  );
  await ui(`tabs.update(${JSON.stringify(target)},{muted:true});true`);
  await select(anchor);
  const before = await ui("tabs.get().map(t=>({id:t.id,url:t.url}))"),
    wcBefore = await app.evaluate(
      ({}, id) => global.getView(id).webContents.id,
      target
    );
  await ui(
    "window.qaMenu=null;const original=ipc.send.bind(ipc);ipc.send=function(channel,...args){if(channel==='open-context-menu'){qaMenu=args[0];return}return original(channel,...args)};true"
  );
  const menuPage = app
    .context()
    .pages()
    .find((p) => p.url() === "min://app/index.html");
  await menuPage
    .locator('.tab-item[data-tab="' + target + '"]')
    .dispatchEvent("contextmenu");
  const menu = await ui("qaMenu");
  const action = menu.template
    .flat()
    .find((item) => item.label?.startsWith("Sleep tab"));
  assert.equal(action.enabled, true);
  await ui(
    `ipc.emit('context-menu-item-selected',null,{menuId:${menu.id},itemId:${action.click}});true`
  );
  await wait(
    () =>
      ui(
        `tabs.get(${JSON.stringify(
          target
        )}).sleeping && !tabs.get(${JSON.stringify(target)}).hasWebContents`
      ),
    "sleep flag"
  );
  assert.equal(
    await app.evaluate(
      ({ webContents }, id) =>
        webContents.getAllWebContents().some((c) => c.id === id),
      wcBefore
    ),
    false
  );
  assert.deepEqual(
    await ui("tabs.get().map(t=>({id:t.id,url:t.url}))"),
    before
  );
  assert.equal(
    await ui(
      `document.querySelector('[data-tab="${target}"]').classList.contains('is-sleeping')`
    ),
    true
  );
  pass("Sleep destroys page contents while retaining ordered tab IDs and URLs");
  // Capture the Quiet tab state on a meaningful new-tab GUI surface.
  const blank = await ui(
    `(()=>{ipc.emit('addTab',null,{url:''});return tabs.getSelected()})()`
  );
  const gui = app
    .context()
    .pages()
    .find((p) => p.url() === "min://app/index.html");
  await gui.keyboard.press("Escape");
  await app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()
      .find((w) => w.isVisible())
      .setContentSize(1100, 760)
  );
  await gui.waitForTimeout(300);
  await app.evaluate(({ webContents }) => {
    const c = webContents
      .getAllWebContents()
      .find((c) => c.getURL() === "min://app/index.html");
    c.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    c.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  });
  await gui.waitForTimeout(200);
  assert.equal(
    await ui(
      "document.querySelector('.tab-item.is-sleeping')!==null && document.getElementById('tab-editor').getBoundingClientRect().height===0"
    ),
    true
  );
  await gui.screenshot({ path: "/private/tmp/svelto-sleep-light.png" });
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "dark";
  });
  await wait(() => ui("window.isDarkMode === true"), "real dark theme");
  await gui.waitForTimeout(250);
  await gui.screenshot({ path: "/private/tmp/svelto-sleep-dark.png" });
  await app.evaluate(({ BaseWindow }) =>
    BaseWindow.getAllWindows()
      .find((w) => w.isVisible())
      .setContentSize(720, 620)
  );
  await gui.screenshot({ path: "/private/tmp/svelto-sleep-narrow.png" });
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = "light";
  });
  await wait(() => ui("window.isDarkMode === false"), "real light theme");
  await menuPage
    .locator('.tab-item[data-tab="' + target + '"] .tab-audio-button')
    .click();
  assert.equal(await ui(`tabs.get(${JSON.stringify(target)}).muted`), false);
  assert.equal(
    await ui(`tabs.get(${JSON.stringify(target)}).hasWebContents`),
    false
  );
  pass("Unmuting a sleeping tab changes its setting without waking it");
  await menuPage.locator('.tab-item[data-tab="' + target + '"]').click();
  await loaded(target);
  await wait(() => page(target, "window.scrollY===900"), "restored scroll");
  assert.equal(await page(target, "window.qaEphemeral"), undefined);
  assert.equal(
    await app.evaluate(
      ({}, id) => global.getView(id).webContents.isAudioMuted(),
      target
    ),
    false
  );
  const nav = await app.evaluate(
    ({}, id) => ({
      entries: global
        .getView(id)
        .webContents.navigationHistory.getAllEntries()
        .map((e) => e.url),
      index: global.getView(id).webContents.navigationHistory.getActiveIndex(),
    }),
    target
  );
  assert.equal(nav.entries[nav.index], origin + "/second");
  assert.equal(nav.entries[nav.index + 1], origin + "/third");
  assert.ok(nav.entries.includes(origin + "/first"));
  assert.equal(await ui(`tabs.get(${JSON.stringify(target)}).sleeping`), false);
  pass(
    "Selection reloads the page and restores scroll, mute, Back and Forward history"
  );
  await ui("ipc.emit('toggleTaskOverlay');true");
  await checkBlocked(target, /active/);
  await ui("ipc.emit('toggleTaskOverlay');true");
  pass("The active tab stays protected while Tasks hides its view");
  const firstUI = await app.evaluate(
    ({ webContents }) =>
      webContents
        .getAllWebContents()
        .find((c) => c.getURL() === "min://app/index.html").id
  );
  const otherTask = await ui("tasks.add()");
  await ui(
    `ipc.send('newWindow',{initialTask:${JSON.stringify(otherTask)}});true`
  );
  await wait(
    () =>
      app.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((c) => c.getURL() === "min://app/index.html").length === 2
      ),
    "second window"
  );
  const otherUI = await app.evaluate(
    ({ webContents }, first) =>
      webContents
        .getAllWebContents()
        .find((c) => c.getURL() === "min://app/index.html" && c.id !== first)
        .id,
    firstUI
  );
  const protectedInOther = await ui(
    `ipc.invoke('sleepTab',${JSON.stringify(target)})`,
    otherUI
  );
  assert.equal(protectedInOther.ok, false);
  assert.match(protectedInOther.reason, /active/);
  await select(anchor);
  assert.equal((await sleep(target)).ok, true);
  await wait(
    () =>
      ui(
        `tasks.getTaskContainingTab(${JSON.stringify(
          target
        )}).tabs.get(${JSON.stringify(target)}).sleeping`,
        otherUI
      ),
    "sleep sync in other Task"
  );
  await select(target);
  await wait(
    () =>
      ui(
        `!tasks.getTaskContainingTab(${JSON.stringify(
          target
        )}).tabs.get(${JSON.stringify(target)}).sleeping`,
        otherUI
      ),
    "wake sync in other Task"
  );
  assert.equal(
    await ui('document.querySelectorAll(".tab-item").length>0', otherUI),
    true
  );
  pass(
    "Sleeping and waking synchronize while another window displays a different Task"
  );
  await app.evaluate(({ BaseWindow, webContents }, id) => {
    const c = webContents.fromId(id);
    const win = BaseWindow.getAllWindows().find((w) =>
      w.getContentView().children.some((v) => v.webContents === c)
    );
    win.close();
  }, otherUI);
  await wait(
    () =>
      app.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((c) => c.getURL() === "min://app/index.html").length === 1
      ),
    "other window close"
  );
  pass("Another window cannot sleep the active page");
  await select(anchor);
  // A native load protects the page, including the window while an async probe runs.
  await app.evaluate(
    ({}, { id, url }) => {
      global
        .getView(id)
        .webContents.loadURL(url)
        .catch(() => {});
    },
    { id: target, url: origin + "/delayed" }
  );
  const r = await sleep(target);
  assert.equal(r.ok, false);
  assert.match(r.reason, /loading/);
  await loaded(target);
  pass("A loading page cannot be discarded");
  await app.evaluate(
    ({}, { id, url }) => global.getView(id).webContents.loadURL(url),
    { id: target, url: origin + "/second" }
  );
  await loaded(target);
  // Race the asynchronous probe with a real tab selection.
  await ui(
    `window.qaSleepRace=ipc.invoke('sleepTab',${JSON.stringify(
      target
    )});document.querySelector('.tab-item[data-tab="${target}"]').click();true`
  );
  const race = await ui("qaSleepRace");
  assert.equal(race.ok, false);
  assert.match(race.reason, /active|changed/);
  assert.equal(
    await page(
      target,
      'document.body.textContent.includes("Sleeping tab verification")'
    ),
    true
  );
  pass("Selecting during the probe cancels sleep");
  await select(anchor);
  assert.equal((await sleep(target)).ok, true);
  await wait(() => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(profile, "sessionRestore.json"), "utf8")
      ).state.tasks.some((t) =>
        t.tabs.some((t) => t.id === target && t.sleeping)
      );
    } catch {
      return false;
    }
  }, "sleep checkpoint");
  assert.deepEqual(await app.evaluate(() => global.qaMainErrors), []);
  await app.evaluate(({ app }) => {
    setTimeout(() => app.quit(), 50);
  });
  await app.waitForEvent("close");
  app = null;
  primaryUI = null;
  app = await _electron.launch({
    executablePath,
    cwd: root,
    args: ["--debug-browser", "--use-fake-device-for-media-stream"],
    env: { ...process.env, SVELTO_USER_DATA_DIR: profile },
    timeout: 60000,
  });
  await wait(
    () => ui(`!!tabs.get(${JSON.stringify(target)})`),
    "restored sleeping tab"
  );
  assert.equal(await ui(`tabs.get(${JSON.stringify(target)}).sleeping`), true);
  await select(target);
  assert.equal(await page(target, "location.pathname"), "/second");
  pass("Sleeping tab intent survives restart and selection wakes it");
  assert.deepEqual(await app.evaluate(() => global.qaMainErrors || []), []);
  assert.deepEqual(errors, []);
  pass("Meaningful Quiet UI renders without GUI JavaScript errors");
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "output/suspension-results.json"),
    JSON.stringify(
      {
        status: "passed",
        checks,
        errors,
        environment: {
          executablePath,
          platform: process.platform,
          arch: process.arch,
        },
      },
      null,
      2
    )
  );
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) {
      const closed = app.waitForEvent("close", { timeout: 10000 });
      app.process().kill("SIGKILL");
      await closed.catch(() => {});
    }
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(profile, { recursive: true, force: true });
  });

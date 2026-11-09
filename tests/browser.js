// browser.js - a headless Chromium (Chrome, Chromium or Edge) for the layout checks, driven over the Chrome DevTools
// Protocol with nothing but Node: its global WebSocket (Node 22 or later) and child_process. No npm package.
//
//   const browser = require('./browser.js');
//   browser.find()                          the browser it would use, or null
//   const b = await browser.launch();       throws when there is none, or it does not start
//   const page = await b.page({ width, height });
//   await page.evaluate('document.title')   awaits a promise, returns the value as JSON gives it
//   await b.close()                         always: it kills the browser and deletes its profile
//
// The browser is the one JITA_BROWSER names, else CHROME_BIN's, else the first found where each platform keeps them
// (GitHub's ubuntu-latest has google-chrome on its PATH). It starts headless with a profile of its own in the temp folder
// and --remote-debugging-port=0, and the port it picked is read from DevToolsActivePort in that profile: nothing is read
// from its stdout, which on Windows (headless Edge from Git Bash) did not come reliably. Every host name resolves to
// nothing, so the page cannot reach the network.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');

function executable(f) {
    try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch (e) { return false; }
}
function onPath(name) {
    const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const d of dirs) { const f = path.join(d, name); if (executable(f)) { return f; } }
    return null;
}
// Where each platform keeps a Chromium. Chrome first, as CI runs Chrome; Edge is what every Windows machine has.
function candidates() {
    if (process.platform === 'win32') {
        const env = process.env, roots = [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LOCALAPPDATA']].filter(Boolean);
        const out = [];
        roots.forEach((r) => { out.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')); });
        if (env['LOCALAPPDATA']) { out.push(path.join(env['LOCALAPPDATA'], 'Chromium', 'Application', 'chrome.exe')); }
        out.push('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
        roots.forEach((r) => { out.push(path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')); });
        return out;
    }
    if (process.platform === 'darwin') {
        return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
    }
    return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']
        .map((n) => onPath(n)).filter(Boolean)
        .concat(['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']);
}
// The browser to use, or null. JITA_BROWSER is taken as it is: one that is not there finds nothing, rather than another.
function find() {
    if (process.env.JITA_BROWSER) { return executable(process.env.JITA_BROWSER) ? process.env.JITA_BROWSER : null; }
    return [process.env.CHROME_BIN].filter(Boolean).concat(candidates()).filter(executable)[0] || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch (e) { /* the temp folder's cleanup gets it */ } };
const PROFILE = /^jita-browser-(\d+)-/;   // a profile's folder: jita-browser-<pid of the node that started it>-<random>
// Kill whatever runs with the profile `name`: the browser itself, when its pid is not known.
function killProfile(name) {
    if (process.platform === 'win32') {
        spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + name +
            "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore', windowsHide: true });
    } else { spawnSync('pkill', ['-9', '-f', name], { stdio: 'ignore' }); }
}
// A check killed from outside (a runner's timeout) cannot clean up after itself, and its browser may run on. So a launch
// first clears away every profile whose node is gone, with whatever still runs in it.
function sweep() {
    let names = [];
    try { names = fs.readdirSync(os.tmpdir()); } catch (e) { return; }
    names.forEach((n) => {
        const m = PROFILE.exec(n);
        if (!m || +m[1] === process.pid || alive(+m[1])) { return; }
        killProfile(n);
        rm(path.join(os.tmpdir(), n));
    });
}

// One DevTools connection, with the pages attached to it as flat sessions. Every call times out rather than hang.
class Cdp {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.calls = new Map(); this.listeners = []; this.closed = false;
        ws.addEventListener('message', (ev) => this._message(ev.data));
        ws.addEventListener('close', () => this._end(new Error('the DevTools connection closed')));
        ws.addEventListener('error', () => this._end(new Error('the DevTools connection failed')));
    }
    _message(data) {
        let m;
        try { m = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8')); } catch (e) { return; }
        if (m.id != null && this.calls.has(m.id)) {
            const c = this.calls.get(m.id);
            this.calls.delete(m.id);
            clearTimeout(c.timer);
            if (m.error) { c.reject(new Error(c.method + ': ' + (m.error.message || JSON.stringify(m.error)))); } else { c.resolve(m.result || {}); }
            return;
        }
        if (m.method) { this.listeners.forEach((fn) => { try { fn(m); } catch (e) { /* a listener's own problem */ } }); }
    }
    _end(err) {
        this.closed = true;
        this.calls.forEach((c) => { clearTimeout(c.timer); c.reject(err); });
        this.calls.clear();
    }
    send(method, params, sessionId, timeoutMs) {
        if (this.closed) { return Promise.reject(new Error(method + ': the DevTools connection is closed')); }
        const id = ++this.id, msg = { id: id, method: method, params: params || {} };
        if (sessionId) { msg.sessionId = sessionId; }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.calls.delete(id); reject(new Error(method + ': no answer in ' + (timeoutMs || 30000) + ' ms')); }, timeoutMs || 30000);
            this.calls.set(id, { resolve: resolve, reject: reject, timer: timer, method: method });
            try { this.ws.send(JSON.stringify(msg)); } catch (e) { clearTimeout(timer); this.calls.delete(id); reject(new Error(method + ': ' + (e && e.message || e))); }
        });
    }
    on(fn) { this.listeners.push(fn); }
}

// The text of an exception the page threw, with where it was thrown.
function describe(d) {
    if (!d) { return 'an exception'; }
    const where = d.url ? (' (' + d.url + ':' + ((d.lineNumber || 0) + 1) + ')') : '';
    return ((d.exception && (d.exception.description || d.exception.value)) || d.text || 'an exception') + where;
}

class Page {
    constructor(cdp, sessionId, targetId) {
        this.cdp = cdp; this.sessionId = sessionId; this.targetId = targetId;
        this.errors = [];    // what the page threw and did not catch, and its console errors: a failing check prints them
        cdp.on((m) => {
            if (m.sessionId !== sessionId) { return; }
            if (m.method === 'Runtime.exceptionThrown') { this.errors.push(describe(m.params.exceptionDetails)); }
            if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
                this.errors.push('console.error: ' + (m.params.args || []).map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' '));
            }
        });
    }
    send(method, params, timeoutMs) { return this.cdp.send(method, params, this.sessionId, timeoutMs); }
    // Evaluate script in the page's global scope, as a classic script runs there: its top-level var and function
    // declarations become globals. A promise is waited for; the value comes back as JSON would carry it.
    async evaluate(expression, timeoutMs) {
        const r = await this.send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true, userGesture: true }, timeoutMs);
        if (r.exceptionDetails) { throw new Error(describe(r.exceptionDetails)); }
        return r.result ? r.result.value : undefined;
    }
    // Load html as the page's document (a data: URL, so it has a doctype and renders in standards mode), and wait for it.
    async load(html) {
        await this.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
        for (let i = 0; i < 400; i++) {
            const st = await this.evaluate("location.protocol + ' ' + document.readyState").catch(() => '');
            if (st === 'data: complete') { return; }
            await sleep(25);
        }
        throw new Error('the page did not load in 10 s');
    }
    close() { return this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {}); }
}

class Browser {
    constructor(proc, dir) { this.proc = proc; this.dir = dir; this.cdp = null; this.exited = false; this.code = null; this.pid = null; }
    // A fresh page: a target of its own, so every page starts with a realm of its own. Its viewport is fixed, so the
    // layout does not depend on the window the platform gives a headless browser.
    async page(opts) {
        const o = opts || {};
        const t = await this.cdp.send('Target.createTarget', { url: 'about:blank' });
        const a = await this.cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
        const page = new Page(this.cdp, a.sessionId, t.targetId);
        await page.send('Runtime.enable');
        await page.send('Page.enable');
        await page.send('Emulation.setDeviceMetricsOverride', { width: o.width || 1400, height: o.height || 1000, deviceScaleFactor: 1, mobile: false });
        return page;
    }
    // What it is, as it says: "HeadlessChrome/131.0.6778.85" and the like.
    async version() { const v = await this.cdp.send('Browser.getVersion').catch(() => null); return (v && v.product) || '?'; }
    // Whether anything of it still runs: the process started, or the browser it handed over to.
    running() { return !this.exited || (!!this.pid && alive(this.pid)); }
    // Close the browser, kill it if it will not go, and delete its profile. Safe to call twice.
    async close() {
        if (this._closing) { return this._closing; }
        this._closing = (async () => {
            if (this.cdp && !this.cdp.closed) {
                await this.cdp.send('Browser.close', {}, null, 5000).catch(() => {});
                for (let i = 0; i < 100 && !this.cdp.closed; i++) { await sleep(50); }
            }
            for (let i = 0; i < 60 && this.running(); i++) { await sleep(50); }
            kill(this);
            try { if (this.cdp) { this.cdp.ws.close(); } } catch (e) { /* already closed */ }
            for (let i = 0; i < 40 && this.running(); i++) { await sleep(50); }
            rm(this.dir);
            live.delete(this);
        })();
        return this._closing;
    }
}

function alive(pid) {
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
// The browsers still running, killed when this process exits however it exits: a crashed check leaves none behind.
// The process started may not be the browser: on Windows msedge.exe can hand over to another process and exit at once
// (code 0), so the browser's own pid is asked for once connected, and both are killed, each with its children.
const live = new Set();
function kill(b) {
    [b.exited ? null : b.proc.pid, b.pid].filter((pid, i, all) => pid && all.indexOf(pid) === i && alive(pid)).forEach((pid) => {
        if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); }
        else { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
    });
    // Handed over before its pid was known (it never connected): whatever runs with this profile is it.
    if (b.exited && b.code === 0 && !b.pid) { killProfile(path.basename(b.dir)); }
}
process.on('exit', () => { live.forEach((b) => { kill(b); rm(b.dir); }); });
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => process.exit(130)));

async function launch(opts) {
    const o = opts || {}, exe = o.executable || find();
    if (!exe) { throw new Error('no Chrome, Chromium or Edge found (set JITA_BROWSER to one)'); }
    if (typeof WebSocket !== 'function') { throw new Error('this Node has no global WebSocket: the layout checks need Node 22 or later'); }
    sweep();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jita-browser-' + process.pid + '-'));
    const args = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--remote-allow-origins=*',
        '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--disable-sync', '--disable-background-networking',
        '--disable-component-update', '--disable-default-apps', '--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1400,1000'];
    if (process.platform === 'linux') { args.push('--no-sandbox', '--disable-dev-shm-usage'); }   // CI's containers and AppArmor
    args.push('about:blank');
    const proc = spawn(exe, args, { stdio: 'ignore', windowsHide: true });
    const b = new Browser(proc, dir);
    live.add(b);
    let failed = null;
    proc.on('error', (e) => { failed = e; b.exited = true; });
    proc.on('exit', (code) => { b.exited = true; b.code = code; });
    try {
        const file = path.join(dir, 'DevToolsActivePort'), until = Date.now() + (o.timeoutMs || 30000);
        let port = null, target = null;
        while (!port) {
            if (failed) { throw failed; }
            // A launcher that handed over exits with 0, and the browser it started writes the file; any other exit is a failure.
            if (b.exited && b.code !== 0) { throw new Error('the browser exited at once (code ' + b.code + ')'); }
            if (Date.now() > until) { throw new Error('the browser wrote no DevToolsActivePort in ' + ((o.timeoutMs || 30000) / 1000) + ' s'); }
            try {
                const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
                if (/^\d+$/.test(lines[0]) && /^\/devtools\/browser\//.test(lines[1] || '')) { port = lines[0]; target = lines[1]; }
            } catch (e) { /* not written yet */ }
            if (!port) { await sleep(50); }
        }
        const ws = new WebSocket('ws://127.0.0.1:' + port + target);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('could not connect to the browser in 10 s')), 10000);
            ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
            ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('could not connect to the browser')); });
        });
        b.cdp = new Cdp(ws);
        const info = await b.cdp.send('SystemInfo.getProcessInfo', {}, null, 10000).catch(() => null);
        const own = info && (info.processInfo || []).filter((p) => p.type === 'browser')[0];
        if (own && own.id) { b.pid = own.id; }
        return b;
    } catch (e) {
        kill(b);
        for (let i = 0; i < 40 && b.running(); i++) { await sleep(50); }
        rm(dir);
        live.delete(b);
        throw e;
    }
}

module.exports = { find: find, launch: launch };

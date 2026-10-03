// boot-check.js - the script loads on a bug report opened from a link or a reload (v3.40.1). When the breadcrumb is
// already on the page at load, waitForKeyElements runs checkIssueType -> addButtons on the spot, inside the script's
// own top-level code. Since v3.38.16 addButtons read jitaConvertBusy, which was declared further down and so still
// undefined then: the TypeError escaped the top level and nothing after it loaded (no JiTA, no panel, no pills).
// Runs the real file from its first line to that call in a fresh context - every function declared, every later
// var still undefined, exactly as in the browser - and checks the vendored waitForKeyElements on its own.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const CALL = '\nwaitForKeyElements (issueItem, checkIssueType);\n';
const at = src.indexOf(CALL);
if (at < 0 || src.indexOf(CALL, at + 1) >= 0) { throw new Error('could not find the first issue check exactly once'); }

// ---- the declaration order, said plainly ----
const decl = src.indexOf('\nvar jitaConvertBusy = {};\n');
ok('the Convert busy map is set up before the first call that can add the buttons', decl >= 0 && decl < at,
    'declared at ' + decl + ', first issue check at ' + at);

// ---- the real start-up, stopped right after the first issue check ----
// A small jQuery: every selector matches one element except an id (so each button is added), and the calls the
// start-up makes are recorded.
const STOP = '__BOOT_STOP__';
const seen = { errors: [], added: [], disabled: [] };
function $(sel) {
    const isId = typeof sel === 'string' && sel.charAt(0) === '#';
    const own = {
        length: isId ? 0 : 1,
        text: () => 'EBR-70152',
        attr: () => 'cls',
        data: () => undefined,
        each: (fn) => { fn.call({}); return proxy; },
        after: (b) => { seen.added.push(b); return proxy; },
        prop: (k, v) => { if (sel === '#convertToDefectButton' && k === 'disabled') { seen.disabled.push(v); } return proxy; }
    };
    const proxy = new Proxy(own, { get: (t, p) => (p in t ? t[p] : () => proxy) });
    return proxy;
}
$.trim = (s) => String(s == null ? '' : s).trim();
const store = {};
const ctx = {
    $, location: { hostname: 'fenriscreations.atlassian.net', pathname: '/browse/EBR-70152' },
    GM_getValue: (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d),
    GM_setValue: (k, v) => { store[k] = v; },
    GM_addValueChangeListener: () => {}, GM_registerMenuCommand: () => {}, GM_addStyle: () => {},
    setInterval: () => 1, clearInterval: () => {},
    console: { log: () => {}, warn: () => {}, error: function () { seen.errors.push([].slice.call(arguments).map(String).join(' ')); } }
};
let stopped = null;
// The whole file, so every function declared further down is hoisted as in the browser; the throw stops it there.
try { vm.runInNewContext(src.slice(0, at + CALL.length) + 'throw "' + STOP + '";\n' + src.slice(at + CALL.length), ctx, { filename: 'JiTA.user.js' }); }
catch (e) { stopped = e; }
ok('the start-up gets past the first issue check with the breadcrumb already on the page', stopped === STOP, String(stopped && (stopped.stack || stopped)));
ok('...without an error along the way', seen.errors.length === 0, seen.errors.join(' | '));
ok('the four buttons are added on the spot', seen.added.length === 4, seen.added.length + ' added');
ok('...and Convert to Defect is set from the busy map: enabled, as nothing converts yet', seen.disabled.length === 1 && seen.disabled[0] === false, JSON.stringify(seen.disabled));

// ---- waitForKeyElements: a callback that throws stays inside it ----
const ws = src.indexOf('function waitForKeyElements('), we = src.indexOf('\n}\n', ws);
if (ws < 0 || we < 0) { throw new Error('could not slice waitForKeyElements'); }
const logged = [], calls = [], els = [{ id: 'a', d: {} }, { id: 'b', d: {} }];
const wctx = {
    JITA_NO_JIRA_UI: false, setInterval: () => 1, clearInterval: () => {},
    console: { error: function () { logged.push([].slice.call(arguments).map(String).join(' ')); } },
    $: (x) => (typeof x === 'string'
        ? { length: els.length, each: (fn) => { els.forEach((el) => fn.call(el)); } }
        : { id: x.id, data: (k, v) => { if (v === undefined) { return x.d[k]; } x.d[k] = v; } })
};
vm.runInNewContext(src.slice(ws, we + 2), wctx);
const act = (j) => { calls.push(j.id); if (j.id === 'a') { throw new Error('boom'); } };
let escaped = null;
try { wctx.waitForKeyElements('.thing', act); } catch (e) { escaped = e; }
ok('a callback that throws does not escape waitForKeyElements', escaped === null, String(escaped));
ok('...the next element is still handled', calls.join() === 'a,b', calls.join());
ok('...the failure is logged, with the selector', logged.length === 1 && /\.thing/.test(logged[0]) && /boom/.test(logged[0]), logged.join(' | '));
ok('...and the failed element counts as handled, so it is not retried every poll', els[0].d.alreadyFound === true, JSON.stringify(els[0].d));
wctx.waitForKeyElements('.thing', act);
ok('a second pass leaves both elements alone', calls.join() === 'a,b' && logged.length === 1, calls.join() + ' / ' + logged.length);

console.log(fail ? '\nFAILURE: ' + fail + ' check(s) failed' : '\nall boot checks passed');
process.exit(fail ? 1 : 0);

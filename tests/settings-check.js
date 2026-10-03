// settings-check.js - Settings and the corner pills (v3.38.21). Evals the real code against stubs:
//  - Clear ledger reports a refused DELETE for its key and still resets the mirror and the scheduler, and anything
//    else that goes wrong re-enables the button with the reason (it used to hang on "Clearing the ledgers…")
//  - the Lead chip is taken down once resolveMe() finds the account is not a Lead
//  - a tab on an older version never moves the What's new "seen" mark back
//  - async Settings completions check that their own status line is still on the page
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setImmediate(r)); } };

(async () => {
    // ================= Clear ledger =================
    let store = {}, metas = [], deletes = [], refuse = null, schedGone = false;
    global.gmSet = (k, v) => { store[k] = v; };
    global.confirm = () => true;
    const L = {
        LEDGER_KEY: 'wiki', QC_LEDGER_KEY: 'qc', SNOOZE_KEY: 'snooze', ledgerPage: () => '123',
        _ym: () => '2026-10', _prevYm: () => '2026-09',
        wiki: { localKey: (m) => 'wikiMirror:' + m }, qc: { localKey: (m) => 'qcMirror:' + m, _actorCache: { x: 1 } },
        pool: { CACHE_KEY: 'pool' }, ui: { _wiki: 1, _qc: 1, _qcWarm: 1 }
    };
    Object.defineProperty(L, 'sched', { get: () => { if (schedGone) { throw new Error('scheduler unavailable'); } return { LAST_KEY: 'last', FAIL_KEY: 'failTs' }; } });
    global.JiTA = {
        leadduty: L,
        conf: {
            getProperty: (page, key) => Promise.resolve({ id: key + '-id' }),
            deleteProperty: (page, id) => { deletes.push(id); return id === refuse ? Promise.reject(new Error('HTTP 403')) : Promise.resolve(); }
        },
        db: { setMeta: (k, v) => { metas.push(k); return Promise.resolve(); } },
        menu: { _live: () => true }
    };
    let disabled = null, status = '';
    global.$wipe = { prop: (k, v) => { disabled = v; return $wipe; } };
    global.$ldStatus = { text: (v) => { if (v === undefined) { return status; } status = v; return $ldStatus; } };
    const wipe = (0, eval)('(' + cut("function () {\n                    var page = JiTA.leadduty.ledgerPage();\n                    if (!confirm('Delete BOTH", '\n                });') + '\n                })');
    refuse = 'qc-id';
    wipe();
    ok('Clear ledger disables its button while it works (control)', disabled === true && /Clearing the ledgers/.test(status));
    await flush();
    ok('a refused delete of one ledger is said for that ledger, and the other is still deleted', /qc: HTTP 403/.test(status) && /wiki: deleted/.test(status) && deletes.join() === 'wiki-id,qc-id', status);
    ok('...the button comes back', disabled === false);
    ok('...and the mirror and the scheduler are reset all the same', metas.length === 3 && store.last === 0 && store.failTs === 0 && L.qc._actorCache && Object.keys(L.qc._actorCache).length === 0,
        metas.join() + ' / ' + JSON.stringify(store));
    status = ''; disabled = null; store = {}; metas = []; deletes = []; refuse = null; schedGone = true;
    wipe();
    await flush();
    ok('anything else that fails stops the wipe with the reason and gives the button back', disabled === false && /clearing stopped: scheduler unavailable/.test(status), status);
    schedGone = false;

    // ================= the Lead chip after resolveMe =================
    let lead = true, mounts = 0, renders = 0, timers = [], settingsOpen = false;
    global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
    global.document = { querySelector: (s) => (s === '#jita-menu.jita-settings-view' && settingsOpen ? {} : null), body: { contains: (n) => !!n.attached } };
    global.JiTA = {
        leadduty: {
            isLead: () => lead, resolveMe: () => Promise.resolve(), syncMirrors: () => Promise.resolve(false),
            sched: { start() {} }, reminder: { mount: () => { mounts++; }, nag() {}, NAG_DELAY_MS: 1 }
        },
        menu: { render: () => { renders++; } }
    };
    (0, eval)(cut('\nfunction jitaArmLeadDuties() {', '\n}\n') + '\n}');
    jitaArmLeadDuties();
    ok('a cached Lead gets the chip at once (control)', mounts === 1, String(mounts));
    lead = false; settingsOpen = true;
    timers.filter((f) => /resolveMe/.test(String(f))).forEach((f) => f());
    await flush();
    ok('once resolveMe() finds the account is not a Lead, the chip is taken down', mounts === 2, String(mounts));
    ok('...and an open Settings is redrawn without the Lead section', renders === 1, String(renders));

    // ================= the What's new seen mark =================
    store = {};
    global.gmGet = (k, d) => (k in store ? store[k] : d);
    let latest = '3.38.15', removed = 0;
    global.JiTA = {
        changelog: { SEEN_KEY: 'jitaChangelogSeen', latest: () => ({ v: latest }), remove: () => { removed++; } },
        worker: {}
    };
    Object.assign(JiTA.worker, eval('({' + cut('    _verCmp: function (a, b) {', '\n    },') + '\n    }})'));
    Object.assign(JiTA.changelog, eval('({' + cut('    markSeen: function () {', '\n    },') + '\n    }})'));
    store.jitaChangelogSeen = '3.38.21';
    JiTA.changelog.markSeen();
    ok('a tab on an older version leaves a newer seen mark alone', store.jitaChangelogSeen === '3.38.21' && removed === 1, store.jitaChangelogSeen);
    latest = '3.38.22';
    JiTA.changelog.markSeen();
    ok('...a newer one moves it forward (control)', store.jitaChangelogSeen === '3.38.22', store.jitaChangelogSeen);
    delete store.jitaChangelogSeen;
    latest = '3.38.10';
    JiTA.changelog.markSeen();
    ok('...and a first-ever mark is set whatever the version', store.jitaChangelogSeen === '3.38.10', String(store.jitaChangelogSeen));

    // ================= Settings completions =================
    global.document = { body: { contains: (n) => !!n.attached } };
    global.JiTA = { menu: {} };
    Object.assign(JiTA.menu, eval('({' + cut('    _live: function ($el) {', '},\n') + '}})'));
    ok('a status line on the page is live, its detached copy after a redraw is not', JiTA.menu._live([{ attached: true }]) === true && JiTA.menu._live([{ attached: false }]) === false && JiTA.menu._live([]) === false);
    const s0 = src.indexOf('    render: function () {\n        var $p = $(\'#jita-menu\');'), s1 = src.indexOf('\n    },\n', s0);
    const body = src.slice(s0, s1);
    ok('no completion in Settings checks only that the menu exists', s0 > 0 && body.indexOf("if (!document.getElementById('jita-menu')") === -1 && (body.match(/JiTA\.menu\._live\(/g) || []).length === 13,
        String((body.match(/JiTA\.menu\._live\(/g) || []).length));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Settings checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });

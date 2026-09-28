// Eval the real JiTA.leadduty.reminder literal: the chip's wording and the once-a-day dialog's gating.
// What is being pinned: the dialog is quiet for 24h after any answer, it never steals an overlay the Lead
// is already using, it keeps its OWN stamp (the chip's x must not suppress tomorrow's dialog), and it stays
// silent on a month that is already done.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const rs = src.indexOf('JiTA.leadduty.reminder = {');
const re = src.indexOf('\n};', rs) + 3;
if (rs < 0 || re < 3) { throw new Error('could not slice JiTA.leadduty.reminder'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const DAY = 24 * 60 * 60 * 1000;
const gm = {};
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.JITA_IS_FORGE_FRAME = false;
// The corner pills share one layer constant (defined at the top of the userscript since v3.28.3).
global.JITA_PILL_Z = Number((src.match(/var JITA_PILL_Z = (\d+);/) || [])[1]);

// Minimal DOM + jQuery: every builder call has to chain, and we capture the text that lands on screen.
let painted = [], overlayOpen = false, uiOpened = false, buttons = {};
function $stub(html) {
    const node = {
        _text: '',
        appendTo() { return node; }, append() { return node; },
        text(t) { if (t === undefined) { return node._text; } node._text = t; painted.push(t); return node; },
        attr() { return node; }, css() { return node; }, prop() { return node; },
        on(ev, fn) { if (/>([^<]+)<\/button>/.test(html)) { buttons[RegExp.$1] = fn; } return node; },
        find() { return node; }, remove() { return node; }, toggle() { return node; }, is() { return false; }
    };
    return node;
}
global.$ = $stub;
// The chip is built with raw DOM calls, so the element stub has to carry enough of one for _paint to find
// its label child and set the text we assert on.
function elStub() {
    const e = {
        style: { cssText: '' }, _attrs: {}, _kids: [], _text: '',
        setAttribute(k, v) { e._attrs[k] = v; },
        addEventListener() {},
        appendChild(c) { e._kids.push(c); },
        querySelector(sel) {
            const m = /\[data-ld="([^"]+)"\]/.exec(sel);
            return m ? (e._kids.filter((c) => c._attrs && c._attrs['data-ld'] === m[1])[0] || null) : null;
        },
        set textContent(v) { e._text = v; painted.push(v); },
        get textContent() { return e._text; }
    };
    return e;
}
global.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: elStub,
    body: { appendChild() {} }
};

let outstanding = { pages: 2, checks: 10, known: true };
let syncCalls = 0, syncImpl = () => Promise.resolve(false);
global.JiTA = {
    menu: { isOpen: () => overlayOpen, close() { overlayOpen = false; }, _openOverlay() { overlayOpen = true; return { $menu: $stub(), close() { overlayOpen = false; } }; } },
    leadduty: {
        SNOOZE_KEY: 'leadDutySnoozeTs', NAG_KEY: 'leadDutyNagTs', SNOOZE_MS: DAY,
        isLead: () => true,
        outstanding: () => Promise.resolve(outstanding),
        syncMirrors: () => { syncCalls++; return syncImpl(); },
        ui: { open() { uiOpened = true; overlayOpen = true; } }
    }
};
eval(src.slice(rs, re));
const R = global.JiTA.leadduty.reminder;

function reset() { painted = []; buttons = {}; overlayOpen = false; uiOpened = false; R._nagged = false; delete gm.leadDutyNagTs; }
const tick = () => new Promise((r) => setTimeout(r, 5));

(async () => {
    // ---- wording (the chip and the dialog share one phrase) ----
    ok('page reviews are named as such', R._summary({ pages: 2, checks: 0 }) === '2 page reviews', R._summary({ pages: 2, checks: 0 }));
    ok('QC checks are named as such', R._summary({ pages: 0, checks: 10 }) === '10 QC checks', R._summary({ pages: 0, checks: 10 }));
    ok('both halves read together', R._summary({ pages: 1, checks: 1 }) === '1 page review, 1 QC check',
        R._summary({ pages: 1, checks: 1 }));
    ok('nothing known to be outstanding is an empty phrase', R._summary({ pages: null, checks: null }) === '');
    ok('the chip names the work', R._label({ pages: 2, checks: 0 }) === '📋 Lead duties: 2 page reviews');
    ok('a finished month reads as all done', R._label({ pages: 0, checks: 0 }) === '📋 Lead duties: all done ✓', R._label({ pages: 0, checks: 0 }));
    ok('unknown counts are not "all done"', R._label({ pages: 0, checks: null }) === '📋 Lead duties', R._label({ pages: 0, checks: null }));

    // ---- the chip ----
    reset();
    R.mount(); await tick();
    ok('the chip names both halves', painted.some((t) => t === '📋 Lead duties: 2 page reviews, 10 QC checks'),
        painted.join(' | '));

    reset();
    outstanding = { pages: 0, checks: 0, known: true };
    R.mount(); await tick();
    ok('a finished month keeps the chip, saying so', painted.some((t) => t === '📋 Lead duties: all done ✓'), painted.join(' | '));
    outstanding = { pages: 2, checks: 10, known: true };

    // ---- the dialog ----
    reset();
    R.nag(); await tick();
    ok('the dialog opens when work is outstanding', overlayOpen);
    ok('it states what is outstanding', painted.some((t) => /2 page reviews, 10 QC checks/.test(t)), painted.join(' | '));
    ok('merely seeing it buys hours of quiet', (gm.leadDutyNagTs || 0) > Date.now(), String(gm.leadDutyNagTs));
    ok('...but less than a day, so a real answer still matters', (gm.leadDutyNagTs || 0) < Date.now() + DAY);
    ok('both answers are offered', !!buttons['Open lead duties'] && !!buttons['Remind me tomorrow'],
        Object.keys(buttons).join(' | '));

    buttons['Remind me tomorrow']();
    ok('"Remind me tomorrow" buys a full day', (gm.leadDutyNagTs || 0) >= Date.now() + DAY - 2000);
    ok('and closes the dialog', !overlayOpen);

    // Once quiet, it stays quiet - a reload or a second tab must not re-nag.
    reset();
    gm.leadDutyNagTs = Date.now() + DAY;
    R.nag(); await tick();
    ok('a quiet stamp suppresses the dialog', !overlayOpen && !painted.length);

    reset();
    R.nag(); await tick();
    const first = overlayOpen;
    overlayOpen = false;
    R.nag(); await tick();
    ok('it fires at most once per session', first && !overlayOpen);

    // Opening the duties from the dialog counts as engaging with it.
    reset();
    R.nag(); await tick();
    buttons['Open lead duties']();
    ok('"Open lead duties" opens the overlay', uiOpened);
    ok('and buys a full day too', (gm.leadDutyNagTs || 0) >= Date.now() + DAY - 2000);

    // It must never steal an overlay the Lead is already working in.
    reset();
    overlayOpen = true;
    R.nag(); await tick();
    ok('an open overlay is never replaced', !painted.length, painted.join(' | '));
    ok('and that does not burn the session (it can nag later)', R._nagged === false);

    // A finished month is silent, and does not spend the quiet stamp either.
    reset();
    outstanding = { pages: 0, checks: 0, known: true };
    R.nag(); await tick();
    ok('a finished month raises no dialog', !overlayOpen && gm.leadDutyNagTs === undefined);
    outstanding = { pages: 2, checks: 10, known: true };

    // The chip's own x is a SEPARATE decision from the dialog's.
    reset();
    gm.leadDutySnoozeTs = Date.now();
    R.nag(); await tick();
    ok('hiding the chip does not suppress the dialog', overlayOpen);
    delete gm.leadDutySnoozeTs;

    // ---- VMS applications: visibility, NOT accountability -------------------------------------------
    // The third duty carries no ledger entry, so it may inform the chip but must never drive the daily
    // dialog, and an unreadable VMS must never summon the chip on its own - a Lead who is simply not
    // logged in would then be nagged every day about a queue nobody can see.
    reset();
    outstanding = { pages: 0, checks: 0, known: true, apps: { ok: true, fresh: 7, second: 4, total: 11 } };
    R.mount(); await tick();
    ok('applications alone can raise the chip', painted.some((t) => /11 applications/.test(t)), painted.join(' | '));

    reset();
    outstanding = { pages: 2, checks: 10, known: true, apps: { ok: true, fresh: 7, second: 4, total: 11 } };
    R.mount(); await tick();
    ok('...and read alongside the other two',
        painted.some((t) => t === '📋 Lead duties: 2 page reviews, 10 QC checks, 11 applications'), painted.join(' | '));

    reset();
    outstanding = { pages: 0, checks: 0, known: true, apps: { ok: false, reason: 'login' } };
    R.mount(); await tick();
    ok('an unreadable VMS does not turn a finished month into work',
        painted.some((t) => t === '📋 Lead duties: all done ✓') && !painted.some((t) => /VMS/.test(t)), painted.join(' | '));

    reset();
    outstanding = { pages: 2, checks: 0, known: true, apps: { ok: false, reason: 'login' } };
    R.mount(); await tick();
    ok('...but a chip already up says the number is missing',
        painted.some((t) => /VMS needs a login/.test(t)), painted.join(' | '));

    reset();
    outstanding = { pages: 0, checks: 0, known: true, apps: { ok: true, fresh: 0, second: 0, total: 0 } };
    R.mount(); await tick();
    ok('an empty application queue is not work', painted.some((t) => t === '📋 Lead duties: all done ✓'), painted.join(' | '));

    reset();
    outstanding = { pages: 0, checks: 0, known: true, apps: { ok: true, fresh: 7, second: 4, total: 11 } };
    R.nag(); await tick();
    ok('applications never raise the daily dialog', !overlayOpen && gm.leadDutyNagTs === undefined,
        'no ledger entry means no accountability nag');
    outstanding = { pages: 2, checks: 10, known: true };

    // ---- counts not known yet (the first minute of a month) ----
    reset();
    outstanding = { pages: null, checks: null, known: false };
    R.mount(); await tick();
    ok('unknown counts keep the chip up with just its name', painted.some((t) => t === '📋 Lead duties'), painted.join(' | '));
    reset();
    R.nag(); await tick();
    ok('unknown counts raise no dialog', !overlayOpen && gm.leadDutyNagTs === undefined);
    reset();
    outstanding = { pages: 0, checks: null, known: true };
    R.nag(); await tick();
    ok('...nor does a half that is known to be done', !overlayOpen && gm.leadDutyNagTs === undefined);

    // ---- the dialog checks the shared ledger before trusting the local copy ----
    // The reported bug: pages reviewed in another browser left the local copy saying "2 page reviews", and the
    // dialog announced them right before the overlay showed the month complete.
    reset(); syncCalls = 0;
    outstanding = { pages: 2, checks: 0, known: true };
    syncImpl = () => { outstanding = { pages: 0, checks: 0, known: true }; return Promise.resolve(true); };
    R.nag(); await tick();
    ok('the dialog reads the shared ledger first', syncCalls === 1, String(syncCalls));
    ok('...and stays quiet when it shows the work done', !overlayOpen && gm.leadDutyNagTs === undefined);
    reset(); syncCalls = 0;
    outstanding = { pages: 2, checks: 0, known: true };
    syncImpl = () => Promise.resolve(false);
    R.nag(); await tick();
    ok('when the ledger has nothing new (or is unreachable) the local count still speaks', overlayOpen);
    reset(); syncCalls = 0;
    gm.leadDutyNagTs = Date.now() + DAY;
    R.nag(); await tick();
    ok('a quiet stamp skips the ledger read too', syncCalls === 0, String(syncCalls));
    outstanding = { pages: 2, checks: 10, known: true };

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'reminder checks passed.'));
    process.exit(fail ? 1 : 0);
})();

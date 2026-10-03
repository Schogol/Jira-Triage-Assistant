// logsig-check.js - the defect badges on a parsed log follow the current index (v3.38.12). rematch() runs after every
// sync while a log is open; it used to clear only the per-row scan marker, so each sync put another [EDR-x] link in
// front of the last one and a match that no longer held kept its badge and highlight. The badge was also inserted by
// rebuilding the whole cell through innerHTML. Evals the real JiTA.logsig.applyToTable / rematch over a fake table.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const slice = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim()); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setTimeout(r, 0));

// ---- a fake table: rows of one cell, each holding text (and, once marked, a badge link) ----
function El(tag) {
    const n = { tagName: tag, kids: [], attrs: {}, title: '', className: '', style: {}, parentNode: null };
    const has = (x) => n.className.split(' ').indexOf(x) >= 0;
    n.classList = {
        add: (...c) => { c.forEach((x) => { if (!has(x)) { n.className = (n.className + ' ' + x).trim(); } }); },
        remove: (...c) => { n.className = n.className.split(' ').filter((x) => x && c.indexOf(x) < 0).join(' '); },
        contains: has
    };
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.removeAttribute = (k) => { delete n.attrs[k]; if (k === 'title') { n.title = ''; } };
    n.insertBefore = (c, ref) => { const i = ref ? n.kids.indexOf(ref) : -1; n.kids.splice(i < 0 ? n.kids.length : i, 0, c); c.parentNode = n; return c; };
    n.removeChild = (c) => { n.kids = n.kids.filter((k) => k !== c); c.parentNode = null; return c; };
    Object.defineProperty(n, 'firstChild', { get: () => n.kids[0] || null });
    Object.defineProperty(n, 'lastElementChild', { get: () => { for (let i = n.kids.length - 1; i >= 0; i--) { if (n.kids[i].tagName) { return n.kids[i]; } } return null; } });
    Object.defineProperty(n, 'textContent', {
        get: () => n.kids.map((k) => (k.tagName ? k.textContent : k.text)).join(''),
        set: (v) => { n.kids = [{ text: String(v) }]; }
    });
    n.querySelectorAll = (sel) => {
        const out = [];
        (function walk(x) { x.kids.forEach((k) => { if (!k.tagName) { return; } if (sel === 'a.jita-sig-link' && k.tagName === 'A' && k.className.split(' ').indexOf('jita-sig-link') >= 0) { out.push(k); } walk(k); }); })(n);
        return out;
    };
    return n;
}
function row(text) { const tr = El('TR'), td = El('TD'); td.kids.push({ text: text }); td.parentNode = tr; tr.kids.push(td); return tr; }
const rows = [row('12:00:01 INFO login ok'), row('EXCEPTION #1 Boom in undock'), row('  at Ship.Undock'), row('EXCEPTION END'), row('12:00:05 INFO done')];
const anchor = rows[1], anchorCell = anchor.lastElementChild, original = anchorCell.kids[0];
rows[0].lastElementChild.title = 'Client log, line 1';   // a tooltip that is not ours
global.document = {
    getElementById: (id) => (id === 'tableContent' ? {} : null),
    querySelectorAll: (sel) => (sel === '#tableContent tbody tr' ? rows : []),
    createElement: (tag) => El(String(tag).toUpperCase())
};

// ---- the index the table is matched against, changed between passes ----
let idx = null, found = null;
const EXACT = { sigMap: { S1: { members: [{ key: 'EDR-1' }] } }, crashMap: { C1: { members: [{ key: 'EDR-2' }] } }, keyToSigs: { 'EDR-1': ['S1'] }, keyToCrash: {} };
const LOOSE = { sigMap: {}, crashMap: { C1: { members: [{ key: 'EDR-2' }] } }, keyToSigs: {}, keyToCrash: { 'EDR-2': ['C1'] } };
const NONE = { sigMap: {}, crashMap: {}, keyToSigs: {}, keyToCrash: {} };
global.JiTA = { logsig: {} };
Object.assign(JiTA.logsig, eval('({' + slice('    applyToTable: function () {') + slice('    rematch: function () {') + '})'), {
    ensure: () => Promise.resolve(idx),
    _fingerprint: (text) => (/Boom/.test(text) ? { sig: 'S1', crashSig: 'C1', msg: 'Boom' } : {}),
    renderPanel: (f) => { found = f; }
});
const links = () => anchor.querySelectorAll('a.jita-sig-link').map((a) => a.textContent).join(',');

(async () => {
    idx = EXACT;
    await JiTA.logsig.applyToTable();
    ok('the first pass badges the exception with its defect', links() === '[EDR-1]' && anchor.classList.contains('sig-hit'), links());
    ok('...in front of the cell\'s own text, which is left as it was rather than rebuilt', anchorCell.kids[1] === original && anchorCell.kids.length === 2);
    ok('...and the panel lists the defect once', found && found['EDR-1'] && found['EDR-1'].count === 1, JSON.stringify(Object.keys(found || {})));

    JiTA.logsig.rematch();
    await flush();
    ok('a sync re-matching the same index leaves one badge, not two', links() === '[EDR-1]', links());
    ok('...one highlight', anchor.className.split(' ').filter((c) => c === 'sig-hit').length === 1, anchor.className);
    ok('...and the panel still counts it once', found['EDR-1'] && found['EDR-1'].count === 1);

    idx = LOOSE;
    JiTA.logsig.rematch();
    await flush();
    ok('when only the crash site matches now, the badge says so instead', links() === '[~EDR-2]', links());
    ok('...with the loose highlight and not the exact one', anchor.classList.contains('sig-hit-loose') && !anchor.classList.contains('sig-hit'), anchor.className);
    ok('...and the tooltip names the new match', /^Possibly related \(same crash site\) · EDR-2$/.test(anchorCell.title), anchorCell.title);

    idx = NONE;
    JiTA.logsig.rematch();
    await flush();
    ok('when nothing matches any more, the badge goes', links() === '' && anchorCell.kids.length === 1 && anchorCell.kids[0] === original, links());
    ok('...and so do the highlight and the tooltip', !anchor.classList.contains('sig-hit') && !anchor.classList.contains('sig-hit-loose') && anchorCell.title === '', anchor.className + ' / ' + anchorCell.title);
    ok('...and the panel lists nothing', found && Object.keys(found).length === 0, JSON.stringify(Object.keys(found || {})));
    ok('a tooltip the log parser put on a cell itself survives every re-match', rows[0].lastElementChild.title === 'Client log, line 1', rows[0].lastElementChild.title);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'log signature checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });

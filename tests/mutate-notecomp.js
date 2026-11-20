// mutate-notecomp.js - breaks each guard of the VMS note composer (v3.53.6, review 2026-11-20 leadduty-logic-1): one note
// at a time for an application, across composers rebuilt meanwhile; a posted note's draft goes whatever is on screen;
// a refused one keeps it; a rebuilt tab is redrawn from the outcome. Requires notecomp-check to go red. A crashed or
// hung harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const N = 'notecomp-check.js';
const muts = [
    [N, 'Ctrl+Enter posts while one is on its way', '            if (U._noteBusy[it.id]) { return; }\n', ''],
    [N, 'nothing is marked on its way', '            U._noteBusy[it.id] = true;\n', ''],
    [N, 'a note that landed keeps the composer locked', '                delete U._noteBusy[it.id];\n', ''],
    [N, 'a posted draft stays when the tab was rebuilt', 'if (res.ok && st.drafts) { delete st.drafts[it.id]; }', ''],
    [N, 'a refused note loses its draft', 'if (res.ok && st.drafts) { delete st.drafts[it.id]; }', 'if (st.drafts) { delete st.drafts[it.id]; }'],
    [N, 'the rebuilt tab is painted as if it were this one', '                if (U._apps !== st) {\n', '                if (false) {\n'],
    [N, 'a rebuilt tab is not redrawn', 'if (on && on.id === it.id) { if (res.ok) { delete cur.qa[it.id]; } U._showApp(cur.idx); }', ''],
    [N, 'a rebuilt tab is redrawn from its old copy', 'if (res.ok) { delete cur.qa[it.id]; } U._showApp(cur.idx);', 'U._showApp(cur.idx);'],
    [N, 'a rebuilt tab redraws whatever application it shows', 'if (on && on.id === it.id) {', 'if (on) {'],
    [N, 'a rebuilt tab says nothing', `U._status(res.ok ? ('✓ Note added on ' + (res.name || target.name) + "'s account.") : ('✗ Note not posted: ' + res.message));`, ''],
    [N, 'a rebuilt composer offers Post while the note is on its way', "        if (U._noteBusy[it.id]) { $post.prop('disabled', true); $msg.text('Sending to VMS…'); }   // posted from the composer this one replaced\n", ''],
    [N, 'a post that throws locks the composer', 'L.apps.addNote(it.id, text, vis).then(landed, function (e) { landed({ ok: false, message: String((e && e.message) || e) }); });', 'L.apps.addNote(it.id, text, vis).then(landed);']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutnc.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutnc.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    // A harness that stops without its last line (a post left waiting forever) went red too.
    if (!/FAILURE|passed/.test(out)) { crashed = true; }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutnc.js')) { fs.unlinkSync('mutnc.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

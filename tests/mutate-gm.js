// mutate-gm.js - breaks each guard of the Convert to Support Ticket flow (v3.38.2) and requires gm-check to go red.
// A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'gm-check.js';
const muts = [
    // ---- the internal note ----
    [H, 'a missing internal-note tab is typed into anyway', 'if (!JiTA.responses._selectInternalNote()) {', 'if (!JiTA.responses._selectInternalNote() && false) {'],
    [H, 'the tab switch is not waited for', 'poll(JiTA.responses._internalNoteActive, 3000, function () {', 'poll(function () { return true; }, 3000, function () {'],
    [H, 'a present tab counts as selected', "{ return tabs[i].getAttribute('aria-selected') === 'true'; }", '{ return true; }'],
    [H, 'no last look before Add', "if (!JiTA.responses._internalNoteActive()) {\n                    resolve({ ok: false, error: 'The composer left", "if (false) {\n                    resolve({ ok: false, error: 'The composer left"],
    // ---- closing the modal stops the conversion ----
    [H, 'the modal is always alive', 'function alive() { return !!(ov.$overlay[0] && ov.$overlay[0].isConnected); }', 'function alive() { return true; }'],
    [H, 'a close during the ticket check is ignored', "if (!alive()) { throw CLOSED; }\n            if (state === 'noticket')", "if (state === 'noticket')"],
    [H, 'a close while the note posts is ignored', 'if (!alive()) { throw CLOSED; }   // closed while the note was posted', '// closed while the note was posted'],
    [H, 'the 20 s fallback closes whatever is open', 'if (alive()) { ov.close(); }', 'ov.close();'],
    [H, 'a failure after the close goes unsaid', "if (invoked) { JiTA.ui.toast('Convert to Support Ticket failed: '", "if (false) { JiTA.ui.toast('Convert to Support Ticket failed: '"],
    [H, 'a backed-out conversion is toasted as failed', "if (invoked) { JiTA.ui.toast('Convert to Support Ticket failed: '", "if (true) { JiTA.ui.toast('Convert to Support Ticket failed: '"],
    [H, 'the automation is never marked as asked for', '                invoked = true;\n', ''],
    [H, 'a closed modal is painted instead', "        }).catch(function (e) {\n            if (!alive()) {", "        }).catch(function (e) {\n            if (false) {"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutg.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutg.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutg.js')) { fs.unlinkSync('mutg.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

// mutate-nogrey.js - breaks the no-grey change (v3.39.5) and requires nogrey-check to go red. A crashed harness
// counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'nogrey-check.js';
const muts = [
    [H, 'the demotion flags the defect closed', "        if (typeof r.pct === 'number') { r.pct = Math.round(r.pct * sf.factor); }\n        // Note:",
        "        if (typeof r.pct === 'number') { r.pct = Math.round(r.pct * sf.factor); }\n        r.closed = true;\n        // Note:"],
    [H, 'the demotion drops its note', "        r.staleNote = 'fixed ' + JiTA.util.humanizeAge(sf.ageDays) + ' before report';\n", ''],
    [H, 'the panel row greys a demoted defect', "        if (r.closed) { $li.addClass('jita-sd-closed'); }", "        if (r.closed || r.staleNote) { $li.addClass('jita-sd-closed'); }"],
    [H, 'the panel row no longer greys a closed report', "        if (r.closed) { $li.addClass('jita-sd-closed'); }", "        if (false) { $li.addClass('jita-sd-closed'); }"],
    [H, 'the panel\'s reporter list keeps the old flag', '                        closed: JiTA.util.isClosedStatus(status)   // grey out closed reports so the open ones stand out',
        '                        stale: JiTA.util.isClosedStatus(status)   // grey out closed reports so the open ones stand out'],
    [H, 'Triage mode\'s reporter list keeps the old flag', '                        closed: JiTA.util.isClosedStatus(status)   // grey the closed ones so the open ones stand out',
        '                        stale: JiTA.util.isClosedStatus(status)   // grey the closed ones so the open ones stand out'],
    [H, 'Triage mode greys a demoted defect', "                    if (r.closed) { $li.addClass('jt-closed'); }", "                    if (r.closed || r.staleNote) { $li.addClass('jt-closed'); }"],
    [H, 'the panel stylesheet keeps the old class', '#jita-sd-list li.jita-sd-closed { opacity: .6; }', '#jita-sd-list li.jita-sd-stale { opacity: .6; }'],
    [H, 'Triage mode\'s stylesheet keeps the old class', "'.jita-triage-view .jt-list li.jt-closed { opacity: .55; }'", "'.jita-triage-view .jt-list li.jt-stale { opacity: .55; }'"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutn.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutn.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutn.js')) { fs.unlinkSync('mutn.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

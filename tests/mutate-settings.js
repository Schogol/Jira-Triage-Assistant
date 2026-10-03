// mutate-settings.js - breaks each Settings / pill fix (v3.38.21) and requires settings-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'settings-check.js';
const muts = [
    [H, 'a refused delete escapes the per-key report', "                        }).catch(function (e) { out.push(key + ': ' + String(e && e.message || e)); });",
        "                        }, function (e) { out.push(key + ': ' + String(e && e.message || e)); });"],
    [H, 'the wipe has no last catch', "                    }).catch(function (e) {\n                        if (!JiTA.menu._live($ldStatus)) { return; }\n                        $wipe.prop('disabled', false);\n                        $ldStatus.text((out.length ? out.join(' · ') + ' · ' : '') + 'clearing stopped: ' + String(e && e.message || e));\n                    });",
        '                    });'],
    [H, 'a stopped wipe keeps its button disabled', "                        $wipe.prop('disabled', false);\n                        $ldStatus.text((out.length ? out.join(' · ') + ' · ' : '') + 'clearing stopped: '",
        "                        $ldStatus.text((out.length ? out.join(' · ') + ' · ' : '') + 'clearing stopped: '"],
    [H, 'a non-Lead keeps the chip', '            try { JiTA.leadduty.reminder.mount(); } catch (e) { /* swallow */ }   // removes the chip for a non-Lead\n', ''],
    [H, 'an open Settings keeps the Lead section', "            try { if (document.querySelector('#jita-menu.jita-settings-view')) { JiTA.menu.render(); } } catch (e) { /* swallow */ }\n            return;\n        }",
        '            return;\n        }'],
    [H, 'the seen mark moves back', 'if (!seen || JiTA.worker._verCmp(C.latest().v, seen) > 0) { gmSet(C.SEEN_KEY, C.latest().v); }', 'gmSet(C.SEEN_KEY, C.latest().v);'],
    [H, 'a detached status line counts as live', '_live: function ($el) { return !!($el && $el[0] && document.body && document.body.contains($el[0])); },', '_live: function ($el) { return true; },'],
    [H, 'a completion checks only for the menu again', 'if (!JiTA.menu._live($wbk)) { return; }', "if (!document.getElementById('jita-menu')) { return; }"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutv.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutv.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutv.js')) { fs.unlinkSync('mutv.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

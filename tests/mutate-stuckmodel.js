// mutate-stuckmodel.js - breaks each guard against a stuck embedding model (v3.58.2) and requires stuckmodel-check to go
// red. A crashed harness counts as red, and so does one that ends without its verdict (a check left hanging).
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'stuckmodel-check.js';
const muts = [
    // ---- the worker's lookup ----
    [H, 'the watchdog never fires', "wd = setTimeout(function () { rej(new Error('the model gave no answer in '", "wd = setTimeout(function () { void (new Error('the model gave no answer in '"],
    [H, 'the watchdog ignores QUERY_MS', 'var ms = cfg.QUERY_MS || 10000, err = null;', 'var ms = 10000, err = null;'],
    [H, 'a failed query keeps its pipeline', '                err = e;\n                dropPipe(p);\n', '                err = e;\n'],
    [H, 'one try only', 'Q_TRIES = 3;', 'Q_TRIES = 1;'],
    [H, 'two tries only', 'Q_TRIES = 3;', 'Q_TRIES = 2;'],
    [H, 'a vector of NaN is taken', "                if (!v || !v.length || !isFinite(v[0])) { throw new Error('the model answered with no usable vector'); }\n", ''],
    [H, 'the graphics card is never left alone', '                if (t === 1) { gpuOff = true; }\n', ''],
    [H, 'the model load ignores gpuOff', '(cfg.tryGpu && !gpuOff) ?', 'cfg.tryGpu ?'],
    [H, 'a failed query is remembered', '                clearTimeout(wd);\n                err = e;\n', '                clearTimeout(wd);\n                err = e; qText = text; qVec = new Float32Array([0, 0]);\n'],
    [H, 'the last vector is not kept', '        if (qText === text && qVec) { return qVec; }\n', ''],
    [H, 'the worker is built without QUERY_MS', 'QUERY_MS: JiTA.embed.QUERY_MS, ', ''],
    // ---- dropPipe and the embed pass ----
    [H, 'a failure drops a pipeline that replaced the failed one', '        if (used && used !== pipe) { return; }\n', ''],
    [H, 'a failed batch drops whichever pipeline is current', 'dropPipe(bp);', 'dropPipe();'],
    [H, 'a batch loads a pipeline of its own', 'embedBatch(texts, bp),', 'embedBatch(texts),'],
    // ---- the tab: why a list is Keyword ----
    [H, 'a failed worker is not logged', "        JiTA.log('[JiTA] ' + key + ' ranked by keywords only, ' + why);\n", ''],
    [H, 'a failed worker gives no reason', '        return fallback(why);\n    });\n};', '        return keywordOnly();\n    });\n};'],
    [H, 'nothing by meaning gives no reason', "return fallback('nothing was found by meaning: no '", "return keywordOnly('nothing was found by meaning: no '"],
    [H, 'Keyword by hand gives no reason', "return kw('switched to by hand');", 'return keywordOnly();'],
    [H, 'no worker gives no reason', "return kw('the ranking worker cannot run in this tab');", 'return keywordOnly();'],
    [H, 'a list drawn waiting gives no reason', "resolve(kw('the ranking worker had not answered after ' + (JiTA.embed.WARM_WAIT_MS / 1000) + ' s; the list switches to Hybrid when it does', true));", 'resolve(keywordOnly());'],
    [H, 'a list drawn waiting is not marked', "the list switches to Hybrid when it does', true));", "the list switches to Hybrid when it does'));"],
    [H, 'a late fallback never corrects the badge', '} else if (res && res.why && JiTA.ui && JiTA.ui._lateWhy) {', '} else if (false) {'],
    // ---- the mode badge ----
    [H, 'the badge hover gives no reason', ".attr('title', (why ? 'Keyword: ' + why + '.\\n' : '') + JiTA.ui.MODE_TIP)", ".attr('title', JiTA.ui.MODE_TIP)"],
    [H, 'a Hybrid badge shows a reason', "var why = out.mode === 'Keyword' ? out.why : '';", 'var why = out.why;'],
    [H, 'the badge never marks a wait', ".attr('data-wait', why && out.wait ? '1' : null);", ".attr('data-wait', null);"],
    [H, 'a late fallback corrects any badge', "var $m = $('#jita-sd-mode[data-wait]');", "var $m = $('#jita-sd-mode');"],
    [H, 'a corrected badge stays marked waiting', "$m.removeAttr('data-wait').attr('title'", "$m.attr('title'"],
    [H, 'a list paints its mode without the reason', 'JiTA.ui._showMode(out);\n                var pick = null;', "$('#jita-sd-mode').text(out.mode);\n                var pick = null;"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutsm.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutsm.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out) || !/passed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutsm.js')) { fs.unlinkSync('mutsm.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

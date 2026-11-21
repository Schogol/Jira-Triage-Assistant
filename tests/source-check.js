// source-check.js - tests/source.js, which finds a piece of JiTA.user.js by its name for the harnesses. First on small
// texts, one rule at a time; then on the whole script: every top-level assignment, every member of every object and
// every function with a name of its own cuts out as code that parses, the members of an object between them cover all
// of its code, and no member runs on into the next. So a change to the script's layout that the rule would cut wrong
// fails here, naming the piece, before any harness that uses it goes wrong. JITA_SOURCE names another copy of
// source.js, as mutate-source.js takes it.
const path = require('path');
const S = require(path.resolve(process.env.JITA_SOURCE || path.join(__dirname, 'source.js')));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

// ---- the rules, on small texts ----
const T = [
    'JiTA.demo = {',
    '    KEY: \'demoKey\',          // a constant with a comment after its comma',
    '    TWO: 2,                   // and one whose comment',
    '                              // runs on below it',
    '    URL: \'https://example.com/a\', // a URL is no comment',
    '    LIST: [\'a\',',
    '        \'b\'],',
    '',
    '    // about css',
    '    css: \'\\',
    '#demo { color: red; }\\',
    '#demo .x { color: blue; }\\',
    '\',',
    '    tpl: `',
    '}',
    '    ` + 1,',
    '    re: function (s) { return s.replace(/[`\'"]/g, \'\'); },',
    '    slash: function (s) { return s.replace(/[/`]/g, \'\'); },',
    '    note: 1,   // a lone ` in a comment',
    '    esc: \'it\\\'s a ` in a string\',',
    '    cmt: function () {',
    '        /* a comment with a ` in it',
    '}  still the comment */',
    '        return 1;',
    '    },',
    '    run: function (a, b) {',
    '        if (a) {',
    '            return b;',
    '        }',
    '        return a;',
    '    },',
    '    made: (function () {',
    '        return 2;',
    '    })(),',
    '',
    '    last: function () {',
    '        return 3;',
    '    }',
    '};',
    'function outer(x) {',
    '    function inner(y) {',
    '        return y;',
    '    }',
    '    return inner(x);',
    '}',
    'function other() {',
    '    function inner() { return 0; }',
    '}',
    ''
].join('\n');
ok('a one-line member ends on its line, its comma gone and its comment kept', S.member(T, 'JiTA.demo', 'KEY') === '    KEY: \'demoKey\'          // a constant with a comment after its comma');
ok('...and one whose comment runs on below keeps it, its comma gone from its code line', S.member(T, 'JiTA.demo', 'TWO') === '    TWO: 2                   // and one whose comment\n                              // runs on below it',
    JSON.stringify(S.member(T, 'JiTA.demo', 'TWO')));
ok('...a // inside a string is no comment', S.member(T, 'JiTA.demo', 'URL') === '    URL: \'https://example.com/a\' // a URL is no comment', S.member(T, 'JiTA.demo', 'URL'));
ok('a value that runs on, deeper, ends on its last line', S.member(T, 'JiTA.demo', 'LIST') === '    LIST: [\'a\',\n        \'b\']', JSON.stringify(S.member(T, 'JiTA.demo', 'LIST')));
ok('a string run on with backslashes, its lines at the margin, is one piece', S.member(T, 'JiTA.demo', 'css').split('\n').length === 4 && /^'$/.test(S.member(T, 'JiTA.demo', 'css').split('\n')[3]), JSON.stringify(S.member(T, 'JiTA.demo', 'css')));
ok('a template string, a closing brace inside it, is one piece', S.member(T, 'JiTA.demo', 'tpl') === '    tpl: `\n}\n    ` + 1', JSON.stringify(S.member(T, 'JiTA.demo', 'tpl')));
ok('a backtick or quote inside a regex opens nothing', S.member(T, 'JiTA.demo', 're') === '    re: function (s) { return s.replace(/[`\'"]/g, \'\'); }' && S.member(T, 'JiTA.demo', 'cmt').split('\n').length === 5,
    JSON.stringify(S.member(T, 'JiTA.demo', 'cmt')));
ok('...nor one inside a block comment, a brace at the margin in it closing nothing', S.member(T, 'JiTA.demo', 'cmt').split('\n').pop() === '    }');
ok('a function member ends on its closing brace, whatever its parameters', S.member(T, 'JiTA.demo', 'run') === '    run: function (a, b) {\n        if (a) {\n            return b;\n        }\n        return a;\n    }');
ok('...and one called where it is defined, on its })()', S.member(T, 'JiTA.demo', 'made') === '    made: (function () {\n        return 2;\n    })()');
ok('...and the last one, with no comma', S.member(T, 'JiTA.demo', 'last') === '    last: function () {\n        return 3;\n    }');
ok('...a slash inside a regex\'s brackets ends nothing', S.member(T, 'JiTA.demo', 'slash') === '    slash: function (s) { return s.replace(/[/`]/g, \'\'); }');
ok('...nor does a backtick in a line comment, or an escaped quote in a string', S.member(T, 'JiTA.demo', 'note') === '    note: 1   // a lone ` in a comment' &&
    S.member(T, 'JiTA.demo', 'esc') === '    esc: \'it\\\'s a ` in a string\'', JSON.stringify([S.member(T, 'JiTA.demo', 'note'), S.member(T, 'JiTA.demo', 'esc')]));
const obj = new Function('return ' + S.members(T, 'JiTA.demo', ['KEY', 'TWO', 'URL', 'LIST', 'note', 'esc', 'run', 'made', 'last']))();
ok('members() makes an object of the ones asked for, comments and all', obj.KEY === 'demoKey' && obj.TWO === 2 && obj.URL === 'https://example.com/a' && obj.LIST.join() === 'a,b' && obj.note === 1 && obj.esc === 'it\'s a ` in a string' &&
    obj.run(1, 2) === 2 && obj.made === 2 && obj.last() === 3 && Object.keys(obj).length === 9, JSON.stringify(Object.keys(obj)));
const T2 = 'JiTA.demo = {\n    KEY: \'another\'\n};\n';
ok('two texts with an object of the same name each give their own', S.member(T2, 'JiTA.demo', 'KEY') === '    KEY: \'another\'' && S.member(T, 'JiTA.demo', 'KEY').indexOf('demoKey') > 0);
const demo = {};
new Function('JiTA', S.top(T, 'JiTA.demo'))({ demo: demo });
ok('top() gives the whole assignment, to its };', /^JiTA\.demo = \{\n[\s\S]*\n\};$/.test(S.top(T, 'JiTA.demo')), S.top(T, 'JiTA.demo').slice(-20));
ok('fn() gives a declaration, its inner functions in it', S.fn(T, 'outer') === 'function outer(x) {\n    function inner(y) {\n        return y;\n    }\n    return inner(x);\n}');
ok('...and finds one inside another piece', S.fn(T, 'inner', S.fn(T, 'outer')) === '    function inner(y) {\n        return y;\n    }');
ok('a name not there throws, saying what it looked for', throws(() => S.member(T, 'JiTA.demo', 'nope'), /source\.js: no member nope in JiTA\.demo/) &&
    throws(() => S.top(T, 'JiTA.none'), /no top-level JiTA\.none/) && throws(() => S.fn(T, 'missing'), /no function missing\(/));
ok('...and so does a name found twice', throws(() => S.fn(T, 'inner'), /more than one function inner\(/));
ok('a deeper line is never taken for a member', throws(() => S.member(T, 'JiTA.demo', 'return 2;'), /no member/) && throws(() => S.member('JiTA.x = {\n    a: {\n        b: 1\n    }\n};', 'JiTA.x', 'b'), /no member b/));
ok('names are taken as they are, not as patterns', throws(() => S.member(T, 'JiTA.demo', 'K.Y'), /no member/) && throws(() => S.top(T, 'JiTA.dem.'), /no top-level/));
ok('...even one with a bracket in it', throws(() => S.top(T, 'JiTA.demo('), /no top-level JiTA\.demo\(/));
ok('a piece that runs to the end of the text, with no line after it, is all of it', S.fn('function z() {\n    return 1;\n}', 'z') === 'function z() {\n    return 1;\n}' &&
    S.member('JiTA.q = {\n    a: function () {\n        return 1;', 'JiTA.q', 'a') === '    a: function () {\n        return 1;');
ok('...nor as what every object has', throws(() => S.member(T, 'JiTA.demo', 'constructor'), /no member constructor/) && throws(() => S.fn(T, 'toString'), /no function toString\(/));
const T3 = 'JiTA.one = {\n    a: 1\n};\nJiTA.two = {\n    a: 2\n};\nfunction f() { return 3; }\n';
ok('each object\'s members are its own, and each text\'s functions', S.member(T3, 'JiTA.one', 'a') === '    a: 1' && S.member(T3, 'JiTA.two', 'a') === '    a: 2' &&
    S.fn(T3, 'f') === 'function f() { return 3; }' && throws(() => S.fn(T2, 'f'), /no function f\(/));
const fs = require('fs'), os = require('os');
const crlf = path.join(os.tmpdir(), 'jita-source-crlf-' + process.pid + '.js'), had = process.env.JITA_SRC;
fs.writeFileSync(crlf, '// ==UserScript==\r\nJiTA.x = {\r\n    a: 1\r\n};\r\n');
process.env.JITA_SRC = crlf;
let loaded;
try { loaded = S.load(); } finally { if (had === undefined) { delete process.env.JITA_SRC; } else { process.env.JITA_SRC = had; } fs.unlinkSync(crlf); }
ok('load() reads the script JITA_SRC names, with LF line ends', loaded === '// ==UserScript==\nJiTA.x = {\n    a: 1\n};\n', JSON.stringify(loaded));

// ---- the whole script ----
const src = S.load();
const names = (re, text) => { const c = {}; let m; while ((m = re.exec(text))) { c[m[1]] = (c[m[1]] || 0) + 1; } return c; };
const tops = names(/^((?:JiTA|window)(?:\.[\w$]+)+) = /gm, src);
const bad = [], uncovered = [], runOn = [];
let nTop = 0, nObj = 0, nMem = 0;
Object.keys(tops).filter((t) => tops[t] === 1).forEach((t) => {
    let text;
    try { text = S.top(src, t); new Function(text); nTop++; } catch (e) { bad.push(t + ': ' + e.message); return; }
    const lines = text.split('\n');
    if (!/ = \{$/.test(lines[0])) { return; }
    nObj++;
    const covered = lines.map((l, i) => i === 0 || i === lines.length - 1);
    const mem = names(/^    ([\w$]+): /gm, text);
    Object.keys(mem).filter((n) => mem[n] === 1).forEach((n) => {
        let piece;
        // with a member after it, so a comma left on the piece shows as two
        try { piece = S.member(src, t, n); new Function('return ({\n' + piece + '\n,\nnext: 1\n});'); nMem++; } catch (e) { bad.push(t + '.' + n + ': ' + e.message); return; }
        const pl = piece.split('\n'), at = lines.findIndex((l) => l.indexOf('    ' + n + ': ') === 0);
        if (pl.slice(1).some((l) => /^    [\w$]+: /.test(l) && !/^ {5}/.test(l))) { runOn.push(t + '.' + n); }
        pl.forEach((l, k) => { covered[at + k] = true; });
    });
    lines.forEach((l, i) => { if (!covered[i] && l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)) { uncovered.push(t + ' +' + i + ': ' + l.trim().slice(0, 60)); } });
});
const fns = names(/^ *function ([\w$]+) ?\(/gm, src);
let nFn = 0;
Object.keys(fns).filter((n) => fns[n] === 1).forEach((n) => {
    try { new Function(S.fn(src, n)); nFn++; } catch (e) { bad.push('function ' + n + ': ' + e.message); }
});
ok('every top-level assignment, object member and function of the script cuts out as code that parses (' + nTop + ' assignments, ' + nMem + ' members, ' + nFn + ' functions)',
    !bad.length && nObj > 25 && nMem > 1000 && nFn > 200, bad.slice(0, 5).join(' | '));
ok('...the members of each of the ' + nObj + ' objects cover all of its code between them', !uncovered.length, uncovered.slice(0, 5).join(' | '));
ok('...and no member runs on into the next', !runOn.length, runOn.slice(0, 5).join(', '));
ok('the pieces the harnesses take most are where they should be', /^    ebrPool: function \(\) \{[\s\S]*\n    \}$/.test(S.member(src, 'JiTA.rank', 'ebrPool')) &&
    /^function jitaWorkerBody\(/.test(S.fn(src, 'jitaWorkerBody')) && /\n\}$/.test(S.fn(src, 'jitaWorkerBody')) &&
    /^    function logsigOp\(payload\) \{/.test(S.fn(src, 'logsigOp', S.fn(src, 'jitaWorkerBody'))) && /^function jitaShared\(\) \{/.test(S.fn(src, 'jitaShared')) &&
    typeof S.shared(src).fingerprint === 'function' && typeof S.workerLogsig(src).op === 'function');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'source checks passed.'));
process.exit(fail ? 1 : 0);

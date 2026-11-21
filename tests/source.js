// source.js - finds a piece of JiTA.user.js by its name, for a harness to eval. A harness that cuts code out between
// two pieces of text it copied from the script breaks on any edit to that text: a parameter added, a line re-worded.
// These go by name and by the script's layout instead (4 spaces a level, a closing brace on a line of its own at the
// indent its opening line had), so they keep working however the code inside changes. source-check.js checks that the
// layout holds for every object member and function in the script, so a piece the rule would cut wrong fails there.
//
//   const S = require('./source');
//   const src = S.load();                              // the script: JITA_SRC or ../JiTA.user.js, with LF line ends
//   S.top(src, 'JiTA.changelog')                       // 'JiTA.changelog = { ... };', a top-level assignment
//   S.member(src, 'JiTA.rank', 'ebrPool')              // '    ebrPool: function () { ... }', one member of an object
//   S.members(src, 'JiTA.rank', ['ebrPool', '_gate'])  // '({ ... })' with those members, to eval as an object
//   S.fn(src, 'jitaWorkerBody')                        // 'function jitaWorkerBody(cfg) { ... }', a declaration
//   S.fn(src, 'lgFp', S.fn(src, 'jitaWorkerBody'))     // ...looked for inside another piece
//
// Each throws, naming what it looked for, when the name is missing or found more than once.
'use strict';
const fs = require('fs'), path = require('path');

function load() {
    return fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const indentOf = (line) => /^ */.exec(line)[0].length;

// Where each name starts in text, { name: [index, ...] }, for every match of re (flags m and g, the name its group 1).
function names(text, re) {
    const at = {};
    let m;
    while ((m = re.exec(text))) { (at[m[1]] = at[m[1]] || []).push(m.index); }
    return at;
}
// The one place a name starts, or a throw that says what was looked for.
function one(at, name, what) {
    const found = Object.prototype.hasOwnProperty.call(at, name) ? at[name] : [];
    if (found.length !== 1) { throw new Error('source.js: ' + (found.length ? 'more than one ' : 'no ') + what); }
    return found[0];
}

// From the line at `start` (its index in text), up to the next line indented no deeper than it: that line too when it
// starts with a closing bracket (`},` `];` `})();`), else the piece ends just before it. Lines inside a string are passed
// over whatever their indent: the CSS strings run on with a backslash at the end of each line, a template string runs
// until its closing backtick. Reads only as far as the piece goes.
function block(text, start) {
    const lines = [];
    let p = start, end = -1, base = 0, st = null;
    for (;;) {
        const q = text.indexOf('\n', p), i = lines.push(q < 0 ? text.slice(p) : text.slice(p, q)) - 1;
        if (i === 0) {
            base = indentOf(lines[0]);
            st = scan(lines[0], { tpl: false, cmt: false });
        } else {
            const inside = /\\$/.test(lines[i - 1]) || st.tpl || st.cmt;   // a line that starts inside a string or comment
            st = scan(lines[i], st);
            if (!inside && lines[i].trim() && indentOf(lines[i]) <= base) {
                end = /^[}\])]/.test(lines[i].slice(base)) ? i : i - 1;
                break;
            }
        }
        if (q < 0) { break; }
        p = q + 1;
    }
    if (end < 0) { end = lines.length - 1; }
    while (end > 0 && !lines[end].trim()) { end--; }
    return lines.slice(0, end + 1).join('\n');
}

// Reads one line from state st ({ tpl: inside a template string, cmt: inside a block comment }) and returns the state
// at its end. In code, quotes and regex literals are read past, so a backtick inside them opens nothing.
function scan(line, st) {
    let tpl = st.tpl, cmt = st.cmt, q = null, cls = false, prev = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (cmt) { if (ch === '*' && line[i + 1] === '/') { cmt = false; i++; } continue; }
        if (ch === '\\') { i++; continue; }
        if (tpl) { if (ch === '`') { tpl = false; prev = '`'; } continue; }
        if (q) {
            if (q === '/' && ch === '[') { cls = true; } else if (q === '/' && ch === ']') { cls = false; } else if (ch === q && !cls) { q = null; prev = ch; }
            continue;
        }
        if (ch === '/' && line[i + 1] === '/') { break; }
        if (ch === '/' && line[i + 1] === '*') { cmt = true; i++; continue; }
        if (ch === '`') { tpl = true; continue; }
        if (ch === '\'' || ch === '"') { q = ch; continue; }
        if (ch === '/' && (prev === '' || '(,=:[!&|?{};+'.indexOf(prev) >= 0)) { q = '/'; cls = false; continue; }
        if (ch.trim()) { prev = ch; }
    }
    return { tpl: tpl, cmt: cmt };
}

// What has been looked up in the last script asked about: its top-level pieces, where each object's members start,
// where its functions start. member() asks for its object every time, a harness asks for many functions.
let seen = { src: null, tops: {}, mems: {}, fns: null };
const remember = (src) => { if (seen.src !== src) { seen = { src: src, tops: {}, mems: {}, fns: null }; } return seen; };

// A top-level assignment, `name = ...` at the start of a line, up to its closing line (`};`, `})();`, ...).
function top(src, name) {
    const k = remember(src);
    if (!Object.prototype.hasOwnProperty.call(k.tops, name)) {
        const at = names(src, new RegExp('^(' + esc(name) + ') = ', 'gm'));
        k.tops[name] = block(src, one(at, name, 'top-level ' + name + ' = ...'));
    }
    return k.tops[name];
}

// A member of a top-level object, `    name: ...` one level in, up to its closing line, without the comma after it. A
// comment after that comma stays, and so do comment lines that carry it on below, so the piece ends a line.
function member(src, obj, name) {
    const body = top(src, obj), known = remember(src);
    const at = known.mems[obj] || (known.mems[obj] = names(body, /^    ([\w$]+): /gm));
    const lines = block(body, one(at, name, 'member ' + name + ' in ' + obj)).split('\n');
    let k = lines.length - 1;
    while (k > 0 && /^\s*\/\//.test(lines[k])) { k--; }
    lines[k] = lines[k].replace(/,(\s*\/\/.*)?$/, '$1');
    return lines.join('\n');
}

// Several members of one object, as an object literal to eval. The commas go on lines of their own, as a member may
// end in a comment.
function members(src, obj, names) {
    return '({\n' + names.map((n) => member(src, obj, n)).join('\n,\n') + '\n})';
}

// A function declaration, `function name(` at any indent, up to the brace that closes it at that indent. `within` is
// the text to look in (a piece cut out before), the whole script otherwise.
function fn(src, name, within) {
    const FN = /^ *function ([\w$]+) ?\(/gm, k = remember(src);
    const text = within === undefined ? src : within;
    const at = within === undefined ? (k.fns || (k.fns = names(src, FN))) : names(within, FN);
    return block(text, one(at, name, 'function ' + name + '('));
}

// What the page and the worker share (jitaShared), run as both run it: the real function, from this script.
function shared(src) { return new Function(fn(src, 'jitaShared') + '\nreturn jitaShared();')(); }
// Its exception-matching pieces under the names JiTA.logsig hands them on by, to Object.assign onto a JiTA.logsig stub.
function logsigShared(src) {
    const SH = shared(src);
    return { MIN_FRAMES: SH.MIN_FRAMES, CRASH_FRAMES: SH.CRASH_FRAMES, TRACE: SH.TRACE, OPEN_CUT: SH.OPEN_CUT, isTrace: SH.isTrace, isCut: SH.isCut,
        _traceKey: SH.traceKey, isUserError: SH.isUserError, _splitBlocks: SH.splitBlocks, _fingerprint: SH.fingerprint, _logBlocks: SH.logBlocks, _crashOf: SH.crashOf };
}

module.exports = { load: load, top: top, member: member, members: members, fn: fn, block: block, shared: shared, logsigShared: logsigShared };

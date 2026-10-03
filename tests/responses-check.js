// responses-check.js - the canned replies JiTA ships (JiTA.responses.DEFAULTS) are sent to players as they are, so none
// may still carry a placeholder: the Security Related reply went out for years with "REPLACE WITH TEAM NAME" in the
// middle of a paragraph (fixed in v3.38.9). Also checks each reply is well-formed. Evals the real DEFAULTS list.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('    DEFAULTS: [', src.indexOf('\nJiTA.responses = {'));
const e = src.indexOf('\n    ],', s);
if (s < 0 || e < 0) { throw new Error('could not slice JiTA.responses.DEFAULTS'); }
const R = eval('({' + src.slice(s, e + '\n    ],'.length) + '})').DEFAULTS;

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

ok('there are canned replies to check', Array.isArray(R) && R.length > 10, String(R && R.length));
ok('every reply has a title and a body', R.every((r) => r && typeof r.title === 'string' && r.title.trim() && typeof r.body === 'string' && r.body.trim()),
    R.filter((r) => !r || !r.title || !r.body).map((r) => r && r.title).join(', '));
const titles = R.map((r) => r.title);
ok('no two replies share a title', titles.every((t, i) => titles.indexOf(t) === i), titles.filter((t, i) => titles.indexOf(t) !== i).join(', '));
const PLACEHOLDER = /REPLACE WITH|\bTODO\b|\bTBD\b|\bXXX\b|\[[A-Z ]{3,}\]|\{\{|<[A-Z ]{3,}>/;
const marked = R.filter((r) => PLACEHOLDER.test(r.body) || PLACEHOLDER.test(r.title));
ok('no reply still carries a placeholder', !marked.length, marked.map((r) => r.title + ': ' + (PLACEHOLDER.exec(r.body) || PLACEHOLDER.exec(r.title))[0]).join('; '));
ok('the Security Related reply names the Bug Hunter team', R.some((r) => r.title === 'Security Related' && /as well as the Bug Hunter team are not directly involved/.test(r.body)));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'canned reply checks passed.'));
process.exit(fail ? 1 : 0);

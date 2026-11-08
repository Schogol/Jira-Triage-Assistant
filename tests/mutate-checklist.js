// mutate-checklist.js - breaks each guard of the Defect checklist (v3.51.0: the ISD guide's rules for a defect, judged
// against the defect and the bug report it was converted from; no unassign while items are open; the writes it offers) in
// turn and requires checklist-check to go red. A crashed harness counts as red. Every anchor is looked for in the
// checklist's own block (CL), once, unless the breakage names another part: [harness, name, anchor, replacement, part].
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const CK = 'checklist-check.js';
const CL = ['\nJiTA.checklist = {', '\n    _noop: null\n};'], BOOT = ['// ---- Jira boot: watch the DOM', 'observer.observe(document.body'];
const muts = [
    // ---- small parts ----
    [CK, 'a list value reads as nothing', "if (Array.isArray(v)) { return v.map(JiTA.checklist._val).filter(function (x) { return !!x; }).join(', '); }", "if (Array.isArray(v)) { return ''; }"],
    [CK, 'of two fields with one name, the first', "if (!out[k] || (!JiTA.checklist._val((fields || {})[out[k]]) && JiTA.checklist._val((fields || {})[id]))) { out[k] = id; }", 'if (!out[k]) { out[k] = id; }'],
    [CK, 'a field\'s first value read as what it became', "return items[j].fromString == null ? '' : items[j].fromString;", "return items[j].toString == null ? '' : items[j].toString;"],
    // ---- Priority, Team and Epic Link ----
    [CK, 'FC setting Priority is the reporter\'s too', 'prs.forEach(function (p) { if (p.by !== reporter) { fair = p.it.to; } else { mine = p; } });', 'prs.forEach(function (p) { if (p.by === reporter) { mine = p; } });'],
    [CK, 'a Team set when the defect was made is nobody\'s', "if (!last || last.by === reporter) { out.push({ name: x.name, at: last ? last.at : '' }); }", "if (last && last.by === reporter) { out.push({ name: x.name, at: last.at }); }"],
    [CK, 'a Team FC set is the reporter\'s', "if (!last || last.by === reporter) { out.push({ name: x.name, at: last ? last.at : '' }); }", "out.push({ name: x.name, at: last ? last.at : '' });"],
    [CK, 'an epic parent is not an Epic Link', "            if (x.name === 'Epic Link' && !C._val(v) && f.parent && /epic/i.test(((f.parent.fields || {}).issuetype || {}).name || '')) { v = f.parent; }\n", ''],
    // ---- the unassign to put back ----
    [CK, 'anyone\'s unassign is put back', 'if (!last || !me || last.by !== me || last.item.to || !last.item.from) { return null; }', 'if (!last || !me || last.item.to || !last.item.from) { return null; }'],
    [CK, 'an old unassign is put back', "        if (isNaN(t) || now - t > C.REVERT_MS) { return null; }\n", ''],
    [CK, 'a hand-over to someone is undone', 'if (!last || !me || last.by !== me || last.item.to || !last.item.from) { return null; }', 'if (!last || !me || last.by !== me || !last.item.from) { return null; }'],
    // ---- which bug report ----
    [CK, 'the clone link counts for nothing', "        if (clones.length === 1) { return clones[0].key; }\n", ''],
    [CK, 'the summary compared is the one it has now', "first = C._squash(C._first(hist, 'summary', f.summary));", 'first = C._squash(f.summary);'],
    [CK, 'a scratch defect with one report attached takes it for its source', "return (pool.length === 1 && (f.labels || []).indexOf('cloned') >= 0) ? pool[0].key : null;", 'return pool.length === 1 ? pool[0].key : null;'],
    [CK, 'a linked defect taken for a bug report', "if (!o || !/^EBR-\\d+$/.test(o.key || '')) { return; }", 'if (!o) { return; }'],
    // ---- logs, labels, exceptions ----
    [CK, 'a LogLite workspace is no log', "    _isLog: function (name) { return /\\.lsw$/i.test(name || '') || ", "    _isLog: function (name) { return "],
    [CK, 'anything named like a log is one', " && /\\.(txt|log|zip|csv)$/i.test(name || '')); },", '); },'],
    [CK, 'the player\'s copied log does not count', "var logs = (d.attachments || []).filter(function (a) { return C._isLog(a.filename); });",
        "var logs = (d.attachments || []).filter(function (a) { return C._isLog(a.filename) && !/^logs\\.txt$/i.test(a.filename); });"],
    // ---- the reproduction steps ----
    [CK, 'the report\'s steps count as rewritten', "add('steps', 'Reproduction steps as a numbered list', !!st.ordered && !sameSteps,", "add('steps', 'Reproduction steps as a numbered list', !!st.ordered,"],
    [CK, 'a numbered list is no steps', "add('steps', 'Reproduction steps as a numbered list', !!st.ordered && !sameSteps,", "add('steps', 'Reproduction steps as a numbered list', false,"],
    [CK, 'the steps section is not read', "return { text: C._squash(list) ? list : (m ? m[1] : ''),", 'return { text: list,'],
    [CK, 'the player\'s section wins over the hunter\'s list', "return { text: C._squash(list) ? list : (m ? m[1] : ''),", 'return { text: m ? m[1] : list,'],
    [CK, 'a steps field of its own is passed over', '        if (C._squash(ft)) { return { text: ft, ordered:', '        if (false) { return { text: ft, ordered:'],
    [CK, 'an empty steps field hides the description\'s', '        if (C._squash(ft)) { return { text: ft, ordered:', '        if (field) { return { text: ft, ordered:'],
    [CK, 'a list\'s text taken from all of the description', 'var here = inList || n.type === \'orderedList\';', 'var here = true;'],
    [CK, 'the report\'s steps read from its description only', "steps: C._steps(f.description, stepsId ? f[stepsId] : null).text,", 'steps: C._steps(f.description, null).text,'],
    [CK, 'the steps field never asked for on the report', "'?fields=summary,description,labels,attachment' + (stepsId ? ',' + stepsId : '')", "'?fields=summary,description,labels,attachment'"],
    [CK, 'the steps field not found by name', "steps: /^(steps to reproduce|reproduction steps)$/i };", 'steps: /^steps$/i };'],
    // ---- the server and build ----
    [CK, 'the EVE fields are not found', "server: /^eve server$/i, build: /^eve build$/i,", "server: /^server$/i, build: /^build$/i,"],
    [CK, 'one EVE field filled in will do', "add('build', 'EVE Server and EVE Build set', !empty.length || (srv && bld),", "add('build', 'EVE Server and EVE Build set', empty.length < 2 || (srv && bld),"],
    [CK, 'the old way does not count beside the fields', "add('build', 'EVE Server and EVE Build set', !empty.length || (srv && bld),", "add('build', 'EVE Server and EVE Build set', !empty.length,"],
    [CK, 'the fields never asked for', "        if (hasFields) {\n            add('build', 'EVE Server and EVE Build set'", "        if (false) {\n            add('build', 'EVE Server and EVE Build set'"],
    // ---- label suggestions ----
    [CK, 'a label it has is suggested', "(d.labels || []).concat((d.src && d.src.labels) || [], C.KEEP_LABELS).forEach(", "((d.src && d.src.labels) || []).concat(C.KEEP_LABELS).forEach("],
    [CK, 'the report\'s labels are suggested', "(d.labels || []).concat((d.src && d.src.labels) || [], C.KEEP_LABELS).forEach(", "(d.labels || []).concat(C.KEEP_LABELS).forEach("],
    [CK, 'a rare label is suggested', 'if (!(n >= C.LABEL_MIN) || have[label.toLowerCase()] || c0 !== c0.toUpperCase()) { return; }', 'if (have[label.toLowerCase()] || c0 !== c0.toUpperCase()) { return; }'],
    [CK, 'a lower-case label is suggested', 'if (!(n >= C.LABEL_MIN) || have[label.toLowerCase()] || c0 !== c0.toUpperCase()) { return; }', 'if (!(n >= C.LABEL_MIN) || have[label.toLowerCase()]) { return; }'],
    [CK, 'the summary counts no more than the description', "var parts = [['summary', C._words(d.summary), 3],", "var parts = [['summary', C._words(d.summary), 1],"],
    [CK, 'suggestions without end', '        return out.slice(0, C.SUGGEST).map(', '        return out.map('],
    [CK, 'a plural is another word', 'var same = function (a, b) { return a === b || a === b + \'s\' || a === b + \'es\'; };', 'var same = function (a, b) { return a === b; };'],
    [CK, 'a label\'s words in any order', '            while (j < run.length && same(words[i + j], run[j])) { j++; }', '            while (j < run.length && words.some(function (w) { return same(w, run[j]); })) { j++; }'],
    [CK, 'a label is only found word by word', '        return split.length > 1 ? [split, [whole]] : [[whole]];', '        return [split];'],
    [CK, 'the labels in use are counted on every card', '            if (m && m.c && Date.now() - (m.at || 0) < C.LABELS_MS) { return m.c; }\n', ''],
    [CK, 'a failed count is never tried again', '        C._labelsP.then(null, function () { C._labelsP = null; });\n', ''],
    [CK, 'the count is not kept', 'return JiTA.db.setMeta(C.LABELS_KEY, { at: Date.now(), n: (issues || []).length, c: c }).then(function () { return c; }, function () { return c; });', 'return c;'],
    [CK, 'a Lead gets labels suggested', '        if (mine) { C._suggestRow(key, s).appendTo($b); }', '        C._suggestRow(key, s).appendTo($b);'],
    [CK, 'a suggested label is added unasked', "        if (!window.confirm('Add the label ' + label + ' to ' + key + '?')) { return Promise.resolve(); }\n", ''],
    [CK, 'a suggested label replaces the others', "{ update: { labels: [{ add: label }] } }", '{ fields: { labels: [label] } }'],
    // ---- the Settings switch ----
    [CK, 'the card ignores its switch', "        if (!flagOn('defectChecklist') || !/^(EDR|EO|PLAT)-\\d+$/.test(key || '')) {", "        if (!/^(EDR|EO|PLAT)-\\d+$/.test(key || '')) {"],
    [CK, 'a switched-off card is drawn all the same', "if (C._key !== key || !flagOn('defectChecklist')) { return; }", 'if (C._key !== key) { return; }'],
    [CK, 'switched off, Unassigned is refused all the same', "if (!s || !s.sees || !s.open || !s.held || !flagOn('defectChecklist')) { return; }", 'if (!s || !s.sees || !s.open || !s.held) { return; }'],
    [CK, 'switched off, an unassign is put back all the same', "if (!s || !s.sees || s.assignee || !s.open || !flagOn('defectChecklist')) { return; }", 'if (!s || !s.sees || s.assignee || !s.open) { return; }'],
    [CK, 'no switch of its own', ', ["defectChecklist", ""]];', '];', ['var savedVariables = ', '\n']],
    [CK, 'the switch on the wrong slot', 'defectProfile: 8, defectChecklist: 9 };', 'defectProfile: 8, defectChecklist: 8 };', ['var FLAG = ', '\n']],
    [CK, 'the switch missing from Settings', '        $feat.append($cl);\n', '', ['        // ---- Features ----', "pane('features').append($feat);"]],
    [CK, 'cloned and jira_escalated counted as report labels', "return C.KEEP_LABELS.indexOf(l) < 0 && (srcLabels || []).indexOf(l) >= 0; });", "return (srcLabels || []).indexOf(l) >= 0; });"],
    [CK, 'cloned and jira_escalated must be capitalised', "return C.KEEP_LABELS.indexOf(l) < 0 && c !== c.toUpperCase(); });", 'return c !== c.toUpperCase(); });'],
    [CK, 'only a-z counts as lower case', "return C.KEEP_LABELS.indexOf(l) < 0 && c !== c.toUpperCase(); });", 'return C.KEEP_LABELS.indexOf(l) < 0 && /[a-z]/.test(c); });'],
    [CK, 'the same crash site is no match', "            if (cs && sites[cs]) { return true; }\n", ''],
    [CK, 'a message of any length matches', 'return m.length >= 12 && text.indexOf(m) >= 0;', 'return text.indexOf(m) >= 0;'],
    [CK, 'the expand changes the description it was given', "var doc = (adf && adf.type === 'doc') ? JSON.parse(JSON.stringify(adf)) : { type: 'doc', version: 1, content: [] };", "var doc = (adf && adf.type === 'doc') ? adf : { type: 'doc', version: 1, content: [] };"],
    [CK, 'an empty text node in the expand', "content: [{ type: 'text', text: text || title }]", "content: [{ type: 'text', text: text }]"],
    [CK, 'the expand\'s title is not cut', "return (m.length > 120 ? m.slice(0, 119) + '…' : m) || 'Exception';", "return m || 'Exception';"],
    // ---- the items ----
    [CK, 'EO and PLAT count as EDR', "/^EDR-\\d+$/.test(d.key || '')", "/^(EDR|EO|PLAT)-\\d+$/.test(d.key || '')"],
    [CK, 'the report\'s summary counts as rewritten', "add('summary', 'Summary says what, where and when', !sameSum && !!C._squash(d.summary),", "add('summary', 'Summary says what, where and when', !!C._squash(d.summary),"],
    [CK, 'a summary with a tag is open again', "add('summary', 'Summary says what, where and when', !sameSum && !!C._squash(d.summary),", "add('summary', 'Summary says what, where and when', !sameSum && !!C._squash(d.summary) && !/^\\s*\\[/.test(d.summary),"],
    [CK, 'the report\'s description counts as rewritten', "!!C._squash(d.desc) && C._squash(d.desc) !== C._squash(s.desc),", '!!C._squash(d.desc),'],
    [CK, 'a build number alone will do', "add('build', 'Server and build number at the top', srv && bld,", "add('build', 'Server and build number at the top', bld,"],
    [CK, '"at the top" is anywhere', "var top = String(d.desc || '').slice(0, C.TOP_CHARS),", "var top = String(d.desc || ''),"],
    [CK, 'the report\'s build is not named', "var built = s && s.build ? ' The bug report\\'s log was written by build ' + s.build + '.' : '';", "var built = '';"],
    [CK, 'a numbered list written out is no steps', "ordered: C._hasNode(desc, 'orderedList') || C.STEPS_RE.test(plain) };", "ordered: C._hasNode(desc, 'orderedList') };"],
    [CK, 'a list is no steps', "ordered: C._hasNode(desc, 'orderedList') || C.STEPS_RE.test(plain) };", 'ordered: C.STEPS_RE.test(plain) };'],
    [CK, 'one step is steps', 'STEPS_RE: /(^|\\s)1[.)]\\s+\\S[\\s\\S]*?\\s2[.)]\\s+\\S/,', 'STEPS_RE: /(^|\\s)1[.)]\\s+\\S/,'],
    [CK, 'a field this Jira lacks is asked for', "var unset = known.filter(function (x) { return x[1] === ''; }).map(function (x) { return x[0]; });", "var unset = [['Severity', d.severity], ['Impact', d.impact]].filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });"],
    [CK, 'without the fields, the item all the same', "        if (known.length) { add('fields', 'Severity and Impact set', !unset.length, 'Not set yet: ' + unset.join(', ') + '.'); }",
        "        add('fields', 'Severity and Impact set', !unset.length, 'Not set yet: ' + unset.join(', ') + '.');"],
    [CK, 'a State asked for again', "var known = [['Severity', d.severity], ['Impact', d.impact]].filter(", "var known = [['Severity', d.severity], ['Impact', d.impact], ['State', '']].filter("],
    [CK, 'what FC sets is never asked', "add('fc', 'Priority, Team and Epic Link left to FC', !fc.length,", "add('fc', 'Priority, Team and Epic Link left to FC', true,"],
    [CK, 'labels never judged for their capitals', "add('caps', 'Labels start with a capital letter', !lower.length,", "add('caps', 'Labels start with a capital letter', true,"],
    [CK, 'no way to take the report\'s labels off', "{ waivable: true, fix: 'labels', left: left });", '{ waivable: true, left: left });'],
    [CK, 'the logs may not be skipped', "Only the simplest defects (a typo, a description, an issue outside the game) go without them.', { waivable: true });", "Only the simplest defects (a typo, a description, an issue outside the game) go without them.');"],
    [CK, 'an exception item over no exceptions', 'if (s && s.exc && s.exc.length) {\n            add(\'exc\'', "if (s && s.exc) {\n            add('exc'"],
    [CK, 'any item may be skipped', 'it.waived = !it.ok && !!it.waivable && !!(d.waived || {})[id];', 'it.waived = !it.ok && !!(d.waived || {})[id];'],
    [CK, 'the waivers read from the wrong place', "w = (prop && prop.w && typeof prop.w === 'object') ? prop.w : {};", 'w = {};'],
    // ---- the state ----
    [CK, 'logs that failed hold the card up for good', 'var pending = !!d.src && d.src.exc === undefined && !d.src.failed;', 'var pending = !!d.src && d.src.exc === undefined;'],
    [CK, 'finished while the logs are still read', 'complete: !open && !pending,', 'complete: !open,'],
    // ---- who sees it ----
    [CK, 'another hunter counts as the reporter', "if (me && rep.accountId === me) { return Promise.resolve('reporter'); }", "if (rep.accountId) { return Promise.resolve('reporter'); }"],
    [CK, 'anyone counts as a Lead', "if (!JiTA.leadduty.isLead() || !rep.accountId) { return Promise.resolve(''); }", "if (!rep.accountId) { return Promise.resolve(''); }"],
    [CK, 'an ISD name means nothing', "        if (/^ISD\\b/i.test(rep.displayName || '')) { return Promise.resolve('lead'); }\n", ''],
    [CK, 'the ISD group is never asked', "return (ms || []).some(function (m) { return m && m.accountId === rep.accountId; }) ? 'lead' : '';", "return '';"],
    [CK, 'someone the card is not for is judged all the same', "                if (!sees) { var none = { key: key, sees: '' }; onState(none); return none; }\n", ''],
    // ---- the report's logs ----
    [CK, 'a reading without logs counts as read', "if (!rec || !rec.logs) { throw new Error('the logs could not be read'); }", "if (!rec) { throw new Error('the logs could not be read'); }"],
    [CK, 'exceptions that do not count are listed', 'var exc = (rec.exc || []).filter(function (e) { return JiTA.excnoise.counts(e.sig); });', 'var exc = (rec.exc || []).slice();'],
    [CK, 'the defect itself listed as holding its exception', 'return k !== key && held[k].hits.some(function (h) { return h.sig === e.sig; });', 'return held[k].hits.some(function (h) { return h.sig === e.sig; });'],
    [CK, 'the report\'s build is lost', '            src.build = rec.build || null;\n', ''],
    // ---- nobody unassigns an unfinished defect ----
    [CK, 'a finished defect\'s Unassigned is refused', "if (!s || !s.sees || !s.open || !s.held || !flagOn('defectChecklist')) { return; }", "if (!s || !s.sees || !s.held || !flagOn('defectChecklist')) { return; }"],
    [CK, 'a defect nobody holds is refused all the same', "if (!s || !s.sees || !s.open || !s.held || !flagOn('defectChecklist')) { return; }", "if (!s || !s.sees || !s.open || !flagOn('defectChecklist')) { return; }"],
    [CK, 'a developer\'s defect is held by its reporter', 'held: !!d.assignee && d.assignee === d.reporter,', 'held: !!d.assignee,'],
    [CK, 'a developer\'s defect offers the hand-off', "        if (!s.held) {\n            $('<span class=\"jcl-handed\"></span>')", "        if (false) {\n            $('<span class=\"jcl-handed\"></span>')"],
    [CK, 'the refusal lets the picker hear of it', "        e.stopPropagation();\n        if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }\n", ''],
    [CK, 'the refusal says nothing', "        if (e.type === 'click') { JiTA.ui.toast(C._refusal(s)); }\n", ''],
    [CK, 'the refusal says it twice, on mousedown too', "if (e.type === 'click') { JiTA.ui.toast(C._refusal(s)); }", 'JiTA.ui.toast(C._refusal(s));'],
    [CK, 'the guard hears clicks after the picker', "document.addEventListener('click', C._onPick, true);", "document.addEventListener('click', C._onPick, false);"],
    [CK, 'a finished defect\'s unassign is put back', "if (!s || !s.sees || s.assignee || !s.open || !flagOn('defectChecklist')) { return; }", "if (!s || !s.sees || s.assignee || !flagOn('defectChecklist')) { return; }"],
    [CK, 'an unassign put back again and again', 'if (!back || back.from !== s.d.reporter || C._reverted[key] === back.at) { return; }', 'if (!back || back.from !== s.d.reporter) { return; }'],
    [CK, 'a developer\'s defect put back to them', 'if (!back || back.from !== s.d.reporter || C._reverted[key] === back.at) { return; }', 'if (!back || C._reverted[key] === back.at) { return; }'],
    [CK, 'the put-back says nothing', "            JiTA.ui.toast(C._refusal(s) + ' It was put back to its assignee.');\n", ''],
    // ---- writes ----
    [CK, 'a write without the token Jira wants', "headers: { 'X-Atlassian-Token': 'no-check', 'Accept': 'application/json' } };", "headers: { 'Accept': 'application/json' } };"],
    [CK, 'a 429 is a failure', '                    if (xhr && xhr.status === 429 && n > 0) {', '                    if (false) {'],
    [CK, 'Jira\'s reason is lost', "                    if (j && j.errorMessages) { m = m.concat(j.errorMessages); }\n", ''],
    [CK, 'a refusal carries no status', '                    err.status = xhr ? xhr.status : 0;\n', ''],
    [CK, 'a Lead marks items not needed', "if (!s || s.sees !== 'reporter') { return Promise.resolve(); }", 'if (!s) { return Promise.resolve(); }'],
    [CK, 'a mark wipes the others', "var w = (v && v.w && typeof v.w === 'object') ? v.w : {};", 'var w = {};'],
    [CK, 'no marks yet is an error', 'function (e) { if (e && e.status === 404) { return null; } throw e; }', 'function (e) { throw e; }'],
    [CK, 'a mark says nobody', "w[id] = { by: s.me, name: me.displayName || '', at: new Date().toISOString() };", 'w[id] = { at: new Date().toISOString() };'],
    [CK, 'the labels come off unasked', "        if (!window.confirm('Take the bug report\\'s labels off ' + key + ': ' + labels.join(', ') + '?\\n\\ncloned and jira_escalated stay.')) { return Promise.resolve(); }\n", ''],
    [CK, 'the exception is added unasked', "        if (!window.confirm('Add this exception to the end of the description of ' + key + ', in an expand titled:\\n\\n' + title)) { return Promise.resolve(); }\n", ''],
    [CK, 'the description is not read again before the write', "return C._req('GET', C._issuePath(key) + '?fields=description').then(function (iss) {", 'return Promise.resolve({}).then(function (iss) {'],
    [CK, 'the exception never falls back to its signature', 'if (i >= logs.length) { return Promise.resolve(P._sigTip(e.sig, e.msg)); }', "if (i >= logs.length) { return Promise.resolve(''); }"],
    [CK, 'a refused copy says it copied', "                $btn.text('Copy again');\n", "                $btn.text('Copied');\n"],
    [CK, 'the unassign is unasked', "        if (!window.confirm('Unassign ' + key + ' and hand it to FC?')) { return Promise.resolve(); }\n", ''],
    [CK, 'the unassign sends nobody', "return C._req('PUT', C._issuePath(key) + '/assignee', { accountId: null }).then(function () {", "return C._req('PUT', C._issuePath(key) + '/assignee', {}).then(function () {"],
    // ---- the card ----
    [CK, 'the card goes below the others', '            a.parentNode.insertBefore(g, a.nextSibling);\n        }\n        return g ?', '            a.parentNode.appendChild(g);\n        }\n        return g ?'],
    [CK, 'a card pushed down stays there', "        if (g && a && a.parentNode === g.parentNode && a.nextSibling !== g) { a.parentNode.insertBefore(g, a.nextSibling); }\n", ''],
    [CK, 'the title never says how many are open', "        if (t) { t.textContent = C.TITLE + (s.complete ? ' · ready' : (s.open ? ' · ' + s.open + ' open' : '')); }\n", ''],
    [CK, 'the hand-off offered with items open', "            $btn.prop('disabled', true).attr('title', s.pending ? 'Still reading the bug report\\'s logs' : (s.open + ' item' + (s.open === 1 ? '' : 's') + ' still open'));",
        "            $btn.attr('title', 'open').on('click', function () { C._unassign(key, $btn); });"],
    [CK, 'a Lead may take labels off', "if (mine && !it.ok && !it.waived && it.fix === 'labels' && it.left && it.left.length) {", "if (!it.ok && !it.waived && it.fix === 'labels' && it.left && it.left.length) {"],
    [CK, 'a Lead may mark items not needed', '        if (mine && !it.ok && it.waivable) {', '        if (!it.ok && it.waivable) {'],
    [CK, 'a Lead may add an exception', 'if (mine && !C._hasExc(s.d, [e])) {', 'if (!C._hasExc(s.d, [e])) {'],
    [CK, 'Add offered for an exception already there', 'if (mine && !C._hasExc(s.d, [e])) {', 'if (mine) {'],
    [CK, 'no template to copy', "        if (!it.ok && !it.waived && it.copy) {", '        if (false) {'],
    [CK, 'the other defects holding an exception are not shown', "            if (e.defects.length) {\n                var $d", "            if (false) {\n                var $d"],
    [CK, 'an exploit by its severity goes unsaid', "|| /^A\\b/.test(d.severity || '');", ';'],
    [CK, 'the style added on every card', '        if (C._styled) { return; }\n', ''],
    [CK, 'a wiped card stays gone', "        if (!s || !s.sees || document.getElementById(C.GROUP_ID)) { return; }\n        C._draw(C._key, s);", "        return;"],
    [CK, 'the card stays when the defect is left', "            if (C._key) { C._key = null; C.clear(); }\n", "            C._key = null;\n"],
    [CK, 'every Details field is watched', "if (C.FIELDS_SEEN.test(r.label)) { bits.push(r.label + ':' + (r.el.textContent || '')); }", "bits.push(r.label + ':' + (r.el.textContent || ''));"],
    // ---- the page observer ----
    [CK, 'a wiped card waits for the observer\'s pause', "        try { JiTA.checklist.reensure(); } catch (eCl0) { /* swallow */ }   // the Defect checklist card, if Jira wiped it\n", '', BOOT],
    [CK, 'the card never follows the defect on screen', "            try { JiTA.checklist.ensure(); } catch (e7) { /* swallow */ }   // the Defect checklist: follow the defect on screen, judge it again after an edit\n", '', BOOT]
];
// Where an anchor is looked for: the part named (the checklist's block by default), between its first line and its end.
function within(fn) {
    const p = fn || CL, s = src.indexOf(p[0]);
    if (s < 0 || src.indexOf(p[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(p[1], s + p[0].length);
    return e < 0 ? null : [s, e];
}
// JITA_BREAK_SHARD=k/n makes only the breakages whose index % n === k; without it, every breakage.
const SHARD = /^(\d+)\/(\d+)$/.exec(process.env.JITA_BREAK_SHARD || '0/1'), K = SHARD ? +SHARD[1] : 0, N = SHARD ? +SHARD[2] : 0;
if (!SHARD || N < 1 || K >= N) { console.log('JITA_BREAK_SHARD must be k/n with 0 <= k < n, not ' + process.env.JITA_BREAK_SHARD); process.exit(2); }
if (process.env.JITA_BREAK_SHARD) { console.log('shard ' + K + '/' + N + ': ' + muts.filter((m, i) => i % N === K).length + ' of ' + muts.length + ' breakages'); }
let allRed = true;
muts.forEach(([h, name, a, b, fn], i) => {
    if (i % N !== K) { return; }
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no part') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutck.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutck.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutck.js')) { fs.unlinkSync('mutck.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

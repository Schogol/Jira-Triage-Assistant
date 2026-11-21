// mutate-creditdefects.js - breaks each guard of how the ISD credits count a member's defects (v3.51.4: a defect its own
// reporter closed earns nothing; defects count in every space) in turn and requires creditdefects-check.js to go red.
// A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['a defect its reporter closed still counted as created', "                    if (self[issues[i].key]) { continue; }\n", ''],
    ['a defect its reporter closed still counted as resolved', "return all.filter(function (x) { return !self[x.key]; });", "return all;"],
    ['the first resolution set wins, not the last', "                by = (items[j].to || items[j].toString) ?", "                if (by === null) by = (items[j].to || items[j].toString) ?"],
    ['a resolution taken off still counted as set by its author', "by = (items[j].to || items[j].toString) ? ((hist[i].author || {}).accountId || null) : null;", "by = (hist[i].author || {}).accountId || null;"],
    ['a resolution change known by its field id ignored', "if (items[j].field !== 'resolution' && items[j].fieldId !== 'resolution') { continue; }", "if (items[j].field !== 'resolution') { continue; }"],
    ['any field change read as the resolution', "if (items[j].field !== 'resolution' && items[j].fieldId !== 'resolution') { continue; }", "if (false) { continue; }"],
    ['a member\'s old and new accounts not one reporter', "(by === rep || (!!acctToName[by] && acctToName[by] === acctToName[rep]))", "by === rep"],
    ['anyone closing it taken for its reporter', "!!by && !!rep && (by === rep || (!!acctToName[by] && acctToName[by] === acctToName[rep]))", "!!by"],
    ['what a history said never kept', "                seen[x.key] = !!by && !!rep", "                var lost = !!by && !!rep"],
    ['an open defect\'s history read too', "return !!(x.fields || {}).resolution && !(x.key in seen);", "return !(x.key in seen);"],
    ['each count reads every history again', "return !!(x.fields || {}).resolution && !(x.key in seen);", "return !!(x.fields || {}).resolution;"],
    ['the created count asks for no resolution', "crFetchIssues(jql, ['reporter', 'project', 'resolution'])", "crFetchIssues(jql, ['reporter', 'project'])"],
    ['the resolved count asks for no resolution', "crFetchIssues(jql, ['reporter', 'project', 'issuelinks', 'resolution'])", "crFetchIssues(jql, ['reporter', 'project', 'issuelinks'])"],
    ['created defects counted in EO, PLAT and EDR only again', "var jql = 'issuetype = Defect ' +\n            'AND reporter in (' + crAccList(accounts) + ') ' +\n            'AND created >= \"",
        "var jql = 'project in (EO, PLAT, EDR) AND issuetype = Defect ' +\n            'AND reporter in (' + crAccList(accounts) + ') ' +\n            'AND created >= \""],
    ['resolved defects counted in EO, PLAT and EDR only again', "var jql = 'issuetype = Defect ' +\n            'AND reporter in (' + crAccList(accounts) + ') ' +\n            'AND resolution in ('",
        "var jql = 'project in (EO, PLAT, EDR) AND issuetype = Defect ' +\n            'AND reporter in (' + crAccList(accounts) + ') ' +\n            'AND resolution in ('"],
    ['a Duplicate counted as created', "            'AND (resolution is EMPTY OR resolution != Duplicate)';\n        return crFetchIssues(jql, ['reporter', 'project', 'resolution'])",
        "            '';\n        return crFetchIssues(jql, ['reporter', 'project', 'resolution'])"],
    ['the month\'s two counts share no record', "return crDefectsCreated(allAccounts, b, acctToName, rows, seen)", "return crDefectsCreated(allAccounts, b, acctToName, rows)"],
    ['the self panel\'s two counts share no record', "return crDefectsCreated(id.myAccounts, b, acctToName, rows, seen)", "return crDefectsCreated(id.myAccounts, b, acctToName, rows)"],
    ["your own count misses the automation attaches reassigned since", "var autoWas = crc.AUTOMATION_ID ? (", "var autoWas = false ? ("],
    ["the automation attaches are taken by the assignee now", "' AND assignee WAS IN (' + crAccList(accs) + ') ' + win) : null;", "' AND assignee in (' + crAccList(accs) + ')') : null;"],
    ["a reassigned automation attach is counted without its changelog", "if (keys.hasOwnProperty(kw) && movedOut[kw]) { attSet[kw] = true; }", "if (keys.hasOwnProperty(kw)) { attached++; }"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutcd.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node creditdefects-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutcd.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out) && !/FAILURE|^  FAIL  /m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE|CRASH/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutcd.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');

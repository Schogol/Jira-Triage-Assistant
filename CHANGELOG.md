# JiTA changelog

Every version of the Jira Triage Assistant (JiTA), newest first: what it added under New features, what it fixed under Fixed issues. JiTA shows this list in Settings > About, and puts up a What's new pill after an update that brings a feature. Before 2.35.0 the script was called Enhanced Jira Features.

<!--
How a release adds its entry. Tampermonkey fetches this file with the script (@resource changelog), and JiTA reads it
with JiTA.changelog.parse; tests/changelog-check.js fails the build on any line that parser would pass over.
- Every @version bump adds an entry at the top: a "## <version> (<YYYY-MM-DD>)" heading, then "### New features"
  and/or "### Fixed issues", each followed by one "- " line per item.
- Write each item for the bug hunters, at most 240 characters, on one line. Put a backslash before any of
  \ ` * _ [ ] < > # ~ | & (and before a - or + that starts an item), so GitHub shows the item as JiTA does.
- The @resource line in JiTA.user.js ends in ?v=<the same version>, so Tampermonkey fetches this file afresh.
- An entry already released is never removed or re-dated (tests/ci-static.js); its wording may be corrected.
node tests/release.js patch --fix "..." (or minor --feature "...") does the first three: see tests/README.md.
-->

## 3.55.0 (2026-11-22)

### New features

- An igbr.zip has a new entry above logs.txt, Player actions: what the player did, oldest first, read out of logs.txt and methodcalls.txt (jumps, warps, docking, logins, idle time, what the game refused), with a search and Copy.

## 3.54.1 (2026-11-21)

### Fixed issues

- The Settings window of a settings.yaml is wider, and keeps one width on every tab instead of changing with what the tab shows.

## 3.54.0 (2026-11-21)

### New features

- settings.yaml in a report's igbr.zip now opens as the in-game Settings window, with every value as the player had it and the settings that differ from the game's default marked.
- The settings window has a filter for changed settings, a search, the player's shortcuts, the warnings they switched off, the rest of the file, and Show raw and Copy for the file as it is.

## 3.53.37 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.36 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.35 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.34 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.33 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.32 (2026-11-21)

### Fixed issues

- Copy diagnostics names the menu or dialog a corner pill stepped aside for (its tag, role and test id), where it said "\[object HTMLDivElement\]".

## 3.53.31 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.30 (2026-11-21)

### Fixed issues

- ISD credits: your own count of reports attached now includes one the automation attached for you that was reopened and given to someone else since, as the full count does.

## 3.53.29 (2026-11-21)

### Fixed issues

- ISD credits: last month's final count is no longer skipped when another count was running at that moment.
- ISD credits: when Jira is briefly unavailable while members' old accounts are looked up, the count is made again instead of going on with another person's old account, or none.

## 3.53.28 (2026-11-21)

### Fixed issues

- A defect whose description holds a pasted raw log with a stacktrace cut off before its end now matches logs that hold that stacktrace, instead of taking the next log line's code location as part of it.
- Defects in log: the exception message under each defect no longer goes missing when the log is matched twice in a row.

## 3.53.27 (2026-11-21)

### Fixed issues

- Duplicate finder: Recompute and reopening it check the links again, so two defects you have linked in Jira since are no longer suggested, and a link check that failed is tried again instead of counting as no links.
- Duplicate finder: a defect Jira no longer has is not suggested any more.
- Duplicate finder: changing the threshold or pressing Recompute while the list is still loading no longer shows an older list over the new one.
- Duplicate finder: a preview no longer stays on screen after the mouse has left the row, and the scan time is shown in your own time.

## 3.53.26 (2026-11-21)

### Fixed issues

- Detail view: a filter clicked while another page or issue was loading no longer pulls you to its first issue after you have moved on, also while a saved filter is still being read.
- Detail view: collapsing the list in one tab no longer brings back the list another tab had replaced.
- Translate text: when a bug report's labels cannot be read, the card says so and the next box tries again, instead of reading the whole image as English.
- Translate text: a text reader that stopped responding while starting is closed if it finishes later, instead of staying in memory.

## 3.53.25 (2026-11-21)

### Fixed issues

- Defect checklist: switched off in one tab, it no longer takes, refuses or puts back assignees in your other open tabs.
- Defect checklist: its card collapses again while the Triage Assistant is switched off.
- The Triage Assistant panel no longer pops up on a dashboard or board after you have left an issue.
- The Tampermonkey menu no longer lists Settings twice on a wiki page that embeds a database.

## 3.53.24 (2026-11-21)

### Fixed issues

- Lead duties: an issue sampled for quality control in two months keeps a follow-up for each, instead of the later one replacing the earlier, and a Checked no longer withdraws another month's open follow-up.
- Lead duties: the ledger page no longer stays out of date when two Leads publish it at the same time.
- Lead duties: in Applications, a detail that loads after you accept or decline someone no longer moves you on to the next applicant.
- Lead duties: around midnight UTC at the end of a month, the wiki list marks and undoes reviews for its own month.
- Lead duties: a review or check Confluence refuses for good (no edit right on the ledger page, or a full ledger) says it was not saved, instead of showing as done and waiting for a retry that never works.

## 3.53.23 (2026-11-21)

### Fixed issues

- Convert to Defect: opening another issue while a report converts no longer takes you to the new defect, and when no defect is made, Convert works again after 30 seconds instead of staying off until a reload.
- Copy diagnostics in Firefox: each error keeps the line that says where it happened.
- Small improvements behind the scenes.

## 3.53.22 (2026-11-21)

### Fixed issues

- Attach on a bug report: a report attached or closed in Jira since the page was drawn is no longer linked a second time, and once it is linked the other rows stop offering Attach for it.
- Attach on a defect: a report attached in Jira seconds before is no longer linked again; the check now asks the report itself, which is always up to date.
- Status filter: a reopened defect that kept its old resolution is listed under Open, as its card shows it, and is no longer ranked lower as fixed long before the report.
- A report someone had once and has given up since can be attached again within a couple of minutes, without a reload.
- Reporter's other reports and Similar open reports: a late error or empty state no longer shows up on the next issue you opened.
- A report taken off the list, reopened and then attached again in Jira leaves the list again instead of lingering until the next sync.

## 3.53.21 (2026-11-21)

### Fixed issues

- Similar defects: a bug report whose log scan failed for a moment is matched once the scan goes through, instead of going unmatched until the next sync.
- Similar defects: a bug report with a log too big to read in the background still has the defects its logs hold raised.
- Known defects in attached log: a log that did not download is read again on the next look, not taken for an empty one, and the section no longer appears over the trending, similar reports or reporter lists.
- A bug report whose logs could not be read again keeps its known exceptions until a read goes through.
- Background log reading: one report whose log never downloads no longer makes every pass read all open reports again, and a pass cut short by the network no longer marks the newest crash as common.

## 3.53.20 (2026-11-21)

### Fixed issues

- Exception search: the defect's description is read as it is now, so an exception you just pasted into it is offered.
- Exception search: a description, attached reports or a list of open reports that could not be read is said, instead of nothing to look for or none found.
- Exception search: \# after 0x stands for an address, letters and all.
- Exception search: editing a message cut short inside a number still finds the reports that hold it.
- Exception search: a click on a box, edit or reset while editing an exception is no longer lost.
- Exception search: a bug report whose description holds a stacktrace with a message over several lines is found, and each stack of a shared exception is looked for with its own message.
- Exception search: with hundreds of matches the list fills without freezing the page, and no row loses its Attach.

## 3.53.19 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.18 (2026-11-21)

### Fixed issues

- Small improvements behind the scenes.

## 3.53.17 (2026-11-21)

### Fixed issues

- ISD credits: a month counts as finished only once it is over in your own time zone, so west of UTC its last evening hours are counted too.
- ISD credits: your resolved defects follow the full count while that is fresh, so your clone of another member's defect no longer counts for you as well.

## 3.53.16 (2026-11-21)

### Fixed issues

- Stored log readings left by an older version of the log reader are deleted, once, a minute after a Jira page loads, so they no longer take up space in your browser.

## 3.53.15 (2026-11-21)

### Fixed issues

- Defect Profile: on a defect you hid in the Triage Assistant, its own exception is no longer set apart as hidden.
- Defect Profile: a slow lookup from an earlier visit no longer draws an older profile over the newest one when you come back to the defect.
- Defect Profile: a bug report that got a log after it was first read is read again, so its exceptions count.
- Defect Profile: a report whose log holds more exceptions than are kept, or that has a log that was not read, is no longer listed as an outlier for lacking the shared exception.
- A log or igbr.zip that Jira says is not there any more is skipped, instead of every log of the report being downloaded again on each visit.
- A file inside an igbr.zip stops unpacking at 15 MB, whatever the zip says its size is, so a crafted zip cannot fill the tab's memory.

## 3.53.14 (2026-11-21)

### Fixed issues

- Defect checklist: a card that could not tell who is looking at the defect tries again on your next click, or when you come back to the tab, instead of staying away until you reload.
- Defect checklist: moving on to another defect while a change to the last one was still saving no longer leaves the new one without its card.
- Defect checklist: Unassigned is refused only in the defect's own Assignee field, no longer in the Create dialog, a filter or another issue's picker.
- Defect checklist: two marks clicked one right after the other are both kept.
- Defect checklist: Hand to FC is no longer undone when the next read of the bug report's logs, which could not be read before, finds an item open again.
- Defect checklist: Add looks for the exception only in the logs the reader reads (logs.txt first, none over 15 MB), so a huge log attached first no longer stalls it.
- A bug report read by the Defect checklist and the Defect Profile at the same time downloads its logs once, and the profile's DxDiag reading is no longer lost.
- Convert to Defect: a report taken to convert it goes back to unassigned when the conversion does not start.

## 3.53.13 (2026-11-20)

### Fixed issues

- Defect Profile: an exception the attached reports share counts by its message, however many ways the game reached it, so the card shows it as the pattern and points out the reports that lack it.

## 3.53.12 (2026-11-20)

### Fixed issues

- Detail view: a filter clicked on an issue page that did not load (a deleted issue, or one you cannot see) opens the filter's first issue instead of doing nothing.
- Detail view: switching straight back to the issue still on screen no longer loads that issue again 15 seconds later.

## 3.53.11 (2026-11-20)

### Fixed issues

- Exception search: an edited long exception message now still finds the reports that hold it when the part JiTA keeps of it ended at a space.

## 3.53.10 (2026-11-20)

### Fixed issues

- Every open Jira tab now hears another tab's sync and log readings: a parsed log's known defects, and the reports a defect's exceptions raise, no longer stay out of date until the tab is reloaded.

## 3.53.9 (2026-11-20)

### Fixed issues

- Lead duties: the window keeps one height on every tab, so the tabs stay where they are when you switch; the Applications list now uses the whole window.

## 3.53.8 (2026-11-20)

### Fixed issues

- Defect checklist: when the bug report cannot be read (Jira busy, a network blip), the card now says it could not check, instead of judging the defect as written from scratch and possibly showing Ready for FC.

## 3.53.7 (2026-11-20)

### Fixed issues

- Lead duties: pressing Ctrl+Enter again while a VMS note is being sent no longer posts it twice, and a note already posted no longer comes back as an unsent draft after a Refresh.

## 3.53.6 (2026-11-20)

### Fixed issues

- Lead duties: a browser that cannot save the wiki page list no longer reads the whole wiki page tree from Confluence again and again while the tab is open.

## 3.53.5 (2026-11-20)

### Fixed issues

- Lead duties: quality control no longer stops saving Checked and Flag once the Lead Ledger holds several months of them. Each month is now kept on its own on the ledger page, still for six months.

## 3.53.4 (2026-11-20)

### Fixed issues

- After an update that makes JiTA fetch the open bug reports again, the ones closed shortly before no longer stay listed as open matches until a manual rebuild.

## 3.53.3 (2026-11-20)

### Fixed issues

- When your Jira session runs out, the lists of open bug reports no longer take every report off as if it had been closed: JiTA first checks that Jira still knows who you are.

## 3.53.2 (2026-11-20)

### Fixed issues

- After an update, tabs still open from before no longer keep JiTA's background work (matching, credits) on the old version until they are reloaded: an updated tab takes it over within seconds, however many there are.

## 3.53.1 (2026-11-20)

### Fixed issues

- Copy diagnostics now includes what JiTA writes to the console (sync results, failed attaches and translations, worker messages), with or without Debug logging, and points out a ranking worker left over from an older version.

## 3.53.0 (2026-11-19)

### New features

- Copy diagnostics, in Settings \> About: puts a short report on your clipboard (JiTA's version, your browser, what is stored and the errors JiTA ran into) to paste when you report a problem. Nothing is sent anywhere.

### Fixed issues

- Errors JiTA used to drop without a trace are now kept for that report, and shown in the console with Debug logging on.

## 3.52.3 (2026-11-19)

### Fixed issues

- Internal cleanup, no visible change.

## 3.52.2 (2026-11-18)

### Fixed issues

- The list of changes in Settings \> About now comes with the script as its own file, CHANGELOG.md, which can also be read on GitHub.

## 3.52.1 (2026-11-18)

### Fixed issues

- Matching bug reports and Similar open reports: the number of open reports on their status line counts only the reports they can list, so no longer the Vanguard and Launcher ones they leave out.

## 3.52.0 (2026-11-18)

### New features

- Matching bug reports on a defect, and Similar open reports on a bug report, leave out reports labelled Vanguard or Launcher and those in the Launcher component, as the backlog filter does.
- Once after updating, JiTA fetches the open bug reports again in the background, to learn their labels. Until it is done, Vanguard and Launcher-labelled reports can still show up.

### Fixed issues

- Matching bug reports no longer leaves out reports with the EO - GameMasters team. A report converted to a support ticket is closed now, and closed ones were never listed.

## 3.51.5 (2026-11-15)

### Fixed issues

- ISD credits: the leaderboard and the credits pill show the same number for you. Your own row is counted every 2 minutes, the rest every 15, and the newer count of your row is now used in both, rank included.

## 3.51.4 (2026-11-15)

### Fixed issues

- ISD credits: a defect its own reporter closed, as one filed by mistake and taken back, no longer counts as created or resolved, whatever its resolution.
- ISD credits: defects count in every space, not just EO, PLAT and EDR.

## 3.51.3 (2026-11-09)

### Fixed issues

- Detail view: an issue that takes a few seconds to open no longer reloads the page. Jira keeps the issue before on screen until the new one is ready, and JiTA now waits up to 15 s for it, as Convert to Defect does.
- Detail view: two slow issues no longer make every later click in the list reload the page for half an hour.

## 3.51.2 (2026-11-09)

### Fixed issues

- Defect checklist: a bug report label taken off and put back, say a language label for a bug in that language, counts as taken off and as one of the defect's own.
- Defect checklist: Add appropriate labels can no longer be marked Not needed.

## 3.51.1 (2026-11-08)

### Fixed issues

- Attach and Convert to Support Ticket (its Close bug report too) no longer reload the page: Jira shows the new status and links at once.
- Convert to Defect opens the new defect without reloading Jira, so it is there sooner.
- Convert to Defect shows a spinner in its button until the new defect is open, and the button stays off on a bug report you converted.
- Attaching a bug report to the defect you are on shows it in the defect's linked work items at once.

## 3.51.0 (2026-11-08)

### New features

- New Defect checklist card on a defect you wrote: what the ISD guide asks of a defect, each item checked against the defect, and against the bug report it was converted from.
- A defect cannot be unassigned (handed to FC) until every item is done, its attachments checked included. Items the guide lets a defect go without can be marked Not needed. Settings \> Features switches it off.
- It suggests labels already in use that the defect's text calls for. One click adds one, takes the bug report's labels off, or adds an exception from its logs to the description in an expand, and Jira shows it at once, without a reload.
- Convert to Defect assigns an unassigned bug report to you first, so the defect starts out yours until you hand it to FC. A defect that starts out unassigned anyway offers Assign to me.
- The card follows an edit within seconds, and its Copy gives the reproduction steps as a real numbered list in Jira.
- Leads see the card on every ISD member's defect.

## 3.50.0 (2026-11-08)

### Fixed issues

- Triage mode, the full-screen queue opened by double-tapping \<, has been removed. The Triage Assistant in the sidebar, the detail view and the other double-tap shortcuts (\>, \# and +) stay as they are.

## 3.49.2 (2026-11-08)

### Fixed issues

- Small improvements behind the scenes.

## 3.49.1 (2026-11-08)

### Fixed issues

- Small improvements behind the scenes.

## 3.49.0 (2026-11-08)

### Fixed issues

- Small improvements behind the scenes.

## 3.48.0 (2026-11-01)

### Fixed issues

- The Lead duties and What's new pills no longer show a second time inside a database a Confluence page embeds.
- Small improvements behind the scenes.

## 3.47.0 (2026-11-01)

### New features

- Cards in Similar defects, Matching bug reports and Triage mode end in one row of small symbols, the date at the right. The dot is green while open, yellow in progress, red once closed. ≡ is the same exception in the log, ≈ a looser match.
- More symbols: ▲ and a count for a trending defect, ◷ for one fixed long before the report, and ↑ → ↓ ★ for the trend on trending rows. Hover any symbol for what it says. The status, exception and Created lines are gone.
- A card's date reads 12 Jun in the current year and 06 Mar 25 before it, with the full date in its hover.

### Fixed issues

- Triage Assistant in the sidebar: an Attach still checking the report's assignee is grey, no longer link blue.
- A card without a created date keeps no empty strip at its bottom, and a missing date no longer shows as 01 Jan 1970.
- Triage mode's matches now show when a defect was fixed long before the report, as the panel's cards do.

## 3.46.0 (2026-10-22)

### New features

- Stacktraces in a log (STACKTRACE \#) now count wherever exceptions do: double-tap + finds them, they raise a match in both lists ("same stacktrace in log"), the Defect Profile counts them, and the log parser marks their defects.
- The client cuts a stacktrace at 6400 characters, so a long one can lose its stack. Such a one is matched by its message alone, as a looser "\~" match.
- To find the stacktraces in the open bug reports' logs, JiTA reads those logs once more in the background, as on the first run of v3.45.0. The zips are not downloaded again.
- UserErrors, the messages the game shows the player (ThrottleGeneric when buttons are clicked too fast, a session change still under way), no longer raise a match, point at a defect or make a Defect Profile pattern.
- Any other exception or stacktrace that is only noise can be ignored: "ignore" in the full Defect Profile or in double-tap + leaves its message out for every defect, at any stack. Settings \> Triage Assistant counts it again.
- One in 5% or more of the open reports' logs (10 at least) is common and no longer raises a match. They are counted once a day while Read open reports' logs is on. "count anyway" counts one all the same.
- The Defect Profile and double-tap + list the ones that don't count apart, folded, each saying why. Ticked in double-tap +, they are still looked for.
- A match an exception raises now says which one: hover its badge ("same exception in log") for that exception's message and stack, and any others the two share.

### Fixed issues

- An exception cut off before its EXCEPTION END line no longer takes the stacktrace after it for more of its stack.
- Double-tap +: a stacktrace's first line typed on its own, such as "STACKTRACE \#95 Some text", is looked for by its message at any stack, no longer refused.

## 3.45.0 (2026-10-20)

### New features

- Similar defects: a defect holding an exception that is also in the bug report's log ranks higher, with a higher %, and its row says why: "same exception in log" for the same stack, "\~ same crash site in log" for the crash site.
- Matching bug reports on a defect rank higher the same way when their logs hold one of the defect's exceptions: the ones pasted in its description, and the ones its attached reports share.
- An exception only confirms a match the text already found: nothing joins a list on an exception alone, since a log also holds exceptions unrelated to the bug.
- Triage mode ranks its matches the same way.
- To know what the open bug reports' logs hold, JiTA now reads them in the background. The first run downloads a lot, later ones only new or changed reports. Settings \> Triage Assistant \> Read open reports' logs switches it off.

### Fixed issues

- Exception search (double-tap + on a defect): bug reports filed in the launcher are skipped. They have no logs.txt or igbr.zip to read, so the search gets through the open reports sooner.

## 3.44.1 (2026-10-19)

### Fixed issues

- Exception search: the window keeps one size whatever it finds, and a report's description shows beside the window when you hover it, no longer over the list.

## 3.44.0 (2026-10-19)

### New features

- New: on a defect, double-tap + to find the open bug reports whose logs hold the defect's exceptions, and attach them from the list.
- Tick the exceptions to look for: those in the defect's description, those its attached reports share, or every exception in the log of its one attached report. Nothing starts ticked, and nothing is downloaded until you tick one.
- An exception is looked for as written in the log, numbers included. Click edit to put \# where any number will do and \* where any text will, so the same error with other values is found too. The stack still has to match.
- Add exceptions of your own in the box below the list: type a message (\# any number, \* any text) to find it at any stack, or paste an exception from a log to find it at its stack.
- Reports with the same stack come first, then those with only the same crash site. A report someone else has says who, and can still be attached; it stays assigned to them.
- What a report's logs held is remembered, so a later search only downloads the logs of new or changed reports.
- Defect profile: an exception whose defect you hid in the Triage Assistant no longer counts toward the pattern or its outliers. It is listed apart, under a folded hidden exceptions line in the card and in the full profile.
- Defect profile: switchable graphics is no longer counted, as it says No on practically every report.

### Fixed issues

- Detail view: after an issue was slow to open, clicking an issue in the list no longer reloads the whole page, with Jira asking whether to leave it. A slow issue is now waited for.
- Defect profile: hovering an exception shows its message and its call stack one frame per line, instead of one long lowercased line.

## 3.43.0 (2026-10-18)

### New features

- Lead duties: a person with several open follow-ups gets a Resolve all button in the Follow-ups tab, which closes them all out at once with one note saved on each.
- Lead duties: the note for a Flag, a Resolve or a Resolve all is written in a box that takes several lines, and its line breaks are kept on the Follow-ups tab, in the follow-up message and on the ledger page.
- A note you cancel, or one that could not be saved, is offered again the next time you open the box for it.

## 3.42.1 (2026-10-05)

### Fixed issues

- The defect profile now reads every bug report attached to a defect, not just the latest 25. The first visit to a defect with many reports takes longer; later visits only read the reports attached since.

## 3.42.0 (2026-10-05)

### New features

- Settings is split into tabs: Features, Triage Assistant, Canned responses, Lead duties (for Leads) and About. It keeps one size whichever tab is open, and opens on the tab you last used.
- Canned responses are edited right in their tab instead of a separate window. Save keeps Settings open, and unsaved edits stay while you look at another tab.

## 3.41.0 (2026-10-04)

### New features

- On a defect, a new Defect Profile card shows what its bug reports have in common: GPU, OS, renderer, CPU, client builds, shared exceptions and the module their crashes happened in. A shared pattern is highlighted.
- Reports that do not fit the pattern are listed with the reason, which often means a report attached to the wrong defect. Open full profile shows the breakdown, report by report.
- Settings \> Features \> Defect profile switches it off. Under it, Read igbr.zip switches off just the zip downloads that give the crash histories, for smaller downloads and weaker profiles.

## 3.40.2 (2026-10-04)

### Fixed issues

- A bug report attached or closed directly in Jira now leaves a defect's Matching bug reports, and a report's Similar open reports, as soon as the list is shown, instead of up to 30 minutes later. The next match takes its place.
- Attach refuses a report that Jira already shows as attached or closed, instead of adding a second link to it.
- Triage mode: a match found already attached in Jira is taken off the list, and the next one moves up.

## 3.40.1 (2026-10-03)

### Fixed issues

- Opening a bug report from a link or a reload no longer sometimes stops JiTA from loading at all, leaving no panel, buttons or pills. This came in with v3.38.16.
- If one part of JiTA fails while a page loads, the rest now loads anyway.

## 3.40.0 (2026-10-03)

### New features

- The ISD credits pill now shows your credit balance from VMS, next to the credits you have earned so far this month.
- When VMS cannot be read (you are not logged in there, for example), the pill shows a ⚠ and keeps the last balance it read. Click the ⚠ to open your VMS profile; the balance updates when you come back to the tab.

## 3.39.5 (2026-10-03)

### Fixed issues

- Closed defects fixed long before a report are no longer greyed out in the panel or in Triage mode. They still rank lower and still say how long before the report they were fixed.

## 3.39.4 (2026-10-03)

### Fixed issues

- A tab where the shared background worker cannot run no longer loads its own copy of the text model: it ranks by keywords, as it already did.
- Internal cleanup, no other visible change.

## 3.39.3 (2026-10-03)

### Fixed issues

- Picking a canned response now waits for the public reply box to be ready, and says so when the text could not be put in, instead of doing nothing.
- A canned response or the note for the GMs can no longer land in a Jira editor outside the Zendesk panel.
- Convert to Support Ticket counts the note for the GMs as posted only once it has left the reply box, so a post that fails stops the conversion.
- The canned-response dropdown no longer rewrites its label several times a second in Firefox.

## 3.39.2 (2026-10-03)

### Fixed issues

- A first download of the defect or bug report data that is interrupted by a reload now carries on where it stopped, instead of starting over on every reload.
- The background sync every 30 minutes no longer re-embeds, re-translates and redraws when nothing in Jira changed.
- A translation finished while a sync is writing the same report is no longer lost.
- Rebuild BR DB now translates the foreign reports again, and the panel no longer keeps showing "Syncing" after a sync.

## 3.39.1 (2026-10-03)

### Fixed issues

- Only the Created and Updated dates at the bottom of an issue are hidden now, since they show at the top. Any other date Jira lists there stays visible.
- Internal cleanup, no other visible change.

## 3.39.0 (2026-10-03)

### New features

- What's new has two tabs now, New features and Fixed issues, and the pill only comes up for an update that brings something new to use. Fixes are listed without one.

## 3.38.28 (2026-10-03)

### Fixed issues

- Attaching a report from a defect asks Jira who has it right before attaching, so a report someone took meanwhile is no longer reassigned to you.
- A link or attach that Jira refuses now shows Jira's reason (a required field, a validator, a permission) instead of just an HTTP code.
- Defects fixed long before a report are greyed out in the panel again, and a report whose translation failed is translated again on the next look.
- Known defects in attached logs: a report's logs are scanned once per visit, and a scan that failed is tried again instead of hidden until reload.
- A report whose Original Reporter ID could not be read says so, instead of claiming it has none.

## 3.38.27 (2026-10-03)

### Fixed issues

- Triage mode: pressing a digit twice while the matches are still ranking no longer attaches to a match you never saw; it waits for the list.
- Triage mode: a report attached from the defect queue is gone from the bug-report queue too, and a queue that stopped loading early says so.
- Triage mode: resuming where you left off no longer jumps away from an action, attachment or translation you have open, nor loses its place.
- Triage mode: a Won't Do that Jira refuses says why instead of "\[object Object\]", and switching attachments quickly no longer mixes up two logs.

## 3.38.26 (2026-10-03)

### Fixed issues

- Translating foreign reports: one report that cannot be stored no longer ends the pass and starts a second one beside it.
- Translating foreign reports: a translation service that refuses everything is given up after a while instead of being retried for as long as the tab is open.
- The "Checking reports for translation" line no longer stays in the panel once the pass is done.

## 3.38.25 (2026-10-03)

### Fixed issues

- ISD credits: one failed request no longer throws away the whole leaderboard crawl; it is retried like the rest of JiTA does.
- ISD credits: an old-domain account shared by two names goes to the same person every crawl, and tied members share a rank in the table as on the badge.
- ISD credits: last month is computed once more after it ends, instead of keeping its last mid-month snapshot as if it were final.
- ISD credits: the badge says "updating" while the leaderboard is recomputed, Refresh never leaves a stuck progress pill, and a failed read says so.

## 3.38.24 (2026-10-03)

### Fixed issues

- Triage mode upgrades a report ranked while the model was still loading from Keyword to Hybrid once it is ready, as the panel already did.
- With the ranking worker unreachable, the panel no longer empties and refills every few seconds.
- Defects in log: clicking an entry only steps through occurrences on screen, and the panel shows above Triage mode's attachment viewer.
- Defects in log: an exception pasted into a defect with a stack trace after it, or with its log columns, now matches the same exception in a parsed log.

## 3.38.23 (2026-10-03)

### Fixed issues

- Defects and reports that arrive while an embedding pass is running get their vectors right after it, instead of waiting for a later sync with changes.
- An issue re-synced with new text while it was being embedded no longer keeps the vector of its old text.
- One report that cannot be embedded no longer stops every embedding pass at the same place; it is skipped and tried again next time.
- A sync whose database write fails at the last step (a full disk) now fails instead of leaving "A sync is already running" until reload.

## 3.38.22 (2026-10-03)

### Fixed issues

- Screenshot translation: a box drawn while the image was still loading no longer gets the earlier box's text or error, and the image is downloaded once.
- Screenshot translation: a language you pick is no longer replaced by the one from the labels, and an older translation never lands over a newer one.
- Screenshot translation: a text reader that stops responding while it starts is given up after two minutes instead of blocking until reload.
- Copy buttons say "Copy failed" when the clipboard refuses, instead of "Copied".

## 3.38.21 (2026-10-03)

### Fixed issues

- Lead duties: Clear ledger no longer hangs on "Clearing the ledgers…" when Confluence refuses a delete; it says which one failed and finishes the rest.
- Lead duties: the chip goes away as soon as JiTA finds the account is not a Lead, instead of staying until reload.
- The What's new pill no longer comes back for changes already read when a tab still running an older version is closed or dismissed.
- Settings: a result that arrives after the menu was redrawn is no longer written into the old copy of the menu.

## 3.38.20 (2026-10-03)

### Fixed issues

- The Created / Updated dates in the issue header are fetched again after a minute, so an edit shows, and a fetch that failed is retried.
- Declutter no longer leaves a panel hidden until reload when Jira draws a section title before the rest of the page.
- Switching Extra Buttons off in one tab keeps them off in the others, and switching them on no longer puts them on defects.
- Translate says when only part of a report could be translated, instead of leaving an untranslated part beside a translated one.
- On the wiki, the Lead duties chip and the What's new pill step aside for menus, holding a launcher key no longer opens it, and the scrollbar thumb has its colour again.

## 3.38.19 (2026-10-03)

### Fixed issues

- Background sync: a long first sync keeps its claim, so a second tab no longer starts its own beside it, and a tab that closes frees the claim at once.
- Background sync: after a failed run (an expired session, Jira down) it waits five minutes before trying again, instead of retrying every 30 seconds.
- Attaching or closing a report no longer makes every open tab rebuild the shared ranking indexes once each.
- Switching between GPU and CPU embedding now takes effect even when the tab you switch in is not the one running the shared worker.
- A failed embedding pass no longer leaves its progress text standing, and a database upgrade check no longer gives up when a sync happens to be running.

## 3.38.18 (2026-10-03)

### Fixed issues

- dxdiag Quick Info: memory-leak reports and hangs of the EVE client are no longer counted as client crashes; a hang gets its own amber line.
- dxdiag Quick Info: a file without crash history says "crash history unknown" instead of a green all-clear, and BEX crashes show their real exception code.
- dxdiag Quick Info: driver dates written as 15.08.2023 or 2023-08-15 are read, so the driver age and the over-a-year warning show for them too.
- PDM Quick Info: a file without an OS block says it could not be evaluated, instead of "does not meet the minimum requirements".

## 3.38.17 (2026-10-03)

### Fixed issues

- Parsed logs: Only Exceptions no longer hides the table header or parts of Jira behind the log, and Show All no longer forces Jira's own tables open.
- Parsed logs: a line with a missing column no longer leaves the spinner going forever, logging errors are no longer marked as exceptions, and the first row lost its stray border.
- A log header pasted into a comment no longer turns the comment box into the log parser, and a log the viewer could not hand over is left readable instead of emptied.
- Process Health colours 10 or more sessions red again and compares time dilation as numbers; Method Calls no longer shows NaN or drops its last row.
- PDM data: a value containing a colon is read whole, and an oddly formed file no longer stops the summary from showing.

## 3.38.16 (2026-10-03)

### Fixed issues

- Convert to Support Ticket: trying again after a failed conversion no longer posts the GM note a second time.
- Convert to Support Ticket now waits for the report to close, and says so if it stays open, instead of the window disappearing after 20 seconds without a word.
- Convert to Defect no longer takes you away from, or reloads, an issue you moved on to while it converted, and says so when the conversion does not start.
- The Close button now waits for Jira's status menu instead of giving up after a tenth of a second.

## 3.38.15 (2026-10-03)

### Fixed issues

- Lead duties: when the quality control ledger or the page tree cannot be read, the ledger page is left as it was instead of being rewritten with parts missing.
- Lead duties: the Leads' browsers no longer keep rewriting the ledger page just because each scanned the page tree at a different time.
- Lead duties: while the quality control sample cannot be drawn, the background refresh retries every half hour instead of every minute.

## 3.38.14 (2026-10-03)

### Fixed issues

- Lead duties: a review or check saved while Confluence was unreachable just before the month changed is no longer lost.
- Lead duties: something you took back in another browser no longer comes back as done, and marking an item twice no longer stops Undo from restoring it.

## 3.38.13 (2026-10-03)

### Fixed issues

- With the Status or Created within filter set, similar defects and matching reports now find matches beyond the first 200 candidates instead of saying nothing matched.

## 3.38.12 (2026-10-03)

### Fixed issues

- A parsed log left open no longer collects another defect badge on its exceptions with every sync, and a badge for a defect that no longer matches goes away.

## 3.38.11 (2026-10-03)

### Fixed issues

- Lead duties: one deleted or hidden issue in a month's quality control sample no longer stops the whole Quality control tab from loading; it shows as not found.
- Lead duties: when the volunteer site shows a page JiTA cannot read, Applications now says so instead of claiming nobody is waiting.

## 3.38.10 (2026-10-03)

### Fixed issues

- Convert to Defect can no longer create a second defect when you click it again while the first conversion is still running.

## 3.38.9 (2026-10-03)

### Fixed issues

- The Security Related canned reply no longer contains the placeholder REPLACE WITH TEAM NAME: it now names the Bug Hunter team. A copy you edited yourself keeps your wording.

## 3.38.8 (2026-10-03)

### Fixed issues

- Selecting text in a window and letting go outside it no longer closes the window, so a half-edited canned response is not lost.
- Esc in a text box now just leaves the box, and Esc on a small menu such as the filters closes only that menu, not the window or Triage mode under it.

## 3.38.7 (2026-10-03)

### Fixed issues

- If Jira stops answering, or your session expires, while the issue list beside an issue is looking for the open issue, it no longer repeats the same request in an endless loop.

## 3.38.6 (2026-10-03)

### Fixed issues

- Each sync now refreshes the similar defects and matching reports, so reports closed in the meantime drop out and statuses stay current.
- The credits pill no longer hangs for up to 15 minutes when the Jira tab doing the background work is reloaded or closed.

## 3.38.5 (2026-10-03)

### Fixed issues

- After an update the What's new pill now comes up reliably: if the page takes it away while still loading, it comes back by itself.

## 3.38.4 (2026-10-03)

### Fixed issues

- Attach can no longer link a bug report to another bug report. Triage mode could, after a trip to the defect queue and back.
- The similar defects panel no longer shows the previous issue's matches when you move on before they finish loading, so Attach always acts on the issue on screen.

## 3.38.3 (2026-10-03)

### Fixed issues

- The defect and bug report syncs no longer skip updates when your computer is set to a later timezone than your Jira profile.
- If similar defects or open reports have looked out of date, run Rebuild defect DB and Rebuild BR DB once from the settings.

## 3.38.2 (2026-10-03)

### Fixed issues

- Convert to Support Ticket: the note for the GMs is now posted only once the Zendesk composer is confirmed on its internal note tab, so it can no longer reach the player as a public reply.
- Cancel, Esc or closing the Convert to Support Ticket window now stops the conversion, even while it is still checking for a linked Zendesk ticket.

## 3.38.1 (2026-10-01)

### Fixed issues

- Lead duties: Checked, Flag, Mark reviewed, Skip and Undo now update only the row you clicked, so the list no longer empties, reloads and jumps around.
- Resolving a follow-up no longer reloads the Follow-ups tab, and the list keeps its scroll position.
- When a mark cannot reach Confluence, or in a dry run, the status line now says so instead of the message vanishing straight away.
- An Undo that Confluence refuses or cannot reach now leaves the item marked, so the Lead duties pill no longer counts it as still to do.
- A Flag or Skip that cannot be saved is no longer queued to be replayed as a plain Checked or review: its buttons come back so you can try again, and the Flag reason you typed is kept.

## 3.38.0 (2026-09-30)

### New features

- After an update, a "What's new" pill appears in the bottom-left corner. Click it to read what changed, or use its x to dismiss it until the next update.
- The full history of changes, back to the first version in May 2023, is always available in Settings under About.
- The pills in the bottom-left corner now stack neatly, with no empty gap when one of them is not shown.

## 3.37.0 (2026-09-29)

### New features

- Lead duties: reviewed and skipped pages in the Wiki review tab get an Undo button that puts the page back on your list and restores its review history.
- Undo appears only on your own marks, and on a review only while it is still the page's latest reading. Reviews marked before this version have no Undo.
- Recently resolved follow-ups now show the reason they were raised, with the resolution on a line underneath.
- A new note on a VMS application now starts on Public visibility, or on the widest level the page offers.
- If the ledger changed in the meantime and refuses an Undo, the status line now says so instead of reporting success.

## 3.36.0 (2026-09-28)

### New features

- Lead duties: checked and flagged items in the Quality control tab get an Undo button that puts a verdict marked by mistake back on your list.
- Undoing a flag asks first, because it also withdraws the follow-up the other Leads can see. A flag that is already resolved cannot be undone.
- The Quality control table on the ledger page gains a Reason column with what the Lead wrote when flagging, kept after the follow-up is resolved.

## 3.35.2 (2026-09-28)

### Fixed issues

- Screenshot translation: the language dropdown no longer snaps shut straight away in Jira's attachment viewer.
- The Recognized text box there now accepts typing, so you can correct the text before Translate again.

## 3.35.1 (2026-09-28)

### Fixed issues

- The Lead duties pill no longer disappears when the month is done. It now reads 'all done' instead, and the x still hides it for a day.
- The pill updates as soon as something is marked in the Lead duties window, so the month's last mark turns it to 'all done' right away.
- Fixed a false reminder: the daily dialog now checks the shared ledger first, so pages you reviewed in another browser no longer count as due.
- The daily dialog now appears only when there really are page reviews or QC checks left to do.

## 3.35.0 (2026-09-28)

### New features

- New: Trending defects shows the defects that recent bug reports keep getting attached to, so you can see what players are hitting right now.
- Pick it from the funnel menu in the Triage Assistant panel or Triage mode, where rows keep their Attach control, or double-tap \# to switch to it and back.
- Off a bug report, double-tap \# opens a standalone trending list with a per-day chart.
- Trending defects carry a 🔥 badge with their report count in the similar-defects list and in Triage mode's matches. Ranking is unchanged.
- A defect trends at 5 or more reports created in the last 14 days. A resolved defect that keeps getting reports shows how many came after the fix.

## 3.34.0 (2026-09-28)

### New features

- New: Screenshot translation. With an image attachment open, click Translate text and drag a box around text to read and translate just that part.
- It works in Jira's attachment viewer and in Triage mode's viewer, and the text is read inside your browser.
- The language comes from the report's client-language label, and a dropdown lets you change it per issue.
- The result card shows the translation and the recognized text, which you can correct and translate again, join into one line, or copy.
- It can be switched off in Settings under Screenshot translation.

## 3.33.1 (2026-09-26)

### Fixed issues

- Lead duties: accented letters and non-Latin scripts in VMS applications, such as names, answers and notes, now show correctly instead of as raw codes.
- Special characters an applicant typed are no longer decoded twice, so their text shows exactly as they wrote it.

## 3.33.0 (2026-09-26)

### New features

- Detail view: switching a filter's list to Basic now searches within that filter instead of throwing it away.
- The filter shows as a named pill in the bar. Click it to see its JQL, or click its x to search all work with the same basic filters.
- Switching between Basic and JQL no longer asks for confirmation and never changes the list.
- A filter picked while in Basic stays in Basic, and narrowing it keeps it highlighted in the sidebar.
- Re-sorting or changing the search now loads one page instead of paging through thousands of issues looking for the open one.

## 3.32.1 (2026-09-26)

### Fixed issues

- New: Detail view. On any /browse/ page, the list of matching issues sits on the left beside Jira's own issue view, like Jira's removed detail view.
- A filter bar offers Basic filters, JQL and starred filters. Up and Down walk the list with no page load, and prev and next buttons sit by the issue key.
- Clicking a filter in Jira's sidebar loads it into the list, highlights it in the sidebar, and opens its first issue.
- Filters clicked anywhere in Jira now open in the detail view. Both this and the detail view itself can be switched off in Settings.
- The ISD Credits badge and the Lead duties pill no longer cover Jira's dropdowns, dialogs and menus near the screen corners.

## 3.27.0 (2026-09-21)

### New features

- Lead duties: the ledger page is never published from an incomplete scan of the wiki, so it can no longer list pages that should be excluded.
- A browser on an older JiTA version no longer overwrites a ledger page written by a newer one, and says so instead.
- Refresh in the Lead duties window and the daily wiki re-scan now update the ledger page too.
- The ledger page footer names the JiTA version that last published it and whose tab it came from.

## 3.26.3 (2026-09-20)

### Fixed issues

- Lead duties: new VMS applications and returned questionnaires now count on the Lead duties pill. If VMS cannot be read, it says so instead of showing zero.
- A new Applications tab lists who is waiting, oldest first, beside the selected application's answers, with the notes on the account shown on top.
- Accept, Decline or Reset an application from the window. Each needs a second press, and Decline says that it will message the applicant.
- Write a note on an applicant's account from the window, with its visibility shown beside Post. Refresh no longer discards a half-written note.
- Each questionnaire gets its own numbered tab, opening on the one the application is waiting on, and the answers are easier to read.

## 3.20.5 (2026-09-20)

### Fixed issues

- Lead duties: a month's wiki reviews are never assigned from an incomplete scan of the wiki, so pages from excluded sections cannot slip into a list.
- An incomplete scan is thrown away and the last complete one is used instead.

## 3.20.4 (2026-09-20)

### Fixed issues

- Lead duties: the ledger page on the wiki now updates right after each mark, so closing the tab straight away no longer loses the update.
- A mark made while the page is still being written is no longer held back until the six-hourly refresh.

## 3.20.3 (2026-09-20)

### Fixed issues

- Lead duties: fixed several ways the ledger page on the wiki could quietly stop matching the ledger, including right after a new month was assigned.
- A failed ledger page update now shows on the Settings status line instead of going unnoticed.

## 3.20.2 (2026-09-20)

### Fixed issues

- Lead duties: the ledger page no longer lists pages from excluded wiki sections as outstanding work, matching the Lead duties window and pill.
- The ledger page now says how many assigned pages dropped out because they sit in an excluded section.

## 3.20.1 (2026-09-20)

### Fixed issues

- Triage mode now shows its queue as a list beside the open issue, with a Details column, so you can see what is coming and click to jump to any issue.
- Up and Down move through the list. Left switches to the bug-report queue and Right to the open-defect queue.
- The open-defect queue gets its own editable JQL filter, separate from the bug-report queue's.
- The matches column gets the panel's filters: text search, the funnel with Status, Created within and both report views, and the ranking-mode badge.
- Lead duties: pages inside a folder in an excluded wiki section are no longer assigned for review.

## 3.17.2 (2026-09-19)

### Fixed issues

- On wide lists such as Lead duties and the Duplicate-defect finder, the hover preview now opens above or below the row instead of covering its buttons.

## 3.17.1 (2026-09-19)

### Fixed issues

- Lead duties: the Wiki review footer now shows just your progress. Section-wide coverage numbers stay in Settings and on the ledger page.

## 3.17.0 (2026-09-19)

### New features

- Lead duties: the flag prompt now says the reason is shown to the other Leads and also quoted to whoever handled the item.
- Quality control rows stay lined up in their columns after they are checked.
- The Feature Ideas and Discussion wiki section is no longer part of the review rotation.
- Lead duties no longer adds its own Tampermonkey menu entry. Open it from the pill, the daily dialog or Settings.

## 3.16.0 (2026-09-19)

### New features

- New for Leads: Lead duties, a monthly wiki-review rotation and quality-control sampling, split across the Leads without overlap. Others see nothing.
- Wiki review hands each Lead a few pages a month, least-reviewed first, and every page gets read by two different Leads within 12 months.
- Quality control samples last month's ISD-handled bug reports and defects, names who handled each, and lets you mark it checked or flag it with a reason.
- Flags become follow-ups, grouped by Bug Hunter, each with a ready-to-paste message you can copy or edit first.
- A ledger page on the wiki shows assignments, follow-ups and review history. The Lead duties pill and a daily reminder show what is left.

## 3.15.0 (2026-09-19)

### New features

- Triage mode gets a second queue over open defects, switched with the Up and Down arrows. Each queue remembers where you left off.
- In the defect queue, the matches are open bug reports for the defect on screen, and 1 to 9 attaches the picked report to it.
- The bug-report queue's JQL can now be edited behind a JQL button. It defaults to the bug hunters' standard backlog filter.

## 3.14.2 (2026-09-16)

### Fixed issues

- Triage mode no longer reports a GM conversion as failed just because the report closes slowly; it keeps checking in the background for up to a minute.
- The warning about a missing or duplicate Zendesk ticket now only appears if the report is still open after that minute.
- The bug report's title is shown again in Triage mode, between the header and the description.

## 3.14.1 (2026-09-13)

### Fixed issues

- The minimum text similarity dropdown in the Duplicate-defect finder is now readable in Jira's light theme.

## 3.14.0 (2026-09-12)

### New features

- New Duplicate-defect finder: double-tap \> to list open defects that look like duplicates of each other but are not linked yet.
- Pairs are found by similar text (adjustable minimum, 90% by default) or by sharing the same exception, and grouped into clusters with the evidence shown.
- Ignore hides a pair from then on, and "Show ignored" brings dismissed pairs back so you can unignore them.
- The finder only points out candidates; it never links or merges anything itself.
- Stale copies of defects that were moved to another project are removed from local data, which also tidies up the similar defects list.

## 3.13.0 (2026-09-12)

### New features

- New Triage mode: double-tap \< to work through the open bug report backlog in a full-screen, keyboard-driven queue that remembers where you left off.
- Press 1-9 to attach the report to a matching defect, T to close it as Won't Do, G to convert it to a GM support ticket, or E to show an English translation.
- Every action needs a second key press to confirm and first re-checks that the report is still open and unassigned or yours.
- Attachments open in a full-screen viewer, EVE logs open in the Log Parser, and the arrow keys step through them.
- Hover previews can now be moved into and scrolled. The ISD Credits leaderboard now opens from its badge only, no longer from Settings or the Tampermonkey menu.

## 3.12.0 (2026-09-12)

### New features

- New "Similar open reports" option in the Triage Assistant panel's filter menu lists all open bug reports similar to the one you are viewing.
- Reports in other languages are included, matched through their English translation.
- It replaces the "Possible duplicate reports" section and its toggle button.

## 3.11.0 (2026-09-12)

### New features

- A bug report you attach to a defect now drops off that defect's list of matching bug reports right away, in every open tab.

## 3.10.8 (2026-08-30)

### Fixed issues

- The ISD Credits window now opens straight to the leaderboard. The separate summary card is gone, and your own row is highlighted in the table.

## 3.10.7 (2026-08-26)

### Fixed issues

- Background translation of foreign reports runs a little slower to stay under Google's rate limit, which means fewer pauses overall.

## 3.10.6 (2026-08-26)

### Fixed issues

- Bug reports in other languages are now translated to English in the background, so they can be matched against English defects.
- A closed or not yet translated foreign report is translated on the spot when you open it, so its similar defects are still found.
- The Triage Assistant panel shows live progress while reports are checked and translated.
- After updating, all reports are re-processed once in the background.

## 3.9.0 (2026-08-25)

### New features

- Matching goes back to the previous English-only text model, as the multilingual experiment did not work out.
- Browsers that ran 3.8 rebuild their matching data once in the background; everyone else is unaffected.
- The live progress display and the Debug lines for the text model and GPU or CPU use are kept.

## 3.8.5 (2026-08-25)

### Fixed issues

- Experimental: bug reports in other languages can now match English defects, using a new multilingual text model.
- After updating, all open reports are re-processed once in the background; until that finishes, matching relies on keywords only.
- The Triage Assistant panel shows live progress while reports are being re-processed.
- The Debug section in Settings shows which text model is active and whether matching runs on the graphics card or the CPU.

## 3.7.3 (2026-08-24)

### Fixed issues

- The "Possible duplicate reports" section now starts collapsed on every issue you open instead of staying open across issues and reloads.

## 3.7.2 (2026-08-24)

### Fixed issues

- Safer local data upgrades: with many Jira tabs open, a future update can no longer hang or break the data stored in your browser.

## 3.7.1 (2026-08-24)

### Fixed issues

- New "Possible duplicate reports" section on bug reports lists up to five closely matching open reports; turn it on with the new button beside the filter funnel.
- "Known defects in attached log" now recognises more kinds of crash lines, so it finds more known defects.
- When the panel has no local data yet or hits an error, it now offers a "Sync now" or "Retry" button right in the message.
- Typing in comments is lighter, as the Log Parser no longer rescans the page on every keystroke.

## 3.6.3 (2026-08-24)

### Fixed issues

- Internal cleanup, no visible change.

## 3.6.2 (2026-08-24)

### Fixed issues

- Raw text no longer flashes before parsing when you open the DxDiag, PDM data, outstanding calls or last crashes files from the client's zip attachment.

## 3.6.0 (2026-08-24)

### New features

- The Log Parser now handles very large logs, such as a multi-megabyte log from the client's zip attachment, which were silently left unparsed before.
- Raw log text no longer flashes on screen before the parsed view appears.

## 3.5.3 (2026-08-24)

### Fixed issues

- Internal cleanup that makes future Jira page changes quicker to fix, no visible change.

## 3.5.2 (2026-08-24)

### Fixed issues

- Internal cleanup, no visible change.

## 3.5.1 (2026-08-24)

### Fixed issues

- The "Same exception" section on defects no longer flickers when the Triage Assistant panel refreshes.

## 3.5.0 (2026-08-24)

### New features

- ISD Credits are now always calculated in the shared background worker, so every tab counts them the same way.
- If the background worker is down, a credits refresh now fails within seconds instead of hanging, and retries are spaced out.
- Background credit refreshes stay quiet about errors, while a manual Refresh still tells you what went wrong.

## 3.4.0 (2026-08-24)

### New features

- If the shared background worker crashes, it restarts itself or another tab takes over, instead of matching and ISD Credits timing out.
- After a script update, a tab still running old code hands over to an updated one automatically, about 30 seconds after you reload any tab.
- Settings has a new Debug section showing the worker's status and version, with a debug logging switch and a button to test crash recovery.
- The Settings header now stays on top of the switches when you scroll.

## 3.2.4 (2026-08-24)

### Fixed issues

- The "Known defects in attached log" section of the Triage Assistant panel no longer flickers when the panel refreshes.

## 3.2.3 (2026-08-23)

### Fixed issues

- The Triage Assistant panel no longer empties and refills its list when it refreshes in the background.
- The panel no longer disappears and reloads right after an issue opens.
- Fields hidden with Declutter no longer flash back into view when Jira redraws the page.

## 3.2.0 (2026-08-23)

### New features

- New Declutter: choose "Declutter Jira fields" in the Tampermonkey menu to hide fields and sections you never use on an issue.
- Your choices are saved separately for bug reports and defects and applied automatically, even after Jira redraws the page.
- The list shows what is on the issue you have open, so open another issue to see other options.

## 3.1.3 (2026-08-23)

### Fixed issues

- The Translate button now switches to a second Google translation service when the first one is throttled, so it keeps working.
- Brief network drops no longer break the reporter's other reports view, the defect sync or ISD Credits refreshes; the script simply retries.

## 3.1.1 (2026-08-22)

### Fixed issues

- Titles of the ISD Credits window, the Convert to Support Ticket dialog and other pop-up windows are readable again in Jira's light theme.

## 3.1.0 (2026-08-21)

### New features

- "Assign to GM" now opens a Convert to Support Ticket dialog: pick a category, add an optional note for the GMs, and the bug report closes automatically.
- If the report has no linked Zendesk ticket, the dialog says so and offers to close the bug report instead.
- ISD Credits now count a report converted to a support ticket as a reassignment only, and any other report you close as trashed.
- ISD Credits refresh much faster.

## 3.0.0 (2026-08-21)

### New features

- All open Jira tabs now share one background worker for matching and ISD Credits, which cuts memory and graphics card use with many tabs open.
- ISD Credits refreshes no longer stall in background tabs, and two tabs no longer refresh the same month at once.
- The full ISD Credits leaderboard is now visible to everyone, not just Leads.
- The badge now reads "Credits", and months that have not been calculated yet are clearly labelled.

## 2.39.0 (2026-08-20)

### New features

- New ISD Credits badge in the corner shows your credits and rank for the current month; click it to open the ISD Credits window.
- The ISD Credits window has a month picker for the last 12 months. Leads see the full leaderboard, everyone else sees their own numbers and rank.
- Your own numbers update about every 2 minutes and the full leaderboard about every 15 minutes, in the background.
- Credits are split into Defects (created, resolved) and Bug reports (attached, trashed, reassigned); lead and mentor bonuses do not count.
- Settings has a new ISD Credits section to open the leaderboard, refresh now or switch the feature off.

## 2.37.0 (2026-08-20)

### New features

- First look at ISD Credits: a new Tampermonkey menu command works out your credits for the current month and shows your total and rank.
- A small pill in the corner shows progress while your credits are being calculated.

## 2.36.0 (2026-08-19)

### New features

- Internal renaming to match the new name, no visible change. Your settings and canned responses are kept.
- The old Enhanced Jira Features script stays at this version and moves anyone still using it over to JiTA on their next update check.

## 2.35.0 (2026-08-19)

### New features

- The script is now called Jira Triage Assistant (JiTA), and existing installs switch to it on their next update check.
- Convert to Defect no longer creates two defects from one click, and it now takes you straight to the new defect.
- The Extra Buttons no longer fire twice after Jira redraws the page or you move between issues.

## 2.34.0 (2026-08-12)

### New features

- New "This reporter's other reports" button in the Triage Assistant filter menu lists every other report from the same reporter, newest first.
- The list comes from a live Jira search, so it also includes closed and GM-team reports; closed ones are greyed out.
- Use "Back to similar defects" to return; the view also resets when you move to another issue.

## 2.33.0 (2026-08-12)

### New features

- Bug reports assigned to the EO - GameMasters team no longer show up under "Matching bug reports" on defects.
- Already-synced reports are refreshed once automatically so the change applies to them too.

## 2.32.0 (2026-08-10)

### New features

- After you click Translate, the Triage Assistant searches again using the English text, so foreign-language reports find better matches.

## 2.31.0 (2026-08-10)

### New features

- Opening a DxDiag report from a bug report zip now shows a Quick Info summary, starting with the reporter's crash history.
- The summary lists EVE client crashes and blue screens by name, and flags hardware errors and DxDiag's own Direct3D crashes.
- It also shows each graphics card's driver date and age, marks integrated and dedicated cards, and adds a short OS, CPU and RAM line.
- Fixed an empty outstanding calls or last crashes file causing the next file you opened to appear in the wrong table.

## 2.30.0 (2026-08-09)

### New features

- New funnel button in the Triage Assistant filters results by status (Open, Closed, All) and by creation within the last N days, until reload.
- The PDM system check now shows minimum and recommended tiers with a breakdown per component.
- Modern many-core CPUs are rated by thread count so they no longer wrongly show as minimum, and dual-GPU laptops use the stronger card.
- Log Parser no longer misreads a code block in a comment as a log, and files in bug report zips open more reliably.
- Updated bundled libraries and internal cleanup, no other visible change.

## 2.27.1 (2026-07-27)

### Fixed issues

- Fixed the Triage Assistant and known-defect matching breaking after Atlassian started blocking the browser database behind a consent check.
- Your already-synced data is kept.

## 2.27.0 (2026-07-07)

### New features

- New "Group Repeats" toggle in the Log Parser collapses consecutive identical lines or exception blocks into one row with an Nx count.
- Grouping updates live as you toggle message types or search, so hidden rows never break up a run of repeats.

## 2.26.0 (2026-07-05)

### New features

- PLAT issues are now synced and indexed, so they appear as similar defects on bug reports alongside EDR and EO.
- Existing installs refetch their defect data once automatically to pick up PLAT issues.

## 2.25.0 (2026-07-05)

### New features

- PLAT issues now show a "Matching bug reports" list of similar open bug reports in the Triage Assistant.

## 2.24.3 (2026-06-25)

### Fixed issues

- Fixed the Canned responses dropdown opening as a white list in Chrome; it now matches the dark theme.

## 2.24.2 (2026-06-25)

### Fixed issues

- The opening and closing lines for Canned responses can now span several lines.

## 2.24.1 (2026-06-25)

### Fixed issues

- New Canned responses dropdown in the Zendesk Support panel: pick a reply and it is filled into the public reply box for you.
- Comes with 32 built-in replies grouped by section, plus an optional opening and closing line wrapped around each one.
- Edit, add or delete responses and sections in Settings under "Customize responses"; "Restore defaults" brings back the originals.
- Responses you never edited automatically pick up wording fixes from script updates.
- The Triage Assistant is no longer a beta and is on by default, and it is switched on once for existing installs.

## 2.18.0 (2026-06-21)

### New features

- Each entry in "Known defects in attached log" has a hide button that ignores that defect for 1 day, 1 week, 30 days or 90 days.
- Hidden defects are left out of all Triage Assistant results; Settings shows how many are hidden and offers "Unhide all".
- Removed the redundant EO/EDR project badge from result rows.

## 2.17.4 (2026-06-19)

### Fixed issues

- New filter box in the Triage Assistant searches the whole local database for issues containing all typed words and shows the best matches.
- Click the Keyword/Hybrid badge to switch ranking mode for the current session; it goes back to automatic on reload.
- Reopened bug reports show up as open again, because open or closed is now judged by status.
- The same exception now matches more reliably when only IDs or numbers inside lists differ between reports.
- Long unbroken text no longer spills into the next column.

## 2.15.0 (2026-06-17)

### New features

- New "Results shown" setting in the Triage Assistant section of Settings controls how many related issues are listed (1 to 30, default 8).

## 2.14.5 (2026-06-17)

### Fixed issues

- Exceptions that differ only by an ID in the message now match, so reports of the same bug cluster together.

## 2.14.4 (2026-06-17)

### Fixed issues

- On a defect, each matching bug report has an Attach button that marks it as a duplicate of this defect and moves it to Attached.
- Attach is only offered for reports that are unassigned or already yours, and it assigns the report to you.
- An attached report fades out of the list and the next candidate slides in, without a page reload.
- The two sync buttons are combined into one "Sync now".

## 2.13.9 (2026-06-15)

### Fixed issues

- Triage Assistant cards now fit two per row in Jira's sidebar on 1920-pixel-wide screens.

## 2.13.8 (2026-06-15)

### Fixed issues

- Bug reports already Attached to a defect no longer appear as open matches under "Matching bug reports".

## 2.13.7 (2026-06-12)

### Fixed issues

- The issue's Created and Updated dates now appear in the header bar at the top, so you no longer need to scroll down for them.
- Jira's own copy at the bottom is hidden so the dates are not shown twice.

## 2.13.6 (2026-06-11)

### Fixed issues

- Looser "crash-site" matching finds the same exception reached through a different code path and marks it "\~ similar".
- Defects now show a "Possibly related" section under "Same exception", and log panels fall back to these hints when there is no exact match.

## 2.13.5 (2026-06-11)

### Fixed issues

- Extra Buttons labels are now visually centered.

## 2.13.4 (2026-06-11)

### Fixed issues

- Defects whose description contains pasted raw log lines now match the same exception in a parsed log.
- Newly synced defects appear in the "Defects in log" panel without reopening the log.
- Fixed a gap under the collapsed Triage Assistant card and a leftover blue focus ring on its header.

## 2.13.3 (2026-06-09)

### Fixed issues

- Fixed the Log Parser header being cut off in Jira's new log viewer.

## 2.13.2 (2026-06-09)

### Fixed issues

- The Exception clusters overview now correctly says it is sorted newest first.

## 2.13.1 (2026-06-09)

### Fixed issues

- Exception cluster members are listed newest first, and the overview orders clusters by their newest defect.
- Hover previews now appear above the Settings and clusters window instead of greyed out behind it.
- Moving the mouse back to the main defect in "Defects in log" shows its preview again.

## 2.13.0 (2026-06-09)

### New features

- Defects that share the same exception now form clusters, shown as "Same exception (N)" on a defect with Open/Fixed badges and a regression flag.
- New "Exception clusters" overview in Settings, and a "+N related" expander in the "Defects in log" panel.
- Matching no longer relies on the per-user Stackhash, which never matched across different reporters.

## 2.12.3 (2026-06-09)

### Fixed issues

- Created dates now read like "09 Jun 2026" so they cannot be misread in other countries' date formats.

## 2.12.2 (2026-06-08)

### Fixed issues

- The "Mark dup" button is now called "Attach" and updates the status in place without reloading the page.
- Created dates sit in the bottom-right corner of each card so they line up.
- The note on long-fixed matches no longer repeats "Closed" and just shows the time gap.

## 2.12.1 (2026-06-08)

### Fixed issues

- EO issues now show "Matching bug reports" too, not just EDR defects.

## 2.12.0 (2026-06-08)

### New features

- Removed Linked Issue Dropdowns, which had stopped working after Jira changed its layout.

## 2.11.0 (2026-06-08)

### New features

- Similar Defects is now the Triage Assistant and sits in Jira's right-hand column between Details and Development; the floating box is still an option.
- One "Settings" entry in the Tampermonkey menu opens a window with all feature switches and Triage Assistant actions.
- Hover previews no longer autoplay attached videos.
- The script's Dark Mode switch was removed; use Jira's own theme setting instead.
- Fixed an occasional gap at the top of the panel, and the list no longer rebuilds several times during a sync.

## 2.10.1 (2026-06-08)

### Fixed issues

- The defect database now builds itself automatically on first run, no manual sync needed.
- Background auto-sync now reliably runs about every 30 minutes instead of sometimes skipping a turn.

## 2.10.0 (2026-06-08)

### New features

- Defect (EDR) pages now show "Matching bug reports": open bug reports that look like this defect, ranked the same way as similar defects.
- Open bug reports sync automatically, and a new "Sync bug reports now" menu entry lets you catch up by hand.
- Opening a new or just-converted defect quietly syncs it so it gets indexed.

## 2.9.3 (2026-06-07)

### Fixed issues

- When you drag the Similar Defects or Defects in log panel near the bottom of the screen, its list now opens upward while you drag.

## 2.9.1 (2026-06-07)

### Fixed issues

- Translate now uses a free Google service and no longer needs an API key; the key prompt and its menu entry are gone.
- Translated text keeps its line breaks and Jira's normal font.
- Reloading shortly after a sync no longer starts another one; auto-sync waits about 30 minutes between runs.

## 2.9.0 (2026-06-07)

### New features

- Similar Defects now scans the report's attached log and lists "Known defects in attached log" without you opening it.
- In the Log Parser, exceptions matching a known defect are highlighted with its key, with a "Defects in log" panel and a live filter box.
- Hover a suggestion to preview its summary, status and formatted description.
- New "Mark dup" button links the report as a duplicate of a defect and moves it to Attached in one click.
- Defects fixed long before the report was filed are greyed out and moved down the list.

## 2.8.4 (2026-06-07)

### Fixed issues

- The Similar Defects panel now hides while an attachment or the Log Parser is open and comes back when you close it.

## 2.8.3 (2026-06-07)

### Fixed issues

- Drag the Similar Defects panel by its header to move it; its position and minimized state are remembered.
- The minimize button shows + or - to match the current state.

## 2.8.1 (2026-06-07)

### Fixed issues

- If the GPU fails while indexing, the script retries and then pauses instead of switching to CPU; you choose GPU or CPU in the menu.
- Indexing uses less graphics memory to avoid GPU crashes.
- If the model fails while you view a report, that lookup shows keyword results instead.

## 2.8.0 (2026-06-07)

### New features

- Similar Defects now also ranks by meaning, using an AI model that runs locally in your browser (GPU by default, CPU option in the menu).
- Bug reporter boilerplate such as session and hardware info is ignored, so matches focus on the actual problem.
- The defect database syncs quietly in the background every 30 minutes, and several open Jira tabs do not all sync at once.
- Similar Defects is an opt-in beta: it is off for new installs until you enable it in the Tampermonkey menu.

## 2.7.0 (2026-06-07)

### New features

- New Similar Defects panel on bug reports lists the existing EDR and EO defects that best match the report, with clickable links.
- Defects are kept in a local copy in your browser; use "Sync defects now" or "Rebuild defect database" in the Tampermonkey menu.
- The feature can be turned on or off from the Tampermonkey menu.

## 2.6.10 (2026-06-06)

### Fixed issues

- Extra Buttons no longer disappear a couple of seconds after opening a bug report from a direct link.
- They also come back when you move from one issue to another.

## 2.6.9 (2026-06-06)

### Fixed issues

- The Log Parser now also works when a log file attached directly to a report opens in Jira's new log viewer.

## 2.6.8 (2026-05-20)

### Fixed issues

- The script now works on the new Jira site address.

## 2.6.7 (2025-07-21)

### Fixed issues

- Convert to Defect now converts the bug report you are looking at instead of looking up the wrong issue.

## 2.6.6 (2025-07-20)

### Fixed issues

- Convert to Defect works again after Jira's conversion automation was replaced.

## 2.6.5 (2025-07-09)

### Fixed issues

- Extra Buttons restyled for Jira's new layout, with their labels kept on one line.
- The Dark Mode switch now sits next to Jira's Create button in the top bar.

## 2.6.4 (2025-07-03)

### Fixed issues

- Fixed the Log Parser table layout so each log line stays on a single row.

## 2.6.3 (2024-11-29)

### Fixed issues

- Convert to Defect updated for Jira's new way of starting automations.
- Turning off Extra Buttons now also removes the Convert to Defect and Close buttons.

## 2.6.2 (2024-10-31)

### Fixed issues

- Translate, Assign to GM, Convert to Defect and Close show up again after Jira renamed parts of its page.
- The buttons are no longer added twice.

## 2.6.1 (2024-07-16)

### Fixed issues

- The Log Parser recognizes process health logs again after two of their columns were renamed in the EVE client.

## 2.6 (2024-03-21)

### New features

- Log Parser tables now always use a dark background with light text, so they stay readable when Jira is in light mode.

## 2.5 (2024-03-21)

### New features

- Translate picks up the issue title again after a Jira change.
- Log Parser tables for bug report zip files use darker colors that are easier on the eyes.

## 2.4 (2023-07-02)

### New features

- Line numbers on attached files no longer go missing when the Log Parser is turned off.
- Internal cleanup of how settings are stored, no other visible change.

## 2.3 (2023-07-01)

### New features

- The Tampermonkey menu now shows whether each feature is on or off, with Enable and Disable entries.
- Fixed the script not working on the first page load after installing.
- The script now also loads when a Jira address is typed without the trailing slash.

## 2.2 (2023-06-11)

### New features

- Fixed an issue that could stop the script from loading on some Jira pages.

## 2.1 (2023-06-10)

### New features

- Fixed the automatic PC spec check for PDM files, which failed for many Windows PCs.

## 2.0 (2023-06-08)

### New features

- Process health logs show CPU and memory values as whole numbers and highlight a session count of 2 or more in red.

## 1.9 (2023-06-07)

### New features

- Log Parser now also formats process health and method call logs, with slow calls, low FPS and time dilation color-coded.
- Method call logs show the average and peak GetTime (ping) duration; click the peak to jump to it.
- Outstanding calls, last crashes and PDM files inside bug report zips are formatted too when you open them.
- PDM files show whether the PC meets EVE's minimum or recommended requirements and how old the graphics driver is.
- Click the FPS column header in process health logs to switch between FPS and seconds per frame.

## 1.8 (2023-05-15)

### New features

- Clicking "Only Exceptions" in the Log Parser no longer hides the table header.

## 1.7 (2023-05-15)

### New features

- The script now also runs on Jira's issues pages.

## 1.6 (2023-05-14)

### New features

- New Dark Mode switch next to Jira's search box, also available from the Tampermonkey menu.
- The script now only runs on Jira pages instead of every Atlassian page.

## 1.5 (2023-05-13)

### New features

- Added author details to the script information shown in Tampermonkey.

## 1.4 (2023-05-13)

### New features

- New Linked Issue Dropdowns: each group of linked issues collapses into a clickable heading that shows how many issues it holds.
- New Tampermonkey menu entries turn Linked Issue Dropdowns and Extra Buttons on or off.
- Turning Custom Scrollbar, Extra Buttons or Linked Issue Dropdowns on or off takes effect right away, without a reload.
- Convert to Defect reloads the page as soon as Jira confirms the update instead of waiting a fixed 5 seconds.

## 1.2 (2023-05-10)

### New features

- Version bump so existing installs pick up the corrected update address.

## 1.1 (2023-05-10)

### New features

- First release: Translate, Assign to GM, Convert to Defect and Close buttons on bug reports (Extra Buttons).
- Translate turns the title, description and reproduction steps into English (needs a Google Translate API key).
- Assign to GM sets the Team to EO - Game Masters and unassigns the report so the GMs can see it.
- Log Parser turns attached EVE client logs into a color-coded table with toggles for notices, warnings, errors and exceptions.
- Adds the Custom Scrollbar, hides Jira's "Give feedback" button, and adds Tampermonkey menu entries for the API key and feature toggles.

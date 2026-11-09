# JiTA tests

These run on every push and pull request (see `.github/workflows/`). A pull request into `main` has to pass
the `checks` job before it can be merged, and `main` only changes through pull requests.

On a pull request the work runs on four machines side by side: one for the static checks and the test files, and
three that each make a third of the breakages. The `checks` job only waits for them and passes when all of them did.

Run them locally from the repo root with Node 24:

```
node tests/ci-static.js --base origin/main   # syntax, LF endings, no em dashes, @version went up, changelog history
node tests/run-checks.js                     # every *-check.js harness, side by side
node tests/run-breakages.js                  # every mutate-*.js suite, side by side (pull requests only in CI)
```

## The changelog

Every release needs its own entry at the top of `JiTA.changelog.ENTRIES`: `changelog-check.js` fails unless the
newest entry is the `@version` being released. An entry lists what it added under `features` and what it fixed
under `fixes` (either may be left out); only an entry with `features` brings up the What's new pill:

```js
{ v: '3.40.0', date: '2026-10-10', features: [
    'What a user can now do, in one sentence.'
], fixes: [
    'What no longer goes wrong.'
] },
```

`ci-static.js` guards the rest of the history: every version main
has carried keeps its entry, and no entry that is already out is dropped or re-dated (fixing its wording is fine).
`mutate-releases.js` breaks that history four ways and requires `ci-static.js` to notice each one.

## Test files (`*-check.js`)

Each one slices a piece of the real code out of `JiTA.user.js`, evals it against small stubs (no browser, no
Jira, no dependencies beyond Node), and prints a `PASS` or `FAIL` line per behaviour. Set `JITA_SRC` to run
one against another copy of the script:

```
JITA_SRC=some/other/JiTA.user.js node tests/trend-check.js
```

## Breakage suites (`mutate-*.js`)

Each one breaks a specific guard in a copy of the script on purpose and requires the harness that owns it to
go red. They catch tests that pass without actually testing anything.

- `every mutation caught` is the only passing result.
- `SURVIVED` / `GREEN` means a harness stayed green through a breakage: the test needs tightening.
- `ANCHOR` means the code a suite breaks has changed or moved. Update the suite in the same change.

`run-breakages.js` runs the suites side by side, one per worker. `JITA_BREAK_WORKERS` sets the number of workers;
the default is one per CPU, at most 8. Each worker runs in a temporary copy of `tests/` because the suites write
their broken copies under fixed names (`mutt.js` and the like). A suite that runs `ci-static.js` or git needs the
real checkout, so those suites run one after another in `tests/` itself, alongside the workers. Such a suite
passes `--only` to `ci-static.js` to run just the check it breaks (for example `--only es5`).

The longest suites are split into shards (`SHARDS` in `run-breakages.js`), each a job of its own: shard k of n runs
with `JITA_BREAK_SHARD=k/n` and makes only the breakages whose index % n is k. A suite passes only if all its shards
do. To run one suite, or one shard of it, by hand, do it from `tests/`: anywhere else every breakage crashes, and a
crashed harness counts as caught.

```
cd tests && JITA_BREAK_SHARD=1/4 node mutate-members.js
```

A breakage only needs its harness to go red, and the first failing check settles that. So in a run of
`run-breakages.js` every harness stops at its first failing check: `failfast.js`, which the runner puts in
`NODE_OPTIONS`, prints that check and a `RED` line and exits. A harness that passes runs to its end, so a breakage it
misses still shows. The suites' `(N failing)` counts then read 1; `JITA_BREAK_FULL=1` runs every harness to its end
for the full counts. A suite run by hand, as above, runs its harnesses to their end too.

CI splits the run over three machines with `JITA_BREAK_PART=k/n`: each makes part k of n of the jobs. Every part deals
the jobs the same way, the costliest first, each to the part with the least so far, so together they make each job
once (`breakparts-check.js` checks that). A suite's file size stands in for its time; `mutate-layout.js`, which starts
a browser for every breakage, weighs 8 times its size. `JITA_BREAK_LIST=1` lists a run's jobs without making them.

To wait for pending promises, a harness should hop through `setImmediate` a few times, not use
`setTimeout(r, 0)`. On Windows a timeout lasts a whole 15 ms timer tick, and a suite pays that for every wait of
every breakage.

A harness whose code has to wait for real timers (a debounce, a poll, a fallback after 8 s) runs on `clock.js`:
`require('./clock').install()` first thing. Its timers and `Date.now` then run on a clock of their own, which moves
only when nothing else is left to run, so every timer still runs in the order it is due, at its own time, in no real
time. The checklist harness waited about 0.8 s per run before, the members harness about 0.3 s.

## Layout checks (`layout-check.js`)

The harnesses draw into fake DOMs, so a column that shifts from row to row passes them all. `layout-check.js` loads
the real script into a headless Chrome, Chromium or Edge, opens the Lead duties Members and Quality control tabs, the
sidebar cards and Settings with fixture data, and measures them. `browser.js` drives the browser over the DevTools
protocol with Node's own WebSocket (Node 22 or later, no npm package); jQuery comes from the script's `@require`,
checked against its sha256 and kept in the temp folder.

- `JITA_BROWSER` names the browser to use. Otherwise it looks for Chrome, Chromium and Edge where each platform keeps them.
- With no browser it prints `SKIP` and passes, unless `JITA_LAYOUT_REQUIRED=1`. CI sets it, so CI never skips.
- `mutate-layout.js` breaks what those layouts rest on, one thing at a time, and requires the check to go red.

## Adding a test

1. Add `tests/<area>-check.js`. Read the script from
   `process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')`, print `  PASS  ` or
   `  FAIL  ` per assertion, and exit non-zero on any failure. The runner picks it up by name. If the code under
   test waits on timers, install `clock.js` rather than waiting for real.
2. Optionally add `tests/mutate-<area>.js` that breaks what the new test guards and prints
   `every mutation caught` when every breakage turned it red.

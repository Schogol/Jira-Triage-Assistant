# JiTA tests

These run on every push and pull request (see `.github/workflows/`). A pull request into `main` has to pass
the `checks` job before it can be merged, and `main` only changes through pull requests.

Run them locally from the repo root with Node 24:

```
node tests/ci-static.js --base origin/main   # syntax, LF endings, no em dashes, @version went up, changelog history
node tests/run-checks.js                     # every *-check.js harness
node tests/run-breakages.js                  # every mutate-*.js suite (pull requests only in CI)
```

## The changelog

Every release needs its own entry at the top of `JiTA.changelog.ENTRIES`: `changelog-check.js` fails unless the
newest entry is the `@version` being released. `ci-static.js` guards the rest of the history: every version main
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

## Adding a test

1. Add `tests/<area>-check.js`. Read the script from
   `process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')`, print `  PASS  ` or
   `  FAIL  ` per assertion, and exit non-zero on any failure. The runner picks it up by name.
2. Optionally add `tests/mutate-<area>.js` that breaks what the new test guards and prints
   `every mutation caught` when every breakage turned it red.

# AGENTS.md

A minimal launcher for dsh profiles: parses its own flags, resolves profiles against an instance's distro, and passes remaining arguments straight to the profile's app. Read `README.md` first; it is the primary user-facing document for this package. This file is for agents that change the repository.

This file is agent instructions, not user documentation. The rule that the repository holds no documentation files beyond `README.md`, `README_ZH.md` and `CHANGELOG.md` therefore holds unchanged.

## Layout

```
packages/core/      @nanodsh/core: instances, distros, profiles, plugins, boot, diagnostics
packages/cli/       @nanodsh/cli: flags, completion, printing, exit codes; bin/nanodsh.js
examples/           embed.mjs, the core driven without the CLI
scripts/            benchmarks and the desensitization scan
test/               the scan's own tests
CHANGELOG.md        changelog, English only
README.md           user-facing documentation
README_ZH.md        Chinese translation of README.md
```

Each package keeps its own tests under `packages/*/test`: core tests import the package, CLI tests spawn `packages/cli/bin/nanodsh.js`.

Anything a person needs in order to use or change the package lives here. Everything else stays out of the repository.

## Commands

```sh
pnpm install --frozen-lockfile   # before any claim that tests pass
pnpm check                       # syntax check across both packages, scripts/ and test/
pnpm test                        # every package's tests (node --test)
pnpm example                     # examples/embed.mjs
pnpm bench                       # launcher overhead benchmark
pnpm --filter @nanodsh/cli pack  # release tarball (must exclude test/ and scripts/)
```

Both gates (`pnpm check` and `pnpm test`) must be green before delivery. Rerun them after a change; do not cite an earlier run.

## Commits

- One commit per completed step; one commit does one thing.
- English conventional commits; an imperative subject, lowercase, no trailing period.
- Never force-push pushed history; never rewrite someone else's branch.
- Read the full change list before committing. Exclude keys, absolute paths, internal addresses, build output, logs and scratch files.

## Branches and pull requests

- Branch from the latest `master`, and put the issue number in the branch name.
- Open a pull request with the `WIP:` prefix before writing code; one branch carries one pull request.
- Promote it (drop `WIP:`) only when all of these hold: the desensitization scan passed, `mergeable: true`, the branch contains the latest `master`, and no review or comment asks for changes.
- A pull request body is English, code blocks included, and ends with `Closes #N`.
- Issue and pull request titles are English. Issue bodies may be Chinese.
- Tags and releases are created by the repository owner, never by an agent.

## Documents

- Only `README.md`, `README_ZH.md`, `CHANGELOG.md` and this file live in the repository.
- Documentation is written for the people who use or change the package. It states what is true and how to use it, keeps implementation detail to what a reader needs, and does not narrate how or why a decision was made. Reasoning that is still being worked out does not belong in a document at all.
- The README states what the package is and how to use it. It does not explain design decisions, does not say what is missing, and does not review history.
- `README.md` and `README_ZH.md` change together, in the same commit.
- `CHANGELOG.md` is English, follows keepachangelog, and describes behaviour for a user. Sections are `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`. It records no internal refactors and no implementation detail.
- One fact lives in one place. When a second place needs it, link to it or read from the same source; do not copy it.

## Code

- Plain JavaScript ESM throughout (`.js` in each package's `bin/` and `lib/`, `.mjs` in `examples/`, `scripts/` and `test/`). Import across packages by name; local relative imports carry `.js` (or `.mjs`).
- `@nanodsh/core` never prints, never calls `process.exit` and never installs a signal handler: it returns data, or reports through a `warn` callback the caller passes in. A function that touches an instance takes `home` explicitly.
- No comments by default. Documentation comments state the contract in at most two lines. Put the reasoning in the commit message.
- Launcher flags precede app arguments; stop flag parsing at the first unrecognized argument and forward the rest unchanged.
- Published tarballs (`files` in `package.json`) ship only `bin/` and `lib/`, never `test/` or `scripts/`.

## Tests

- Write the test before the delivery. A test describes behaviour, not correctness.
- Behaviour changes together with its test, and the pull request says why.
- Fixtures use loopback and documentation addresses only: `127.0.0.1`, `203.0.113.9`, `example.test`.
- Do not rerun a check that already passed. Exhaustive runs belong to CI or to whoever asks for one.
- When you report results, give the command and its real output. If you could not get a result, write that you did not.

## Desensitization

Nothing entering the repository may contain real names or contact details, private email addresses, private domains, cloud accounts, tokens or keys, internal addresses, absolute paths that carry a user name, or host names. Use `{{EMAIL}}`, `{{DOMAIN}}`, `{{TOKEN}}` and `{{USER}}` as placeholders.

Public account names and public work addresses may appear, after checking each one.

## Versions and release

- Versions follow semver.
- A release commit changes the top of `CHANGELOG.md` (adds a versioned section with date and an empty `[Unreleased]`), bumps `package.json`, and updates any version references in both READMEs if present.
- While releasing, read `[Unreleased]` once more and cut anything that is not a fact.

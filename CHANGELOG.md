# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `nanodsh plugin --profile <name> add --plain <package>` installs a package into the profile without adding it to the bundles the profile composes; a later `add` leaves it uncomposed too.

### Fixed

- The launcher disposes the profile before it exits, so plugin cleanup finishes and the child processes it started do not outlive it.
- `--dump-config`, `--dump-default-config` and `--dump-config-schema` compose with the runtime the instance provides, so a profile whose bundles are newer than the launcher's own runtime no longer loses them to an incompatible-runtime skip.

## [0.0.3] - 2026-11-18

### Added

- `@nanodsh/core` carries profiles, instances, distros and the boot itself without a command line; `@nanodsh/cli` keeps the flags, the printing and the exit codes and depends on it. Embedding the launcher no longer brings in commander or a process that writes to stdout.

## [0.0.2] - 2026-11-17

### Changed

- `nanodsh instance create` replaces `nanodsh instance add` and makes the home directory; `instance add` still works as an alias.
- Nothing is selected by default: without `--home`, `--instance`, `NANODSH_INSTANCE`, `$DSH_HOME`, or a registered default instance, the launcher refuses instead of using `~/.dsh`.

### Fixed

- `nanodsh plugin --profile <name> add` now seeds a missing profile with the distro's default bundles, so a profile built from an app bundle alone no longer starts without `@deepseek-ai/dsh-base`.
- The launcher boots with the `@deepseek-ai/dsh-app-boot` its instance provides, so changes made in the web UI settings pages (the preview notice included) are saved instead of failing with `profile reload requires the root Include entry`.
- The launcher installs the proxy policy with the instance's `@deepseek-ai/dsh-http-proxy`, so child processes follow the same proxy as the harness.
- `nanodsh plugin add` pins `@deepseek-ai/*` packages to the version of the runtime the instance provides, so an aliased base no longer turns the pin into a path and a distro without a base is still pinnable.

## [0.0.1] - 2026-11-15

### Added

- Core launcher to boot dsh profiles with `--profile`, `--patch`, `--dump-config`, `--dump-default-config`, and `--dump-config-schema` flags, passing all remaining arguments straight through to the app.
- `--from-default-profile` flag to reset a profile from its shipped template.
- Distro-backed profile resolution and distro management (`nanodsh distro add`, `show`, `switch`), allowing distro updates without affecting existing profiles.
- Multi-instance management (`nanodsh instance`) with home resolution via `--home`, `--instance`, `NANODSH_INSTANCE`, `$DSH_HOME`, the configured default, or `~/.dsh`.
- Profile management (`nanodsh profile list`, `create`, `remove`).
- Plugin management (`nanodsh plugin`) to install, update, or remove bundles inside a profile via pnpm.
- Layered `.env` loading, outbound proxy support from environment variables, graceful shutdown (with force-exit on a second signal), and startup diagnostics logging.
- Shell completion for bash, zsh, fish, and PowerShell (`pwsh`).

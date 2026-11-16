# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Nothing is selected by default: without `--home`, `--instance`, `NANODSH_INSTANCE`, `$DSH_HOME`, or a registered default instance, the launcher refuses instead of using `~/.dsh`.

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

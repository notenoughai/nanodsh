# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- A launcher that boots a dsh profile, parses `--profile`, `--patch`, `--dump-config`, `--dump-default-config` and `--dump-config-schema`, and passes every remaining argument to the app.
- `--from-default-profile` recreates a profile from a shipped template.
- Profiles resolve against a distro: the instance's `distro.json` selects one, its `dsh.distro.api` must match the launcher, and the instance manifest becomes the install anchor.
- `nanodsh distro add`, `show` and `switch`; a switch assembles the new tree aside and swaps it in without touching profiles.
- `nanodsh instance` commands over a registry in the XDG config directory, with the home resolved from `--home`, `--instance`, `NANODSH_INSTANCE`, `$DSH_HOME`, the registry default or `~/.dsh`.
- `nanodsh profile` list, create and remove, including the naming rules for subcommand and template collisions.
- `nanodsh plugin` forwards pnpm arguments in a profile and reconciles `dsh.profile.bundles` from what is installed.
- Layered `.env` loading, a frozen launch environment snapshot, the outbound proxy from the environment, application readiness, bounded shutdown with a second-signal escape, and a startup diagnostics report under the harness home.
- Shell completion for bash, zsh, fish and pwsh.
- A benchmark for the launcher's own paths.

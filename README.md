# nanodsh

English | [中文](README_ZH.md)

[![npm](https://img.shields.io/npm/v/@nanodsh/cli?label=npm&color=cb3837&logo=npm&logoColor=fff)](https://www.npmjs.com/package/@nanodsh/cli)
[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
[![](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A minimal launcher for dsh profiles.

nanodsh parses only its own flags (selecting a profile, applying patch overlays, or dumping configuration) and forwards all remaining arguments to the profile's app. It ships without a base environment, built-in bundles, or profile templates; profiles resolve against the distro configured for an instance.

## Requirements

Node.js >= 20, with `pnpm` on `PATH` for installing distros and plugins. Booting a profile needs Node.js >= 22.12.

Proxy support (`HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`) needs Node.js >= 22.19. On older Node the launcher starts without the proxy and says why.

## Install

Install the launcher from npm:

```bash
npm install -g @nanodsh/cli
```

## Usage

Each instance pairs a harness home directory with a distro. Nothing is implicit: create an instance first, or pass `--home`/`--instance` on every call. Without one the launcher refuses instead of writing to `~/.dsh`, which belongs to the official `dsh` CLI.

```bash
nanodsh instance create default --home ~/dsh --distro @nanodsh/distro-standard
nanodsh profile create work
nanodsh plugin --profile work add @deepseek-ai/dsh-web-app
nanodsh work --port 8080
```

`@nanodsh/distro-standard` is an example; any npm package declaring `dsh.distro` and providing the host packages can be used as a distro.

### Instances

```bash
nanodsh instance create work --home /srv/dsh-work --distro <package>
nanodsh instance list
nanodsh --instance work web
```

### Profiles and plugins

```bash
nanodsh profile list
nanodsh profile create work --bundle @deepseek-ai/dsh-base
nanodsh plugin --profile work add @deepseek-ai/dsh-headless
nanodsh plugin --profile work remove @deepseek-ai/dsh-headless
```

### Diagnostics and completion

```bash
nanodsh --profile work --dump-config
nanodsh --profile work --dump-default-config
nanodsh --profile work --dump-config-schema
eval "$(nanodsh completion bash)"
```

Launcher flags must precede app arguments. Everything from the first unrecognized argument onward is passed directly to the app (for example, `--port 8080` in `nanodsh work --port 8080`).

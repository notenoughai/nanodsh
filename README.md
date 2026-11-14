# nanodsh

A minimal launcher for dsh profiles.

nanodsh parses only its own flags (selecting a profile, applying patch overlays, or dumping configuration) and forwards all remaining arguments to the profile's app. It ships without a base environment, built-in bundles, or profile templates; profiles resolve against the distro configured for an instance.

## Requirements

Node.js >= 20, with `pnpm` on `PATH` for installing distros and plugins.

## Install

The package is not yet published to npm. Build and install it locally:

```bash
pnpm pack
npm install -g ./notenoughai-nanodsh-0.0.1.tgz
```

## Usage

Each instance pairs a harness home directory with a distro (defaulting to `~/.dsh`).

```bash
nanodsh distro add @notenoughai/distro-standard
nanodsh profile create work
nanodsh plugin --profile work add @deepseek-ai/dsh-web-app
nanodsh work --port 8080
```

`@notenoughai/distro-standard` is an example; any npm package declaring `dsh.distro` and providing the host packages can be used as a distro.

### Instances

```bash
nanodsh instance add work --home /srv/dsh-work --distro <package>
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

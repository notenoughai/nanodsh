# nanodsh

Boot a dsh profile, and nothing else.

nanodsh parses only its own flags — which profile, which extra patch overlays, which config dump — and hands every remaining argument to the profile's app. It ships no base environment, no bundled bundles and no profile templates: a profile resolves against a distro, and the distro is what an instance provides.

## Requirements

Node.js 20 or newer, and pnpm on `PATH` for the commands that install packages.

## Install

Not published yet. `pnpm pack` produces the package, and `npm install -g ./notenoughai-nanodsh-0.0.1.tgz` installs it.

## Use

An instance is one harness home with one distro. The default instance is `~/.dsh`.

```
nanodsh distro add @notenoughai/distro-standard
nanodsh profile create work
nanodsh plugin --profile work add @deepseek-ai/dsh-web-app
nanodsh work --port 8080
```

`@notenoughai/distro-standard` stands in for any npm package that declares `dsh.distro` and carries the host packages a profile resolves against.

Instances:

```
nanodsh instance add work --home /srv/dsh-work --distro <package>
nanodsh instance list
nanodsh --instance work web
```

Profiles and plugins:

```
nanodsh profile list
nanodsh profile create work --bundle @deepseek-ai/dsh-base
nanodsh plugin --profile work add @deepseek-ai/dsh-headless
nanodsh plugin --profile work remove @deepseek-ai/dsh-headless
```

Diagnostics and completion:

```
nanodsh --profile work --dump-config
nanodsh --profile work --dump-default-config
nanodsh --profile work --dump-config-schema
eval "$(nanodsh completion bash)"
```

Launcher flags come first; the first token the launcher does not recognise starts the app's arguments, so `nanodsh work --port 8080` passes `--port 8080` to the app.

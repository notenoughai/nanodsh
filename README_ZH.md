# nanodsh

一个极简的 dsh profile 启动器。

nanodsh 仅解析自身参数（选择 profile、叠加 patch 或导出配置），其余参数原样透传给 profile 对应的 app。它不自带基础环境、内置 bundle 或 profile 模板；profile 依赖的宿主环境由 instance 所配置的 distro 提供。

## 环境要求

Node.js >= 20；安装 distro 或插件时需在 `PATH` 中提供 `pnpm`。

## 安装

从 npm 安装启动器：

```bash
npm install -g @nanodsh/cli
```

## 用法

每个 instance 将一个 harness home 目录与一个 distro 绑定。没有隐式 home：先建一个 instance，或者每次调用都带 `--home`/`--instance`。两者都不给时启动器会直接报错，而不是写入官方的 `dsh` 占用的 `~/.dsh`。

```bash
nanodsh instance create default --home ~/dsh --distro @nanodsh/distro-standard
nanodsh profile create work
nanodsh plugin --profile work add @deepseek-ai/dsh-web-app
nanodsh work --port 8080
```

`@nanodsh/distro-standard` 仅为示例，任何声明了 `dsh.distro` 并提供宿主包的 npm 包均可作为 distro。

### Instance 管理

```bash
nanodsh instance create work --home /srv/dsh-work --distro <package>
nanodsh instance list
nanodsh --instance work web
```

### Profile 与插件

```bash
nanodsh profile list
nanodsh profile create work --bundle @deepseek-ai/dsh-base
nanodsh plugin --profile work add @deepseek-ai/dsh-headless
nanodsh plugin --profile work remove @deepseek-ai/dsh-headless
```

### 诊断与补全

```bash
nanodsh --profile work --dump-config
nanodsh --profile work --dump-default-config
nanodsh --profile work --dump-config-schema
eval "$(nanodsh completion bash)"
```

启动器参数须位于 app 参数之前。自第一个不被启动器识别的参数起，后续所有参数将直接透传给 app（例如 `nanodsh work --port 8080` 中的 `--port 8080`）。

# nanodsh

只做一件事：启动 dsh profile，别的都不管。

nanodsh 只解析自己的参数——启动哪个 profile、额外叠哪些 patch、要不要 dump 配置——其余参数原样交给 profile 的 app。它不自带基础环境、不捆绑 bundle、不提供 profile 模板：profile 解析所依赖的宿主由一个 distro 提供，而 distro 属于某个 instance。

## 要求

Node.js 20 或更新；涉及安装包的命令需要 `PATH` 上有 pnpm。

## 安装

尚未发布。用 `pnpm pack` 打包，再执行 `npm install -g ./notenoughai-nanodsh-0.0.1.tgz`。

## 使用

一个 instance 是一个 harness home，只挂一个 distro；默认 instance 是 `~/.dsh`。

```
nanodsh distro add @notenoughai/distro-standard
nanodsh profile create work
nanodsh plugin --profile work add @deepseek-ai/dsh-web-app
nanodsh work --port 8080
```

`@notenoughai/distro-standard` 只是一个示例：任何声明了 `dsh.distro`、并携带宿主包的 npm 包都可以当 distro。

Instance：

```
nanodsh instance add work --home /srv/dsh-work --distro <package>
nanodsh instance list
nanodsh --instance work web
```

Profile 与插件：

```
nanodsh profile list
nanodsh profile create work --bundle @deepseek-ai/dsh-base
nanodsh plugin --profile work add @deepseek-ai/dsh-headless
nanodsh plugin --profile work remove @deepseek-ai/dsh-headless
```

诊断与补全：

```
nanodsh --profile work --dump-config
nanodsh --profile work --dump-default-config
nanodsh --profile work --dump-config-schema
eval "$(nanodsh completion bash)"
```

启动器自己的参数必须写在前面；从启动器不认识的第一个 token 起，剩下的都算 app 的参数——所以 `nanodsh work --port 8080` 里的 `--port 8080` 是给 app 的。

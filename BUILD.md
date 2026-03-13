# 构建说明

本文档说明本扩展的本地构建流程、脚本含义以及如何使用 `vsce` 打包为 `.vsix` 供安装或发布。

---

## 一、环境要求

- **Node.js**：建议 16+（项目使用 CommonJS、ES6）
- **包管理器**：`npm` 或 `pnpm`
- **VS Code**：用于本地调试与扩展宿主

安装依赖：

```bash
npm install
# 或
pnpm install
```

---

## 二、本地构建逻辑

本扩展有两种运行环境，对应两套构建产物：

| 运行环境           | 入口                                | 开发构建             | 发布构建                 | 说明                                  |
| ------------------ | ----------------------------------- | -------------------- | ------------------------ | ------------------------------------- |
| **桌面端（Node）** | `main: "./out/extension"`           | `tsc` (compile)      | esbuild (bundle-desktop) | 发布时单文件含依赖，无需 node_modules |
| **Web / 远程**     | `browser: "./out/web/extension.js"` | Rspack (compile-web) | Rspack (package-web)     | VS Code for Web、Codespaces 等        |

### 2.1 桌面端构建

- **开发**：`npm run compile` / `pnpm run compile` — 使用 `tsc` 按 `tsconfig.json` 编译到 `out/`，便于调试。
- **发布**：`npm run bundle-desktop` / `pnpm run bundle-desktop` — 使用 esbuild 将入口及依赖（如 json5）打成单文件 `out/extension.js`，供 `vsce package --no-dependencies` 使用，避免依赖 `npm list`（兼容 pnpm）。
- **产物**：开发时为 `out/extension.js`、`out/configuration.js`、`out/parser.js` 等；发布时为单文件 `out/extension.js`。

### 2.2 Web 端构建（Rspack）

- **命令**：`npm run compile-web` 或 `pnpm run compile-web`
- **配置**：`build/web-extension.rspack.config.js`
- **行为**：以 `src/extension.ts` 为入口，打包为单文件、target 为 `webworker`，并处理 Node 风格 polyfill（如 `path`、`util`、`process`）。
- **产物**：`out/web/extension.js`（供 `package.json` 的 `browser` 字段引用）。

### 2.3 构建流程概览

```
源码 (src/)
    │
    ├─ 开发：tsc (compile)           → out/*.js
    ├─ 发布：esbuild (bundle-desktop) → out/extension.js（单文件含 json5）
    │
    └─ Rspack (compile-web / package-web)  → out/web/extension.js   ← browser
```

**开发时完整构建（桌面 + Web）：**

```bash
npm run compile
npm run compile-web
```

**发布前构建（由 vscode:prepublish 自动执行）：** `bundle-desktop` + `package-web`，无需 `npm list`，兼容 pnpm。

---

## 三、npm 脚本说明

| 脚本                | 用途                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| `compile`           | 桌面端 tsc 编译到 `out/`（开发用）                                              |
| `watch`             | 桌面端监听并增量编译                                                            |
| `bundle-desktop`    | 桌面端 esbuild 单文件打包到 `out/extension.js`（含 json5，发布用）              |
| `compile-web`       | Web 端 Rspack 开发模式打包到 `out/web/`                                         |
| `watch-web`         | Web 端监听并增量打包                                                            |
| `package-web`       | Web 端 Rspack 生产打包                                                          |
| `vscode:prepublish` | 发布前自动执行：`bundle-desktop` + `package-web`                                |
| `package:vsix`      | 执行 prepublish 后执行 `vsce package --no-dependencies` 生成 .vsix（兼容 pnpm） |

---

## 四、本地开发与调试

1. **只改 TypeScript（桌面端）**  
   终端执行：`npm run watch` 或 `pnpm run watch`，在 VS Code 中按 F5 使用「Extension」配置启动调试即可。

2. **需要改 Web 端或同时改两端**
   - 桌面端：`npm run watch`
   - Web 端：`npm run watch-web`  
     再按 F5 启动「Extension」即可（本地扩展宿主会用到 `out/` 与 `out/web/`）。

3. **启动配置**  
   `.vscode/launch.json` 中的「Extension」会先执行 `preLaunchTask: "npm: watch"`（即 `npm run watch`），再启动扩展开发宿主。

---

## 五、vsce package 打包

本项目使用 **桌面端单文件打包（esbuild）+ `vsce package --no-dependencies`**，不依赖 `npm list`，**兼容 pnpm**，避免因 json5 等依赖的 dev 依赖导致 `npm list` 报错（如 ELSPROBLEMS / missing）。

### 5.1 安装 vsce（未安装时）

```bash
npm install -g @vscode/vsce
# 或
npx vsce package --no-dependencies
```

### 5.2 打包步骤

1. **发布前构建（必须）**  
   会生成桌面端单文件 `out/extension.js`（含 json5）和 Web 端 `out/web/extension.js`：

   ```bash
   npm run vscode:prepublish
   # 或
   pnpm run vscode:prepublish
   ```

2. **执行打包（推荐一条命令）**  
   使用 `--no-dependencies`，不执行 `npm list`，不打包 node_modules，与 pnpm 兼容：

   ```bash
   npm run package:vsix
   # 或
   pnpm run package:vsix
   ```

   或手动执行：

   ```bash
   npm run vscode:prepublish
   npx vsce package --no-dependencies
   ```

3. **产物**  
   当前目录下会生成 `better-comments-<version>.vsix`（版本号来自 `package.json` 的 `version`）。vsix 内包含 `out/extension.js`、`out/web/extension.js` 等，不包含 node_modules。

### 5.3 安装本地 .vsix

- **命令行**：  
  `code --install-extension better-comments-3.0.2.vsix`（请按实际文件名替换版本号）。
- **VS Code 界面**：扩展视图 → 右上角「…」→「从 VSIX 安装…」→ 选择生成的 `.vsix` 文件。

### 5.4 打包时常见问题

- **报错缺少 `out/` 或 `out/web/extension.js`**  
  先执行：`npm run vscode:prepublish`（会执行 `bundle-desktop` 与 `package-web`）。
- **使用 pnpm 时出现 `npm list` / ELSPROBLEMS / missing 依赖**  
  已通过「桌面端 esbuild 单文件打包 + `vsce package --no-dependencies`」规避，直接使用 `pnpm run package:vsix` 即可。
- **版本号**  
  修改 `package.json` 的 `version` 后重新执行 `vsce package --no-dependencies`（或 `pnpm run package:vsix`）即可生成新版本 .vsix。

---

## 六、发布到市场（可选）

若需发布到 [VS Code 市场](https://marketplace.visualstudio.com/)：

1. 安装并登录 [vsce](https://github.com/microsoft/vscode-vsce)：  
   `npm i -g @vscode/vsce`，然后 `vsce login <publisher>`。
2. 确保 `package.json` 中 `publisher` 与登录账号一致。
3. 执行一次完整构建与打包：  
   `npm run vscode:prepublish`，再 `vsce package`。
4. 发布：  
   `vsce publish`（或按需使用 `vsce publish --pat <token>`）。

---

## 七、目录结构速览

```
.
├── src/                    # 源码
│   ├── extension.ts        # 扩展入口
│   ├── configuration.ts    # 语言配置加载
│   ├── parser.ts           # 注释解析与装饰
│   └── typings/
├── out/                    # 桌面端 tsc 输出（main）
│   ├── extension.js
│   ├── configuration.js
│   ├── parser.js
│   └── web/                # Rspack 输出（browser）
│       └── extension.js
├── build/
│   └── web-extension.rspack.config.js
├── package.json            # main → out/extension，browser → out/web/extension.js
└── tsconfig.json
```

上述内容覆盖了本地构建、vsce package 以及桌面/Web 两套构建逻辑，按需执行对应脚本即可。

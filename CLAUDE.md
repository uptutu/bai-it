# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# 掰it — 项目指南

掰it 是一个纯本地 Chrome/Firefox 扩展，帮助用户在浏览英文网页时拆解长句结构、标注生词。零后端、零登录。

详见 [README.md](./README.md)。

## 开发

```bash
npm install              # 安装依赖
npm run build            # 构建到 dist/
npm run build:firefox    # 构建 + 打包 Firefox 版本
npm run build:safari     # 构建 + 打包 Safari 版本（需 macOS）
npm test                 # 运行全部单元测试（Vitest）
npm test -- scan-rules   # 运行指定测试文件（文件名匹配）
npm run dev              # 开发模式（watch + sourcemap）
npm run release          # 测试 + 构建 + 打包 Chrome/Firefox zip（仅本地）
```

构建产物在 `dist/` 目录。Chrome 加载 `dist/`，Firefox 需要先运行 `npm run build:firefox` 生成 zip 后解压安装。

## 发布

**当用户表达"可以发版了"的意图时（不限于特定措辞），Claude 自主执行完整发布流程，用户不需要跑任何命令。** 详见 [docs/release.md](./docs/release.md)。

流程概要：确认版本号 → 改 manifest.json → `npm run release` → git commit + tag + push → `gh release create` → 提醒用户手动上传商店 → 清理 zip。

商店上传是唯一需要用户手动操作的步骤（需要登录网页后台）。

## 跨浏览器兼容性

使用 `src/shared/browser-api.ts` 统一 API 入口（**项目内代码不应直接调用 `chrome.*`，必须通过这层抽象**）：

```typescript
import { storage, runtime, tabs, action } from "./shared/browser-api.ts";
// 代替 chrome.storage.sync.get(...)
const result = await storage.sync.get(keys);
```

Firefox 打包由 `scripts/package-firefox.mjs` 处理：修改 manifest.json 的 `browser_specific_settings.gecko` 和 `background.scripts`。Safari 通过 `scripts/build-safari.mjs` 转换。Safari 专用 polyfills 在 `src/shared/safari-polyfills.ts`。

## 构建配置

- **ESM** 仅用于 background service worker（MV3 要求 `type: module`）
- **IIFE** 用于 content script、popup、options（Chrome 不支持 content script ESM）
- 构建工具：ESBuild（`build.mjs`），不使用 Vite/Webpack/Plasmo
- 4 个入口点：`background`、`content`、`popup`、`options`（Options 唯一使用 React）
- JSON 词表/词典通过 ESBuild 直接打包进 content script（见 `src/content/index.ts` 顶部的 `import ... from "../../data/..."`）

## 架构

### 四组件消息流

```
[Web Page]  ←→  Content Script (注入)  ←chrome.runtime.sendMessage→  Service Worker  ←fetch→  LLM API
                       ↓ 写                                              ↓ 写
                  DOM (渲染分块)                                  IndexedDB (openen-data)
                       ↑                                                ↑ 读
                       └── popup (用户配置) ──chrome.storage.sync──────┘
                       └── options (管理页, React) ────────────────────┘
```

- **Content Script** (`src/content/`)：扫读 DOM，触发分块请求，注入渲染元素，监听 MutationObserver
- **Service Worker** (`src/background/`)：唯一与 LLM API 通信的入口；管理配置；缓存读写
- **Popup** (`src/popup/`)：站点开关、辅助力度、显示方式
- **Options** (`src/options/`)：React 管理页面（5 个 Tab：Dashboard / DailyReview / Sentences / Vocabulary / Settings），所有数据从 IndexedDB 读

**消息契约** 集中定义在 `src/shared/types.ts` 的 `Message` 与 `BackgroundMessage` 类型。Content → SW 用 `Message`，SW → Content 用 `BackgroundMessage`。

### 两级分块：本地优先，LLM 兜底

```
句子 → 本地规则判断 → 能拆？→ 本地拆分（即时）→ 离线词典标注生词
                  ↘ 不能？→ LLM 拆分（1-2s）→ 语境化释义
```

- 本地拆分：`src/shared/scan-rules.ts`（`scanSplit`），基于 POS 标注（pos-js）+ 逻辑转换点（并列/从属/转折/关系代词）
  - 三级颗粒度：`coarse`（仅逗号+连词）/ `medium`（默认）/ `fine`（+ 介词短语 + 关系副词 + 引语边界）
  - 拆分失败（>3 从属标记）时设置 `needsLLM: true`，由 Content 转给 SW
- LLM 适配：`src/shared/llm-adapter.ts`，3 种驱动：`gemini` / `openai-compatible` / `anthropic`
  - 提示词见 `buildChunkPrompt`（强制 JSON 输出、严格保留原文、用 2 空格缩进）
  - 多 Provider 存储见 `src/shared/types.ts` 的 `LLMMultiConfig` / `resolveLLMConfig` / `migrateLLMConfig`（处理旧格式升级）

### 生词标注三层词汇源（优先级从高到低）

1. 行业术语包（`data/industry-*.json`）— 暂无此文件，仅有通用词频+词典；行业包是 V2 扩展点
2. 离线词典（`data/dict-ecdict.json`，31K 词条 + 词形映射 `lemma-map.json`）
3. LLM 语境化释义（仅在调 LLM 时获得）

过滤：`src/shared/vocab.ts` 的 `annotateWords` 跳过已掌握词、长度 <3、缩写、专有名词、词频表前 5000 词。

### 数据存储

- **IndexedDB** `openen-data`（v3 schema，12 张表）：全部学习数据，DAO 在 `src/shared/db.ts`
  - `vocab` / `vocab_contexts`：生词 + 每次出现的语境
  - `patterns` / `pattern_examples`：句式类型（11 种 `PatternKey`）+ 例句
  - `learning_records`：阅读记录（只存 LLM 处理过的）
  - `pending_sentences`：浏览时静默采集的待分析句子（管理端懒处理）
  - `settings`：键值对设置
  - `weekly_reports` / `review_items`（SM-2 算法）/ `wallpaper_records` / `translation_cache` / `word_detail_cache`
  - **所有表**有 `updated_at` + `is_dirty`（V2 跨设备同步预留），主键用 UUID
- **chrome.storage.sync**：LLM 配置、站点开关、辅助力度、主题等用户偏好
- **chrome.storage.local**：已掌握词列表（高频读，sync 配额紧张）

## 测试

- **单元测试**：Vitest，文件在 `src/__tests__/*.test.ts`，与被测代码并列（不是 `tests/` 下）
  - `vitest.config.ts` 只 include `src/__tests__/`
  - IndexedDB 用 `fake-indexeddb`
- **验收测试**（Puppeteer）：`tests/acceptance/*.mjs`，需手动起 Chrome 后跑
  - `smoke-test.mjs` / `scan-mode.mjs` / `scan-mode-basic.mjs` / `onboarding-screenshots.mjs` / `popup-test.mjs` / `options-test.mjs`
- 验收标准见 [docs/testing.md](./docs/testing.md)

## 项目结构

```
src/
├── background/    # Service Worker（MV3）— index.ts
├── content/       # Content Script — index.ts (主逻辑) + renderer.ts (DOM 注入) + styles.ts
├── popup/         # 插件弹窗
├── options/       # React 管理页面
│   ├── App.tsx
│   ├── tabs/      # Dashboard / DailyReview / Sentences / Vocabulary / Settings
│   ├── components/ # GlassCard / NavBar / VocabPill / WordTooltip / ...
│   ├── hooks/     # useConfig / useDB / useDashboardData / ...
│   └── exampleData.ts  # 空数据时的硬编码示例（onboarding 状态用）
├── shared/        # 跨组件共享
│   ├── types.ts        # ★ Message 契约 + DB record 类型 + LLM 配置常量
│   ├── browser-api.ts  # chrome.* 抽象层
│   ├── db.ts           # IndexedDB DAO
│   ├── llm-adapter.ts  # LLM 适配层
│   ├── scan-rules.ts   # 本地拆分规则（含 POS 标注）
│   ├── rule-engine.ts  # 英文检测 + 复杂度估算
│   ├── vocab.ts        # 生词标注
│   ├── cache.ts        # 分块结果缓存
│   └── safari-polyfills.ts
├── __tests__/     # Vitest 单元测试（与 src/ 并列）
└── types/         # 全局 .d.ts（pos-js 类型补丁）
data/              # 词频表 / 离线词典 / 词形映射（构建时打包进 content script）
tests/             # Puppeteer 验收测试
scripts/           # 构建辅助：firefox 打包 / safari 转换 / dict 构建 / icons 生成 / release
docs/              # prd / design / architecture / testing / release / workflow / rule / safari
```

## 文档

| 文档 | 内容 |
|------|------|
| [docs/prd.md](./docs/prd.md) | 产品需求：用户痛点、三层体验模型、功能范围 |
| [docs/design.md](./docs/design.md) | 设计规范：视觉风格、品牌、各模块 UI |
| [docs/architecture.md](./docs/architecture.md) | 技术架构：模块设计、数据模型、关键决策 |
| [docs/testing.md](./docs/testing.md) | 测试：验收标准、测试方法 |
| [docs/release.md](./docs/release.md) | 发布流程：版本号 → 打包 → 推送 → 上架 Chrome + Edge + Firefox |
| [docs/workflow.md](./docs/workflow.md) | 文件组织 + Git 工作流 + 日常操作指引 |
| [docs/rule.md](./docs/rule.md) | 本地拆分规则的语义说明 |
| [docs/safari.md](./docs/safari.md) | Safari 转换说明 |

### 内部文档（`_local/`，不进 git）

| 文档 | 内容 |
|------|------|
| [_local/HANDOFF.md](./_local/HANDOFF.md) | 交接状态：当前进度、上次改了什么、下一步 |
| [_local/backlog.md](./_local/backlog.md) | 需求池：想法收集、优先级管理（`/bai-idea` 快速记录） |
| `_local/playgrounds/` | 设计原型 HTML |
| `_local/mockups/` | UI Mockup HTML |
| `_local/store-assets/` | 商店提交文档 + 截图 |


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

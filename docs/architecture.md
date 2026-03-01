# OpenEn — 技术架构文档

## 整体架构

```
Chrome 扩展（单包，零后端）
├── Content Script — 扫描页面、模式判断、渲染分块
├── Background Service Worker — 调 LLM API、批量处理
├── Popup — 开关、模式切换、LLM 配置
├── Options 页（React）— 生词本、学习记录、周报、壁纸
└── IndexedDB — 所有数据
```

## 构建工具

**ESBuild**，沿用旧项目方案。

- 3 个开发依赖：esbuild、typescript、vitest（Options 页加 React 相关依赖）
- 4 个入口点：content、background、popup、options
- ESM 输出格式（MV3 Service Worker 要求）
- 开发模式：watch + sourcemap；生产模式：minify

不使用 Vite/Webpack/Plasmo。ESBuild 原生支持 JSX，足够覆盖 Options 页的 React 需求。

## 项目目录结构

```
OpenEn/
├── src/
│   ├── content/              # Content Script
│   │   ├── index.ts          # DOM 扫描、模式判断、注入
│   │   ├── renderer.ts       # 分块结果渲染（复用旧项目）
│   │   ├── styles.ts         # CSS（复用旧项目）
│   │   └── vocab-panel.ts    # 词汇面板（复用旧项目）
│   ├── background/           # Service Worker
│   │   └── index.ts          # LLM 调用、批量处理、缓存
│   ├── popup/                # Popup UI
│   │   └── index.ts          # 开关、模式切换、LLM 配置
│   ├── options/              # Options 页（React）
│   │   └── App.tsx           # 生词本、学习记录等
│   └── shared/               # 共享模块
│       ├── types.ts          # 类型定义（复用旧项目，按需调整）
│       ├── rule-engine.ts    # 细读模式复杂度判断（复用旧项目，调高长度权重）
│       ├── scan-rules.ts     # 扫读模式本地拆分规则（新写）
│       ├── cache.ts          # IndexedDB 缓存（复用旧项目）
│       ├── db.ts             # IndexedDB 数据层（新写，9 张表）
│       └── llm-adapter.ts    # LLM 适配层（新写）
├── data/
│   ├── word-frequency.json   # 英文常用词频表（内置，离线）
│   ├── dict-ecdict.json      # 通用离线词典（ECDICT 或类似开源词典）
│   └── industry-ai.json      # AI 行业术语包（V1 内置）
├── dist/                     # 构建输出
├── manifest.json
├── popup.html
├── options.html
├── build.mjs
├── package.json
└── tsconfig.json
```

## 分块功能的技术实现

### 两级处理：本地优先，LLM 兜底

分块不是"全部本地"或"全部 LLM"，而是两级：

```
句子进入
  ↓
本地规则判断：能本地拆吗？
  ├── 能（大部分句子）→ 本地拆分 + 离线词典标注生词 → 即时显示
  └── 不能（复杂句）→ 调 LLM 拆分 + LLM 返回语境化生词释义 → 1-2 秒后显示
```

两种模式共用这个两级架构，区别在于阈值和策略：

### 扫读模式的处理流程

1. **本地规则拆分**（scan-rules.ts，新写）
   - 不依赖从句标记词，核心判断：句子长度 + 逻辑转换点
   - 在逻辑转换点断行：并列（and/or/but）、转折（however/although）、条件（if/unless）、因果（because/therefore）、从句引导（which/who/that）等
   - 长度阈值可调（短/中/长三档，默认中）
   - 保留缩进层级
   - **即时完成，零 API 成本**

2. **复杂句降级到 LLM**
   - 本地规则判断句子复杂度超过阈值（多层嵌套等）→ 发给 LLM
   - LLM 返回精准分块 + 语境化生词释义
   - 有 1-2 秒延迟，但只占少数句子

3. **生词标注（本地部分）**
   - 词频表过滤：不在常用 5000-8000 词表里的词 → 标注虚线
   - 行业术语包优先：用户勾选的行业（V1 默认 AI 行业），术语用行业语境释义覆盖通用词典义
   - 已知词过滤：用户标记为"已掌握"的词自动跳过
   - 释义来源：行业包 > 离线词典 > 不标注
   - hover 显示释义，不直接展示

### 细读模式的处理流程

1. **规则引擎判断**（rule-engine.ts，微调）
   - 沿用旧项目的复杂度评估逻辑
   - 提高句子长度权重（15 词 +1.0，25 词 +1.0，40 词 +1.0，原来都是 +0.5）
   - 复杂度 ≥ 灵敏度阈值 → 自动调 LLM 拆分
   - 低于阈值 → 挂手动触发按钮

2. **LLM 返回语境化释义**
   - 细读模式调 LLM 时，同时返回基于上下文的生词释义
   - 释义精准匹配当前语境

3. **进入页面辅助**
   - 生词汇总面板：扫描全文，列出难词

### 模式自动判断

Content Script 进入页面时，根据 URL 和 DOM 结构判断：

| 页面类型 | URL 特征 | 模式 |
|---------|---------|------|
| 推特时间线 | `twitter.com/home`, `x.com/home` | 扫读 |
| 推特搜索 | `twitter.com/search` | 扫读 |
| 推特详情 | `twitter.com/xxx/status/xxx` | 细读 |
| Reddit 列表 | `reddit.com/r/xxx` | 扫读 |
| Reddit 帖子 | `reddit.com/r/xxx/comments/xxx` | 细读 |
| 文章页 | 有 `<article>` 或长文内容 | 细读 |
| 其他 | 默认 | 细读 |

信息流中特别长的内容（推特长 thread 等），自动提升辅助力度。
Popup 手动切换可覆盖自动判断。

## 生词系统的词汇来源

### 三层词汇源（优先级从高到低）

1. **行业术语包**（data/industry-*.json）
   - V1 内置 AI 行业包
   - 每个包包含几百个术语及其行业语境释义
   - 用户在设置中勾选关注的行业
   - 术语包生成方式：LLM + 搜索生成初稿，人工审核后内置

2. **通用离线词典**（data/dict-ecdict.json）
   - 开源词典（如 ECDICT，50+ 万词条）
   - 提供基础释义（可能有多个义项）

3. **LLM 语境化释义**
   - 仅在调 LLM 时获得（细读模式的复杂句 + 扫读模式的降级复杂句）
   - 基于上下文给出精准释义

### 已知词过滤

- 用户标记"已掌握"的词存入 IndexedDB vocab 表
- 标注生词时自动跳过已掌握的词
- 用得越久，标注越精准

## LLM 适配层

支持两种 API 格式：

| 格式 | 覆盖的模型 |
|------|-----------|
| Gemini 格式 | Google Gemini 系列 |
| OpenAI 兼容格式 | OpenAI (GPT)、DeepSeek、Kimi、Claude（通过兼容接口）等 |

### 用户配置项

- API 格式选择（Gemini / OpenAI 兼容）
- API Key（AES 加密存储）
- Base URL（OpenAI 兼容格式需要，Gemini 用默认）
- 模型名称（下拉或手动输入）

### 设计决策

- Prompt 不按模型调，V1 用一套通用 prompt，从旧项目 chunk.ts 提取适配
- API key 用 `crypto.subtle` AES 加密存储，密钥绑定插件实例
- MV3 Service Worker 生命周期：活跃的 fetch 请求会阻止 SW 被杀，不在 SW 内存中存临时状态

## 数据模型（IndexedDB）

### 全局规则

- 主键全部用 UUID（为 V2 跨设备同步预留）
- 所有表加 `updated_at` + `is_dirty`（同步接口预留）
- IndexedDB 自带 schema 版本管理（`onupgradeneeded`），V1 就内置

### 表结构

| 表名 | 用途 |
|------|------|
| `vocab` | 生词表（单词、状态、释义、音标等） |
| `vocab_contexts` | 生词出处（原句、语境释义、来源 URL） |
| `patterns` | 句式类型（that 从句嵌套等） |
| `pattern_examples` | 句式实例（具体例句） |
| `learning_records` | 阅读记录（原文、分块结果、分析、`llm_provider`、`tokens_used`） |
| `settings` | 用户设置（含 `llm_provider`、`llm_model`、`llm_api_key`） |
| `weekly_reports` | 周报缓存 |
| `review_items` | 间隔重复队列（SM-2 算法） |
| `wallpaper_records` | 壁纸生成记录 |

## 代码复用（来自旧项目）

### 直接复制（零或极少修改）

| 模块 | 来源 | 行数 |
|------|------|------|
| CSS 样式 | `styles.ts` | 584 |
| 词汇面板 | `vocab-panel.ts` | 417 |
| 分块渲染器 | `renderer.ts` | 201 |
| 类型定义 | `types.ts` | 65 |

### 复用 + 微调

| 模块 | 来源 | 调整内容 |
|------|------|---------|
| 规则引擎 | `rule-engine.ts` | 提高长度权重 |
| IndexedDB 缓存 | `cache.ts` | 适配新的数据层 |
| 分块 Prompt | `chunk.ts` | 提取通用 prompt，适配两种 API 格式 |
| 站点选择器 | `content/index.ts` | 提取选择器配置，加入模式判断 |

### 需要重写

| 模块 | 原因 |
|------|------|
| Content Script 主逻辑 | 加入两种模式判断、本地拆分路径 |
| Background Service Worker | 从调 Cloudflare Workers → 直调 LLM API |
| Popup | 加 LLM 配置、模式切换 |
| 数据存储层 | 从云端 D1 → 本地 IndexedDB（9 张表） |
| 管理界面 | 从独立网站 → 插件 Options 页（React） |

### 新写

| 模块 | 用途 |
|------|------|
| `scan-rules.ts` | 扫读模式本地拆分规则 |
| `llm-adapter.ts` | LLM 适配层（Gemini + OpenAI 兼容） |
| `db.ts` | IndexedDB 数据层（9 张表） |
| `data/industry-ai.json` | AI 行业术语包 |
| Options 页 | React 管理界面 |

## 开发顺序

1. **项目骨架** — package.json、build.mjs、manifest.json、tsconfig.json
2. **复制可复用代码** — rule-engine、renderer、styles、types、cache
3. **LLM 适配层** — 先跑通一个最简单的分块请求（最小验证）
4. **细读模式** — 基于旧 content script 改造，自动分块跑起来
5. **扫读模式** — 新写 scan-rules.ts，加模式判断和切换
6. **生词系统** — 离线词典 + 词频表 + AI 行业术语包 + 已知词过滤
7. **Popup** — LLM 配置 + 模式切换
8. **IndexedDB 数据层** — 9 张表
9. **Options 页面（React）** — 生词本、学习记录等

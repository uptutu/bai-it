# OpenEn — 交接状态

> 每个 session 开始时先看这个文件，结束时更新它。

## 当前状态

Step 1-8 编码完成，167 个单元测试全通过。下一步 Step 9：Options 页面（React）。

本次完成 Step 8：IndexedDB 数据层（`src/shared/db.ts`），9 张表的 CRUD + SM-2 间隔重复算法 + schema 版本管理。58 个新增单元测试（使用 fake-indexeddb）。

## 已完成

- [x] 初始化 git 仓库和文档骨架
- [x] 分块功能需求讨论（扫读 + 细读两种模式）
- [x] 分块功能技术方案（本地优先 + LLM 兜底的两级架构）
- [x] 测试机制建立：docs/testing.md（验收标准 + 测试方法 + 基础设施）
- [x] Chrome CDP 调试环境配置（`~/.chrome-debug-profile/`，X 已登录，端口 9222）
- [x] 管理端（Options 页）需求讨论
- [x] Popup 需求重新设计（大按钮开关 + 站点级 toggle + 辅助力度滑杆 + 显示方式分段选择器）。原型：`mockup-popup.html`
- [x] **Step 1：项目骨架** — package.json、build.mjs、manifest.json、tsconfig.json
- [x] **Step 2：复制可复用代码** — rule-engine、renderer、styles、types、cache、vocab-panel
- [x] **Step 3：LLM 适配层** — Gemini + OpenAI 兼容格式，26 个单元测试
- [x] **Step 4：细读模式** — 规则引擎复杂度判断 + LLM 分块 + 手动触发，22 个单元测试
- [x] **Step 5：扫读模式** — scan-rules.ts 本地拆分（并列/转折/条件/从句），31 个单元测试
- [x] **Step 6：生词系统** — vocab.ts 词频过滤 + 行业术语 + 离线词典 + 已知词跳过，16 个单元测试
- [x] **Step 7：Popup** — popup.html + popup.js，LLM 配置、拆分设置（粒度/显示方式/门槛）、模式切换
- [x] **信息流截断修复** — insertChunkedElement() 跳过 line-clamp/overflow-hidden 容器，在外层插入
- [x] **5 级显示方式** — L5 全拆、L4 缩进无透明度、L3 仅分行、L2 行内分隔符、L1 从句变淡
- [x] **Step 8：IndexedDB 数据层** — db.ts 9 张表 CRUD + SM-2 算法 + schema 管理，58 个单元测试

## 编码细节

### 构建配置
- **ESM** 仅用于 background service worker（MV3 要求 `type: module`）
- **IIFE** 用于 content script、popup、options（Chrome 不支持 content script ESM）
- content.js 包含词汇数据打包后 102KB（minified），可接受

### 数据文件（data/）
- `word-frequency.json`：5000 常用词（来源：Google Trillion Word Corpus top 5000）
- `dict-ecdict.json`：~250 个精选词汇中文释义（MVP 子集，生产可扩展）
- `industry-ai.json`：~80 个 AI 行业术语及中文释义

### IndexedDB 数据层
- **数据库**：`openen-data`（与缓存数据库 `openen-cache` 独立）
- **9 张表**：vocab、vocab_contexts、patterns、pattern_examples、learning_records、settings、weekly_reports、review_items、wallpaper_records
- **全局规则**：UUID 主键、`updated_at` + `is_dirty`（V2 同步预留）、`onupgradeneeded` schema 版本管理
- **SM-2 算法**：review_items 表内置间隔重复，`reviewItemDAO.review(db, id, quality)` 自动更新 ease_factor/interval/next_review_at
- **settings 表**：键值对存储，给 Options 页学习系统用。Popup/Background 的 LLM 配置仍走 `chrome.storage.sync`，暂不迁移
- **测试**：fake-indexeddb mock，58 个单元测试覆盖全部表 CRUD + SM-2 + 跨表业务场景

### 浏览器测试
- 已切换到 **Puppeteer** 做浏览器验收测试（替代了之前不稳定的 CDP websocket 方案）
- 冒烟测试脚本：`tests/acceptance/smoke-test.mjs`
- 扫读模式测试脚本：`tests/acceptance/scan-mode-basic.mjs`

### 待人工确认项
1. 配置 API key 后，在 X 首页验证扫读模式拆分效果
2. 生词虚线标注和 hover 释义弹层
3. 滚动加载后新推文也被处理
4. 释义准确性抽查
5. Reddit 信息流页面分块是否正常分行显示（L3-L5）
6. Popup 各控件功能（LLM 配置保存、显示方式滑块、粒度切换）

### Chrome 调试 profile 问题
旧的 `~/.chrome-debug-profile/` 无法通过 `--load-extension` 加载扩展（原因不明，可能是 profile 状态损坏）。新 profile `~/.chrome-debug-profile-2/` 可以正常加载但缺少 Reddit 登录状态。建议：在用户主力 Chrome 中手动加载 dist/ 目录测试。

## 关键决策记录

### 两种阅读模式
- **扫读模式**：信息流场景（80% 时间），目标是效率。本地规则激进拆分（按长度 + 逻辑转换点断行），复杂句降级到 LLM。即时响应为主。
- **细读模式**：文章场景（20% 时间），目标是成长。规则引擎判断复杂度（提高了长度权重），只拆真正复杂的句子，简单长句留给用户自己读。手动触发按钮兜底。

### 生词标注方案
- **不直接显示中文释义**，用 hover 虚线（用户确认，避免视觉干扰和不准确标注的打扰）
- **三层词汇源**：行业术语包（V1 必须有 AI 包）> 通用离线词典 > LLM 语境化释义
- AI 行业术语包手动审核后内置

### 学习系统（管理端 Options 页）
- **页面结构**：四个 Tab——Dashboard、每日学习、难句集、设置
- **核心单位是句子不是单词**：不做"生词本"，做"难句集"
- **难句卡片 6 层**：原句 → 句式标签 → 分块 → 句式讲解 → 学会表达 → 生词
- **视觉风格**：借鉴 frontend-slides 项目

### 技术栈
- 构建工具：ESBuild（沿用旧项目，加 React JSX 支持）
- 单包结构，不做 monorepo
- 浏览器测试：Puppeteer

## 开发顺序

详见 docs/architecture.md "开发顺序" 章节，共 9 步：
1. ~~项目骨架~~ ✅
2. ~~复制可复用代码~~ ✅
3. ~~LLM 适配层~~ ✅
4. ~~细读模式~~ ✅
5. ~~扫读模式~~ ✅
6. ~~生词系统~~ ✅
7. ~~Popup~~ ✅
8. ~~IndexedDB 数据层~~ ✅
9. **Options 页面（React）** ← 下一步

## 参考文件

- 旧项目：`/Users/liuyujian/Documents/Enlearn/`
- 新项目规划原文：`/Users/liuyujian/Documents/Enlearn/newproject.md`
- 扫读模式视觉 mockup：`mockup-scan-mode.html`（用于讨论，不纳入正式代码）

# 发布流程

> **用户说"发布"时，Claude 按以下步骤自主执行。** 除了商店上传，用户不需要跑任何命令。

---

## Claude 自动执行的步骤

### 1. 确认版本号

问用户：这次发什么版本？给出建议：
- bug 修复：改第三位（0.2.0 → 0.2.1）
- 新功能：改第二位（0.2.0 → 0.3.0）
- 大版本：改第一位（0.2.0 → 1.0.0）

用户确认后继续。

### 2. 更新 manifest.json

```bash
# Claude 修改 manifest.json 的 version 字段
```

### 3. 构建 + 打包

```bash
npm run release
```

依次执行：跑测试 → 构建 → 打包 Chrome/Edge zip + Firefox zip。测试不通过会中断。

产物：
- `bai-it-v{版本号}.zip` — Chrome / Edge 通用
- `bai-it-firefox-v{版本号}.zip` — Firefox 专用（自动加 gecko id + 改 background.scripts）

### 4. 生成 Firefox 源码包

Firefox AMO 审核要求提供可构建的源码。

```bash
zip -r bai-it-source.zip . \
  -x "node_modules/*" "dist/*" "dist-*" ".git/*" \
  "bai-it-*.zip" "_local/*" "*.DS_Store"
```

### 5. 提交 + 推送 + 创建 GitHub Release

```bash
git add -A
git commit -m "release: v{版本号}"
git tag v{版本号}
git push origin main --tags
```

> **CI 自动发布（推荐）**：[`.github/workflows/release.yml`](../.github/workflows/release.yml) 监听 `v*` tag push，自动跑测试 + 构建 + 打 Chrome/Firefox/Safari 三个 zip + 创建 GitHub Release（`generate_release_notes: true` 自动生成 notes）。本地只需 push tag。
>
> 触发后查看进度：仓库 → Actions → release workflow。
>
> 本地手动发布仍可用 `npm run release`（同样产出三个 zip + 旧式 `gh release create`）。

### 6. 提醒用户上传商店

Claude 完成上面所有步骤后，告诉用户：

> GitHub 发布完成。zip 文件在项目根目录。
>
> 需要你手动上传到三个商店：
>
> **Chrome Web Store**
> 1. 打开 https://chrome.google.com/webstore/devconsole
> 2. 点已有扩展 → Package → Upload new package
> 3. 上传 `bai-it-v{版本号}.zip` → Submit for review
>
> **Edge Add-ons**
> 1. 打开 https://partner.microsoft.com/dashboard/microsoftedge/public/login
> 2. 点已有扩展 → Packages → 上传 `bai-it-v{版本号}.zip`
> 3. Submit → Publish
>
> **Firefox Add-ons (AMO)**
> 1. 打开 https://addons.mozilla.org/developers/addons
> 2. 点已有扩展 → Upload New Version
> 3. 上传 `bai-it-firefox-v{版本号}.zip`
> 4. 上传源码包 `bai-it-source.zip` + 填写构建说明（见下方）
> 5. Submit for review
>
> Firefox 构建说明（复制粘贴到 AMO 表单）：
> ```
> Requirements: Node.js 18+
> Steps:
> 1. npm install
> 2. npm run build
> 3. node scripts/package-firefox.mjs
> 4. Output: bai-it-firefox-v{version}.zip
> ```

详细字段说明见 `_local/store-assets/` 下的各商店提交指南。

### 7. 清理

用户确认商店上传完成后：

```bash
rm bai-it-v*.zip bai-it-firefox-v*.zip bai-it-source.zip
```

---

## 快速检查清单

- [ ] 版本号已确认
- [ ] `manifest.json` version 已更新
- [ ] `npm run release` 通过（测试 + 构建 + Chrome zip + Firefox zip）
- [ ] `bai-it-source.zip` 源码包已生成
- [ ] Git commit + tag + push
- [ ] GitHub Release 已创建并挂上两个 zip
- [ ] 用户已上传 Chrome Web Store
- [ ] 用户已上传 Edge Add-ons
- [ ] 用户已上传 Firefox AMO（含源码包）
- [ ] 本地 zip 已清理

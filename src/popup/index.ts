/**
 * Popup — 弹出窗口
 *
 * 职责：
 * 1. 大按钮：当前页面开关（显示原文 / 拆分显示）
 * 2. 站点级 toggle：控制整个域名是否启用
 * 3. 辅助力度滑杆（1-5），合并 chunkGranularity + sensitivity
 * 4. 显示方式分段选择器（详细/简洁/轻微）+ 实时预览
 */

import type { Message, OpenEnConfig } from "../shared/types.ts";

// ========== DOM 元素 ==========

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const siteName = $("site-name");
const siteDomain = $("site-domain");
const actionBtn = $<HTMLButtonElement>("action-btn");
const actionText = $("action-text");
const siteToggle = $<HTMLInputElement>("site-toggle");
const content = $("content");
const assistSlider = $<HTMLInputElement>("assist-slider");
const assistHint = $("assist-hint");
const segControl = $("seg-control");
const modeDesc = $("mode-desc");
const preview = $("preview");
const linkOptions = $<HTMLAnchorElement>("link-options");

// ========== 常量 ==========

const ASSIST_HINTS: Record<number, string> = {
  1: "最少 — 只拆最难的句子",
  2: "较少 — 复杂句才拆",
  3: "适中 — 复杂句自动拆，简单句不打扰",
  4: "较多 — 大部分长句都会拆",
  5: "最多 — 积极拆分，一目了然",
};

/** 辅助力度 → 底层配置映射 */
const ASSIST_TO_CONFIG: Record<number, { chunkGranularity: "coarse" | "medium" | "fine"; sensitivity: number }> = {
  1: { chunkGranularity: "coarse", sensitivity: 5 },
  2: { chunkGranularity: "coarse", sensitivity: 4 },
  3: { chunkGranularity: "medium", sensitivity: 3 },
  4: { chunkGranularity: "fine", sensitivity: 2 },
  5: { chunkGranularity: "fine", sensitivity: 1 },
};

/** 显示方式配置 */
const DISPLAY_MODES: Record<string, { desc: string; intensity: number; html: string }> = {
  structure: {
    desc: "分行 + 缩进，一眼看清主从关系",
    intensity: 5,
    html: `
      <span class="line line-main">She finished the project</span>
      <span class="line line-sub1">that no one thought was possible,</span>
      <span class="line line-sub2">before the deadline.</span>
    `,
  },
  lines: {
    desc: "只分行，不加额外标记",
    intensity: 3,
    html: `
      <span class="line">She finished the project</span>
      <span class="line">that no one thought was possible,</span>
      <span class="line">before the deadline.</span>
    `,
  },
  light: {
    desc: "不分行，次要部分变淡",
    intensity: 1,
    html: `<span class="line line-main">She finished the project</span><span class="dot"> · </span><span class="line line-sub">that no one thought was possible,</span><span class="dot"> · </span><span class="line line-sub">before the deadline.</span>`,
  },
};

// ========== 状态 ==========

let currentTab: chrome.tabs.Tab | null = null;
let currentHostname = "";
let isChunking = false; // 大按钮状态
let siteEnabled = true; // 站点级开关

// ========== 通信 ==========

function sendMessage(message: Message): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

// ========== 辅助力度：config → slider 值 ==========

function configToAssistLevel(config: OpenEnConfig): number {
  const s = config.sensitivity;
  if (s >= 5) return 1;
  if (s >= 4) return 2;
  if (s >= 3) return 3;
  if (s >= 2) return 4;
  return 5;
}

// ========== 显示方式：chunkIntensity → mode key ==========

function intensityToMode(intensity: number): string {
  if (intensity >= 4) return "structure";
  if (intensity >= 2) return "lines";
  return "light";
}

// ========== UI 更新 ==========

function updateActionButton(): void {
  if (isChunking) {
    actionBtn.className = "action-btn is-on";
    actionText.textContent = "显示原文";
  } else {
    actionBtn.className = "action-btn is-off";
    actionText.textContent = "拆分显示";
  }

  // 站点禁用时，大按钮灰掉不可点
  if (!siteEnabled) {
    actionBtn.style.opacity = "0.4";
    actionBtn.style.pointerEvents = "none";
  } else {
    actionBtn.style.opacity = "1";
    actionBtn.style.pointerEvents = "auto";
  }
}

function updateContentArea(): void {
  // 站点禁用或拆分关闭时，设置区域变淡
  content.classList.toggle("disabled", !siteEnabled || !isChunking);
}

function setDisplayMode(modeKey: string): void {
  const mode = DISPLAY_MODES[modeKey];
  if (!mode) return;

  // 更新分段按钮
  segControl.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.mode === modeKey);
  });

  // 更新描述和预览
  modeDesc.textContent = mode.desc;
  preview.className = "display-preview mode-" + modeKey;
  preview.innerHTML = mode.html;
}

// ========== 初始化 ==========

async function init(): Promise<void> {
  // 获取当前 tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab ?? null;

  if (currentTab?.url) {
    try {
      currentHostname = new URL(currentTab.url).hostname;
    } catch {
      currentHostname = "";
    }
  }

  // 显示站点名
  siteName.textContent = currentHostname || "—";
  siteDomain.textContent = currentHostname || "—";

  // 获取当前状态
  if (currentTab?.id && currentHostname) {
    const result = (await sendMessage({
      type: "getTabState",
      tabId: currentTab.id,
      hostname: currentHostname,
    })) as { state: "active" | "paused" | "disabled" };

    siteEnabled = result.state !== "disabled";
    isChunking = result.state === "active";
  }

  // 获取配置
  const config = (await sendMessage({ type: "getConfig" })) as OpenEnConfig;

  // 设置站点 toggle
  siteToggle.checked = siteEnabled;

  // 设置辅助力度滑杆
  const assistLevel = configToAssistLevel(config);
  assistSlider.value = String(assistLevel);
  assistHint.textContent = ASSIST_HINTS[assistLevel];

  // 设置显示方式
  const currentMode = intensityToMode(config.chunkIntensity);
  setDisplayMode(currentMode);

  // 更新 UI 状态
  updateActionButton();
  updateContentArea();

  // ===== 事件绑定 =====

  // 大按钮：切换当前页面拆分
  actionBtn.addEventListener("click", async () => {
    if (!siteEnabled || !currentTab?.id) return;

    isChunking = !isChunking;

    if (isChunking) {
      await sendMessage({ type: "resumeTab", tabId: currentTab.id });
    } else {
      await sendMessage({ type: "pauseTab", tabId: currentTab.id });
    }

    updateActionButton();
    updateContentArea();
  });

  // 站点级 toggle
  siteToggle.addEventListener("change", async () => {
    if (!currentHostname) return;

    const result = (await sendMessage({
      type: "toggleSite",
      hostname: currentHostname,
    })) as { enabled: boolean };

    siteEnabled = result.enabled;

    if (!siteEnabled) {
      isChunking = false;
    } else {
      // 站点重新启用时，恢复为活跃
      isChunking = true;
    }

    updateActionButton();
    updateContentArea();
  });

  // 辅助力度滑杆 — 拖动时更新提示
  assistSlider.addEventListener("input", () => {
    const level = Number(assistSlider.value);
    assistHint.textContent = ASSIST_HINTS[level];
  });

  // 辅助力度滑杆 — 松手时保存
  assistSlider.addEventListener("change", async () => {
    const level = Number(assistSlider.value);
    const mapping = ASSIST_TO_CONFIG[level];
    await sendMessage({
      type: "updateConfig",
      config: mapping,
    });
  });

  // 显示方式分段选择器
  segControl.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest(".seg-btn") as HTMLElement | null;
    if (!btn || btn.classList.contains("active")) return;

    const modeKey = btn.dataset.mode!;
    setDisplayMode(modeKey);

    const mode = DISPLAY_MODES[modeKey];
    await sendMessage({
      type: "updateConfig",
      config: { chunkIntensity: mode.intensity },
    });
  });

  // 更多设置 → Options 页
  linkOptions.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();

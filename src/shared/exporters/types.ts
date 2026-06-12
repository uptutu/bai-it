/**
 * 导出器共享类型与工具
 *
 * 掰it 的导出统一接受 LearningRecord[] + 元数据，输出 Blob。
 * 触发下载由调用方负责（Options 页用 <a download>）。
 */

import type { LearningRecord } from "../types.ts";

/** 导出格式 */
export type ExportFormat = "epub" | "md" | "pdf";

/** 文档元数据（标题/作者/简介 + 句子集合） */
export interface ExportDocument {
  title: string;
  author: string;
  description?: string;
  language: string; // BCP-47，如 "en" / "zh"
  records: LearningRecord[];
}

/** 导出结果 */
export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

/** 当前日期时间（YYYY-MM-DD HH:mm） */
export function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO 日期（YYYY-MM-DD） */
export function isoDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 字符串安全转义（XML/HTML 文本节点） */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 触发下载（Options 页用 <a download>） */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

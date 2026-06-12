/**
 * Markdown 导出
 *
 * 极简模板：标题 → 简介 → 每条句子（原句 + 分块 + 为什么难读 + 学会表达 + 生词）
 * 适合在 VSCode、Typora、Notion 等阅读器打开。
 */

import type { ExportDocument, ExportResult } from "./types.ts";
import { isoDate, nowStamp } from "./types.ts";
import { PATTERN_LABELS } from "../../options/constants.ts";

export function exportToMarkdown(doc: ExportDocument): ExportResult {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push("");
  if (doc.description) {
    lines.push(`> ${doc.description}`);
    lines.push("");
  }
  lines.push(`- 句子数：${doc.records.length}`);
  lines.push(`- 导出时间：${nowStamp()}`);
  lines.push("");

  if (doc.records.length === 0) {
    lines.push("_暂无句子_");
  } else {
    doc.records.forEach((r, i) => {
      const patternLabel = r.pattern_key ? PATTERN_LABELS[r.pattern_key] : "其他";
      lines.push(`## ${i + 1}. ${patternLabel} · ${isoDate(r.created_at)}`);
      lines.push("");
      lines.push("**原句**");
      lines.push("");
      lines.push(`> ${r.sentence}`);
      lines.push("");

      if (r.chunked) {
        lines.push("**分块**");
        lines.push("");
        lines.push("```");
        lines.push(r.chunked);
        lines.push("```");
        lines.push("");
      }

      if (r.sentence_analysis) {
        lines.push("**为什么难读**");
        lines.push("");
        lines.push(r.sentence_analysis);
        lines.push("");
      }

      if (r.expression_tips) {
        lines.push("**学会表达**");
        lines.push("");
        lines.push(r.expression_tips.replace(/\*\*/g, ""));
        lines.push("");
      }

      if (r.new_words.length > 0) {
        lines.push("**生词**");
        lines.push("");
        for (const w of r.new_words) {
          lines.push(`- \`${w.word}\` — ${w.definition}`);
        }
        lines.push("");
      }

      if (r.source_url) {
        lines.push(`[来源](${r.source_url})`);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });

  const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const filename = `${safeTitle || "掰it-export"}-${isoDate(Date.now())}.md`;

  return { blob, filename, mimeType: "text/markdown" };
}

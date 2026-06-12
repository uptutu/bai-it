/**
 * PDF 导出
 *
 * 走浏览器原生路径：构造一个不可见的 iframe，加载打印专用 HTML，调 window.print()。
 * 用户在系统打印对话框里选"另存为 PDF"即可。
 *
 * 优点：零依赖，所有系统都支持
 * 缺点：交互多一步（保存对话框）
 */

import type { ExportDocument } from "./types.ts";
import { escapeXml, isoDate, nowStamp } from "./types.ts";
import { PATTERN_LABELS } from "../../options/constants.ts";

function buildPrintHtml(doc: ExportDocument): string {
  const sections = doc.records
    .map((r, i) => {
      const patternLabel = r.pattern_key ? PATTERN_LABELS[r.pattern_key] : "其他";
      const newWordsHtml =
        r.new_words.length > 0
          ? `<dl class="vocab">${r.new_words
              .map(
                (w) =>
                  `<dt>${escapeXml(w.word)}</dt><dd>${escapeXml(w.definition)}</dd>`,
              )
              .join("")}</dl>`
          : "";

      return `
    <section class="record">
      <h2>${i + 1}. ${escapeXml(patternLabel)} · ${isoDate(r.created_at)}</h2>
      <blockquote class="original">${escapeXml(r.sentence)}</blockquote>
      ${r.chunked ? `<h3>分块</h3><pre>${escapeXml(r.chunked)}</pre>` : ""}
      ${r.sentence_analysis ? `<h3>为什么难读</h3><p>${escapeXml(r.sentence_analysis)}</p>` : ""}
      ${r.expression_tips ? `<h3>学会表达</h3><p>${escapeXml(r.expression_tips.replace(/\*\*/g, ""))}</p>` : ""}
      ${newWordsHtml}
      ${r.source_url ? `<p class="source"><a href="${escapeXml(r.source_url)}">${escapeXml(r.source_url)}</a></p>` : ""}
    </section>
  `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(doc.title)}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Georgia, "Source Han Serif SC", serif; line-height: 1.6; color: #222; max-width: 100%; }
    h1 { font-size: 1.8em; border-bottom: 2px solid #6366f1; padding-bottom: 0.3em; }
    h2 { font-size: 1.2em; color: #444; margin-top: 1.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
    h3 { font-size: 1em; color: #6366f1; margin-top: 1em; }
    .meta { color: #666; font-size: 0.9em; margin: 1em 0; }
    blockquote.original { border-left: 3px solid #6366f1; padding: 0.5em 1em; margin: 1em 0; background: #f5f5ff; font-style: italic; page-break-inside: avoid; }
    pre { background: #fafafa; padding: 0.8em; border: 1px solid #eee; white-space: pre-wrap; font-family: "SF Mono", Menlo, monospace; font-size: 0.85em; page-break-inside: avoid; }
    section.record { page-break-inside: avoid; margin-bottom: 2em; }
    dl.vocab { margin: 0.5em 0; }
    dl.vocab dt { font-weight: bold; display: inline; }
    dl.vocab dt:after { content: " — "; color: #999; }
    dl.vocab dd { display: inline; margin-left: 0; }
    p.source { font-size: 0.8em; color: #888; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${escapeXml(doc.title)}</h1>
  ${doc.description ? `<blockquote>${escapeXml(doc.description)}</blockquote>` : ""}
  <p class="meta">句子数：${doc.records.length} · 导出时间：${nowStamp()}</p>
  ${sections || "<p><em>暂无句子</em></p>"}
</body>
</html>`;
}

/** 触发浏览器打印（用户在打印对话框里选"另存为 PDF"） */
export function exportToPdf(doc: ExportDocument): void {
  const html = buildPrintHtml(doc);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);
  iframe.srcdoc = html;

  iframe.addEventListener("load", () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 5000);
      }
    }, 100);
  });
}

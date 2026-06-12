/**
 * 导出菜单：下拉式按钮，选格式后触发下载
 *
 * 接受 LearningRecord[] + 文档元数据。EPUB 是异步的，加 loading 态。
 */

import { useState, useRef, useEffect } from "react";
import {
  exportToEpub,
  exportToMarkdown,
  exportToPdf,
  triggerDownload,
  type ExportDocument,
} from "../../shared/exporters/index.ts";

interface ExportMenuProps {
  doc: ExportDocument;
  disabled?: boolean;
}

export function ExportMenu({ doc, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点外面关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = async (format: "epub" | "md" | "pdf") => {
    setOpen(false);
    if (disabled || doc.records.length === 0) return;
    try {
      setBusy(true);
      if (format === "pdf") {
        exportToPdf(doc);
        // PDF 走系统打印对话框，busy 立即结束
        setBusy(false);
        return;
      }
      if (format === "md") {
        const result = exportToMarkdown(doc);
        triggerDownload(result.blob, result.filename);
      } else {
        const result = await exportToEpub(doc);
        triggerDownload(result.blob, result.filename);
      }
    } catch (err) {
      console.error("[bait] export failed:", err);
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="export-menu-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        type="button"
        title="导出当前句子"
      >
        {busy ? "导出中..." : "导出 ▾"}
      </button>
      {open && (
        <div className="export-menu-dropdown">
          <button
            className="export-menu-item"
            onClick={() => handleExport("epub")}
            type="button"
            disabled={doc.records.length === 0}
          >
            <span className="export-menu-item-label">EPUB</span>
            <span className="export-menu-item-hint">阅读器推送</span>
          </button>
          <button
            className="export-menu-item"
            onClick={() => handleExport("md")}
            type="button"
            disabled={doc.records.length === 0}
          >
            <span className="export-menu-item-label">Markdown</span>
            <span className="export-menu-item-hint">纯文本备份</span>
          </button>
          <button
            className="export-menu-item"
            onClick={() => handleExport("pdf")}
            type="button"
            disabled={doc.records.length === 0}
          >
            <span className="export-menu-item-label">PDF</span>
            <span className="export-menu-item-hint">系统打印对话框</span>
          </button>
        </div>
      )}
    </div>
  );
}

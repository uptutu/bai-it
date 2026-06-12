/**
 * 导出器测试
 *
 * 关键不变量：
 * - Markdown: 包含原句、分块、生词、来源
 * - EPUB: mimetype 是固定字符串；OPF 含 dc:title；包含所有章节
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import type { LearningRecord } from "../shared/types.ts";
import { exportToMarkdown } from "../shared/exporters/markdown.ts";
import { exportToEpub } from "../shared/exporters/epub.ts";
import { escapeXml, isoDate } from "../shared/exporters/types.ts";

const mockRecord: LearningRecord = {
  id: "test-001",
  sentence: "OpenAI, which raised $13B, is now valued at $157B.",
  chunked: "OpenAI,\n  which raised $13B,\nis now valued at $157B.",
  sentence_analysis: "插入了一个 which 从句。",
  expression_tips: "**X, which did Y, is now Z**",
  pattern_key: "insertion",
  new_words: [
    { word: "valued", definition: "估值" },
    { word: "raised", definition: "筹集" },
  ],
  source_url: "https://example.com/article",
  llm_provider: "gemini",
  created_at: new Date("2026-06-01T10:00:00Z").getTime(),
  updated_at: new Date("2026-06-01T10:00:00Z").getTime(),
  is_dirty: false,
};

const baseDoc = {
  title: "测试标题",
  author: "掰it",
  description: "测试描述",
  language: "en",
};

describe("exportToMarkdown", () => {
  it("生成包含原句/分块/生词/来源的完整 Markdown", async () => {
    const result = exportToMarkdown({
      ...baseDoc,
      records: [mockRecord],
    });

    expect(result.mimeType).toBe("text/markdown");
    expect(result.filename).toMatch(/^测试标题-\d{4}-\d{2}-\d{2}\.md$/);

    const text = await result.blob.text();
    expect(text).toContain("# 测试标题");
    expect(text).toContain("> 测试描述");
    expect(text).toContain("OpenAI, which raised $13B, is now valued at $157B.");
    expect(text).toContain("```");
    expect(text).toContain("which raised $13B");
    expect(text).toContain("插入了一个 which 从句。");
    expect(text).toContain("X, which did Y, is now Z"); // 去掉 markdown 加粗符号
    expect(text).toContain("`valued` — 估值");
    expect(text).toContain("`raised` — 筹集");
    expect(text).toContain("[来源](https://example.com/article)");
  });

  it("文件名为空时使用降级标题", () => {
    const result = exportToMarkdown({
      title: "",
      author: "掰it",
      language: "en",
      records: [],
    });
    expect(result.filename).toMatch(/^掰it-export-/);
  });

  it("空 records 数组生成包含占位符的文档", async () => {
    const result = exportToMarkdown({
      ...baseDoc,
      records: [],
    });
    const text = await result.blob.text();
    expect(text).toContain("句子数：0");
    expect(text).toContain("_暂无句子_");
  });

  it("文件标题包含非法字符时被替换为下划线", () => {
    const result = exportToMarkdown({
      ...baseDoc,
      title: "test/file:name*?",
      records: [],
    });
    expect(result.filename).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe("exportToEpub", () => {
  it("生成有效的 EPUB 3.0 文件结构", async () => {
    const result = await exportToEpub({
      ...baseDoc,
      records: [mockRecord],
    });

    expect(result.mimeType).toBe("application/epub+zip");
    expect(result.filename).toMatch(/\.epub$/);

    const buffer = await result.blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    // 1. mimetype 内容固定
    const mimetype = await zip.file("mimetype")?.async("string");
    expect(mimetype).toBe("application/epub+zip");

    // 2. container.xml
    const container = await zip.file("META-INF/container.xml")?.async("string");
    expect(container).toContain("rootfile");
    expect(container).toContain("OEBPS/content.opf");

    // 3. content.opf 含元数据
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    expect(opf).toContain("<?xml");
    expect(opf).toContain("<dc:title>测试标题</dc:title>");
    expect(opf).toContain("<dc:creator>掰it</dc:creator>");
    expect(opf).toContain('<dc:language>en</dc:language>');
    expect(opf).toContain("<dc:description>测试描述</dc:description>");
    expect(opf).toContain('version="3.0"');

    // 4. nav.xhtml
    const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain("chapter-1.xhtml");

    // 5. 章节含原句
    const chapter = await zip.file("OEBPS/chapter-1.xhtml")?.async("string");
    expect(chapter).toContain("OpenAI, which raised $13B");
    expect(chapter).toContain("<pre");
    expect(chapter).toContain("估值");

    // 6. style.css
    const css = await zip.file("OEBPS/style.css")?.async("string");
    expect(css).toContain("font-family");
  });

  it("多记录时每条生成独立章节", async () => {
    const result = await exportToEpub({
      ...baseDoc,
      records: [mockRecord, { ...mockRecord, id: "test-002", sentence: "Second sentence." }],
    });
    const buffer = await result.blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const ch1 = await zip.file("OEBPS/chapter-1.xhtml")?.async("string");
    const ch2 = await zip.file("OEBPS/chapter-2.xhtml")?.async("string");
    expect(ch1).toBeDefined();
    expect(ch2).toBeDefined();
    expect(ch2).toContain("Second sentence.");
  });

  it("空 records 仍生成有效的 EPUB（无章节）", async () => {
    const result = await exportToEpub({
      ...baseDoc,
      records: [],
    });
    const buffer = await result.blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    expect(opf).toContain("<manifest>");
    expect(opf).not.toContain("chapter-1");

    const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
    expect(nav).toContain("<ol>");
  });
});

describe("utility functions", () => {
  it("escapeXml 转义 5 个 XML 特殊字符", () => {
    expect(escapeXml(`<a href="b">'c'&d</a>`)).toBe("&lt;a href=&quot;b&quot;&gt;&apos;c&apos;&amp;d&lt;/a&gt;");
  });

  it("isoDate 格式为 YYYY-MM-DD", () => {
    expect(isoDate(new Date("2026-06-12T08:00:00Z").getTime())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

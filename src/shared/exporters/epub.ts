/**
 * EPUB 导出
 *
 * 生成符合 EPUB 3.0 规范的 .epub 文件：
 * - mimetype（首个文件，必须未压缩）
 * - META-INF/container.xml
 * - OEBPS/content.opf（包描述）
 * - OEBPS/nav.xhtml（导航）
 * - OEBPS/chapter-N.xhtml（每条句子一章）
 *
 * 适用：Apple Books、Koreader、Calibre；Kindle 需转换（calibre / kindle previewer）。
 */

import JSZip from "jszip";
import type { LearningRecord } from "../types.ts";
import type { ExportDocument, ExportResult } from "./types.ts";
import { escapeXml, isoDate } from "./types.ts";
import { PATTERN_LABELS } from "../../options/constants.ts";

/** EPUB 内部 ID — 用时间戳保证唯一性 */
function epubId(): string {
  return `urn:uuid:bait-${Date.now()}`;
}

function buildChapterXhtml(chapter: {
  index: number;
  title: string;
  body: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <section epub:type="bodymatter chapter">
    <h1>${escapeXml(chapter.title)}</h1>
    ${chapter.body}
  </section>
</body>
</html>`;
}

function renderRecordBody(r: LearningRecord): string {
  const parts: string[] = [];

  parts.push(`<blockquote class="original">${escapeXml(r.sentence)}</blockquote>`);

  if (r.chunked) {
    parts.push('<h2>分块</h2>');
    parts.push(`<pre class="chunked">${escapeXml(r.chunked)}</pre>`);
  }

  if (r.sentence_analysis) {
    parts.push('<h2>为什么难读</h2>');
    const paragraphs = r.sentence_analysis.split(/\n+/).filter(Boolean);
    parts.push(...paragraphs.map((p) => `<p>${escapeXml(p)}</p>`));
  }

  if (r.expression_tips) {
    parts.push('<h2>学会表达</h2>');
    const paragraphs = r.expression_tips.split(/\n+/).filter(Boolean);
    parts.push(...paragraphs.map((p) => `<p>${escapeXml(p)}</p>`));
  }

  if (r.new_words.length > 0) {
    parts.push('<h2>生词</h2>');
    parts.push('<dl class="vocab">');
    for (const w of r.new_words) {
      parts.push(`<dt>${escapeXml(w.word)}</dt><dd>${escapeXml(w.definition)}</dd>`);
    }
    parts.push('</dl>');
  }

  if (r.source_url) {
    parts.push(`<p class="source"><a href="${escapeXml(r.source_url)}">来源</a></p>`);
  }

  return parts.join("\n");
}

const STYLE_CSS = `
body { font-family: Georgia, "Source Han Serif SC", serif; line-height: 1.7; margin: 1em; color: #222; }
h1 { font-size: 1.3em; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; }
h2 { font-size: 1.05em; color: #555; margin-top: 1.5em; }
blockquote.original { border-left: 3px solid #6366f1; padding: 0.5em 1em; margin: 1em 0; background: #f8f8ff; font-style: italic; }
pre.chunked { background: #fafafa; padding: 1em; border: 1px solid #eee; white-space: pre-wrap; font-family: "SF Mono", Menlo, monospace; font-size: 0.9em; line-height: 1.5; }
dl.vocab { margin: 0.5em 0; }
dl.vocab dt { font-weight: bold; display: inline; }
dl.vocab dt:after { content: " — "; color: #999; }
dl.vocab dd { display: inline; margin-left: 0; }
dl.vocab dd:after { content: "\A"; white-space: pre; }
p.source { font-size: 0.85em; color: #888; margin-top: 2em; }
nav#toc ol { list-style: none; padding-left: 0; }
nav#toc li { margin: 0.3em 0; }
`;

export async function exportToEpub(doc: ExportDocument): Promise<ExportResult> {
  const zip = new JSZip();
  const id = epubId();
  const date = new Date().toISOString().split("T")[0];

  // 1. mimetype（必须是第一个文件，存储方式 STORE）
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  // 3. 生成各章节
  const chapters: { id: string; href: string; title: string }[] = [];
  doc.records.forEach((r, i) => {
    const patternLabel = r.pattern_key ? PATTERN_LABELS[r.pattern_key] : "其他";
    const title = `${i + 1}. ${patternLabel}`;
    const href = `chapter-${i + 1}.xhtml`;
    const xhtml = buildChapterXhtml({
      index: i + 1,
      title,
      body: renderRecordBody(r),
    });
    zip.file(`OEBPS/${href}`, xhtml);
    chapters.push({ id: `chap${i + 1}`, href, title });
  });

  // 4. nav.xhtml（EPUB 3 导航）
  const navItems = chapters
    .map((c) => `<li><a href="${c.href}">${escapeXml(c.title)}</a></li>`)
    .join("\n        ");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>目录</title></head>
<body>
  <nav id="toc" epub:type="toc">
    <h1>目录</h1>
    <ol>
        ${navItems}
    </ol>
  </nav>
</body>
</html>`,
  );

  // 5. content.opf
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...chapters.map(
      (c) =>
        `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n    ");

  const spineItems = chapters
    .map((c) => `<itemref idref="${c.id}"/>`)
    .join("\n    ");

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(doc.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(id)}</dc:identifier>
    <dc:title>${escapeXml(doc.title)}</dc:title>
    <dc:creator>${escapeXml(doc.author)}</dc:creator>
    <dc:language>${escapeXml(doc.language)}</dc:language>
    ${doc.description ? `<dc:description>${escapeXml(doc.description)}</dc:description>` : ""}
    <dc:date>${date}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`,
  );

  // 6. style.css
  zip.file("OEBPS/style.css", STYLE_CSS);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const filename = `${safeTitle || "掰it-export"}-${isoDate(Date.now())}.epub`;

  return { blob, filename, mimeType: "application/epub+zip" };
}

/**
 * 移除 <code>/<pre>/<kbd>/<samp>/<tt> 块内部的文本。
 *
 * 用途：掰it 在提取页面文本后，调用本函数把代码片段内容掏空，
 * 避免 `foo(); // note` 被识别成"句子"被拆分，也避免 code 内的 token
 * 被标成"生词"。
 *
 * 边界规则：
 * - 大小写不敏感
 * - 支持属性 `<code class="hl">npm install</code>`
 * - 多行内容（`s` 标志）
 * - 嵌套同名标签：贪婪匹配第一个 `</tag>` 作为闭合；外层剩下的孤儿开标签保留为字面量
 * - 非配对的孤标签不做替换（避免误伤 `the </code/> word`）
 */

const CODE_BLOCK_PATTERN = /<(code|pre|kbd|samp|tt)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

export function stripCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, "");
}

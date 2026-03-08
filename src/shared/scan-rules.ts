/**
 * 扫读模式本地拆分规则
 *
 * 在逻辑转换点断行：并列（and/or/but）、转折（however/although）、
 * 条件（if/unless）、因果（because/therefore）、从句（which/who/that）。
 * 使用 POS 标注（pos-js）辅助消歧。
 *
 * 三级颗粒度：
 * - coarse: 仅在逗号+连词处拆分（最保守）
 * - medium: 长句允许无逗号拆分
 * - fine:   更低阈值 + 介词短语 + 引语边界拆分
 *
 * 设计原则：
 * - 即时完成（< 1ms），零 API 成本
 * - 宁可多拆不漏拆（扫读场景，快速理解优先）
 * - 复杂句（3+ 从句标记 + 本地拆不动）降级给 LLM
 */

import { Lexer as PosLexer, Tagger as PosTagger } from "pos";

// ========== 类型 ==========

export type Granularity = "coarse" | "medium" | "fine";

export interface ScanChunk {
  text: string;
  level: number; // 0 = 主句, 1 = 从句/修饰
}

export interface ScanResult {
  chunks: ScanChunk[];
  needsLLM: boolean;
}

// ========== 长度阈值 ==========

const THRESHOLD_WORDS: Record<string, number> = {
  short: 8,
  medium: 12,
  long: 18,
};

// ========== 关键词集合 ==========

/** 并列连词：逗号后出现时拆分，同级 */
const COORDINATE = new Set(["and", "or", "but", "nor", "yet", "so"]);

/** 强从属连词：无需逗号也可拆分 */
const STRONG_SUBORDINATE = new Set([
  "because", "although", "though", "whereas", "unless",
  "whenever", "wherever", "whether",
]);

/** 弱从属连词：需要逗号才拆分（有非连词用法） */
const WEAK_SUBORDINATE = new Set([
  "since", "while", "if", "when", "until", "before", "after", "once",
]);

/** 关系代词：逗号后出现时拆分 */
const RELATIVE = new Set(["which", "who", "whom", "whose", "where", "that"]);

/** 关系代词（宽松模式，排除 that — 歧义太大）*/
const RELATIVE_RELAXED = new Set(["which", "who", "whom", "whose", "where"]);

/** 转折/过渡词：逗号后或句首出现时拆分 */
const TRANSITION = new Set([
  "however", "therefore", "thus", "hence",
  "nevertheless", "nonetheless", "moreover", "furthermore",
  "meanwhile", "otherwise", "consequently", "accordingly",
]);

/** fine 模式介词拆分：常见引出新信息的介词/短语标记 */
const PREPOSITION_FINE = new Set([
  "about", "from", "into", "through", "across",
  "toward", "towards", "without", "despite",
  // 高频介词（配合 4+词前/4+词后约束，不会过度拆分）
  "between", "on", "for", "with", "by", "in",
  "over", "under", "beyond", "against",
  // 分词/比较短语标记
  "compared", "including",
]);

/** fine 模式疑问/关系副词：引出从句 */
const CLAUSE_STARTER_FINE = new Set(["how", "why", "what"]);

/** 所有从属标记（用于复杂度计数） */
const ALL_SUBORDINATE = new Set([
  ...STRONG_SUBORDINATE, ...WEAK_SUBORDINATE, ...RELATIVE,
]);

/** 报告动词：后面的 that 通常引导宾语从句，不应拆分 */
const REPORT_VERBS = new Set([
  "know", "knew", "known", "knows",
  "think", "thought", "thinks",
  "believe", "believed", "believes",
  "say", "said", "says",
  "tell", "told", "tells",
  "feel", "felt", "feels",
  "find", "found", "finds",
  "show", "showed", "shown", "shows",
  "suggest", "suggested", "suggests",
  "argue", "argued", "argues",
  "claim", "claimed", "claims",
  "report", "reported", "reports",
  "explain", "explained", "explains",
  "realize", "realized", "realizes",
  "notice", "noticed", "notices",
  "assume", "assumed", "assumes",
  "hope", "hoped", "hopes",
  "expect", "expected", "expects",
  "confirm", "confirmed", "confirms",
  "reveal", "revealed", "reveals",
  "mean", "meant", "means",
  "understand", "understood", "understands",
  "indicate", "indicated", "indicates",
  "ensure", "ensured", "ensures",
  "note", "noted", "notes",
  "prove", "proved", "proven", "proves",
  "agree", "agreed", "agrees",
  "conclude", "concluded", "concludes",
  "discover", "discovered", "discovers",
  "learn", "learned", "learnt", "learns",
  "remember", "remembered", "remembers",
  "mention", "mentioned", "mentions",
  "deny", "denied", "denies",
  "insist", "insisted", "insists",
  "decide", "decided", "decides",
  "state", "stated", "states",
  "declare", "declared", "declares",
]);

// ========== POS 标注 ==========

let _posLexer: PosLexer | null = null;
let _posTagger: PosTagger | null = null;

/**
 * 对句子进行 POS 标注，返回与 words 数组对齐的标签数组。
 * 使用字符位置映射保证对齐准确性。
 */
export function getPOSTags(sentence: string, words: string[]): string[] | null {
  try {
    if (!_posLexer) _posLexer = new PosLexer();
    if (!_posTagger) _posTagger = new PosTagger();

    const posTokens = _posLexer.lex(sentence);
    const tagged = _posTagger.tag(posTokens);

    // 按字符位置建立 POS 标签映射
    const charTags: string[] = new Array(sentence.length).fill("");
    let searchFrom = 0;
    for (const [posWord, posTag] of tagged) {
      const idx = sentence.indexOf(posWord, searchFrom);
      if (idx >= 0) {
        // 只存实词标签，跳过纯标点标签
        if (!/^[,.:;!?()"'\-`]$/.test(posTag)) {
          for (let c = idx; c < idx + posWord.length; c++) {
            charTags[c] = posTag;
          }
        }
        searchFrom = idx + posWord.length;
      }
    }

    // 将字符级标签映射到 word 级
    const tags: string[] = [];
    let wordSearchFrom = 0;
    for (const word of words) {
      const idx = sentence.indexOf(word, wordSearchFrom);
      if (idx >= 0) {
        let tag = "";
        for (let c = idx; c < idx + word.length; c++) {
          if (charTags[c]) { tag = charTags[c]; break; }
        }
        tags.push(tag || "NN");
        wordSearchFrom = idx + word.length;
      } else {
        tags.push("NN");
      }
    }

    return tags;
  } catch {
    return null;
  }
}

// ========== 工具函数 ==========

function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z'-]/g, "");
}

function endsWithPunct(word: string): boolean {
  return /[,;]$/.test(word);
}

function countSubordinateMarkers(words: string[]): number {
  let count = 0;
  for (const w of words) {
    const clean = cleanWord(w);
    if (ALL_SUBORDINATE.has(clean)) count++;
  }
  return count;
}

function isSubordinateStart(word: string): boolean {
  const clean = cleanWord(word);
  return STRONG_SUBORDINATE.has(clean) || WEAK_SUBORDINATE.has(clean);
}

/** 是否为独立的破折号词 */
function isDashWord(word: string): boolean {
  return word === "\u2014" || word === "\u2013" || word === "--";
}

/** 判断当前词是否像一个新从句的开头 */
function looksLikeClauseStart(
  word: string,
  tags: string[] | null,
  i: number,
): boolean {
  if (tags) {
    const tag = tags[i];
    // 代词、冠词、专有名词、存在句 there、情态动词 → 明确的从句开头
    if (["PRP", "DT", "NNP", "NNPS", "EX", "MD"].includes(tag)) return true;
    // 谓语动词 → 从句开头
    if (["VBD", "VBP", "VBZ", "VB"].includes(tag)) return true;
    // 副词：后面跟动词才算从句开头（如 "finally published"）
    if (tag === "RB" && i + 1 < tags.length) {
      return ["VBD", "VBP", "VBZ", "VB", "MD"].includes(tags[i + 1]);
    }
    // 形容词、分词 → 修饰性短语，不是新从句
    if (["JJ", "JJR", "JJS", "VBN", "VBG"].includes(tag)) return false;
    // 其他标签 → 降级到词级启发式
  }

  // 无 POS 时的启发式判断
  const clean = cleanWord(word);
  const PRONOUNS = new Set([
    "i", "you", "he", "she", "it", "we", "they",
    "there", "this", "these", "those",
  ]);
  if (PRONOUNS.has(clean)) return true;
  if (["the", "a", "an"].includes(clean)) return true;
  // 大写开头 → 可能是专有名词
  if (/^[A-Z]/.test(word) && word.length > 1) return true;
  return false;
}

// ========== 核心拆分 ==========

/**
 * 合并过短的片段（< 3 词）到相邻片段
 */
function mergeShortChunks(chunks: ScanChunk[]): ScanChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: ScanChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const wordCount = chunk.text.split(/\s+/).length;

    if (wordCount < 3 && result.length > 0) {
      // Merge into previous chunk
      const prev = result[result.length - 1];
      prev.text += " " + chunk.text;
    } else if (wordCount < 3 && i < chunks.length - 1) {
      // Merge into next chunk
      chunks[i + 1] = {
        text: chunk.text + " " + chunks[i + 1].text,
        level: chunks[i + 1].level,
      };
    } else {
      result.push({ ...chunk });
    }
  }

  return result;
}

function splitAtBoundaries(
  sentence: string,
  granularity: Granularity = "medium",
  tags: string[] | null = null,
): ScanChunk[] {
  const words = sentence.match(/\S+/g);
  if (!words || words.length === 0) return [];

  // 颗粒度决定宽松规则的门槛
  const longThreshold = granularity === "fine" ? 12 : 15;
  const minBefore = granularity === "fine" ? 3 : 5;
  const minAfterCoord = granularity === "fine" ? 3 : 5;
  const minAfterSub = granularity === "fine" ? 3 : 4;

  const isLongSentence = words.length >= longThreshold;
  const chunks: ScanChunk[] = [];
  let currentWords: string[] = [];

  // 初始层级：从属连词开头 → level 1；句首分词短语 → level 1
  let currentLevel = 0;
  if (isSubordinateStart(words[0])) {
    currentLevel = 1;
  } else if (tags && (tags[0] === "VBG" || tags[0] === "VBN")) {
    // POS 检测句首分词短语（如 "Running quickly, she caught the bus."）
    currentLevel = 1;
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const clean = cleanWord(word);
    const prev = i > 0 ? words[i - 1] : "";
    const prevHasPunct = endsWithPunct(prev);

    let shouldSplit = false;
    let nextLevel = 0;

    if (currentWords.length >= 2) {
      // === 严格规则（所有颗粒度）===

      // 1. 分号后拆分
      if (prev.endsWith(";")) {
        shouldSplit = true;
        nextLevel = isSubordinateStart(word) ? 1 : 0;
      }
      // 2. 冒号后拆分（后面 4+ 词，排除时间/URL 格式）
      else if (prev.endsWith(":") && !prev.includes("//") && !/^\d/.test(word)) {
        const remaining = words.length - i;
        if (remaining >= 4) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
      }
      // 3. 破折号拆分（独立 — 或词尾 —）
      else if (isDashWord(word) && currentWords.length >= 2) {
        shouldSplit = true;
        nextLevel = currentLevel;
      }
      else if (!isDashWord(prev) && (prev.endsWith("\u2014") || prev.endsWith("\u2013"))) {
        shouldSplit = true;
        nextLevel = currentLevel;
      }
      // 4. 括号开始：( 开头的词
      else if (word.startsWith("(") && currentWords.length >= 2) {
        shouldSplit = true;
        nextLevel = Math.min(currentLevel + 1, 5);
      }
      // 5. 括号结束：前一个词以 ) 结尾
      else if (prev.endsWith(")") && currentLevel > 0) {
        shouldSplit = true;
        nextLevel = Math.max(currentLevel - 1, 0);
      }
      // 6. 并列连词（逗号后）
      else if (COORDINATE.has(clean) && prevHasPunct) {
        shouldSplit = true;
        nextLevel = 0;
      }
      // 7. 强从属连词（不需要逗号）
      else if (STRONG_SUBORDINATE.has(clean)) {
        shouldSplit = true;
        nextLevel = Math.min(currentLevel + 1, 5);
      }
      // 8. "even" + 从属连词 → 在 "even" 处拆分
      else if (clean === "even" && i + 1 < words.length) {
        const nextClean = cleanWord(words[i + 1]);
        if (WEAK_SUBORDINATE.has(nextClean) || STRONG_SUBORDINATE.has(nextClean)) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
      }
      // 9. 弱从属连词（需要逗号）
      else if (WEAK_SUBORDINATE.has(clean) && prevHasPunct) {
        shouldSplit = true;
        nextLevel = Math.min(currentLevel + 1, 5);
      }
      // 10. 关系代词（逗号后）— 含 "that" 安全检查
      else if (RELATIVE.has(clean) && prevHasPunct) {
        if (clean === "that") {
          // POS 标注为指示代词 DT → 不拆
          const tag = tags?.[i];
          if (tag === "DT") {
            // skip — demonstrative "that"
          }
          // 前面是报告动词 → 宾语从句，不拆
          else {
            const prevClean = cleanWord(prev.replace(/[,;]$/, ""));
            if (REPORT_VERBS.has(prevClean)) {
              // skip — noun clause "that"
            } else {
              shouldSplit = true;
              nextLevel = Math.min(currentLevel + 1, 5);
            }
          }
        } else {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
      }
      // 11. 转折/过渡词
      else if (TRANSITION.has(clean) && (prevHasPunct || i === 0)) {
        shouldSplit = true;
        nextLevel = 0;
      }
      // 12. 从句结束检测（改进版：需要像从句开头的词）
      else if (currentLevel >= 1 && prevHasPunct &&
        !COORDINATE.has(clean) && !STRONG_SUBORDINATE.has(clean) &&
        !WEAK_SUBORDINATE.has(clean) && !RELATIVE.has(clean) &&
        !TRANSITION.has(clean)) {
        if (looksLikeClauseStart(word, tags, i)) {
          shouldSplit = true;
          nextLevel = 0;
        }
      }

      // === 宽松规则（medium + fine，无逗号也拆）===
      if (!shouldSplit && granularity !== "coarse" &&
          isLongSentence && currentWords.length >= minBefore) {
        const remaining = words.length - i;

        // 并列连词
        if (COORDINATE.has(clean) && remaining >= minAfterCoord) {
          shouldSplit = true;
          nextLevel = 0;
        }
        // 弱从属连词
        else if (WEAK_SUBORDINATE.has(clean) && remaining >= minAfterSub) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
        // 关系代词（排除 that）
        else if (RELATIVE_RELAXED.has(clean) && remaining >= minAfterSub) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
        // 不定式短语：TO + 动词（POS 辅助）
        else if (tags && tags[i] === "TO" &&
                 i + 1 < words.length && tags[i + 1]?.startsWith("VB") &&
                 remaining >= 4) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
      }

      // === fine 模式额外规则 ===
      if (!shouldSplit && granularity === "fine" &&
          isLongSentence && currentWords.length >= 4) {
        const remaining = words.length - i;

        // 介词短语拆分（前 4+ 词，后 4+ 词）
        if (PREPOSITION_FINE.has(clean) && remaining >= 4) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
        // 疑问/关系副词引出的从句（how/why/what）
        else if (CLAUSE_STARTER_FINE.has(clean) && remaining >= 4) {
          shouldSplit = true;
          nextLevel = Math.min(currentLevel + 1, 5);
        }
        // 引语边界：引号开头（前 3+ 词）
        else if (/^["'\u201C\u2018]/.test(word) && currentWords.length >= 3) {
          shouldSplit = true;
          nextLevel = 0;
        }
      }
    }

    if (shouldSplit && currentWords.length > 0) {
      chunks.push({ text: currentWords.join(" "), level: currentLevel });
      currentWords = [word];
      currentLevel = nextLevel;
    } else {
      currentWords.push(word);
    }
  }

  if (currentWords.length > 0) {
    chunks.push({ text: currentWords.join(" "), level: currentLevel });
  }

  return mergeShortChunks(chunks);
}

// ========== 导出函数 ==========

/**
 * 扫读模式本地拆分
 *
 * @param sentence 要拆分的句子
 * @param threshold 长度阈值 ("short" | "medium" | "long")
 * @param granularity 拆分颗粒度 ("coarse" | "medium" | "fine")
 * @returns 拆分结果，包含分块和是否需要 LLM 降级
 */
export function scanSplit(
  sentence: string,
  threshold: "short" | "medium" | "long" = "medium",
  granularity: Granularity = "medium",
): ScanResult {
  const trimmed = sentence.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const minWords = THRESHOLD_WORDS[threshold];

  // 太短不拆
  if (words.length < minWords) {
    return { chunks: [{ text: trimmed, level: 0 }], needsLLM: false };
  }

  // POS 标注（失败时为 null，优雅降级）
  const tags = getPOSTags(trimmed, words);

  // 先尝试本地拆分
  const chunks = splitAtBoundaries(trimmed, granularity, tags);

  // 本地拆分成功 → 直接用
  if (chunks.length > 1) {
    return { chunks, needsLLM: false };
  }

  // 本地拆不动 + 复杂句（3+ 从属标记）→ 降级 LLM
  const markerCount = countSubordinateMarkers(words);
  if (markerCount >= 3) {
    return { chunks: [{ text: trimmed, level: 0 }], needsLLM: true };
  }

  // 本地拆不动 + 不复杂 → 保持原样
  return { chunks: [{ text: trimmed, level: 0 }], needsLLM: false };
}

/**
 * 将 ScanChunk[] 转为 renderer 期望的缩进文本格式
 *
 * 格式：每行用前导空格表示缩进级别（2 空格 = 1 级）
 */
export function toChunkedString(chunks: ScanChunk[]): string {
  return chunks.map(c => "  ".repeat(c.level) + c.text).join("\n");
}

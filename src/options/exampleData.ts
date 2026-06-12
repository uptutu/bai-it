import type { DashboardData } from "./hooks/useDashboardData.ts";
import type { ReviewData } from "./hooks/useReviewData.ts";
import type { LearningRecord, PatternKey, VocabRecord } from "../shared/types.ts";

// ========== 示例 LearningRecord（5 条，覆盖 5 种句式） ==========

const now = Date.now();
const HOUR = 3600000;
const DAY = 86400000;

const exampleSentences: LearningRecord[] = [
  {
    id: "example-001",
    sentence:
      "OpenAI, which has raised more than $13 billion from Microsoft, is now valued at $157 billion — making it one of the most valuable private companies in the world.",
    chunked:
      "OpenAI,\n  which has raised more than $13 billion from Microsoft,\nis now valued at $157 billion\n  — making it one of the most valuable private companies in the world.",
    sentence_analysis:
      "这句话在主语和谓语之间插入了一个 which 从句来补充背景信息，读的时候容易被插入内容打断主线。",
    expression_tips:
      "**X, which has done Y, is now Z** — 先说主角，中间插一段背景，再说当前状态。比如：Tesla, which started as a tiny startup, is now the most valuable automaker.",
    pattern_key: "insertion" as PatternKey,
    new_words: [{ word: "valued", definition: "估值；被认为值……" }],
    source_url: "https://x.com/example/status/1",
    llm_provider: "gemini",
    created_at: now - 2 * HOUR,
    updated_at: now - 2 * HOUR,
    is_dirty: false,
  },
  {
    id: "example-002",
    sentence:
      "The fact that people who have never written a single line of code are now building fully functional apps using AI tools that didn't exist a year ago says a lot about where we're headed.",
    chunked:
      "The fact\n  that people\n    who have never written a single line of code\n  are now building fully functional apps\n    using AI tools that didn't exist a year ago\nsays a lot about where we're headed.",
    sentence_analysis:
      "这句话从外到内嵌了三层：最外层是 The fact...says，中间嵌了 that people...are building，里面又嵌了 who have never written 和 using AI tools that...。像俄罗斯套娃一样层层嵌套。",
    expression_tips:
      "**The fact that X says a lot about Y** — 用一个事实来引出结论。比如：The fact that AI can now pass the bar exam says a lot about how fast things are changing.",
    pattern_key: "nested" as PatternKey,
    new_words: [{ word: "functional", definition: "功能齐全的；可运行的" }],
    source_url: "https://reddit.com/r/technology/comments/example",
    llm_provider: "gemini",
    created_at: now - 5 * HOUR,
    updated_at: now - 5 * HOUR,
    is_dirty: false,
  },
  {
    id: "example-003",
    sentence:
      "While traditional automakers have spent decades perfecting the internal combustion engine, Tesla has bet everything on a future that many industry veterans still refuse to believe in.",
    chunked:
      "While traditional automakers have spent decades\n  perfecting the internal combustion engine,\nTesla has bet everything on a future\n  that many industry veterans still refuse to believe in.",
    sentence_analysis:
      "前半句用 While 引出传统车企的做法，后半句用 Tesla 做对比。两半刚好形成反差：一个守旧，一个激进。",
    expression_tips:
      "**While X has done A, Y has done B** — 用 While 把两种做法放在一起对比。比如：While most companies played it safe, this startup went all in on AI.",
    pattern_key: "contrast" as PatternKey,
    new_words: [
      { word: "combustion", definition: "燃烧（内燃机的核心过程）" },
      { word: "veterans", definition: "老手；资深从业者" },
    ],
    source_url: "https://www.theverge.com/2024/example",
    llm_provider: "gemini",
    created_at: now - DAY,
    updated_at: now - DAY,
    is_dirty: false,
  },
  {
    id: "example-004",
    sentence:
      "After years of promising that self-driving cars were just around the corner, the industry is finally starting to deliver on that promise — though not in the way most people expected.",
    chunked:
      "After years of promising\n  that self-driving cars were just around the corner,\nthe industry is finally starting to deliver on that promise\n  — though not in the way most people expected.",
    sentence_analysis:
      "句子先用 After years of... 交代了一大段背景（行业多年来的承诺），然后才说正事（终于开始兑现）。读的时候要先耐心读完背景部分。",
    expression_tips:
      "**After years of doing X, Y is finally doing Z** — 先说长期的铺垫，再说终于到来的转变。比如：After years of talking about AGI, companies are finally shipping real products.",
    pattern_key: "background_first" as PatternKey,
    new_words: [],
    source_url: "https://www.theverge.com/2024/self-driving",
    llm_provider: "gemini",
    created_at: now - DAY,
    updated_at: now - DAY,
    is_dirty: false,
  },
  {
    id: "example-005",
    sentence:
      "The ability to generate photorealistic images, write coherent essays, and even pass professional licensing exams has forced researchers to rethink what we mean by intelligence.",
    chunked:
      "The ability\n  to generate photorealistic images,\n  write coherent essays,\n  and even pass professional licensing exams\nhas forced researchers to rethink\n  what we mean by intelligence.",
    sentence_analysis:
      "主语是一个超长的名词短语（The ability to...三个并列），说了一大串才到谓语 has forced。读的时候要记住这一大串都是在说「什么能力」。",
    expression_tips:
      "**The ability to do X, Y, and Z has forced... ** — 用一个超长主语列举多种能力，再接一个有力的动词。比如：The ability to write code, design interfaces, and deploy apps has made full-stack engineers incredibly valuable.",
    pattern_key: "long_subject" as PatternKey,
    new_words: [
      { word: "coherent", definition: "连贯的；条理清楚的" },
      { word: "photorealistic", definition: "照片级逼真的" },
    ],
    source_url: "https://news.ycombinator.com/item?id=example",
    llm_provider: "gemini",
    created_at: now - 2 * DAY,
    updated_at: now - 2 * DAY,
    is_dirty: false,
  },
];

// ========== 示例 VocabRecord（3 个，用于每日回味） ==========

const exampleVocab: (VocabRecord & { encounterToday: number })[] = [
  {
    id: "vocab-ex-001",
    word: "autonomous",
    status: "new",
    definition: "自动驾驶的；自主的",
    encounter_count: 4,
    first_seen_at: now - 3 * DAY,
    updated_at: now - 2 * HOUR,
    is_dirty: false,
    encounterToday: 4,
  },
  {
    id: "vocab-ex-002",
    word: "coherent",
    status: "new",
    definition: "连贯的；条理清楚的",
    encounter_count: 3,
    first_seen_at: now - 2 * DAY,
    updated_at: now - 5 * HOUR,
    is_dirty: false,
    encounterToday: 3,
  },
  {
    id: "vocab-ex-003",
    word: "photorealistic",
    status: "new",
    definition: "照片级逼真的",
    encounter_count: 2,
    first_seen_at: now - 2 * DAY,
    updated_at: now - DAY,
    is_dirty: false,
    encounterToday: 2,
  },
];

// ========== 导出三个常量 ==========

export const EXAMPLE_DASHBOARD: DashboardData = {
  totalSentences: 23,
  totalWords: 47,
  masteredWords: 12,
  todayCount: 8,
  recentSentences: exampleSentences.slice(0, 3),
  loading: false,
  allRecords: exampleSentences,
};

export const EXAMPLE_REVIEW: ReviewData = {
  practiseSentence: exampleSentences[3], // 自动驾驶句（先说背景）
  todayVocab: exampleVocab,
  weekSentenceCount: 15,
  loading: false,
};

export interface ExampleSentencesData {
  records: LearningRecord[];
  availablePatterns: PatternKey[];
}

export const EXAMPLE_SENTENCES: ExampleSentencesData = {
  records: exampleSentences,
  availablePatterns: [
    "insertion",
    "nested",
    "contrast",
    "background_first",
    "long_subject",
  ],
};

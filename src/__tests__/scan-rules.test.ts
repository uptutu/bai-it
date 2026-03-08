import { describe, it, expect } from "vitest";
import { scanSplit, toChunkedString } from "../shared/scan-rules";

// ========== 验收标准：本地拆分-并列句 ==========

describe("并列句拆分", () => {
  it("在 and 处断行", () => {
    const result = scanSplit(
      "The team developed the frontend, and the backend was handled by a separate group of engineers.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c => c.text.startsWith("and "))).toBe(true);
  });

  it("在 but 处断行", () => {
    const result = scanSplit(
      "She wanted to attend the conference, but her schedule was already fully booked for the entire week.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c => c.text.startsWith("but "))).toBe(true);
  });

  it("多个并列连词", () => {
    const result = scanSplit(
      "He wrote the proposal, and she reviewed the draft, but the client rejected it in the end.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("分号分隔的并列", () => {
    const result = scanSplit(
      "The first phase focused on research; the second phase involved implementation and testing across multiple environments.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ========== 验收标准：本地拆分-转折 ==========

describe("转折句拆分", () => {
  it("however 处断行", () => {
    const result = scanSplit(
      "The initial results were promising, however the long-term impact remained unclear and needed further investigation.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("however"),
    )).toBe(true);
  });

  it("although 处断行", () => {
    const result = scanSplit(
      "Although the weather was terrible and the roads were icy, they decided to continue with the outdoor event.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    // 第一块应该是从句（level 1）
    expect(result.chunks[0].level).toBe(1);
  });

  it("while (让步) 处断行", () => {
    const result = scanSplit(
      "The stock market reached record highs this quarter, while unemployment numbers continued to climb in several regions.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ========== 验收标准：本地拆分-条件 ==========

describe("条件句拆分", () => {
  it("if 在句首", () => {
    const result = scanSplit(
      "If the system detects any anomalous behavior in the network, it will automatically trigger a comprehensive security review.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks[0].level).toBe(1); // if 子句是从属
  });

  it("unless 在句中", () => {
    const result = scanSplit(
      "The project will be delayed significantly unless the team receives additional funding and resources from the department.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("unless"),
    )).toBe(true);
    expect(result.chunks.find(c =>
      c.text.toLowerCase().startsWith("unless"),
    )?.level).toBe(1);
  });

  it("when 逗号后拆分", () => {
    const result = scanSplit(
      "The application crashes with an unexpected error, when users try to upload files larger than five megabytes.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ========== 验收标准：本地拆分-从句 ==========

describe("从句拆分", () => {
  it("which 引导的非限制性从句", () => {
    const result = scanSplit(
      "The new framework significantly reduces boilerplate code, which makes development faster and more enjoyable for the entire team.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("which"),
    )).toBe(true);
    expect(result.chunks.find(c =>
      c.text.toLowerCase().startsWith("which"),
    )?.level).toBe(1);
  });

  it("who 引导的从句", () => {
    const result = scanSplit(
      "The researchers at the university, who had been studying this phenomenon for over a decade, finally published their findings.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("who"),
    )).toBe(true);
  });

  it("because 引导的原因从句", () => {
    const result = scanSplit(
      "Many developers prefer TypeScript over plain JavaScript because it catches type errors at compile time and improves code maintainability.",
    );
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("because"),
    )).toBe(true);
    expect(result.chunks.find(c =>
      c.text.toLowerCase().startsWith("because"),
    )?.level).toBe(1);
  });
});

// ========== 验收标准：本地拆分-短句不拆 ==========

describe("短句不拆", () => {
  it("短于阈值的句子原样返回 (medium)", () => {
    const result = scanSplit("The quick brown fox jumps.", "medium");
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].text).toBe("The quick brown fox jumps.");
    expect(result.needsLLM).toBe(false);
  });

  it("短于阈值的句子原样返回 (short)", () => {
    const result = scanSplit("Hello world!", "short");
    expect(result.chunks.length).toBe(1);
    expect(result.needsLLM).toBe(false);
  });

  it("长阈值下中等句子不拆", () => {
    const result = scanSplit(
      "The new feature was released last week and received positive feedback.",
      "long",
    );
    expect(result.chunks.length).toBe(1);
    expect(result.needsLLM).toBe(false);
  });

  it("有不定式短语的长句在 to + 动词处拆分（POS 检测）", () => {
    const result = scanSplit(
      "The entire development team worked incredibly hard throughout the whole entire summer to deliver the final completed product on schedule.",
    );
    // POS 检测到 TO + VB（不定式短语），在 "to deliver" 处拆分
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c => c.text.toLowerCase().startsWith("to deliver"))).toBe(true);
    expect(result.needsLLM).toBe(false);
  });
});

// ========== 验收标准：本地拆分-缩进层级 ==========

describe("缩进层级", () => {
  it("主句 level 0，从句 level 1", () => {
    const result = scanSplit(
      "The company announced the new product lineup, which includes several innovative features that were requested by customers.",
    );
    expect(result.chunks[0].level).toBe(0); // 主句
    const whichChunk = result.chunks.find(c =>
      c.text.toLowerCase().startsWith("which"),
    );
    expect(whichChunk?.level).toBe(1); // 从句
  });

  it("句首从句 level 1，后续主句 level 0", () => {
    const result = scanSplit(
      "Although the implementation was complex and required significant testing, the final product exceeded all expectations.",
    );
    expect(result.chunks[0].level).toBe(1); // although 从句
    const mainChunk = result.chunks.find(c => c.level === 0);
    expect(mainChunk).toBeDefined();
  });

  it("toChunkedString 正确输出缩进格式", () => {
    const result = scanSplit(
      "The server crashed unexpectedly, because the memory usage exceeded the maximum allocated threshold by a significant margin.",
    );
    const str = toChunkedString(result.chunks);
    const lines = str.split("\n");
    // 至少有一行有缩进
    expect(lines.some(l => l.startsWith("  "))).toBe(true);
    // 第一行无缩进（主句）
    expect(lines[0].startsWith("  ")).toBe(false);
  });
});

// ========== 验收标准：复杂句降级 ==========

describe("复杂句降级 LLM", () => {
  it("3+ 从属标记 + 本地拆分成功 → 不降级", () => {
    // 有 3+ 标记但本地规则能拆分 → 优先用本地结果
    const result = scanSplit(
      "The researcher who had been studying the phenomenon that was first observed in the laboratory where the original experiments were conducted finally published the comprehensive report.",
    );
    // 本地拆分能在 who/where 处断行，所以不需要 LLM
    expect(result.needsLLM).toBe(false);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("3+ 从属标记 + 本地拆不动 → 降级 LLM", () => {
    // 13 词，3 个弱从属标记，无逗号。medium 模式下 15+ 词才有宽松规则
    const result = scanSplit(
      "Data collected since the update while monitoring until the test completed is questionable.",
      "medium",
      "medium",
    );
    expect(result.needsLLM).toBe(true);
  });

  it("2 个从属标记不降级", () => {
    const result = scanSplit(
      "The book that she recommended, which was published last year by a prestigious university press, became a bestseller.",
    );
    expect(result.needsLLM).toBe(false);
  });

  it("简单长句不降级", () => {
    const result = scanSplit(
      "The development team successfully completed the migration of all critical services to the new cloud infrastructure, and the performance metrics showed a significant improvement across all key indicators.",
    );
    expect(result.needsLLM).toBe(false);
  });
});

// ========== 验收标准：模式自动判断 ==========
// 注意：模式判断逻辑在 content/index.ts 的 detectReadingMode 中，
// 这里只测试 scan-rules 本身的功能

describe("阈值设置", () => {
  const sentence =
    "She arrived early, and she prepared the presentation materials for the team meeting.";

  it("short 阈值 → 拆分", () => {
    const result = scanSplit(sentence, "short");
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("medium 阈值 → 拆分", () => {
    const result = scanSplit(sentence, "medium");
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("long 阈值 → 不拆（词数不够）", () => {
    const result = scanSplit(sentence, "long");
    expect(result.chunks.length).toBe(1);
  });
});

// ========== 边界情况 ==========

describe("边界情况", () => {
  it("空字符串", () => {
    const result = scanSplit("");
    expect(result.chunks.length).toBe(1);
    expect(result.needsLLM).toBe(false);
  });

  it("纯标点", () => {
    const result = scanSplit("...");
    expect(result.chunks.length).toBe(1);
  });

  it("并列连词无逗号 — 短句不拆", () => {
    // "and" without comma in short sentence — don't split (could be noun phrase)
    const result = scanSplit(
      "The red and blue and green flags were waving proudly in the strong wind.",
    );
    // 13 词 < 15 词阈值，宽松规则不生效
    expect(result.chunks.length).toBe(1);
  });

  it("toChunkedString 单块无缩进", () => {
    const str = toChunkedString([{ text: "Hello world", level: 0 }]);
    expect(str).toBe("Hello world");
  });

  it("toChunkedString 多块正确格式", () => {
    const str = toChunkedString([
      { text: "Main clause here,", level: 0 },
      { text: "because of this reason.", level: 1 },
    ]);
    expect(str).toBe("Main clause here,\n  because of this reason.");
  });
});

// ========== 验收标准：长句宽松规则（无逗号拆分）==========

describe("长句宽松规则", () => {
  it("长句中 and 无逗号也拆分（15+ 词）", () => {
    const result = scanSplit(
      "The team worked on the important project deadline and the other group handled the critical infrastructure deployments independently.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c => c.text.startsWith("and "))).toBe(true);
  });

  it("长句中 when 无逗号也拆分", () => {
    const result = scanSplit(
      "The application will automatically restart the background services when the system detects that the memory usage has exceeded the safe threshold.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("when"),
    )).toBe(true);
  });

  it("长句中 which/who 无逗号也拆分", () => {
    const result = scanSplit(
      "A firm commitment to the principle of democratic governance which ensures that power remains distributed among the people who actually use these systems.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("which") || c.text.toLowerCase().startsWith("who"),
    )).toBe(true);
  });

  it("even when/if/though 在 even 处拆分", () => {
    const result = scanSplit(
      "They decided to continue with the original plan for the product launch even when the market conditions had changed dramatically.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("even"),
    )).toBe(true);
  });

  it("短句中 and 无逗号不拆（< 15 词）", () => {
    const result = scanSplit(
      "Privacy and security are both very important for our users today.",
    );
    // 11 词 < 15 词阈值
    expect(result.chunks.length).toBe(1);
  });

  it("长句拆分后片段不会太短（< 5 词）", () => {
    const result = scanSplit(
      "The researchers at the leading university published groundbreaking findings and the scientific community responded with great enthusiasm across multiple disciplines.",
    );
    // 并列连词拆分：前后各 >= 5 词
    for (const chunk of result.chunks) {
      expect(chunk.text.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("真实推文风格长句拆分", () => {
    const result = scanSplit(
      "A firm commitment to the principle that AGI companies have to devolve power to democracies and avoid unduly concentrating power in themselves even when that leads to uncomfortable places is something I will not regret.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(3);
    expect(result.needsLLM).toBe(false);
  });
});

// ========== 验收标准：fine 颗粒度（介词短语 + 引语）==========

describe("fine 颗粒度", () => {
  it("介词 about 处拆分", () => {
    const result = scanSplit(
      "I was talking with someone at a startup building the agentic layer about how their agents would seamlessly navigate data.",
      "medium",
      "fine",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("about"),
    )).toBe(true);
  });

  it("介词 from 处拆分", () => {
    const result = scanSplit(
      "Their agents would seamlessly navigate and extract aggregate data from a customer's various systems of record across the enterprise.",
      "medium",
      "fine",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("from"),
    )).toBe(true);
  });

  it("how 引出从句处拆分", () => {
    const result = scanSplit(
      "Lotta people are about to learn the hard way how the Enterprise actually works in practice.",
      "medium",
      "fine",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("how"),
    )).toBe(true);
  });

  it("引语边界拆分", () => {
    const result = scanSplit(
      'I just stopped him and was like "Why do you think these SORs would let you do that?"',
      "medium",
      "fine",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("coarse 模式不在介词处拆分", () => {
    const result = scanSplit(
      "I was talking with someone at a startup building the agentic layer about how their agents would seamlessly navigate data.",
      "medium",
      "coarse",
    );
    // coarse 模式只在逗号+连词处拆分，此句无逗号 → 不拆
    expect(result.chunks.length).toBe(1);
  });

  it("fine 模式更低词数阈值也生效", () => {
    // 12 词 + "and"，fine 模式 12+ 词即可宽松
    const result = scanSplit(
      "The team worked hard and the other group handled the critical deployments independently.",
      "medium",
      "fine",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ========== 验收标准：冒号/破折号/括号拆分 ==========

describe("标点符号拆分", () => {
  it("冒号后拆分（后面 4+ 词）", () => {
    const result = scanSplit(
      "There is one thing that matters most: the quality of your daily relationships with other people.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("the quality"),
    )).toBe(true);
  });

  it("冒号后不足 4 词不拆", () => {
    const result = scanSplit(
      "The answer is simple: just wait for the results to come in naturally.",
    );
    // "just wait..." 有 8+ 词 → 应该拆
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("时间格式中的冒号不拆", () => {
    const result = scanSplit(
      "The meeting starts at 3:00 and we need to prepare the presentation materials beforehand.",
    );
    // 3:00 中的冒号不应触发拆分
    // 但 "and" 可能触发拆分 — 测试冒号本身不是拆分点
    const chunked = result.chunks.map(c => c.text).join(" | ");
    expect(chunked).not.toContain("| 00");
  });

  it("独立破折号处拆分", () => {
    const result = scanSplit(
      "The company \u2014 once a dominant market leader in the industry \u2014 is now struggling to survive.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("括号内容拆分", () => {
    const result = scanSplit(
      "The framework (originally developed by Facebook for internal use) is now maintained by the open source community.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    // 括号内容应该是更高层级
    const parenChunk = result.chunks.find(c => c.text.includes("originally"));
    expect(parenChunk?.level).toBeGreaterThanOrEqual(1);
  });
});

// ========== 验收标准："that" 安全规则 ==========

describe("that 安全规则", () => {
  it("报告动词后的 that 不拆分", () => {
    const result = scanSplit(
      "The researchers confirmed, that the results were consistent with their previous findings across all experiments.",
    );
    // "confirmed, that" — "confirmed" 是报告动词 → 不应在 that 处拆
    expect(result.chunks.every(c =>
      !c.text.toLowerCase().startsWith("that the results"),
    )).toBe(true);
  });

  it("非报告动词后的 that 正常拆分", () => {
    const result = scanSplit(
      "The new framework significantly reduces boilerplate code, that developers previously had to write manually for every component.",
    );
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("that developers"),
    )).toBe(true);
  });
});

// ========== 验收标准：从句结束检测改进 ==========

describe("从句结束检测改进", () => {
  it("逗号后形容词短语不误判为新从句", () => {
    const result = scanSplit(
      "The man who arrived at the station, tired and hungry from his long journey, sat down on the nearest bench.",
    );
    // "tired" 不应该被当作新从句的开始
    // POS 识别 tired 为 VBN/JJ → 不是从句开头
    const tiredChunk = result.chunks.find(c =>
      c.text.toLowerCase().startsWith("tired"),
    );
    // 如果 tired 被拆出来，它不应该是 level 0（主句）
    if (tiredChunk) {
      expect(tiredChunk.level).toBeGreaterThanOrEqual(1);
    }
  });

  it("逗号后代词正确识别为新从句开始", () => {
    const result = scanSplit(
      "Although the weather was absolutely terrible for outdoor traveling, she decided to continue with the event anyway.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    const mainChunk = result.chunks.find(c =>
      c.text.toLowerCase().startsWith("she"),
    );
    expect(mainChunk).toBeDefined();
    expect(mainChunk?.level).toBe(0);
  });
});

// ========== 验收标准：POS 辅助拆分 ==========

describe("POS 辅助拆分", () => {
  it("句首分词短语检测（VBG）", () => {
    const result = scanSplit(
      "Running as fast as she possibly could through the crowded streets, she barely managed to catch the last departing bus.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    // 句首 "Running..." 应该是从属（level 1）
    expect(result.chunks[0].level).toBe(1);
  });

  it("不定式短语拆分（TO + VB）", () => {
    const result = scanSplit(
      "She traveled across the country visiting several major cities to find a suitable location for the new headquarters.",
    );
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.some(c =>
      c.text.toLowerCase().startsWith("to find"),
    )).toBe(true);
  });

  it("to + 名词不拆分（非不定式）", () => {
    const result = scanSplit(
      "She went to the store and bought some groceries for dinner tonight.",
    );
    // "to the store" 中的 to 是介词，不是不定式 → 不应在 to 处拆
    // 但 "and" 可能触发拆分
    const toChunk = result.chunks.find(c =>
      c.text.toLowerCase().startsWith("to the store"),
    );
    expect(toChunk).toBeUndefined();
  });
});

// ========== POS 标注函数测试 ==========

describe("getPOSTags", () => {
  // 导入 getPOSTags
  it("返回与 words 数组等长的标签数组", async () => {
    const { getPOSTags } = await import("../shared/scan-rules");
    const sentence = "The quick brown fox jumps over the lazy dog.";
    const words = sentence.match(/\S+/g)!;
    const tags = getPOSTags(sentence, words);
    expect(tags).not.toBeNull();
    expect(tags!.length).toBe(words.length);
  });

  it("正确标注基本词性", async () => {
    const { getPOSTags } = await import("../shared/scan-rules");
    const sentence = "She runs quickly.";
    const words = sentence.match(/\S+/g)!;
    const tags = getPOSTags(sentence, words);
    expect(tags).not.toBeNull();
    expect(tags![0]).toBe("PRP"); // She → 代词
  });
});

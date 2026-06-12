import { describe, it, expect } from "vitest";
import { stripCodeBlocks } from "../shared/strip-code";

describe("stripCodeBlocks", () => {
  it("removes inline <code>foo()</code> content", () => {
    expect(stripCodeBlocks("Use the <code>foo()</code> method.")).toBe(
      "Use the  method.",
    );
  });

  it("removes <code> with attributes", () => {
    expect(
      stripCodeBlocks('Run <code class="hl">npm install</code> first.'),
    ).toBe("Run  first.");
  });

  it("removes <pre> blocks including newlines", () => {
    const input = "Intro.\n<pre>const x = 1;\nconst y = 2;</pre>\nOutro.";
    const out = stripCodeBlocks(input);
    expect(out).not.toContain("const x");
    expect(out).not.toContain("const y");
    expect(out).toContain("Intro.");
    expect(out).toContain("Outro.");
  });

  it("removes <kbd>, <samp>, <tt> blocks", () => {
    expect(stripCodeBlocks("Press <kbd>Ctrl</kbd>+<kbd>C</kbd>.")).toBe(
      "Press +.",
    );
    expect(stripCodeBlocks("Output: <samp>OK</samp>")).toBe("Output: ");
    expect(stripCodeBlocks("The <tt>printf</tt> function.")).toBe(
      "The  function.",
    );
  });

  it("is case-insensitive on tag names", () => {
    expect(stripCodeBlocks("A <CODE>x</CODE> B.")).toBe("A  B.");
  });

  it("does not match code-like substrings outside tags", () => {
    expect(stripCodeBlocks("the </code/> word")).toBe("the </code/> word");
  });

  it("handles nested same-tag pairs (greedy first match consumed)", () => {
    // 第一个 </code> 关闭外层；剩下的孤儿开标签保留为字面量
    const input = "<code>foo<code>bar</code>baz";
    const out = stripCodeBlocks(input);
    expect(out).not.toContain("bar");
  });

  it("preserves content when no code block is present", () => {
    const input = "Plain English text with no markup whatsoever here.";
    expect(stripCodeBlocks(input)).toBe(input);
  });

  it("strips multi-line pre with attribute and whitespace", () => {
    const input = 'before<pre class="x">  line1\n  line2  </pre>after';
    const out = stripCodeBlocks(input);
    expect(out).toMatch(/^before\s*after$/);
  });
});

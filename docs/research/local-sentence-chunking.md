# Local (Non-LLM) English Sentence Chunking Research

> Goal: Given a long English sentence, split it at grammatically meaningful break points (subordinate clauses, prepositional phrases, conjunctions, etc.) — entirely client-side in a Chrome extension.

## 1. Current Implementation Analysis

The project already has a rule-based splitter in `src/shared/scan-rules.ts` with:
- Three granularity levels (coarse / medium / fine)
- Keyword-based trigger sets (COORDINATE, STRONG_SUBORDINATE, WEAK_SUBORDINATE, RELATIVE, TRANSITION, PREPOSITION_FINE)
- Comma-gated vs. ungated splitting logic
- Short-chunk merging (< 3 words)
- LLM fallback for complex sentences (3+ subordinate markers that can't be split locally)

This is already a solid rule-based approach. The question is: what can improve it?

---

## 2. Approach Taxonomy

### 2A. Pure Rule-Based (Current Approach)

**How it works:** Pattern-match on trigger words (conjunctions, relative pronouns, transition words) with optional punctuation gating.

**Strengths:**
- Zero latency (< 1ms)
- Zero bundle size overhead (just code)
- Fully deterministic and debuggable
- Already implemented and working

**Weaknesses:**
- No syntactic awareness — can't distinguish "that" as conjunction vs. demonstrative pronoun vs. relative pronoun
- Can't detect non-finite clause boundaries (participle phrases, infinitive phrases) without POS tags
- Misses reduced relative clauses ("the book written by her" — no trigger word)
- Can't handle nested clauses well (doesn't know when an inner clause ends)

**Best practices from research (iSimp system):**
The iSimp system (U. Delaware) is the gold standard for rule-based clause detection. Key design insights:
1. Uses **trigger words** to initiate clause detection (same concept as current implementation)
2. Scans left-to-right, and when a trigger is found, uses **recursive transition networks** to validate the clause structure
3. Detects 6 construct types: coordination, relative clause, apposition, introductory phrase, subordinate clause, parenthetical element
4. Achieved 86.5-92.7% F-measure
5. Key advantage over our approach: it uses shallow parsing (NP/VP/PP chunks) as input, not raw words

**Source:** [iSimp: A Sentence Simplification System](https://github.com/bionlplab/isimp)

### 2B. POS-Augmented Rules (Recommended Next Step)

**How it works:** Run a lightweight POS tagger first, then apply rules on POS tag sequences instead of raw words.

**Why this is the sweet spot:**
- Resolves the biggest ambiguities in the current system
- POS taggers are fast (pos-js: ~microseconds per word) and small (~50KB)
- No model files needed — rule-based POS taggers use lexicons + transformation rules

**What POS tagging enables that raw words can't:**

| Pattern | Raw Word Problem | POS Solution |
|---------|-----------------|--------------|
| "that" | Is it conjunction (IN), demonstrative (DT), or relative pronoun (WDT)? | POS tag disambiguates |
| "which" | Interrogative vs. relative | Context from surrounding POS tags |
| "to" + verb | Infinitive phrase (splittable) vs. preposition | TO + VB = infinitive |
| "-ing" word | Gerund (noun) vs. participle (modifier) vs. progressive verb | VBG vs. NN |
| "since/while/before/after" | Conjunction vs. preposition vs. adverb | IN vs. RB |

**Concrete POS-based split rules:**

```
# Split before subordinating conjunction + subject
..., IN/WDT + PRP/NNP/DT → split before IN/WDT

# Split before non-finite clause (participle)
..., VBG/VBN + (not part of progressive/passive) → split before VBG/VBN

# Split before infinitive phrase
..., TO + VB → split before TO (if preceded by 4+ words)

# Split before relative adverb clause
..., WRB + ... + VB → split before WRB

# Detect end of subordinate clause
... VB + NP + comma → potential clause end
```

**Available JS POS taggers for browser:**

| Library | Size | Accuracy | Browser? | Notes |
|---------|------|----------|----------|-------|
| [pos-js](https://github.com/dariusk/pos-js) | ~50KB | ~93% | Yes | Eric Brill's TBL tagger, pure JS, no deps |
| [wink-pos-tagger](https://www.npmjs.com/package/wink-pos-tagger) | ~100KB | ~95% | Yes | More accurate, slightly larger |
| [en-pos](https://github.com/FinNLP/en-pos) | ~30KB | ~90% | Yes | Smallest, less accurate |
| [compromise](https://github.com/spencermountain/compromise) | ~200KB | ~90% | Yes | Full NLP suite, has `.clauses()` |
| [wink-nlp](https://github.com/winkjs/wink-nlp) + web model | ~10KB + ~1MB | ~95% | Yes | Most accurate, but model is large |

### 2C. Shallow Parsing / Chunking

**How it works:** Group POS-tagged words into phrases (NP, VP, PP) then split between phrase boundaries.

**Definition:** Shallow parsing identifies constituent parts (nouns, verbs, adjectives) and links them to higher-order units (noun phrases, verb phrases, prepositional phrases) WITHOUT building a full parse tree.

**Process:** Tokenize → POS tag → Chunk (group into phrases)

**Example:**
```
[The old man]_NP [sat]_VP [on the bench]_PP [near the park]_PP [, which]_SBAR [overlooked]_VP [the river]_NP
→ Split points: before PP "near the park", before SBAR ", which"
```

**Advantage over pure POS:** Knows that "on the bench" is one unit that shouldn't be split internally.

**JS implementation status:** No ready-made shallow parser exists for JS. Would need to implement chunk rules on top of a POS tagger. NLTK's RegexpParser-style approach (regex over POS tags) is straightforward to port:

```
NP: {<DT>?<JJ>*<NN.*>+}    # Determiner? + Adjectives* + Nouns+
PP: {<IN><NP>}               # Preposition + NP
VP: {<VB.*><NP|PP>*}         # Verb + NP/PP arguments
SBAR: {<IN|WDT|WP><S>}       # Subordinator + clause
```

### 2D. Full Constituency / Dependency Parsing

**Constituency parsing** builds a full tree: S → NP VP, VP → V NP PP, etc.
**Dependency parsing** finds head-dependent relations: "sat" ← "man" (nsubj), "sat" → "bench" (obl).

**For clause detection, dependency parsing is more useful because:**
- Clause boundaries correspond to specific dependency relations: `ccomp` (clausal complement), `advcl` (adverbial clause), `acl:relcl` (relative clause), `acl` (other clausal modifier)
- Splitting at these relations gives grammatically correct chunks

**JS/Browser options:**

| Tool | Approach | Browser? | Size | Practical? |
|------|----------|----------|------|------------|
| [spacy-wasm](https://spacy.io/universe/project/spacy-wasm) | spaCy via WASM | Theoretically | ~50MB+ | Too large for extension |
| [Transformers.js](https://huggingface.co/docs/transformers.js) | ONNX models via WASM/WebGPU | Yes | 10-100MB per model | Too large, no constituency model |
| [compromise.js](https://github.com/spencermountain/compromise) `.clauses()` | Heuristic | Yes | ~200KB | Limited accuracy, worth testing |
| Stanford CoreNLP | Java-based | No | N/A | Server-only |
| Benepar | PyTorch | No | N/A | Server-only |

**Verdict:** Full parsing is too heavy for a Chrome extension. The models are 10-100MB+, which is unacceptable for an extension that already bundles ~3.2MB of dictionary data.

### 2E. Hybrid: Rules + Small Model (WASM)

**nnsplit** is the most interesting project here:
- Uses a byte-level LSTM for text segmentation
- Compiled to WASM for browser use
- Very small model weights
- Originally designed for sentence boundary detection, but could theoretically be trained for clause boundaries

**Source:** [nnsplit](https://github.com/kornelski/nnsplit)

**However:** nnsplit only does sentence-level splitting, not intra-sentence clause splitting. Training a custom model for clause boundaries would require:
1. A labeled dataset of clause boundaries
2. Model training infrastructure
3. Maintaining the model

This is a significant investment for marginal gains over POS-augmented rules.

---

## 3. Linguistic Patterns: What's Safe to Split At?

### Reliable Break Points (High Confidence)

| Pattern | Example | Detection Method |
|---------|---------|-----------------|
| **Coordinating conjunction after comma** | "She ran, **and** he walked" | `, + FANBOYS` — already implemented |
| **Subordinating conjunction** | "She ran **because** he chased" | Trigger word — already implemented |
| **Non-restrictive relative clause** | "The dog, **which** was old, barked" | `, + which/who/whom/whose` — already implemented |
| **Semicolon** | "She ran; he walked" | Punctuation — already implemented |
| **Transition word after comma/semicolon** | "She ran; **however**, he stayed" | `, + transition word` — already implemented |
| **Appositive** | "Bob, **the teacher**, left" | `, + NP + ,` — NOT yet implemented, needs POS |
| **Parenthetical** | "The plan (**surprisingly**) worked" | `( ... )` — easy to add |
| **Colon introducing explanation** | "One thing mattered: **survival**" | `:` — easy to add |

### Moderate Confidence (Needs POS for Accuracy)

| Pattern | Example | Challenge |
|---------|---------|-----------|
| **Restrictive relative clause** | "The man **who** arrived left" | No comma, "who" could be interrogative |
| **"that" as relative pronoun** | "The book **that** I read" | "that" is extremely ambiguous (demonstrative, conjunction, relative) |
| **Infinitive phrase** | "She left **to find** help" | "to" is also a preposition; need POS to confirm TO+VB |
| **Participle phrase** (non-reduced) | "**Running quickly**, she escaped" | VBG at start is usually safe; mid-sentence VBG is ambiguous |
| **Adverbial "while/since/before"** | "**While** eating, he read" | These words have both conjunction and preposition uses |

### Tricky / Error-Prone (Avoid Without Full Parsing)

| Pattern | Example | Why It's Hard |
|---------|---------|---------------|
| **Reduced relative clause** | "The man **sitting** there" | No trigger word, participle looks like normal verb |
| **Noun clause with "that"** | "I know **that** she left" | Splitting here breaks the clause that's an object |
| **Subject "that" clause** | "**That** he survived surprised us" | "That" is part of the subject, can't split |
| **Correlative conjunctions** | "**Both** X **and** Y" | Splitting at "and" breaks the correlative pair |
| **Comparative clause** | "More than **what** he expected" | "what" introduces a clause but it's part of the comparison |
| **Nested clauses** | "The man who the dog that I bought bit ran" | Multiple embeddings, each "that/who" starts a new nesting |

### Nested Clause Handling

The current implementation uses a `level` counter (0 = main, 1+ = subordinate) and detects clause end via "comma + non-marker word." This is a reasonable heuristic but has failure modes:

**Problem:** "The man who arrived, tired and hungry, sat down"
- Current system: splits at "tired" (comma + non-marker) and thinks it's back to main clause
- Reality: "tired and hungry" is an adjectival phrase modifying "man," not a clause boundary

**Better approach with POS:** After comma, check if next words are JJ (adjective) — if so, it's likely an adjectival phrase, not a clause boundary. Only reset level when seeing a new VB (verb) after the comma.

---

## 4. Existing Open-Source Projects for Language Learning Sentence Splitting

| Project | Approach | Language | Notes |
|---------|----------|----------|-------|
| [shreyaUp/Sentence-Simplification](https://github.com/shreyaUp/Sentence-Simplification) | Stanford parser + rules | Python | Detects clause breakpoints, converts complex → simple sentences |
| [bionlplab/iSimp](https://github.com/bionlplab/isimp) | Shallow parsing + RTN | Python/Java | 6 construct types, 86-92% F-measure |
| [garain/Sentence-Simplification](https://github.com/garain/Sentence-Simplification) | Rules | Python | Complex/compound → simple sentences |
| [shashiongithub/Split-and-Rephrase](https://github.com/shashiongithub/Split-and-Rephrase) | Neural (WebSplit benchmark) | Python | Academic benchmark for sentence splitting |
| [ChunkReader](https://brendonalbertson.com/2021/06/04/automated-chunking-of-text-for-learners-not-search-algorithms/) | NLTK chunking | Python | Specifically designed for language learners |
| [Chunk Master](https://www.yeschat.ai/gpts-2OToXZJtOC-Chunk-Master) | GPT-based | Online | Segments sentences for Korean learners |
| [compromise.js](https://github.com/spencermountain/compromise) `.clauses()` | Heuristic | JavaScript | Browser-ready, but limited accuracy |
| [AlokDebnath/clause-boundary-detection](https://github.com/AlokDebnath/clause-boundary-detection) | CoNLL-style parsing | Python | Academic implementation |

**Key takeaway:** No existing JS/browser project does high-quality intra-sentence clause splitting. The Python projects all rely on either Stanford CoreNLP or spaCy, which are too heavy for browser use.

---

## 5. Recommended Strategy for This Project

### Phase 1: Quick Wins on Current Rule-Based System (No New Dependencies)

These improvements can be made to `scan-rules.ts` without any library additions:

1. **Add parenthetical/colon/dash splitting:**
   - Split before `(` and after `)` (parenthetical)
   - Split at `:` when followed by 4+ words
   - Split at `—` / `--` (em dash)

2. **Improve "that" handling:**
   - Only split at "that" when preceded by a comma (already done) OR when preceded by a noun and followed by a pronoun/determiner (heuristic for relative clause)
   - Never split at "that" when it follows verbs like "know/think/believe/said/told" (noun clause, not splittable)

3. **Add "not only...but also" / "either...or" / "neither...nor" correlation detection:**
   - When "not only" is found, don't split at the next "but"
   - When "either" is found, don't split at the next "or"

4. **Improve clause-end detection:**
   - Current: any comma + non-marker word = clause end
   - Better: require the post-comma word to start a clause-like structure (capital letter, pronoun, or determiner)

### Phase 2: Add Lightweight POS Tagging (~50KB)

Add `pos-js` (or a custom minimal tagger) to enable:

1. **Disambiguate "that":** DT (demonstrative) vs. IN (conjunction) vs. WDT (relative)
2. **Detect infinitive phrases:** TO + VB pattern → split before TO
3. **Detect participle phrases at sentence start:** VBG/VBN at position 0-2 → mark as subordinate
4. **Better clause-end detection:** Look for VB after comma to confirm new clause, not just any non-marker word
5. **Appositive detection:** `, + NP + ,` pattern

**Bundle size impact:** ~50KB (pos-js) — acceptable given current 3.2MB bundle.

**Implementation sketch:**
```typescript
import { Lexer, Tagger } from 'pos';

function posAugmentedSplit(sentence: string): ScanChunk[] {
  const lexer = new Lexer();
  const tagger = new Tagger();
  const words = lexer.lex(sentence);
  const tagged = tagger.tag(words); // [[word, tag], ...]

  // Apply POS-aware rules on tagged sequence
  for (let i = 0; i < tagged.length; i++) {
    const [word, tag] = tagged[i];

    // "that" disambiguation
    if (word.toLowerCase() === 'that') {
      if (tag === 'WDT') { /* relative pronoun — split */ }
      else if (tag === 'IN') { /* conjunction — check if noun clause */ }
      else if (tag === 'DT') { /* demonstrative — don't split */ }
    }

    // Infinitive phrase detection
    if (tag === 'TO' && i + 1 < tagged.length && tagged[i+1][1].startsWith('VB')) {
      // Split before infinitive if enough words before
    }

    // Participle phrase at start
    if (i < 3 && (tag === 'VBG' || tag === 'VBN')) {
      // Mark as subordinate chunk
    }
  }
}
```

### Phase 3: Custom Shallow Chunker (Optional, Medium Effort)

If Phase 2 results are good but still have edge cases, build a simple regex-over-POS chunker:

```typescript
// After POS tagging, join tags into a string and regex-match phrase boundaries
const tagString = tagged.map(t => t[1]).join(' ');

// Find noun phrases: DT? JJ* NN+
const npPattern = /(?:DT )?(?:JJ )*(?:NNP?S? )+/g;

// Find prepositional phrases: IN NP
const ppPattern = /IN (?:DT )?(?:JJ )*(?:NNP?S? )+/g;

// Split between major phrase boundaries
```

This would give iSimp-like shallow parsing capability at minimal cost.

### What NOT to Do

1. **Don't add spacy-wasm or Transformers.js** — model files are 10-100MB, unacceptable for an extension
2. **Don't train a custom neural model** — overkill for this use case, and maintaining models is expensive
3. **Don't use compromise.js for splitting** — its `.clauses()` method is undocumented and unreliable; the library is 200KB with mediocre accuracy. If we're adding a dependency, pos-js at 50KB gives more targeted value
4. **Don't try to handle all edge cases** — the LLM fallback exists for a reason. Focus on getting the common 80% right locally, let LLM handle the complex 20%

---

## 6. Summary: Effort vs. Impact Matrix

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| Parenthetical/colon/dash rules | Low | Medium | None |
| Better "that" heuristics | Low | Medium | None |
| Correlative conjunction handling | Low | Low | None |
| Better clause-end detection | Low | Medium | None |
| POS tagger integration | Medium | High | pos-js (~50KB) |
| Infinitive/participle detection | Medium | High | Requires POS |
| Appositive detection | Medium | Medium | Requires POS |
| Shallow chunker (NP/VP/PP) | High | Medium | Requires POS |
| Full dependency parser | Very High | High | 10MB+ model |
| Custom neural model | Very High | Medium | Training infra |

**Recommended path:** Phase 1 (quick wins, no deps) → Phase 2 (POS tagger) → evaluate if Phase 3 is needed.

---

## Sources

- [iSimp: A Sentence Simplification System](https://github.com/bionlplab/isimp) — [Paper](https://research.bioinformatics.udel.edu/isimp/)
- [shreyaUp/Sentence-Simplification](https://github.com/shreyaUp/Sentence-Simplification) — Clause breakpoint detection
- [compromise.js](https://github.com/spencermountain/compromise) — JS NLP with `.clauses()` method
- [winkNLP](https://winkjs.org/wink-nlp/) — Browser-compatible NLP pipeline
- [pos-js](https://github.com/dariusk/pos-js) — Lightweight JS POS tagger
- [wink-pos-tagger](https://www.npmjs.com/package/wink-pos-tagger) — Higher accuracy POS tagger
- [nnsplit](https://github.com/kornelski/nnsplit) — WASM-based neural text segmentation
- [Transformers.js](https://huggingface.co/docs/transformers.js) — Browser ML inference via ONNX
- [spacy-wasm](https://spacy.io/universe/project/spacy-wasm) — spaCy in browser via WASM
- [ChunkReader / Brendon Albertson](https://brendonalbertson.com/2021/06/04/automated-chunking-of-text-for-learners-not-search-algorithms/) — Text chunking for learners
- [AlokDebnath/clause-boundary-detection](https://github.com/AlokDebnath/clause-boundary-detection) — Clause boundary detection
- [Shallow Parsing (Wikipedia)](https://en.wikipedia.org/wiki/Shallow_parsing) — NLP chunking overview
- [NLP-progress: Simplification](http://nlpprogress.com/english/simplification.html) — State of the art tracking
- [Grammarly: Independent and Dependent Clauses](https://www.grammarly.com/blog/grammar/independent-and-dependent-clauses/) — Linguistic rules reference
- [Grammarly: Restrictive vs Non-Restrictive Clauses](https://www.grammarly.com/blog/using-that-and-which-is-all-about-restrictive-and-non-restrictive-clauses/) — "that" vs "which" disambiguation
- [Constituency vs Dependency Parsing (Baeldung)](https://www.baeldung.com/cs/constituency-vs-dependency-parsing) — Parsing approach comparison

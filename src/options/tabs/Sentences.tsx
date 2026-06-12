import { useState } from "react";
import type { LearningRecord, PatternKey, PendingSentenceRecord } from "../../shared/types.ts";
import { GlassCard } from "../components/GlassCard.tsx";
import { PatternTag } from "../components/PatternTag.tsx";
import { ChunkLines } from "../components/ChunkLines.tsx";
import { FilterChip } from "../components/FilterChip.tsx";
import { VocabPill } from "../components/VocabPill.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ExportMenu } from "../components/ExportMenu.tsx";
import { useSentences, type SentenceItem } from "../hooks/useSentences.ts";
import { useMasteredWords } from "../hooks/useMasteredWords.ts";
import { PATTERN_LABELS } from "../constants.ts";

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

function extractDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// ========== Analyzed (existing) ==========

function SentenceCollapsed({ record, onClick }: { record: LearningRecord; onClick: () => void }) {
  return (
    <GlassCard className="sent-item" onClick={onClick}>
      <div className="sent-item-top">
        {record.pattern_key && <PatternTag patternKey={record.pattern_key} />}
        <span className="sentence-source">
          {extractDomain(record.source_url)} · {formatTimeAgo(record.created_at)}
        </span>
      </div>
      <div className="sent-item-text">{record.sentence}</div>
      <div className="sent-item-meta">
        {record.new_words.length > 0 && (
          <span className="sent-item-vocab-count">{record.new_words.length} 生词</span>
        )}
        <span className="sent-item-domain">{extractDomain(record.source_url)}</span>
        <span className="sent-item-time">{formatTimeAgo(record.created_at)}</span>
      </div>
    </GlassCard>
  );
}

function SentenceExpanded({ record, onClick }: { record: LearningRecord; onClick: () => void }) {
  const { masteredWords, toggleMastered } = useMasteredWords();

  return (
    <GlassCard className="sent-expanded" onClick={onClick}>
      <div className="sent-item-top">
        {record.pattern_key && <PatternTag patternKey={record.pattern_key} />}
        <span className="sentence-source">
          {extractDomain(record.source_url)} · {formatTimeAgo(record.created_at)}
        </span>
      </div>

      {/* Layer 1: 原句 */}
      <div className="sent-expanded-original">{record.sentence}</div>

      {/* Layer 2: 分块 */}
      <div className="sent-section-label" style={{ marginTop: 0 }}>分块</div>
      <ChunkLines chunked={record.chunked} newWords={record.new_words} />

      {/* Layer 3: 为什么难读 */}
      {record.sentence_analysis && (
        <>
          <div className="sent-section-label">为什么难读</div>
          <div className="sent-explanation">{record.sentence_analysis}</div>
        </>
      )}

      {/* Layer 4: 学会表达 */}
      {record.expression_tips && (
        <>
          <div className="sent-section-label">学会表达</div>
          <div
            className="sent-expression"
            dangerouslySetInnerHTML={{ __html: formatExpression(record.expression_tips) }}
          />
        </>
      )}

      {/* Layer 5: 生词 */}
      {record.new_words.length > 0 && (
        <>
          <div className="sent-section-label">生词</div>
          <div className="sent-vocab-row">
            {record.new_words.map((w, i) => (
              <VocabPill
                key={i}
                word={w.word}
                definition={w.definition}
                mastered={masteredWords.has(w.word.toLowerCase())}
                onToggleMastered={() => toggleMastered(w.word)}
              />
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}

// ========== Pending ==========

function SentencePending({
  pending,
  analyzing,
  error,
  onClick,
}: {
  pending: PendingSentenceRecord;
  analyzing: boolean;
  error?: string;
  onClick: () => void;
}) {
  return (
    <GlassCard className="sent-item sent-pending" onClick={onClick}>
      <div className="sent-item-top">
        {pending.manual && <span className="sent-badge sent-badge-manual">手动</span>}
        {analyzing && <span className="sent-badge sent-badge-analyzing">分析中...</span>}
        {error && <span className="sent-badge sent-badge-error">分析失败</span>}
        <span className="sentence-source">
          {pending.source_hostname} · {formatTimeAgo(pending.created_at)}
        </span>
      </div>
      <div className="sent-item-text">{pending.text}</div>
      {pending.new_words.length > 0 && (
        <div className="sent-item-meta">
          <span className="sent-item-vocab-count">{pending.new_words.length} 生词</span>
        </div>
      )}
    </GlassCard>
  );
}

function SentencePendingExpanded({
  pending,
  analyzing,
  error,
  onClick,
}: {
  pending: PendingSentenceRecord;
  analyzing: boolean;
  error?: string;
  onClick: () => void;
}) {
  return (
    <GlassCard className="sent-expanded sent-pending" onClick={onClick}>
      <div className="sent-item-top">
        {pending.manual && <span className="sent-badge sent-badge-manual">手动</span>}
        {analyzing && <span className="sent-badge sent-badge-analyzing">分析中...</span>}
        {error && <span className="sent-badge sent-badge-error">分析失败</span>}
        <span className="sentence-source">
          {pending.source_hostname} · {formatTimeAgo(pending.created_at)}
        </span>
      </div>

      <div className="sent-expanded-original">{pending.text}</div>

      {analyzing && (
        <div className="sent-skeleton-container">
          <div className="sent-section-label">分块</div>
          <div className="sent-skeleton" />
          <div className="sent-section-label">为什么难读</div>
          <div className="sent-skeleton sent-skeleton-wide" />
          <div className="sent-section-label">学会表达</div>
          <div className="sent-skeleton sent-skeleton-wide" />
        </div>
      )}

      {error && (
        <div className="sent-error-msg">分析失败：{error}</div>
      )}

      {!analyzing && !error && (
        <div className="sent-pending-hint">等待分析...</div>
      )}
    </GlassCard>
  );
}

function formatExpression(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

// ========== Main Component ==========

interface SentencesProps {
  db: IDBDatabase | null;
  isExample: boolean;
}

export function Sentences({ db, isExample }: SentencesProps) {
  const {
    items, filter, setFilter, availablePatterns, loading,
    page, setPage, totalPages, hasNextPage, hasPrevPage,
  } = useSentences(db, isExample);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return null;

  if (items.length === 0 && filter === "all") {
    return <EmptyState text="还没积累难句，去浏览英文网页，遇到的难句会自动攒在这" />;
  }

  const getItemId = (item: SentenceItem) =>
    item.type === "analyzed" ? item.record.id : item.pending.id;

  // 提取所有已分析记录供导出（pending 无 LLM 结果，导出没意义）
  const exportableRecords: LearningRecord[] = items
    .filter((i): i is SentenceItem & { type: "analyzed" } => i.type === "analyzed")
    .map((i) => i.record);

  return (
    <>
      {/* Filter bar */}
      <div className="filter-bar rv">
        <FilterChip
          label="全部"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {availablePatterns.map((pk) => (
          <FilterChip
            key={pk}
            label={PATTERN_LABELS[pk] ?? pk}
            active={filter === pk}
            onClick={() => setFilter(pk)}
          />
        ))}
        <div className="filter-bar-spacer" />
        <ExportMenu
          doc={{
            title: "掰it 难句集",
            author: "掰it",
            description: `共 ${exportableRecords.length} 条难句，导出时间 ${new Date().toLocaleString("zh-CN")}`,
            language: "en",
            records: exportableRecords,
          }}
          disabled={exportableRecords.length === 0}
        />
      </div>

      {/* Sentence list */}
      {items.map((item) => {
        const id = getItemId(item);
        const isExpanded = expandedId === id;

        return (
          <div key={id} className="rv">
            {item.type === "analyzed" ? (
              isExpanded ? (
                <SentenceExpanded record={item.record} onClick={() => setExpandedId(null)} />
              ) : (
                <SentenceCollapsed record={item.record} onClick={() => setExpandedId(id)} />
              )
            ) : (
              isExpanded ? (
                <SentencePendingExpanded
                  pending={item.pending}
                  analyzing={item.analyzing}
                  error={item.error}
                  onClick={() => setExpandedId(null)}
                />
              ) : (
                <SentencePending
                  pending={item.pending}
                  analyzing={item.analyzing}
                  error={item.error}
                  onClick={() => setExpandedId(id)}
                />
              )
            )}
          </div>
        );
      })}

      {items.length === 0 && filter !== "all" && (
        <EmptyState text={`没有「${PATTERN_LABELS[filter as PatternKey] ?? filter}」类型的难句`} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="sent-pagination rv">
          <button
            className="sent-page-btn"
            disabled={!hasPrevPage}
            onClick={() => setPage(p => p - 1)}
          >
            ← 上一页
          </button>
          <span className="sent-page-info">{page} / {totalPages}</span>
          <button
            className="sent-page-btn"
            disabled={!hasNextPage}
            onClick={() => setPage(p => p + 1)}
          >
            下一页 →
          </button>
        </div>
      )}
    </>
  );
}

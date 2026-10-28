import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { initials, formatDate } from './ui';
import {
  splitBlocks, computeHunks, mergeBlocks, hunkKind, hunkKey, hunksOverlap, inlineTextDiff
} from './reviewDiff';
import {
  X, Check, Ban, CheckCircle2, MessageSquareText, FilePlus2, FileMinus2, FilePen, AlertTriangle, FileText
} from 'lucide-react';

const formatPreviewHtml = (rawHtml) => {
  if (!rawHtml) return '';
  return String(rawHtml).replace(
    /<span[^>]*\bdata-sig-width=["']?([^"'\s>]+)["']?[^>]*>\s*\{\{\s*(?:Signature|Sig)\s*:\s*([^|}]+?)(?:\s*\|[^}]*)?\s*\}\}\s*<\/span>/gi,
    (_, w, slot) => {
      const cleanSlot = String(slot || 'Submitter').trim();
      const normW = String(w || 'auto').toLowerCase();
      const badge = normW !== 'auto' ? ` <small style="opacity:0.75;font-weight:700;">(${normW}% width)</small>` : '';
      return `<span class="sd-badge sd-badge-purple" style="display:inline-flex;align-items:center;gap:4px;margin:2px 4px;">✍️ Signature: ${cleanSlot}${badge}</span>`;
    }
  );
};

const Doc = ({ html }) => (
  <div className="sd-rv-doc sd-word-editor-body" dangerouslySetInnerHTML={{ __html: formatPreviewHtml(html) }} />
);

const KIND_META = {
  insert: { label: 'Added', icon: FilePlus2, tone: 'green' },
  delete: { label: 'Removed', icon: FileMinus2, tone: 'red' },
  modify: { label: 'Edited', icon: FilePen, tone: 'amber' }
};

const textOfBlock = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  return (tpl.content.textContent || '').replace(/\s+/g, ' ').trim();
};

const excerpt = (s, n = 70) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

// Shows what a single change does: a word-level diff for edited text, otherwise before / after
const HunkBody = ({ hunk }) => {
  const kind = hunkKind(hunk);
  if (kind === 'modify' && hunk.oldBlocks.length === 1 && hunk.newBlocks.length === 1) {
    const diff = inlineTextDiff(hunk.oldBlocks[0], hunk.newBlocks[0]);
    if (diff?.html) return <Doc html={diff.html} />;
  }
  return (
    <div className="sd-rv-pair">
      {hunk.oldBlocks.length > 0 && (
        <div className="sd-rv-side is-old">
          <span className="sd-rv-side-label">{kind === 'delete' ? 'Removed' : 'Before'}</span>
          <Doc html={hunk.oldBlocks.join('')} />
        </div>
      )}
      {hunk.newBlocks.length > 0 && (
        <div className="sd-rv-side is-new">
          <span className="sd-rv-side-label">{kind === 'insert' ? 'Added' : 'After'}</span>
          <Doc html={hunk.newBlocks.join('')} />
        </div>
      )}
    </div>
  );
};

// Full-screen screen where the initiator accepts / rejects every reviewer's changes
export const ReviewChangesModal = ({ review, onClose, onFinished }) => {
  const { saveReviewDecisions, finalizeReview, addToast } = useApp();

  const baseBlocks = useMemo(() => splitBlocks(review.baseHtml), [review.baseHtml]);

  const reviewers = useMemo(() => review.reviewers.map(rv => ({
    ...rv,
    hunks: rv.html ? computeHunks(baseBlocks, splitBlocks(rv.html)) : []
  })), [review.reviewers, baseBlocks]);

  const allHunks = useMemo(() => reviewers.flatMap(rv => rv.hunks.map(h => ({
    ...h,
    reviewerId: rv.userId,
    reviewerName: rv.name,
    key: hunkKey(rv.userId, h)
  }))), [reviewers]);

  const [decisions, setDecisions] = useState(() => {
    const valid = new Set(allHunks.map(h => h.key));
    return Object.fromEntries(Object.entries(review.decisions || {}).filter(([k]) => valid.has(k)));
  });
  const [filter, setFilter] = useState('all'); // 'all' | 'pending'
  const [finishing, setFinishing] = useState(false);

  // Persist decisions shortly after each click so the initiator can leave and come back
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const t = setTimeout(() => { saveReviewDecisions(review.id, decisions); }, 600);
    return () => clearTimeout(t);
  }, [decisions]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptedHunks = useMemo(() => allHunks.filter(h => decisions[h.key] === 'accepted'), [allHunks, decisions]);
  const resultHtml = useMemo(() => mergeBlocks(baseBlocks, acceptedHunks), [baseBlocks, acceptedHunks]);

  const total = allHunks.length;
  const decided = allHunks.filter(h => decisions[h.key]).length;
  const allDecided = decided === total;

  // An accepted change from another reviewer that rewrites the same part of the document
  const acceptedConflict = (h) => allHunks.find(g =>
    g.reviewerId !== h.reviewerId && decisions[g.key] === 'accepted' && hunksOverlap(h, g));
  const overlapping = (h) => allHunks.filter(g => g.reviewerId !== h.reviewerId && hunksOverlap(h, g));

  const decide = (h, value) => {
    if (value === 'accepted') {
      const c = acceptedConflict(h);
      if (c) {
        addToast('Conflicting change', `This overlaps ${c.reviewerName}'s accepted change. Reject or reset that one first.`, 'warning');
        return;
      }
    }
    setDecisions(prev => {
      const next = { ...prev };
      if (prev[h.key] === value) delete next[h.key]; else next[h.key] = value;
      return next;
    });
  };

  const bulk = (rv, value) => {
    const next = { ...decisions };
    let skipped = 0;
    rv.hunks.forEach(h => {
      const full = { ...h, reviewerId: rv.userId, key: hunkKey(rv.userId, h) };
      if (value === 'accepted') {
        const clash = allHunks.some(g => g.reviewerId !== rv.userId && next[g.key] === 'accepted' && hunksOverlap(full, g));
        if (clash) { skipped++; return; }
      }
      next[full.key] = value;
    });
    setDecisions(next);
    if (skipped) addToast('Some changes skipped', `${skipped} change${skipped === 1 ? '' : 's'} overlap an already accepted change.`, 'warning');
  };

  const handleClose = async () => {
    if (Object.keys(decisions).length) await saveReviewDecisions(review.id, decisions);
    onClose();
  };

  const finish = async () => {
    if (!allDecided || finishing) return;
    setFinishing(true);
    const ok = await finalizeReview(review.id, { finalHtml: resultHtml, decisions });
    if (ok) {
      addToast('Review finished', `${acceptedHunks.length} of ${total} change${total === 1 ? '' : 's'} accepted.`, 'success');
      onFinished(resultHtml);
    } else {
      setFinishing(false);
    }
  };

  return (
    <div className="sd-rv-backdrop" id="review-changes-screen">
      <div className="sd-rv-shell">
        <header className="sd-rv-header">
          <div className="sd-rv-header-title">
            <span className="sd-rv-header-icon"><MessageSquareText size={18} /></span>
            <div>
              <h2>Review changes — {review.title}</h2>
              <p className="sd-muted">
                {total === 0
                  ? 'None of the reviewers changed the document.'
                  : `${decided} of ${total} change${total === 1 ? '' : 's'} decided`}
              </p>
            </div>
          </div>

          {total > 0 && (
            <div className="sd-rv-progress" aria-label="Decision progress">
              <span style={{ width: `${(decided / total) * 100}%` }} />
            </div>
          )}

          <div className="sd-rv-header-actions">
            {total > 0 && (
              <div className="sd-view-toggle" role="group" aria-label="Filter changes">
                <button type="button" className={`sd-view-toggle-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
                <button type="button" className={`sd-view-toggle-btn ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
                  Undecided ({total - decided})
                </button>
              </div>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleClose} disabled={finishing}>
              <X size={14} /> Close
            </button>
            <button
              type="button"
              id="btn-finish-review"
              className="btn btn-primary btn-sm"
              onClick={finish}
              disabled={!allDecided || finishing}
              title={allDecided ? 'Apply the accepted changes and continue to publishing' : 'Accept or reject every change first'}
            >
              <CheckCircle2 size={14} /> {finishing ? 'Applying…' : 'Apply accepted changes'}
            </button>
          </div>
        </header>

        <div className="sd-rv-body">
          <div className="sd-rv-changes">
            {reviewers.map(rv => {
              const rvHunks = allHunks.filter(h => h.reviewerId === rv.userId);
              const visible = filter === 'pending' ? rvHunks.filter(h => !decisions[h.key]) : rvHunks;
              const acc = rvHunks.filter(h => decisions[h.key] === 'accepted').length;
              const rej = rvHunks.filter(h => decisions[h.key] === 'rejected').length;
              return (
                <section key={rv.userId} className="sd-rv-reviewer" id={`reviewer-section-${rv.userId}`}>
                  <header className="sd-rv-reviewer-head">
                    <span className="sd-avatar">{initials(rv.name)}</span>
                    <div className="sd-rv-reviewer-meta">
                      <strong>{rv.name}</strong>
                      <span className="sd-muted">{rv.department} · submitted {formatDate(rv.submittedAt, true)}</span>
                    </div>
                    {rvHunks.length === 0 ? (
                      <span className="sd-badge sd-badge-gray">No changes</span>
                    ) : (
                      <>
                        <span className="sd-badge sd-badge-violet">{rvHunks.length} change{rvHunks.length === 1 ? '' : 's'}</span>
                        <span className="sd-muted sd-rv-tally">{acc} accepted · {rej} rejected</span>
                        <div className="sd-rv-bulk">
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => bulk(rv, 'accepted')}>
                            <Check size={12} /> Accept all
                          </button>
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => bulk(rv, 'rejected')}>
                            <Ban size={12} /> Reject all
                          </button>
                        </div>
                      </>
                    )}
                  </header>

                  {rv.comment && (
                    <div className="sd-rv-comment">
                      <MessageSquareText size={14} />
                      <p>{rv.comment}</p>
                    </div>
                  )}

                  {visible.map((h, i) => {
                    const kind = hunkKind(h);
                    const meta = KIND_META[kind];
                    const Icon = meta.icon;
                    const state = decisions[h.key];
                    const clash = acceptedConflict(h);
                    const others = overlapping(h);
                    const prevText = kind === 'insert' ? textOfBlock(baseBlocks[h.start - 1]) : '';
                    return (
                      <article
                        key={h.key}
                        id={`change-${h.key.replace(':', '-')}`}
                        className={`sd-rv-card ${state ? `is-${state}` : ''}`}
                      >
                        <header className="sd-rv-card-head">
                          <span className={`sd-badge sd-badge-${meta.tone}`}><Icon size={11} /> {meta.label}</span>
                          <span className="sd-muted sd-rv-card-pos">
                            Change {h.index + 1} of {rvHunks.length}
                            {kind === 'insert' && (h.start === 0
                              ? ' · at the start'
                              : ` · after “${excerpt(prevText) || '…'}”`)}
                          </span>
                          {state && (
                            <span className={`sd-badge ${state === 'accepted' ? 'sd-badge-green' : 'sd-badge-red'}`}>
                              {state === 'accepted' ? 'Accepted' : 'Rejected'}
                            </span>
                          )}
                        </header>

                        <HunkBody hunk={h} />

                        {others.length > 0 && (
                          <p className={`sd-rv-conflict ${clash ? 'is-blocked' : ''}`}>
                            <AlertTriangle size={13} />
                            Overlaps {others.map(o => `${o.reviewerName}'s change`).join(', ')} — only one of them can be accepted.
                          </p>
                        )}

                        <footer className="sd-rv-card-actions">
                          <button
                            type="button"
                            className={`btn btn-sm sd-rv-accept ${state === 'accepted' ? 'on' : ''}`}
                            onClick={() => decide(h, 'accepted')}
                            disabled={!!clash && state !== 'accepted'}
                            title={clash ? `Overlaps ${clash.reviewerName}'s accepted change` : 'Accept this change'}
                          >
                            <Check size={14} /> Accept
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm sd-rv-reject ${state === 'rejected' ? 'on' : ''}`}
                            onClick={() => decide(h, 'rejected')}
                            title="Reject this change"
                          >
                            <Ban size={14} /> Reject
                          </button>
                          {state && (
                            <button type="button" className="sd-link-btn" onClick={() => setDecisions(prev => {
                              const next = { ...prev };
                              delete next[h.key];
                              return next;
                            })}>
                              Reset
                            </button>
                          )}
                          <span className="sd-muted sd-rv-card-idx">#{i + 1}</span>
                        </footer>
                      </article>
                    );
                  })}

                  {rvHunks.length > 0 && visible.length === 0 && (
                    <p className="sd-muted sd-rv-allset">All of {rv.name}'s changes are decided.</p>
                  )}
                </section>
              );
            })}
          </div>

          <aside className="sd-rv-result">
            <header className="sd-rv-result-head">
              <FileText size={14} />
              <strong>Resulting document</strong>
              <span className="sd-muted">{acceptedHunks.length} change{acceptedHunks.length === 1 ? '' : 's'} applied</span>
            </header>
            <div className="sd-rv-result-sheet">
              <Doc html={resultHtml} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

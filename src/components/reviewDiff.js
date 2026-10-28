// Block-level diff & merge used by template reviews.
//
// A document is split into its top-level blocks (paragraphs, headings, tables, lists, ...).
// Each reviewer's copy is compared with the original ("base"). Every contiguous run of changed
// blocks is one "hunk" = one change the initiator can accept or reject.
//
// A hunk replaces base blocks [start, end) with `newBlocks`:
//   - insertion:    start === end, oldBlocks empty
//   - deletion:     newBlocks empty
//   - modification: both non-empty
// Hunks of different reviewers are merged by their position in the base document, so accepting
// several reviewers' changes never depends on the order in which they are accepted.

const normalize = (block) => block.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Reviewer HTML is written by other users, so it is cleaned before it is ever rendered or
// loaded into the editor: no scripts / embeds, no inline event handlers, no javascript: URLs.
const BLOCKED_TAGS = 'script, iframe, object, embed, link, meta, base, form, style';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction'];

export const sanitizeHtml = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  tpl.content.querySelectorAll(BLOCKED_TAGS).forEach((n) => n.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(a.name);
      else if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  return tpl.innerHTML;
};

// Top-level blocks of an editor HTML string (loose text is wrapped in a paragraph)
export const splitBlocks = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = sanitizeHtml(html);
  const blocks = [];
  tpl.content.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      if (node.textContent.trim()) {
        const p = document.createElement('p');
        p.textContent = node.textContent;
        blocks.push(p.outerHTML);
      }
    } else if (node.nodeType === 1) {
      blocks.push(node.outerHTML);
    }
  });
  return blocks;
};

const blockEl = (html) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content.firstElementChild;
};

const wordSet = (text) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)) || []);

// How alike two blocks are (0..1). Blocks of a different kind (p vs table) never pair up.
const blockSimilarity = (x, y) => {
  if (x.tag !== y.tag) return 0;
  if (x.words.size === 0 && y.words.size === 0) return 0.5;
  let shared = 0;
  x.words.forEach((w) => { if (y.words.has(w)) shared++; });
  return shared / (x.words.size + y.words.size - shared || 1);
};

const PAIR_THRESHOLD = 0.34;

// A run of consecutive changed blocks is split so every edited paragraph becomes its own change:
// old and new blocks are paired by text similarity (order preserved); whatever stays unpaired
// forms a pure insertion / deletion / replacement.
const refineRun = (run) => {
  const O = run.oldBlocks;
  const Nw = run.newBlocks;
  if (O.length === 0 || Nw.length === 0 || (O.length === 1 && Nw.length === 1)) return [run];

  const describe = (html) => {
    const el = blockEl(html);
    return { tag: el ? el.tagName : '', words: wordSet(el ? el.textContent || '' : '') };
  };
  const oi = O.map(describe);
  const ni = Nw.map(describe);
  const sim = oi.map((x) => ni.map((y) => blockSimilarity(x, y)));

  const a = O.length;
  const b = Nw.length;
  const best = Array.from({ length: a + 1 }, () => new Float64Array(b + 1));
  for (let i = a - 1; i >= 0; i--) {
    for (let j = b - 1; j >= 0; j--) {
      let v = Math.max(best[i + 1][j], best[i][j + 1]);
      if (sim[i][j] >= PAIR_THRESHOLD) v = Math.max(v, 1 + sim[i][j] + best[i + 1][j + 1]);
      best[i][j] = v;
    }
  }

  const out = [];
  let pending = null;
  const flushPending = () => {
    if (pending) { out.push(pending); pending = null; }
  };
  let i = 0;
  let j = 0;
  while (i < a || j < b) {
    if (i < a && j < b && sim[i][j] >= PAIR_THRESHOLD && best[i][j] === 1 + sim[i][j] + best[i + 1][j + 1]) {
      flushPending();
      out.push({ start: run.start + i, end: run.start + i + 1, newBlocks: [Nw[j]], oldBlocks: [O[i]] });
      i++; j++;
      continue;
    }
    if (!pending) pending = { start: run.start + i, end: run.start + i, newBlocks: [], oldBlocks: [] };
    if (j < b && (i >= a || best[i][j + 1] >= best[i + 1][j])) {
      pending.newBlocks.push(Nw[j]);
      j++;
    } else {
      pending.oldBlocks.push(O[i]);
      i++;
      pending.end = run.start + i;
    }
  }
  flushPending();
  return out;
};

// Changes a reviewer made compared with the base blocks
export const computeHunks = (baseBlocks, newBlocks) => {
  const a = baseBlocks.map(normalize);
  const b = newBlocks.map(normalize);
  const n = a.length;
  const m = b.length;

  // Ignore the unchanged head and tail so the LCS table stays small
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head++;
  let tailA = n;
  let tailB = m;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) { tailA--; tailB--; }

  const N = tailA - head;
  const M = tailB - head;
  const lcs = Array.from({ length: N + 1 }, () => new Uint32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      lcs[i][j] = a[head + i] === b[head + j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const hunks = [];
  let cur = null;
  const flush = () => {
    if (cur) {
      cur.oldBlocks = baseBlocks.slice(cur.start, cur.end);
      hunks.push(cur);
      cur = null;
    }
  };

  let i = 0;
  let j = 0;
  while (i < N || j < M) {
    if (i < N && j < M && a[head + i] === b[head + j]) {
      flush();
      i++; j++;
      continue;
    }
    if (!cur) cur = { start: head + i, end: head + i, newBlocks: [] };
    if (j < M && (i >= N || lcs[i][j + 1] > lcs[i + 1][j])) {
      cur.newBlocks.push(newBlocks[head + j]);
      j++;
    } else {
      i++;
      cur.end = head + i;
    }
  }
  flush();

  return hunks.flatMap(refineRun).map((h, idx) => ({ ...h, index: idx }));
};

export const hunkKind = (h) => (h.oldBlocks.length === 0 ? 'insert' : h.newBlocks.length === 0 ? 'delete' : 'modify');

export const hunkKey = (reviewerId, hunk) => `${reviewerId}:${hunk.index}`;

// Two changes conflict when they rewrite the same part of the base document
export const hunksOverlap = (x, y) => {
  const xEmpty = x.start === x.end;
  const yEmpty = y.start === y.end;
  if (xEmpty && yEmpty) return false;
  if (xEmpty) return y.start < x.start && x.start < y.end;
  if (yEmpty) return x.start < y.start && y.start < x.end;
  return x.start < y.end && y.start < x.end;
};

// Apply accepted hunks (any order) onto the base blocks and return the merged HTML
export const mergeBlocks = (baseBlocks, acceptedHunks) => {
  const deleted = new Array(baseBlocks.length).fill(false);
  const inserts = new Map();
  acceptedHunks.forEach((h) => {
    for (let i = h.start; i < h.end; i++) deleted[i] = true;
    if (h.newBlocks.length) inserts.set(h.start, [...(inserts.get(h.start) || []), ...h.newBlocks]);
  });
  const out = [];
  for (let i = 0; i <= baseBlocks.length; i++) {
    (inserts.get(i) || []).forEach((b) => out.push(b));
    if (i < baseBlocks.length && !deleted[i]) out.push(baseBlocks[i]);
  }
  return out.length ? out.join('') : '<p><br></p>';
};

// True when the reviewer's copy differs from the original
export const hasChanges = (baseHtml, html) => computeHunks(splitBlocks(baseHtml), splitBlocks(html)).length > 0;

// Word-by-word diff of two plain-text blocks. Returns { html } or null when the blocks contain
// widgets / tables (those are shown as a before / after pair instead).
export const inlineTextDiff = (oldHtml, newHtml) => {
  const o = blockEl(oldHtml);
  const n = blockEl(newHtml);
  if (!o || !n || o.tagName !== n.tagName) return null;
  const plain = (el) => !el.querySelector('table, img, [class*="sd-doc-"], [data-sig-width], ul, ol') && !/^(TABLE|UL|OL)$/.test(el.tagName);
  if (!plain(o) || !plain(n)) return null;

  const ta = (o.textContent || '').split(/(\s+)/).filter(Boolean);
  const tb = (n.textContent || '').split(/(\s+)/).filter(Boolean);
  if (ta.join('') === tb.join('')) return { html: null, formattingOnly: true };

  const A = ta.length;
  const B = tb.length;
  const lcs = Array.from({ length: A + 1 }, () => new Uint32Array(B + 1));
  for (let i = A - 1; i >= 0; i--) {
    for (let j = B - 1; j >= 0; j--) {
      lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts = [];
  const push = (type, text) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text; else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < A || j < B) {
    if (i < A && j < B && ta[i] === tb[j]) { push('eq', ta[i]); i++; j++; }
    else if (j < B && (i >= A || lcs[i][j + 1] > lcs[i + 1][j])) { push('ins', tb[j]); j++; }
    else { push('del', ta[i]); i++; }
  }
  const inner = parts.map(({ type, text }) => (
    type === 'eq' ? escapeHtml(text)
      : type === 'ins' ? `<ins class="sd-rv-ins">${escapeHtml(text)}</ins>`
        : `<del class="sd-rv-del">${escapeHtml(text)}</del>`
  )).join('');
  return { html: `<${n.tagName.toLowerCase()}>${inner}</${n.tagName.toLowerCase()}>` };
};

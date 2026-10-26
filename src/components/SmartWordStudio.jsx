import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { fileToBase64, Modal } from './ui';
import { hasChanges as docHasChanges } from './reviewDiff';
import { PrePublishReviewPromptModal } from './PrePublishReviewPromptModal';
import { SendForReviewModal } from './SendForReviewModal';
import { printWordDocument } from '../utils/wordPrintEngine';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Table as TableIcon, Type, Calendar, Hash, CheckSquare, ChevronDown,
  PenTool, FileText, CheckCircle2, X, Plus, Trash2, ArrowLeft, ArrowRight, Settings,
  ShieldCheck, UploadCloud, Folder, Sparkles, AlertCircle, ArrowUp, ArrowDown,
  Layers, Palette, Layout, MousePointerClick, HelpCircle, Undo2, Redo2, Eye, Columns2, SquarePen,
  Send, UserCheck, MessageSquare, GitCommit, Edit3, Check, AlertTriangle,
  Minus, Image as ImageIcon, Link as LinkIcon, Tag, Info, Printer, Loader2, FileEdit,
  Baseline, Highlighter
} from 'lucide-react';

const FONTS = [
  { name: 'Calibri', value: 'Calibri, sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { name: 'Roboto', value: 'Roboto, sans-serif' }
];

const FONT_SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '22pt', '28pt'];
const GOOGLE_DOCS_FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];

// Text and Highlight Color Palettes
const TEXT_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark Slate', value: '#1e293b' },
  { name: 'Charcoal', value: '#374151' },
  { name: 'Slate Gray', value: '#64748b' },
  { name: 'Cool Gray', value: '#9ca3af' },
  { name: 'Pure White', value: '#ffffff' },

  { name: 'Crimson Red', value: '#dc2626' },
  { name: 'Ruby Dark', value: '#991b1b' },
  { name: 'Coral Orange', value: '#ea580c' },
  { name: 'Amber Gold', value: '#d97706' },
  { name: 'Warm Yellow', value: '#ca8a04' },
  { name: 'Electric Lime', value: '#a4fb4f' },

  { name: 'Forest Green', value: '#15803d' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Sky Blue', value: '#0284c7' },
  { name: 'Royal Blue', value: '#2563eb' },

  { name: 'Navy Blue', value: '#1e3a8a' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Deep Purple', value: '#7c3aed' },
  { name: 'Violet', value: '#9333ea' },
  { name: 'Berry Magenta', value: '#c026d3' },
  { name: 'Hot Pink', value: '#db2777' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow (Classic)', value: '#fef08a' },
  { name: 'Electric Lime', value: '#a4fb4f' },
  { name: 'Bright Mint', value: '#86efac' },
  { name: 'Cyan Light', value: '#67e8f9' },
  { name: 'Sky Blue', value: '#93c5fd' },
  { name: 'Neon Pink', value: '#f472b6' },

  { name: 'Soft Peach', value: '#fed7aa' },
  { name: 'Warm Amber', value: '#fcd34d' },
  { name: 'Lavender', value: '#c4b5fd' },
  { name: 'Pastel Rose', value: '#fca5a5' },
  { name: 'Aquamarine', value: '#5eead4' },
  { name: 'Soft Lilac', value: '#e9d5ff' },

  { name: 'Light Gray', value: '#e2e8f0' },
  { name: 'Medium Slate', value: '#94a3b8' },
  { name: 'Charcoal Dark', value: '#475569' },
  { name: 'Dark Teal', value: '#115e59' },
  { name: 'Dark Navy', value: '#1e3a8a' },
  { name: 'Dark Wine', value: '#831843' },
];

const SYSTEM_TAGS_LIST = ['Form ID', 'Submitted By', 'Submitted Date', 'Version', 'Department'];

// Allowed field widths (percent of the form row when a user fills the form)
const WIDTH_OPTIONS = [25, 33, 50, 66, 75, 100];

const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fieldIcon = (type) => type === 'date' ? '📅' : type === 'number' ? '🔢' : type === 'textarea' ? '📝' : type === 'dropdown' ? '🔽' : type === 'checkbox' ? '☑️' : '✏️';

const REMOVE_BTN_HTML = '<span class="sd-doc-pill-remove" data-remove="1" title="Remove this element">×</span>';

const pillInnerHtml = (label, type, required, mode = 'placeholder', bold = false) => `
  <span class="sd-doc-pill-icon">${fieldIcon(type)}</span>
  <span class="sd-doc-pill-label" style="${bold ? 'font-weight: 700;' : ''}">{{${esc(label)}}}</span>
  ${bold ? '<span class="sd-doc-pill-tag req" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);">Bold</span>' : ''}
  <span class="sd-doc-pill-tag ${required ? 'req' : 'opt'}">${required ? '* Required' : 'Optional'}</span>
  ${REMOVE_BTN_HTML}
`;

const sigInnerHtml = (slot) => {
  const isSubmitter = String(slot).toLowerCase() === 'submitter';
  return `
    <div class="sd-doc-sig-head">
      <span class="sd-doc-sig-icon">✍️</span>
      <span class="sd-doc-sig-title">${esc(isSubmitter ? 'Applicant Signature' : `${slot} Approval Signature`)}</span>
      ${REMOVE_BTN_HTML}
    </div>
    <div class="sd-doc-sig-body">
      <span class="sd-doc-sig-hint">${isSubmitter ? 'Stamped upon submission' : `Department Authorized Signatory · ${esc(slot)}`}</span>
    </div>
  `;
};

const systemTagInnerHtml = (name) => `🏷️ {{${esc(name)}}}${REMOVE_BTN_HTML}`;

// Convert stored template raw HTML (with {{field_key}}, {{Signature: ...}}, and {{System Tag}}) into studio interactive pills
const convertRawHtmlToStudio = (rawHtml, existingFields = []) => {
  let docHtml = rawHtml || '';
  const fieldsMap = new Map();
  (existingFields || []).forEach(f => {
    if (!f) return;
    if (f.key) fieldsMap.set(String(f.key).toLowerCase(), f);
    if (f.label) fieldsMap.set(String(f.label).toLowerCase(), f);
  });

  // Signature slots
  docHtml = docHtml.replace(/\{\{\s*(?:Signature|sig)\s*:\s*([^}]+)\}\}/gi, (match, slot) => {
    const s = slot.trim();
    return `<div class="sd-doc-sig-block" data-sig-slot="${esc(s)}" contenteditable="false">${sigInnerHtml(s)}</div>`;
  });

  // System tags
  for (const st of SYSTEM_TAGS_LIST) {
    const re = new RegExp(`\\{\\{\\s*${st}\\s*\\}\\}`, 'gi');
    docHtml = docHtml.replace(re, `<span class="sd-doc-system-tag" data-sys-tag="${esc(st)}" contenteditable="false">${systemTagInnerHtml(st)}</span>`);
  }

  // Strip wrapping <strong>/<b> around field placeholders so pills don't inherit nested tags
  docHtml = docHtml.replace(/<(strong|b)[^>]*>\s*(\{\{\s*[^}]+\}\})\s*<\/\1>/gi, '$2');

  // Field placeholders {{field_key}}
  docHtml = docHtml.replace(/\{\{\s*([^}]+)\}\}/g, (match, fieldName) => {
    const fn = fieldName.trim();
    if (SYSTEM_TAGS_LIST.some(st => st.toLowerCase() === fn.toLowerCase())) return match;
    const f = fieldsMap.get(fn.toLowerCase()) || {
      key: fn,
      label: fn,
      type: 'text',
      mode: 'placeholder',
      bold: false,
      required: true,
      placeholder: '',
      description: '',
      options: [],
      width: null
    };
    const mode = f.mode || 'placeholder';
    const isPh = mode === 'placeholder';
    const isBold = !!(f.bold || f.isBold);
    const widthAttr = f.width ? ` data-width="${f.width}" style="width: ${f.width === 100 ? '100%' : `calc(${f.width}% - 8px)`}; box-sizing: border-box;"` : '';
    return `<span class="sd-doc-field-pill${isPh ? ' is-placeholder' : ''}${isBold ? ' is-bold' : ''}" data-field-key="${esc(f.key)}" data-field-label="${esc(f.label)}" data-field-type="${f.type}" data-field-mode="${mode}" data-field-bold="${isBold ? 'true' : 'false'}" data-required="${f.required}" data-placeholder="${esc(f.placeholder || '')}" data-description="${esc(f.description || '')}" data-options='${JSON.stringify(f.options || [])}'${widthAttr} contenteditable="false">${pillInnerHtml(f.label, f.type, f.required, mode, isBold)}</span>`;
  });

  return docHtml;
};

// Reflect the chosen width on the in-document field pill (0 / empty = auto)
const applyPillWidth = (el, width) => {
  const w = parseInt(width, 10);
  if (w > 0) {
    el.setAttribute('data-width', String(w));
    el.style.width = w === 100 ? '100%' : `calc(${w}% - 8px)`;
    el.style.boxSizing = 'border-box';
  } else {
    el.removeAttribute('data-width');
    el.style.width = '';
  }
};

// ---------- Word-style table helpers (operate directly on the live DOM table) ----------
const NO_TABLE_CTX = { inTable: false, canMerge: false, canSplit: false };

// Remove editor-only UI state (cell selection highlight, image selection outlines) so it never reaches history/publish/preview
const stripEditorState = (root) => {
  if (!root) return;
  root.querySelectorAll('.sd-cell-selected').forEach(c => {
    c.classList.remove('sd-cell-selected');
    if (!c.getAttribute('class')) c.removeAttribute('class');
  });
  root.querySelectorAll('.sd-doc-image-wrap.is-selected').forEach(w => {
    w.classList.remove('is-selected');
    if (!w.getAttribute('class')) w.removeAttribute('class');
  });
  root.querySelectorAll('.sd-doc-image.is-selected').forEach(img => {
    img.classList.remove('is-selected');
    if (!img.getAttribute('class')) img.removeAttribute('class');
  });
};

const getCleanEditorHtml = (el) => {
  if (!el) return '';
  const clone = el.cloneNode(true);
  stripEditorState(clone);
  return clone.innerHTML;
};

// Virtual grid of a table: grid[r][c] is the cell covering that slot (spanned cells repeat).
// grid.pos maps each cell to its origin { r, c }.
const buildTableGrid = (table) => {
  const grid = [];
  grid.pos = new Map();
  Array.from(table.rows).forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.cells).forEach(cell => {
      while (grid[r][c]) c++;
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      grid.pos.set(cell, { r, c });
      for (let i = 0; i < rs; i++) {
        grid[r + i] = grid[r + i] || [];
        for (let j = 0; j < cs; j++) grid[r + i][c + j] = cell;
      }
      c += cs;
    });
  });
  return grid;
};

const cellsInRange = (grid, { r1, c1, r2, c2 }) => {
  const set = new Set();
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) if (grid[r]?.[c]) set.add(grid[r][c]);
  }
  return Array.from(set);
};

// Grow a rectangle until no merged cell is cut in half (same rule as Word)
const expandRange = (grid, rng) => {
  let { r1, c1, r2, c2 } = rng;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = grid[r]?.[c];
        const p = cell && grid.pos.get(cell);
        if (!p) continue;
        const bottom = p.r + (cell.rowSpan || 1) - 1;
        const right = p.c + (cell.colSpan || 1) - 1;
        if (p.r < r1) { r1 = p.r; changed = true; }
        if (p.c < c1) { c1 = p.c; changed = true; }
        if (bottom > r2) { r2 = bottom; changed = true; }
        if (right > c2) { c2 = right; changed = true; }
      }
    }
  }
  return { r1, c1, r2, c2 };
};

const applyCellBorder = (cell, on) => {
  if (on) {
    cell.style.border = '1px solid #cbd5e1';
    cell.removeAttribute('data-borderless');
  } else {
    cell.style.border = 'none';
    cell.setAttribute('data-borderless', '1');
  }
};

const makeCell = (table) => {
  const td = document.createElement('td');
  applyCellBorder(td, !table?.querySelector('td[data-borderless]'));
  td.style.padding = '6px 8px';
  td.style.verticalAlign = 'top';
  td.innerHTML = '<br/>';
  return td;
};

const insertCellAtCol = (tr, newCell, col, grid) => {
  const ref = Array.from(tr.cells).find(c => {
    const p = grid.pos.get(c);
    return p && p.c >= col;
  });
  if (ref) tr.insertBefore(newCell, ref); else tr.appendChild(newCell);
};

// Column widths as % of the table (colspans get the sum of the columns they cover)
const applyColumnWidths = (table, widths) => {
  const grid = buildTableGrid(table);
  const sum = widths.reduce((a, b) => a + b, 0) || 1;
  grid.pos.forEach((p, cell) => {
    let w = 0;
    for (let i = 0; i < (cell.colSpan || 1); i++) w += widths[p.c + i] || 0;
    cell.style.width = `${((w / sum) * 100).toFixed(2)}%`;
  });
  table.style.tableLayout = 'fixed';
  if (!table.style.width) table.style.width = '100%';
};

const equalizeColumns = (table) => {
  const cols = buildTableGrid(table)[0]?.length || 1;
  applyColumnWidths(table, new Array(cols).fill(1));
};

// Current rendered column widths (px) so structural edits can keep manual resizing
const measureColumns = (table) => {
  const grid = buildTableGrid(table);
  const cols = grid[0]?.length || 0;
  const widths = new Array(cols).fill(null);
  grid.pos.forEach((p, cell) => {
    if ((cell.colSpan || 1) === 1 && widths[p.c] == null) widths[p.c] = cell.getBoundingClientRect().width;
  });
  const known = widths.filter(w => w != null);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : (table.getBoundingClientRect().width / Math.max(cols, 1)) || 100;
  return widths.map(w => (w == null ? fallback : w));
};

const createTableElement = (rows, cols) => {
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.margin = '8px 0';
  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) tr.appendChild(makeCell(null));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  equalizeColumns(table);
  return table;
};

const insertRowAt = (table, index) => {
  const grid = buildTableGrid(table);
  const cols = grid[0]?.length || 1;
  const tr = document.createElement('tr');
  const handled = new Set();
  for (let c = 0; c < cols; c++) {
    const above = index > 0 ? grid[index - 1]?.[c] : null;
    const below = index < grid.length ? grid[index]?.[c] : null;
    if (above && below && above === below) {
      if (!handled.has(above)) { above.rowSpan = (above.rowSpan || 1) + 1; handled.add(above); }
    } else {
      tr.appendChild(makeCell(table));
    }
  }
  const ref = table.rows[index];
  if (ref) ref.parentNode.insertBefore(tr, ref);
  else table.rows[table.rows.length - 1].parentNode.appendChild(tr);
};

const insertColAt = (table, index) => {
  const grid = buildTableGrid(table);
  const handled = new Set();
  grid.forEach((row, r) => {
    const left = index > 0 ? row[index - 1] : null;
    const right = row[index];
    if (left && right && left === right) {
      if (!handled.has(left)) { left.colSpan = (left.colSpan || 1) + 1; handled.add(left); }
    } else {
      insertCellAtCol(table.rows[r], makeCell(table), index, grid);
    }
  });
};

const deleteRowAt = (table, r) => {
  const grid = buildTableGrid(table);
  const tr = table.rows[r];
  const seen = new Set();
  (grid[r] || []).forEach(cell => {
    if (!cell || seen.has(cell)) return;
    seen.add(cell);
    if ((cell.rowSpan || 1) > 1) {
      cell.rowSpan = (cell.rowSpan || 1) - 1;
      if (cell.parentNode === tr && table.rows[r + 1]) {
        // the spanning cell starts here: hand it down to the next row
        insertCellAtCol(table.rows[r + 1], cell, grid.pos.get(cell).c + 1, grid);
      }
    }
  });
  tr.remove();
};

const deleteColAt = (table, c) => {
  const grid = buildTableGrid(table);
  const seen = new Set();
  grid.forEach(row => {
    const cell = row[c];
    if (!cell || seen.has(cell)) return;
    seen.add(cell);
    if ((cell.colSpan || 1) > 1) cell.colSpan = (cell.colSpan || 1) - 1;
    else cell.remove();
  });
};

const cellHasContent = (cell) => !!(cell.textContent.trim() || cell.querySelector('.sd-doc-field-pill, .sd-doc-sig-block, .sd-doc-system-tag, table, img'));

const mergeRange = (table, rng) => {
  const grid = buildTableGrid(table);
  const { r1, c1, r2, c2 } = expandRange(grid, rng);
  const first = grid[r1][c1];
  const seen = new Set([first]);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = grid[r][c];
      if (!cell || seen.has(cell)) continue;
      seen.add(cell);
      if (cellHasContent(cell)) {
        if (cellHasContent(first)) first.appendChild(document.createElement('br'));
        else first.innerHTML = '';
        while (cell.firstChild) first.appendChild(cell.firstChild);
      }
      cell.remove();
    }
  }
  first.rowSpan = r2 - r1 + 1;
  first.colSpan = c2 - c1 + 1;
  if (!first.firstChild) first.innerHTML = '<br/>';
  return first;
};

const splitCell = (table, cell) => {
  const grid = buildTableGrid(table);
  const pos = grid.pos.get(cell);
  const rs = cell.rowSpan || 1;
  const cs = cell.colSpan || 1;
  if (!pos || (rs === 1 && cs === 1)) return;
  cell.removeAttribute('rowspan');
  cell.removeAttribute('colspan');
  for (let i = 0; i < rs; i++) {
    for (let j = 0; j < cs; j++) {
      if (i === 0 && j === 0) continue;
      insertCellAtCol(table.rows[pos.r + i], makeCell(table), pos.c + j, grid);
    }
  }
};

// Table insert picker (hover a grid of squares, like Word's Insert Table)
const PICKER_ROWS = 8;
const PICKER_COLS = 10;
const TableGridPicker = ({ x, y, onPick, onClose }) => {
  const [hover, setHover] = useState({ r: 0, c: 0 });
  return (
    <>
      <div className="sd-tblpick-backdrop" onClick={onClose} />
      <div
        className="sd-tblpick"
        role="dialog"
        aria-label="Insert table"
        style={{ left: x, top: y }}
        onMouseDown={e => e.preventDefault()}
      >
        <div className="sd-tblpick-title">{hover.r > 0 ? `${hover.c} × ${hover.r} Table` : 'Insert Table'}</div>
        <div className="sd-tblpick-grid" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
          {Array.from({ length: PICKER_ROWS }, (_, r) => Array.from({ length: PICKER_COLS }, (_, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              className={`sd-tblpick-cell ${r < hover.r && c < hover.c ? 'on' : ''}`}
              aria-label={`${c + 1} columns by ${r + 1} rows`}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onClick={() => onPick(r + 1, c + 1)}
            />
          )))}
        </div>
      </div>
    </>
  );
};

// Read a field pill's configuration from its data-* attributes
const readPillConfig = (pill) => {
  const key = (pill.getAttribute('data-field-key') || 'field').trim();
  let options = [];
  try {
    options = JSON.parse(pill.getAttribute('data-options') || '[]');
  } catch { options = []; }
  return {
    key,
    label: (pill.getAttribute('data-field-label') || key).trim(),
    type: pill.getAttribute('data-field-type') || 'text',
    mode: pill.getAttribute('data-field-mode') || 'input',
    bold: pill.getAttribute('data-field-bold') === 'true',
    required: pill.getAttribute('data-required') !== 'false',
    placeholder: (pill.getAttribute('data-placeholder') || '').trim(),
    description: (pill.getAttribute('data-description') || '').trim(),
    options,
    width: parseInt(pill.getAttribute('data-width'), 10) || null
  };
};

// Native input markup for a field inside the document preview (interactive, never submitted)
const previewInputHtml = (f) => {
  const ph = `placeholder="${esc(f.placeholder)}"`;
  if (f.type === 'textarea') return `<textarea rows="3" class="sd-input" ${ph}></textarea>`;
  if (f.type === 'date') return '<input type="date" class="sd-input" />';
  if (f.type === 'number') return `<input type="number" step="any" class="sd-input" ${ph} />`;
  if (f.type === 'dropdown' || f.type === 'select') {
    const opts = (f.options || []).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    return `<select class="sd-input"><option value="">-- Select an option --</option>${opts}</select>`;
  }
  if (f.type === 'checkbox') {
    return `<label class="sd-pv-check"><input type="checkbox" /> <span>${esc(f.placeholder || f.label || 'Confirm')}</span></label>`;
  }
  return `<input type="text" class="sd-input" ${ph} />`;
};

// Turn the editor content into what a user would see: text stays as-is, widgets become live controls
const buildPreviewHtml = (editorEl) => {
  const clone = editorEl.cloneNode(true);
  stripEditorState(clone);

  clone.querySelectorAll('.sd-doc-field-pill').forEach(pill => {
    const f = readPillConfig(pill);
    const wrap = document.createElement('span');
    const isDirectInput = f.mode === 'input' && (f.width || f.type === 'textarea');
    if (!isDirectInput) {
      wrap.className = `sd-pv-placeholder-tag ${f.bold ? 'is-bold' : ''}`;
      wrap.title = `${f.label || f.key}${f.required ? ' (Required)' : ''}`;
      if (f.bold) wrap.style.fontWeight = '700';
      wrap.innerHTML = `<span class="sd-ph-brace">{{</span><span class="sd-ph-tag-title ${f.bold ? 'is-bold' : ''}">${esc(f.label || f.key)}</span>${f.required ? '<span class="sd-ph-star">*</span>' : ''}<span class="sd-ph-brace">}}</span>`;
    } else {
      wrap.className = `sd-pv-field${f.type === 'textarea' || f.width === 100 ? ' is-block' : ''}`;
      if (f.width) wrap.style.width = f.width === 100 ? '100%' : `calc(${f.width}% - 8px)`;
      wrap.innerHTML = `<span class="sd-pv-label">${esc(f.label)}${f.required ? '<span class="sd-required"> *</span>' : ''}</span>${previewInputHtml(f)}`;
    }
    pill.replaceWith(wrap);
  });

  clone.querySelectorAll('.sd-doc-sig-block').forEach(sig => {
    const slot = (sig.getAttribute('data-sig-slot') || 'Submitter').trim();
    const isSubmitter = slot.toLowerCase() === 'submitter';
    const box = document.createElement('div');
    box.className = 'sd-pv-sig';
    box.innerHTML = `<strong>${esc(isSubmitter ? 'Applicant signature' : `${slot} approval signature`)}</strong><span>${isSubmitter ? 'Saved signature is stamped on submit' : `Added when ${esc(slot)} approves`}</span>`;
    sig.replaceWith(box);
  });

  clone.querySelectorAll('.sd-doc-system-tag').forEach(tag => {
    const span = document.createElement('span');
    span.className = 'sd-pv-sys';
    span.textContent = `[${(tag.getAttribute('data-sys-tag') || 'Auto').trim()}]`;
    tag.replaceWith(span);
  });

  return clone.innerHTML;
};

// Live preview of the document as a user will see it when filling it in
const FormPreviewPane = ({ html, title, department, workflow, margins, fontFamily, fontSize }) => (
  <aside className="sd-studio-preview-scroll" aria-label="Live form preview">
    <div className="sd-pv-head">
      <span className="sd-badge sd-badge-accent"><Eye size={11} /> Live preview — as users will fill it</span>
      <span className="sd-muted">{title || 'Untitled form'} · {department}</span>
    </div>

    <div className={`sd-word-page-sheet sd-pv-sheet margins-${margins}`} style={{ fontFamily, fontSize }}>
      <div
        className="sd-word-editor-body sd-pv-doc"
        style={{ fontFamily, fontSize }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>

    <div className="sd-pv-foot">
      <div className="sd-preview-chain">
        {['Applicant', ...normalizeWorkflowSteps(workflow)].map((step, i) => (
          <span key={`${step}-${i}`} className="sd-preview-step">{i + 1}. {step}</span>
        ))}
      </div>
      <div className="sd-preview-actions">
        <button type="button" className="btn btn-primary" disabled>Sign &amp; submit</button>
        <span className="sd-muted">Preview only — nothing is submitted</span>
      </div>
    </div>
  </aside>
);

// Safely normalize workflow entries to an array of clean department name strings
const normalizeWorkflowSteps = (wf) => {
  if (!Array.isArray(wf)) return [];
  return wf.map(step => {
    if (!step) return '';
    if (typeof step === 'string') return step.trim();
    if (typeof step === 'object') return (step.department || step.name || '').trim();
    return String(step).trim();
  }).filter(Boolean);
};

// Image Insert Dialog (Upload or Web URL)
const ImageInsertDialog = ({ isOpen, onClose, onInsert, addToast }) => {
  const [tab, setTab] = useState('upload'); // 'upload' | 'url'
  const [fileData, setFileData] = useState(null); // base64
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState(false);
  const [width, setWidth] = useState(50);
  const [align, setAlign] = useState('center');
  const [alt, setAlt] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast?.('Invalid File', 'Please select an image file (PNG, JPG, SVG, WebP, GIF)', 'error');
      return;
    }
    fileToBase64(file).then(base64 => {
      setFileData(base64);
      setFileName(file.name);
      setFileSize((file.size / 1024).toFixed(1) + ' KB');
      if (!alt) setAlt(file.name.replace(/\.[^.]+$/, ''));
    }).catch(() => {
      addToast?.('Error', 'Failed to read image file', 'error');
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const activeSrc = tab === 'upload' ? fileData : (url.trim() || null);
  const canInsert = !!activeSrc && (tab !== 'url' || !urlError);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!canInsert) return;
    onInsert({
      src: activeSrc,
      alt: alt.trim(),
      width,
      align
    });
  };

  return (
    <Modal
      title="Insert Image"
      subtitle="Embed images, logos, graphics, and diagrams into your Word template"
      onClose={onClose}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canInsert}
            onClick={handleSubmit}
          >
            Insert Image
          </button>
        </div>
      }
    >
      <div className="sd-image-insert-dialog">
        <div className="sd-img-tabs">
          <button
            type="button"
            className={`sd-img-tab ${tab === 'upload' ? 'is-active' : ''}`}
            onClick={() => setTab('upload')}
          >
            <UploadCloud size={14} /> Upload from Computer
          </button>
          <button
            type="button"
            className={`sd-img-tab ${tab === 'url' ? 'is-active' : ''}`}
            onClick={() => setTab('url')}
          >
            <LinkIcon size={14} /> Web Image URL
          </button>
        </div>

        {tab === 'upload' && (
          <div className="sd-img-tab-content">
            {!fileData ? (
              <div
                className={`sd-dropzone ${isDragging ? 'is-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '36px 20px' }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <UploadCloud size={32} style={{ color: 'var(--primary-500)' }} />
                <strong>Click to browse or drag & drop image here</strong>
                <span>Supports PNG, JPG, JPEG, SVG, WebP, GIF</span>
              </div>
            ) : (
              <div className="sd-img-preview-box">
                <div className="sd-img-preview-thumb">
                  <img src={fileData} alt="Preview" />
                </div>
                <div className="sd-img-preview-meta">
                  <strong>{fileName}</strong>
                  <span>{fileSize}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    style={{ marginTop: 6 }}
                    onClick={() => { setFileData(null); setFileName(''); setFileSize(''); }}
                  >
                    Change Image
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'url' && (
          <div className="sd-img-tab-content">
            <label className="sd-field-label">
              <span>Image Address (URL)</span>
              <input
                type="url"
                className="input input-sm"
                placeholder="https://example.com/images/company-logo.png"
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setUrlError(false);
                }}
                autoFocus
              />
            </label>
            {url.trim() && (
              <div className="sd-img-preview-box" style={{ marginTop: 8 }}>
                <div className="sd-img-preview-thumb">
                  <img
                    src={url}
                    alt="Preview"
                    onError={() => setUrlError(true)}
                    onLoad={() => setUrlError(false)}
                  />
                </div>
                <div className="sd-img-preview-meta">
                  {urlError ? (
                    <span style={{ color: '#ef4444', fontSize: '0.82rem' }}>
                      ⚠️ Unable to load image from this URL. Please verify the link.
                    </span>
                  ) : (
                    <span style={{ color: 'var(--primary-500)', fontSize: '0.82rem', fontWeight: 600 }}>
                      ✓ Image preview loaded successfully
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="sd-img-settings-grid">
          <div className="sd-img-setting-col">
            <label className="sd-field-label">Display Width</label>
            <div className="sd-btn-group-row">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  className={`btn btn-xs ${width === pct ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setWidth(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="sd-img-setting-col">
            <label className="sd-field-label">Alignment</label>
            <div className="sd-btn-group-row">
              {[
                { id: 'left', label: 'Left', icon: AlignLeft },
                { id: 'center', label: 'Center', icon: AlignCenter },
                { id: 'right', label: 'Right', icon: AlignRight }
              ].map(al => {
                const Icon = al.icon;
                return (
                  <button
                    key={al.id}
                    type="button"
                    className={`btn btn-xs ${align === al.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setAlign(al.id)}
                  >
                    <Icon size={12} style={{ marginRight: 4 }} /> {al.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <label className="sd-field-label" style={{ marginTop: 8 }}>
          <span>Caption / Alt Text (optional)</span>
          <input
            type="text"
            className="input input-sm"
            placeholder="e.g. Official Department Seal"
            value={alt}
            onChange={e => setAlt(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
};

// Modes:
//  - normal:            admin designs a form (publish, or send it for review)
//  - reviewSession:     a reviewer edits their own copy of someone else's draft and submits it
//  - resume:            the initiator continues from the merged result of a finished review
export const SmartWordStudio = ({
  onClose,
  initialDepartment,
  initialFolderId,
  initialDocxFile,
  reviewSession,
  resume,
  templateToEdit
}) => {
  const {
    currentUser, isSuperAdmin, departments, folders, formTemplates,
    createTemplate, updateTemplate, addTemplateComment, updateTemplateComment,
    submitReview, startReview, addToast
  } = useApp();
  const isReviewer = !!reviewSession;
  const seed = resume?.settings || null;
  const targetTemplateId = templateToEdit?.id || resume?.templateId || seed?.templateId || null;
  const targetTemplate = useMemo(() => {
    if (templateToEdit) return templateToEdit;
    if (targetTemplateId) {
      const found = (formTemplates || []).find(t => t.id === targetTemplateId);
      if (found) return found;
    }
    if (resume) {
      const matchTitle = (seed?.title || '').trim().toLowerCase();
      const matchDept = seed?.department;
      if (matchTitle) {
        return (formTemplates || []).find(t => t.department === matchDept && t.title?.trim().toLowerCase() === matchTitle) || null;
      }
    }
    return null;
  }, [templateToEdit, targetTemplateId, resume, seed, formTemplates]);
  const isEditingExisting = !!targetTemplate || !!targetTemplateId;

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const canvasLayoutRef = useRef(null);
  const fontSizeDropdownRef = useRef(null);
  const textColorDropdownRef = useRef(null);
  const highlightDropdownRef = useRef(null);

  // Editor formatting state
  const [fontFamily, setFontFamily] = useState(() => targetTemplate?.fontFamily || seed?.fontFamily || FONTS[0].value);
  const [fontSize, setFontSize] = useState(() => targetTemplate?.fontSize || seed?.fontSize || '11pt');
  const [fontSizeDisplay, setFontSizeDisplay] = useState(() => parseInt(targetTemplate?.fontSize || seed?.fontSize || '11', 10) || 11);
  const [fontSizeInput, setFontSizeInput] = useState(() => String(parseInt(targetTemplate?.fontSize || seed?.fontSize || '11', 10) || 11));
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);

  // Text color & Highlight color state
  const [textColor, setTextColor] = useState('#000000');
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#fef08a');
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);

  // Image insertion and interactive floating toolbar
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageEl, setSelectedImageEl] = useState(null); // { wrap, img }
  const [imageToolbarPos, setImageToolbarPos] = useState(null); // { top, left }
  const [margins, setMargins] = useState('normal'); // 'normal' | 'narrow' | 'wide'
  const [pageSize, setPageSize] = useState('A4'); // 'A4' | 'letter'
  const [orientation, setOrientation] = useState('portrait');

  // ---- Undo / Redo (snapshot history of the editor HTML) ----
  // Native contentEditable undo cannot track our programmatic inserts/removals, so we keep our own stack.
  const historyRef = useRef({ stack: [], index: -1 });
  const typingTimerRef = useRef(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  // ---- Live preview (data derived from the fields/signatures currently in the document) ----
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'split' | 'preview'
  const [previewHtml, setPreviewHtml] = useState('');

  const refreshPreview = () => {
    const el = editorRef.current;
    if (!el) return;
    setPreviewHtml(buildPreviewHtml(el));
  };

  const syncHistoryState = () => {
    const h = historyRef.current;
    setHistoryState({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    refreshPreview();
  };

  const pushHistory = () => {
    const el = editorRef.current;
    if (!el) return;
    const h = historyRef.current;
    const html = getCleanEditorHtml(el);
    if (h.stack[h.index] === html) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(html);
    if (h.stack.length > 100) h.stack.shift();
    h.index = h.stack.length - 1;
    syncHistoryState();
  };

  const flushTyping = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    pushHistory();
  };

  const handleEditorInput = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null;
      pushHistory();
    }, 400);
  };

  const restoreHistory = (index) => {
    const el = editorRef.current;
    const h = historyRef.current;
    if (!el || index < 0 || index >= h.stack.length) return;
    h.index = index;
    el.innerHTML = h.stack[index];
    savedRangeRef.current = null;
    cellRangeRef.current = null;
    setTableCtx(NO_TABLE_CTX);
    setActiveFieldEdit(null);
    setActiveSigEdit(null);
    setShowTextColorPicker(false);
    setShowHighlightPicker(false);
    syncHistoryState();
    el.focus();
  };

  const handleUndo = () => {
    flushTyping();
    const h = historyRef.current;
    if (h.index > 0) restoreHistory(h.index - 1);
  };

  const handleRedo = () => {
    flushTyping();
    const h = historyRef.current;
    if (h.index < h.stack.length - 1) restoreHistory(h.index + 1);
  };

  // ---- Word-style table tools ----
  const [tableCtx, setTableCtx] = useState(NO_TABLE_CTX);
  const [tablePicker, setTablePicker] = useState(null); // { x, y } while the insert-table grid is open
  const cellRangeRef = useRef(null); // { table, r1, c1, r2, c2 } while a range of cells is selected
  const dragStartRef = useRef(null);
  const resizeHoverRef = useRef(null);
  const resizeRef = useRef(null);

  const clearCellSelection = () => {
    const ed = editorRef.current;
    if (ed) {
      stripEditorState(ed);
      ed.classList.remove('sd-cell-dragging');
    }
    cellRangeRef.current = null;
  };

  // The cell the caret is in (or the top-left cell of the selected range)
  const getActiveCell = () => {
    const range = cellRangeRef.current;
    if (range) return buildTableGrid(range.table)[range.r1]?.[range.c1] || null;
    const sel = window.getSelection();
    const node = sel && sel.rangeCount && editorRef.current?.contains(sel.anchorNode)
      ? sel.anchorNode
      : savedRangeRef.current?.startContainer;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const cell = el?.closest?.('td, th');
    return cell && editorRef.current?.contains(cell) ? cell : null;
  };

  const updateTableContext = () => {
    const cell = getActiveCell();
    const r = cellRangeRef.current;
    const next = {
      inTable: !!cell,
      canMerge: !!r && (r.r2 > r.r1 || r.c2 > r.c1),
      canSplit: !!cell && ((cell.rowSpan || 1) > 1 || (cell.colSpan || 1) > 1)
    };
    setTableCtx(prev => (
      prev.inTable === next.inTable && prev.canMerge === next.canMerge && prev.canSplit === next.canSplit ? prev : next
    ));
  };

  const getActiveFontSizePt = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return null;
    const node = sel.anchorNode;
    if (!node || !editorRef.current.contains(node)) return null;

    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return null;

    const styledEl = el.closest('[style*="font-size"]');
    if (styledEl && styledEl.style?.fontSize) {
      const fs = styledEl.style.fontSize;
      if (fs.endsWith('pt')) {
        const p = parseInt(fs, 10);
        if (!isNaN(p) && p > 0) return p;
      }
    }

    try {
      const comp = window.getComputedStyle(el).fontSize;
      if (comp) {
        const px = parseFloat(comp);
        if (!isNaN(px) && px > 0) {
          return Math.round(px * 0.75);
        }
      }
    } catch {}
    return null;
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editorRef.current && editorRef.current.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      const activePt = getActiveFontSizePt();
      if (activePt) {
        setFontSizeDisplay(activePt);
        if (document.activeElement !== document.querySelector('.sd-gdoc-fs-input')) {
          setFontSizeInput(String(activePt));
        }
      }
    }
    updateTableContext();
  };

  const placeCaret = (el) => {
    const ed = editorRef.current;
    if (!ed || !el) return;
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const selectCellRange = (table, a, b) => {
    const grid = buildTableGrid(table);
    const pa = grid.pos.get(a);
    const pb = grid.pos.get(b);
    if (!pa || !pb) return;
    const rng = expandRange(grid, {
      r1: Math.min(pa.r, pb.r),
      c1: Math.min(pa.c, pb.c),
      r2: Math.max(pa.r + (a.rowSpan || 1) - 1, pb.r + (b.rowSpan || 1) - 1),
      c2: Math.max(pa.c + (a.colSpan || 1) - 1, pb.c + (b.colSpan || 1) - 1)
    });
    stripEditorState(editorRef.current);
    cellsInRange(grid, rng).forEach(c => c.classList.add('sd-cell-selected'));
    editorRef.current.classList.add('sd-cell-dragging');
    cellRangeRef.current = { table, ...rng };
  };

  // Runs a structural/formatting table operation on the active table, then records history.
  // widths: 'keep' re-applies the column widths measured before the edit, 'equalize' redistributes, 'none' leaves them.
  const runTableOp = (fn, widths = 'keep') => {
    const cell = getActiveCell();
    if (!cell) return;
    const table = cell.closest('table');
    const before = widths === 'keep' ? measureColumns(table) : null;
    const result = fn(table, cell);
    clearCellSelection();
    if (table.isConnected) {
      if (before) applyColumnWidths(table, before);
      else if (widths === 'equalize') equalizeColumns(table);
    }
    pushHistory();
    if (result && result.isConnected) placeCaret(result);
    saveSelection();
  };

  const targetCells = () => {
    const r = cellRangeRef.current;
    if (r) return cellsInRange(buildTableGrid(r.table), r);
    const c = getActiveCell();
    return c ? [c] : [];
  };

  const handleTableInsertRow = (after) => runTableOp((t, c) => {
    const p = buildTableGrid(t).pos.get(c);
    insertRowAt(t, after ? p.r + (c.rowSpan || 1) : p.r);
    return c;
  });

  const handleTableInsertCol = (after) => runTableOp((t, c) => {
    const p = buildTableGrid(t).pos.get(c);
    insertColAt(t, after ? p.c + (c.colSpan || 1) : p.c);
    return c;
  }, 'equalize');

  const handleTableDeleteRow = () => runTableOp((t, c) => {
    const g = buildTableGrid(t);
    if (g.length <= 1) { t.remove(); return null; }
    const r = g.pos.get(c).r;
    deleteRowAt(t, r);
    return t.rows[Math.min(r, t.rows.length - 1)]?.cells[0];
  });

  const handleTableDeleteCol = () => runTableOp((t, c) => {
    const g = buildTableGrid(t);
    if ((g[0]?.length || 1) <= 1) { t.remove(); return null; }
    const p = g.pos.get(c);
    deleteColAt(t, p.c);
    const g2 = buildTableGrid(t);
    return g2[p.r]?.[Math.min(p.c, (g2[0]?.length || 1) - 1)];
  }, 'equalize');

  const handleTableDelete = () => runTableOp((t) => {
    t.remove();
    const ed = editorRef.current;
    if (ed && !ed.innerHTML.trim()) ed.innerHTML = '<p><br/></p>';
    return null;
  }, 'none');

  const handleTableMerge = () => runTableOp((t) => {
    const r = cellRangeRef.current;
    return r ? mergeRange(t, r) : null;
  });

  const handleTableSplit = () => runTableOp((t, c) => {
    splitCell(t, c);
    return c;
  });

  const handleTableCellStyle = (prop, value) => runTableOp((t, c) => {
    targetCells().forEach(cell => { cell.style[prop] = value; });
    return c;
  }, 'none');

  const handleTableBorders = (on) => runTableOp((t, c) => {
    Array.from(t.rows).forEach(row => Array.from(row.cells).forEach(cell => applyCellBorder(cell, on)));
    return c;
  }, 'none');

  const handleTableWidth = (full) => runTableOp((t, c) => {
    t.style.width = full ? '100%' : 'auto';
    return c;
  }, 'none');

  const handleTableEqualize = () => runTableOp((t, c) => {
    equalizeColumns(t);
    return c;
  }, 'none');

  // Column border dragging (Word-style resize): widths are kept as % so they follow page margins
  const startResize = (cell, startX) => {
    const table = cell.closest('table');
    const pos = buildTableGrid(table).pos.get(cell);
    if (!pos) return;
    const widths = measureColumns(table);
    applyColumnWidths(table, widths);
    resizeRef.current = { table, colIdx: pos.c + (cell.colSpan || 1) - 1, startX, widths };
    editorRef.current?.classList.add('sd-col-resizing');
  };

  const doResize = (x) => {
    const rs = resizeRef.current;
    if (!rs) return;
    const a = rs.widths[rs.colIdx];
    const b = rs.widths[rs.colIdx + 1];
    if (a == null || b == null) return;
    const MIN = 30;
    const newA = Math.min(Math.max(MIN, a + (x - rs.startX)), a + b - MIN);
    const next = rs.widths.slice();
    next[rs.colIdx] = newA;
    next[rs.colIdx + 1] = a + b - newA;
    applyColumnWidths(rs.table, next);
  };

  const endResize = () => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    editorRef.current?.classList.remove('sd-col-resizing');
    pushHistory();
  };

  const handleEditorMouseDown = (e) => {
    if (e.button !== 0) return;
    const hover = resizeHoverRef.current;
    if (hover) {
      e.preventDefault();
      startResize(hover, e.clientX);
      return;
    }
    const cell = e.target.closest?.('td, th');
    clearCellSelection();
    dragStartRef.current = cell && editorRef.current.contains(cell) ? cell : null;
  };

  const handleEditorMouseMove = (e) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (resizeRef.current) {
      if (e.buttons === 1) doResize(e.clientX); else endResize();
      return;
    }
    const cell = e.target.closest?.('td, th');
    if (e.buttons === 1) {
      // dragging: extend a cell-range selection across cells of the same table
      const start = dragStartRef.current;
      if (start && cell && cell.closest('table') === start.closest('table') && (cell !== start || cellRangeRef.current)) {
        selectCellRange(start.closest('table'), start, cell);
        window.getSelection()?.removeAllRanges();
      }
      return;
    }
    // hovering: show the resize cursor on a column border (not the last column's right edge)
    let hover = null;
    if (cell && ed.contains(cell) && Math.abs(e.clientX - cell.getBoundingClientRect().right) <= 4) {
      const g = buildTableGrid(cell.closest('table'));
      const p = g.pos.get(cell);
      if (p && p.c + (cell.colSpan || 1) < (g[0]?.length || 0)) hover = cell;
    }
    resizeHoverRef.current = hover;
    ed.classList.toggle('sd-col-resize', !!hover);
  };

  const handleEditorMouseUp = () => {
    dragStartRef.current = null;
    endResize();
    saveSelection();
  };

  const handleEditorKeyDown = (e) => {
    // Delete/Backspace on a selected image removes the image
    if (selectedImageEl?.wrap && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      selectedImageEl.wrap.remove();
      setSelectedImageEl(null);
      setImageToolbarPos(null);
      pushHistory();
      return;
    }

    const range = cellRangeRef.current;
    const activeCell = getActiveCell(); // read before a pending range is cleared

    // Delete/Backspace on a selected cell range clears the cells' content (like Word)
    if (range && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      cellsInRange(buildTableGrid(range.table), range).forEach(c => { c.innerHTML = '<br/>'; });
      clearCellSelection();
      pushHistory();
      updateTableContext();
      return;
    }
    if (range && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) && !(e.ctrlKey || e.metaKey)) {
      clearCellSelection();
    }

    // Tab / Shift+Tab move between cells; Tab in the last cell adds a row
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && activeCell) {
      e.preventDefault();
      const table = activeCell.closest('table');
      const cells = Array.from(table.rows).flatMap(r => Array.from(r.cells));
      const idx = cells.indexOf(activeCell) + (e.shiftKey ? -1 : 1);
      if (idx < 0) return;
      let target = cells[idx];
      if (!target) {
        insertRowAt(table, table.rows.length);
        target = table.rows[table.rows.length - 1].cells[0];
        pushHistory();
      }
      placeCaret(target);
      saveSelection();
      return;
    }

    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo(); else handleUndo();
    } else if (k === 'y') {
      e.preventDefault();
      handleRedo();
    }
  };

  // Tabs: 'home' | 'insert' | 'layout' | 'workflow'
  const [activeRibbonTab, setActiveRibbonTab] = useState('home');

  // The contextual Table Tools tab only exists while the caret/selection is inside a table
  useEffect(() => {
    if (!tableCtx.inTable && activeRibbonTab === 'table') setActiveRibbonTab('home');
  }, [tableCtx.inTable, activeRibbonTab]);

  // Metadata
  const [title, setTitle] = useState(targetTemplate?.title || reviewSession?.review?.title || seed?.title || '');
  const [description, setDescription] = useState(targetTemplate?.description || seed?.description || '');
  const [department, setDepartment] = useState(targetTemplate?.department || seed?.department || initialDepartment || currentUser?.department || departments[0]?.name || '');
  const [folderId, setFolderId] = useState(targetTemplate ? (targetTemplate.folderId || '') : (seed ? (seed.folderId || '') : (initialFolderId || '')));
  const [audience, setAudience] = useState(targetTemplate?.audience || seed?.audience || 'DEPARTMENT');
  const [defaultExpiryDays, setDefaultExpiryDays] = useState(targetTemplate?.defaultExpiryDays || seed?.defaultExpiryDays || 14);
  const [workflow, setWorkflow] = useState(() =>
    normalizeWorkflowSteps(targetTemplate?.workflow || reviewSession?.review?.workflow || seed?.workflow)
  );

  // Duplicate file check for current folder & department
  const duplicateConflict = useMemo(() => {
    if (!title.trim()) return null;
    const cleanT = title.trim().toLowerCase();
    const folderStr = String(folderId || '');
    const resolvedId = targetTemplate?.id || targetTemplateId;
    return (formTemplates || []).find(t => {
      if (resolvedId && t.id === resolvedId) return false;
      if (t.status === 'ARCHIVED') return false;
      if (t.department !== (department || currentUser?.department)) return false;
      if (String(t.folderId || '') !== folderStr) return false;
      return t.title?.trim().toLowerCase() === cleanT;
    });
  }, [title, folderId, department, currentUser?.department, targetTemplate, targetTemplateId, formTemplates]);

  // Review flow UI (reviewer submission)
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [reviewComment, setReviewComment] = useState('');

  // Commit / Versioning modal state
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  // Pre-publish prompt & Send for review states
  const [showPrePublishPrompt, setShowPrePublishPrompt] = useState(false);
  const [showSendForReview, setShowSendForReview] = useState(false);

  // In-form Word-style Comments / Objections margin pane state
  const [showCommentsPane, setShowCommentsPane] = useState(() => ((targetTemplate?.comments?.length || 0) > 0));
  const [comments, setComments] = useState(() => targetTemplate?.comments || []);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentType, setNewCommentType] = useState('COMMENT'); // 'COMMENT' | 'SUGGESTION' | 'CHANGE_REQUEST' | 'OBJECTION'


  // Popover state for configuring a field inside the document
  const [activeFieldEdit, setActiveFieldEdit] = useState(null); // { key, label, type, required, placeholder, options }
  const [activeSigEdit, setActiveSigEdit] = useState(null); // { currentDept }

  // Close modals on Escape key
  useEffect(() => {
    if (!activeFieldEdit && !activeSigEdit) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (activeFieldEdit) handleCancelFieldEdit();
        if (activeSigEdit) setActiveSigEdit(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFieldEdit, activeSigEdit]);

  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const activeDept = isSuperAdmin ? department : (currentUser?.department || departments[0]?.name || '');
  const deptFolders = (folders || []).filter(f => f.department === activeDept);

  // Initialize editor with the template to edit, review copy, merged review result, passed file, or blank
  useEffect(() => {
    if (templateToEdit) {
      if (templateToEdit.fontFamily) setFontFamily(templateToEdit.fontFamily);
      if (templateToEdit.fontSize) {
        setFontSize(templateToEdit.fontSize);
        const pt = parseInt(templateToEdit.fontSize, 10) || 11;
        setFontSizeDisplay(pt);
        setFontSizeInput(String(pt));
      }
      if (editorRef.current && templateToEdit.htmlContent) {
        const loadedHtml = convertRawHtmlToStudio(templateToEdit.htmlContent, templateToEdit.fields);
        editorRef.current.innerHTML = loadedHtml;
        pushHistory();
      } else if (editorRef.current && !templateToEdit.htmlContent) {
        // Fetch original docx file from server, convert to base64, parse to HTML
        apiService.getTemplateFile(templateToEdit.id)
          .then(blob => fileToBase64(blob))
          .then(b64 => apiService.parseDocx(b64))
          .then(parsed => {
            if (editorRef.current && parsed?.html) {
              const loadedHtml = convertRawHtmlToStudio(parsed.html, templateToEdit.fields);
              editorRef.current.innerHTML = loadedHtml;
              pushHistory();
            }
          })
          .catch(err => {
            console.error('[SmartWordStudio] Failed to load docx from server:', err);
            initializeBlankDocument();
          });
      }
    } else if (reviewSession) {
      if (editorRef.current) {
        const fields = reviewSession.review?.settings?.fields || reviewSession.review?.fields || [];
        const loadedHtml = convertRawHtmlToStudio(reviewSession.html, fields);
        editorRef.current.innerHTML = loadedHtml;
        pushHistory();
      }
    } else if (resume) {
      if (editorRef.current) {
        const fields = resume.settings?.fields || targetTemplate?.fields || [];
        const loadedHtml = convertRawHtmlToStudio(resume.html, fields);
        editorRef.current.innerHTML = loadedHtml;
        pushHistory();
      }
    } else if (initialDocxFile) {
      loadDocxFile(initialDocxFile);
    } else if (editorRef.current && !editorRef.current.innerHTML.trim()) {
      initializeBlankDocument();
    }
  }, [templateToEdit, targetTemplate, initialDocxFile, reviewSession, resume]);

  // Keep workflow steps in sync if departments change
  useEffect(() => {
    if (workflow.length === 0 && activeDept) {
      setWorkflow([activeDept]);
    }
  }, [activeDept]);

  // Ensure contenteditable creates standard <p> on Enter across all browsers
  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {}
  }, []);

  const initializeBlankDocument = () => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = '<p><br/></p>';
    pushHistory();
    if (workflow.length === 0 && activeDept) {
      setWorkflow([activeDept]);
    }
  };

  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Format commands (Home Ribbon)
  const execCmd = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) editorRef.current.focus();
  };

  const handleFontChange = (val) => {
    setFontFamily(val);
    execCmd('fontName', val);
  };

  // Close font size & color dropdowns on outside click
  useEffect(() => {
    if (!showFontSizeDropdown && !showTextColorPicker && !showHighlightPicker) return;
    const handleClickOutside = (e) => {
      if (fontSizeDropdownRef.current && !fontSizeDropdownRef.current.contains(e.target)) {
        setShowFontSizeDropdown(false);
      }
      if (textColorDropdownRef.current && !textColorDropdownRef.current.contains(e.target)) {
        setShowTextColorPicker(false);
      }
      if (highlightDropdownRef.current && !highlightDropdownRef.current.contains(e.target)) {
        setShowHighlightPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFontSizeDropdown, showTextColorPicker, showHighlightPicker]);

  // Google Docs style font-size applicator (works on selected text, or inserts styled insertion point)
  const applyFontSize = (val) => {
    const num = Math.max(1, Math.min(400, parseInt(val, 10) || 11));
    const ptVal = `${num}pt`;
    setFontSize(ptVal);
    setFontSizeDisplay(num);
    setFontSizeInput(String(num));

    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range = null;
    if (sel && sel.rangeCount && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
      range = savedRangeRef.current;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (range) {
      if (!range.collapsed) {
        const span = document.createElement('span');
        span.style.fontSize = ptVal;
        span.appendChild(range.extractContents());
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
        pushHistory();
      } else {
        const span = document.createElement('span');
        span.style.fontSize = ptVal;
        const zwsp = document.createTextNode('\u200B');
        span.appendChild(zwsp);
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.setStart(zwsp, 1);
        newRange.setEnd(zwsp, 1);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
      }
    }
  };

  const handleStepFontSize = (delta) => {
    const current = parseInt(fontSizeDisplay, 10) || 11;
    const next = Math.max(1, Math.min(400, current + delta));
    applyFontSize(next);
  };

  const commitInputSize = () => {
    const num = parseInt(fontSizeInput, 10);
    if (!isNaN(num) && num > 0 && num <= 400) {
      applyFontSize(num);
    } else {
      setFontSizeInput(String(fontSizeDisplay));
    }
  };

  const handleFontSizeChange = (val) => {
    applyFontSize(val);
  };

  // Text Color applicator (works on selected text, or inserts styled insertion point)
  const applyTextColor = (colorVal) => {
    setTextColor(colorVal || '#000000');
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range = null;
    if (sel && sel.rangeCount && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
      range = savedRangeRef.current;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (!range) return;

    if (!range.collapsed) {
      if (!colorVal || colorVal === 'inherit' || colorVal === 'initial') {
        const frag = range.extractContents();
        if (frag.querySelectorAll) {
          frag.querySelectorAll('*').forEach(el => {
            el.style.color = '';
            if (!el.getAttribute('style')) el.removeAttribute('style');
          });
        }
        const span = document.createElement('span');
        span.style.color = 'inherit';
        span.appendChild(frag);
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
        pushHistory();
        return;
      }

      const span = document.createElement('span');
      span.style.color = colorVal;
      span.appendChild(range.extractContents());
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
      pushHistory();
    } else {
      const span = document.createElement('span');
      if (colorVal && colorVal !== 'inherit') {
        span.style.color = colorVal;
      }
      const zwsp = document.createTextNode('\u200B');
      span.appendChild(zwsp);
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.setStart(zwsp, 1);
      newRange.setEnd(zwsp, 1);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
  };

  // Highlight Color applicator (works on selected text, or inserts styled insertion point)
  const applyHighlightColor = (bgVal) => {
    setHighlightColor(bgVal || '#fef08a');
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range = null;
    if (sel && sel.rangeCount && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else if (savedRangeRef.current && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
      range = savedRangeRef.current;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (!range) return;

    if (!range.collapsed) {
      if (!bgVal || bgVal === 'transparent' || bgVal === 'none') {
        const frag = range.extractContents();
        if (frag.querySelectorAll) {
          frag.querySelectorAll('*').forEach(el => {
            el.style.backgroundColor = '';
            if (!el.getAttribute('style')) el.removeAttribute('style');
          });
        }
        const span = document.createElement('span');
        span.style.backgroundColor = 'transparent';
        span.appendChild(frag);
        range.insertNode(span);

        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
        pushHistory();
        return;
      }

      const span = document.createElement('span');
      span.style.backgroundColor = bgVal;
      span.appendChild(range.extractContents());
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
      pushHistory();
    } else {
      const span = document.createElement('span');
      if (bgVal && bgVal !== 'transparent') {
        span.style.backgroundColor = bgVal;
      }
      const zwsp = document.createTextNode('\u200B');
      span.appendChild(zwsp);
      range.insertNode(span);

      const newRange = document.createRange();
      newRange.setStart(zwsp, 1);
      newRange.setEnd(zwsp, 1);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    }
  };

  // Image insertion and interactive controls
  const insertImageAtCursor = ({ src, alt = '', width = 50, align = 'center' }) => {
    if (!src || !editorRef.current) return;
    editorRef.current.focus();

    const wrap = document.createElement('div');
    wrap.className = 'sd-doc-image-wrap';
    wrap.setAttribute('data-align', align);
    wrap.setAttribute('contenteditable', 'false');
    wrap.style.textAlign = align;
    wrap.style.margin = '14px 0';
    wrap.innerHTML = `
      <span class="sd-doc-pill-remove sd-image-remove" data-remove="1" title="Delete this image">×</span>
      <img src="${src}" alt="${escapeHtml(alt)}" class="sd-doc-image" style="max-width: ${width}%; height: auto; border-radius: 4px;" />
    `;

    insertNodeAtCursor(wrap, wrap.querySelector('img'));
    pushHistory();
    setShowImageModal(false);
  };

  const handleEditorPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          fileToBase64(file).then(base64 => {
            insertImageAtCursor({ src: base64, alt: file.name || 'Pasted Image', width: 60, align: 'center' });
            addToast?.('Image pasted', 'Image inserted into document from clipboard', 'info');
          }).catch(() => {
            addToast?.('Error', 'Failed to paste image', 'error');
          });
          return;
        }
      }
    }
  };

  const handleEditorDrop = (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type && file.type.startsWith('image/')) {
        e.preventDefault();
        fileToBase64(file).then(base64 => {
          insertImageAtCursor({ src: base64, alt: file.name, width: 60, align: 'center' });
          addToast?.('Image inserted', `Image "${file.name}" placed in document`, 'info');
        }).catch(() => {
          addToast?.('Error', 'Failed to insert dropped image', 'error');
        });
      }
    }
  };

  // Keep floating image toolbar positioned accurately when scrolling or resizing
  useEffect(() => {
    if (!selectedImageEl?.img) return;
    const updatePos = () => {
      if (!selectedImageEl.img.isConnected) {
        setSelectedImageEl(null);
        setImageToolbarPos(null);
        return;
      }
      const rect = selectedImageEl.img.getBoundingClientRect();
      if (rect.bottom < 80 || rect.top > window.innerHeight - 30) {
        setImageToolbarPos(null);
      } else {
        setImageToolbarPos({
          top: rect.top < 110 ? (rect.bottom + 10) : (rect.top - 42),
          left: rect.left + (rect.width / 2)
        });
      }
    };
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [selectedImageEl]);

  const updateImageWidth = (pct) => {
    if (!selectedImageEl?.img) return;
    selectedImageEl.img.style.maxWidth = `${pct}%`;
    setTimeout(() => {
      if (selectedImageEl?.img) {
        const rect = selectedImageEl.img.getBoundingClientRect();
        setImageToolbarPos({
          top: rect.top < 110 ? (rect.bottom + 10) : (rect.top - 42),
          left: rect.left + (rect.width / 2)
        });
      }
    }, 40);
    pushHistory();
  };

  const updateImageAlign = (align) => {
    if (!selectedImageEl?.wrap) return;
    selectedImageEl.wrap.style.textAlign = align;
    selectedImageEl.wrap.setAttribute('data-align', align);
    setTimeout(() => {
      if (selectedImageEl?.img) {
        const rect = selectedImageEl.img.getBoundingClientRect();
        setImageToolbarPos({
          top: rect.top < 110 ? (rect.bottom + 10) : (rect.top - 42),
          left: rect.left + (rect.width / 2)
        });
      }
    }, 40);
    pushHistory();
  };

  const removeSelectedImage = () => {
    if (!selectedImageEl?.wrap) return;
    selectedImageEl.wrap.remove();
    setSelectedImageEl(null);
    setImageToolbarPos(null);
    pushHistory();
  };

  // Helper to insert an element at cursor inside editor
  const insertNodeAtCursor = (node, targetToSelect = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    let range = null;

    if (savedRangeRef.current && editorRef.current.contains(savedRangeRef.current.commonAncestorContainer)) {
      range = savedRangeRef.current;
    } else if (sel && sel.rangeCount && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    }

    const refNode = targetToSelect || node;

    if (range) {
      range.deleteContents();
      range.insertNode(node);
      if (refNode && refNode.parentNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(refNode);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange;
      }
    } else {
      // Append to the bottom of the editor
      editorRef.current.appendChild(node);
    }
    pushHistory();
  };

  // Insert form placeholder / input widget
  const handleInsertField = (type = 'text', defaultLabel = 'New Field', mode = 'placeholder') => {
    const key = `Field_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const span = document.createElement('span');
    span.className = `sd-doc-field-pill${mode === 'placeholder' ? ' is-placeholder' : ''}`;
    span.setAttribute('data-field-key', key);
    span.setAttribute('data-field-label', defaultLabel);
    span.setAttribute('data-field-type', type);
    span.setAttribute('data-field-mode', mode);
    span.setAttribute('data-field-bold', 'false');
    span.setAttribute('data-required', 'true');
    span.setAttribute('data-placeholder', '');
    span.setAttribute('data-description', '');
    span.setAttribute('data-options', type === 'dropdown' ? JSON.stringify(['Option 1', 'Option 2']) : '[]');
    span.contentEditable = 'false';

    span.innerHTML = pillInnerHtml(defaultLabel, type, true, mode, false);

    const space = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(span);
    fragment.appendChild(space);

    insertNodeAtCursor(fragment, space);

    // Immediately open configuration popover for this new field
    setActiveFieldEdit({
      element: span,
      spaceNode: space,
      isNew: true,
      key,
      label: defaultLabel,
      type,
      mode,
      bold: false,
      required: true,
      placeholder: '',
      description: '',
      width: 0,
      options: type === 'dropdown' ? ['Option 1', 'Option 2'] : []
    });
  };

  // Insert Signature block
  const handleInsertSignature = (deptName = 'Submitter') => {
    const isSubmitter = deptName === 'Submitter';
    const block = document.createElement('div');
    block.className = 'sd-doc-sig-block';
    block.setAttribute('data-sig-slot', deptName);
    block.contentEditable = 'false';

    block.innerHTML = sigInnerHtml(deptName);

    const p = document.createElement('p');
    p.innerHTML = '<br/>';
    const fragment = document.createDocumentFragment();
    fragment.appendChild(block);
    fragment.appendChild(p);

    insertNodeAtCursor(fragment, p);

    // Automatically sync into workflow approval chain if it's a department
    if (!isSubmitter && !workflow.some(w => (typeof w === 'string' ? w : w?.department) === deptName)) {
      setWorkflow(prev => [...normalizeWorkflowSteps(prev), deptName]);
    }
  };

  // Insert System Tag
  const handleInsertSystemTag = (tagName) => {
    const span = document.createElement('span');
    span.className = 'sd-doc-system-tag';
    span.setAttribute('data-sys-tag', tagName);
    span.contentEditable = 'false';
    span.innerHTML = systemTagInnerHtml(tagName);

    const space = document.createTextNode(' ');
    const fragment = document.createDocumentFragment();
    fragment.appendChild(span);
    fragment.appendChild(space);

    insertNodeAtCursor(fragment, space);
  };

  // Insert Table below the current paragraph (replacing it if it is empty), like Word
  const handleInsertTable = (rows = 3, cols = 3) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const sel = window.getSelection();
    let node = null;
    if (savedRangeRef.current && ed.contains(savedRangeRef.current.commonAncestorContainer)) {
      node = savedRangeRef.current.commonAncestorContainer;
    } else if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      node = sel.anchorNode;
    }
    let block = node && (node.nodeType === 1 ? node : node.parentElement);
    while (block && block.parentElement !== ed) block = block.parentElement;

    const table = createTableElement(rows, cols);
    const p = document.createElement('p');
    p.innerHTML = '<br/>';
    if (block) {
      const isEmptyPara = block.tagName === 'P' && !block.textContent.trim()
        && !block.querySelector('.sd-doc-field-pill, .sd-doc-sig-block, .sd-doc-system-tag, img, table');
      if (isEmptyPara) block.replaceWith(table, p); else block.after(table, p);
    } else {
      ed.append(table, p);
    }
    setTablePicker(null);
    clearCellSelection();
    placeCaret(table.rows[0].cells[0]);
    pushHistory();
    saveSelection();
  };

  // Handle document click delegation for interactive widgets
  const handleEditorClick = (e) => {
    // Quick-remove (×) button on any widget
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const widget = removeBtn.closest('.sd-doc-field-pill, .sd-doc-sig-block, .sd-doc-system-tag, .sd-doc-image-wrap');
      if (widget) {
        widget.remove();
        setActiveFieldEdit(null);
        setActiveSigEdit(null);
        setSelectedImageEl(null);
        setImageToolbarPos(null);
        pushHistory();
      }
      return;
    }

    const imgWrap = e.target.closest('.sd-doc-image-wrap');
    const imgEl = e.target.closest('img.sd-doc-image') || imgWrap?.querySelector('img.sd-doc-image');
    if (imgWrap && imgEl) {
      e.preventDefault();
      e.stopPropagation();
      editorRef.current?.querySelectorAll('.sd-doc-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
      imgWrap.classList.add('is-selected');

      const rect = imgEl.getBoundingClientRect();
      setSelectedImageEl({ wrap: imgWrap, img: imgEl });
      setImageToolbarPos({
        top: rect.top < 110 ? (rect.bottom + 10) : (rect.top - 42),
        left: rect.left + (rect.width / 2)
      });
      setActiveFieldEdit(null);
      setActiveSigEdit(null);
      return;
    }

    // Clicking outside image closes image toolbar
    if (selectedImageEl) {
      editorRef.current?.querySelectorAll('.sd-doc-image-wrap.is-selected').forEach(w => w.classList.remove('is-selected'));
      setSelectedImageEl(null);
      setImageToolbarPos(null);
    }

    const fieldPill = e.target.closest('.sd-doc-field-pill');
    if (fieldPill) {
      e.preventDefault();
      e.stopPropagation();
      const key = fieldPill.getAttribute('data-field-key') || 'field';
      const label = fieldPill.getAttribute('data-field-label') || key;
      const type = fieldPill.getAttribute('data-field-type') || 'text';
      const mode = fieldPill.getAttribute('data-field-mode') || 'input';
      const bold = fieldPill.getAttribute('data-field-bold') === 'true';
      const required = fieldPill.getAttribute('data-required') !== 'false';
      const placeholder = fieldPill.getAttribute('data-placeholder') || '';
      const description = fieldPill.getAttribute('data-description') || '';
      const width = parseInt(fieldPill.getAttribute('data-width'), 10) || 0;
      let options = [];
      try {
        options = JSON.parse(fieldPill.getAttribute('data-options') || '[]');
      } catch {
        options = [];
      }

      setActiveFieldEdit({
        element: fieldPill,
        isNew: false,
        key,
        label,
        type,
        mode,
        bold,
        required,
        placeholder,
        description,
        width,
        options
      });
      setActiveSigEdit(null);
      return;
    }

    const sigBlock = e.target.closest('.sd-doc-sig-block');
    if (sigBlock) {
      e.preventDefault();
      e.stopPropagation();
      const slot = sigBlock.getAttribute('data-sig-slot') || 'Submitter';
      setActiveSigEdit({
        element: sigBlock,
        slot
      });
      setActiveFieldEdit(null);
      return;
    }

    // Clicking outside any widget closes popovers
    setActiveFieldEdit(null);
    setActiveSigEdit(null);
  };

  // Cancel / close field popover
  const handleCancelFieldEdit = () => {
    if (activeFieldEdit?.isNew && activeFieldEdit?.element) {
      activeFieldEdit.element.remove();
      if (activeFieldEdit.spaceNode?.isConnected) {
        activeFieldEdit.spaceNode.remove();
      }
      pushHistory();
    }
    setActiveFieldEdit(null);
  };

  // Save changes to active field popover
  const handleSaveFieldEdit = (updated) => {
    if (!activeFieldEdit?.element) return;
    const el = activeFieldEdit.element;
    const mode = updated.mode || 'input';
    const isBold = !!updated.bold;
    el.setAttribute('data-field-key', (updated.key || 'Field').trim());
    el.setAttribute('data-field-label', (updated.label || updated.key || 'Field').trim());
    el.setAttribute('data-field-type', updated.type || 'text');
    el.setAttribute('data-field-mode', mode);
    el.setAttribute('data-field-bold', isBold ? 'true' : 'false');
    el.setAttribute('data-required', updated.required ? 'true' : 'false');
    el.setAttribute('data-placeholder', (updated.placeholder || '').trim());
    el.setAttribute('data-description', (updated.description || '').trim());
    el.setAttribute('data-options', JSON.stringify(updated.options || []));
    applyPillWidth(el, updated.width);

    if (mode === 'placeholder') {
      el.classList.add('is-placeholder');
    } else {
      el.classList.remove('is-placeholder');
    }

    if (isBold) {
      el.classList.add('is-bold');
    } else {
      el.classList.remove('is-bold');
    }

    el.innerHTML = pillInnerHtml((updated.label || updated.key || 'Field').trim(), updated.type || 'text', updated.required, mode, isBold);

    setActiveFieldEdit(null);
    pushHistory();
  };

  // Delete active field
  const handleDeleteFieldEdit = () => {
    if (activeFieldEdit?.element) {
      activeFieldEdit.element.remove();
      if (activeFieldEdit.spaceNode?.isConnected) {
        activeFieldEdit.spaceNode.remove();
      }
      pushHistory();
    }
    setActiveFieldEdit(null);
  };

  // Change signature slot
  const handleSaveSigEdit = (newDept) => {
    if (!activeSigEdit?.element) return;
    const el = activeSigEdit.element;
    const isSubmitter = newDept === 'Submitter';
    el.setAttribute('data-sig-slot', newDept);
    el.innerHTML = sigInnerHtml(newDept);

    if (!isSubmitter && !workflow.some(w => (typeof w === 'string' ? w : w?.department) === newDept)) {
      setWorkflow(prev => [...normalizeWorkflowSteps(prev), newDept]);
    }
    setActiveSigEdit(null);
    pushHistory();
  };

  const handleDeleteSigEdit = () => {
    if (activeSigEdit?.element) {
      activeSigEdit.element.remove();
      pushHistory();
    }
    setActiveSigEdit(null);
  };

  // Load .docx file into Word Form Studio
  const loadDocxFile = async (f) => {
    setErrorMsg('');
    setParsing(true);
    try {
      const base64 = await fileToBase64(f);
      const res = await apiService.parseDocx(base64);

      // Clean HTML and convert any detected tags into interactive widgets
      let docHtml = res.html || '';

      // Set title from file name if default
      if (title === 'Untitled Word Form') {
        setTitle(f.name.replace(/\.(docx|doc)$/i, '').replace(/[_-]+/g, ' ').trim());
      }

      // Transform raw {{Signature: XYZ}} into interactive signature blocks
      docHtml = docHtml.replace(/\{\{\s*Signature\s*:\s*([^}]+)\}\}/gi, (match, slot) => {
        const s = slot.trim();
        return `<div class="sd-doc-sig-block" data-sig-slot="${escapeHtml(s)}" contenteditable="false">${sigInnerHtml(s)}</div>`;
      });

      // Transform any remaining {{Field Name}} into interactive form pills (system tags are handled next)
      docHtml = docHtml.replace(/\{\{\s*([^}]+)\}\}/g, (match, fieldName) => {
        const fn = fieldName.trim();
        if (SYSTEM_TAGS_LIST.some(st => st.toLowerCase() === fn.toLowerCase())) return match;
        return `<span class="sd-doc-field-pill" data-field-key="${escapeHtml(fn)}" data-field-label="${escapeHtml(fn)}" data-field-type="text" data-required="true" data-placeholder="" data-options="[]" contenteditable="false">${pillInnerHtml(fn, 'text', true)}</span>`;
      });

      // Transform raw {{System Tag}} into system tags
      for (const st of SYSTEM_TAGS_LIST) {
        const re = new RegExp(`\\{\\{\\s*${st}\\s*\\}\\}`, 'gi');
        docHtml = docHtml.replace(re, `<span class="sd-doc-system-tag" data-sys-tag="${escapeHtml(st)}" contenteditable="false">${systemTagInnerHtml(st)}</span>`);
      }

      if (editorRef.current) {
        editorRef.current.innerHTML = docHtml;
        pushHistory();
      }

      // Pre-fill workflow if signatures found
      if (res.signatureSlots?.length) {
        const deptNames = departments.map(d => d.name.toLowerCase());
        const validSlots = res.signatureSlots
          .filter(s => deptNames.includes(s.toLowerCase()))
          .map(s => departments.find(d => d.name.toLowerCase() === s.toLowerCase()).name);
        if (validSlots.length) setWorkflow(validSlots);
      }

      addToast('Document loaded', `Opened ${f.name} in Word Studio`, 'info');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to read Word document (.doc / .docx)');
    }
    setParsing(false);
  };

  // Compile document into clean HTML with {{placeholders}} and extract metadata
  const compileDocument = () => {
    if (!editorRef.current) return null;
    const clone = editorRef.current.cloneNode(true);
    stripEditorState(clone);

    const fields = [];
    const signatureSlots = [];
    const systemTags = [];

    // 1. Convert .sd-doc-field-pill -> {{field_key}}
    const fieldPills = clone.querySelectorAll('.sd-doc-field-pill');
    fieldPills.forEach(pill => {
      const cfg = readPillConfig(pill);
      fields.push(cfg);
      if (cfg.bold) {
        const strong = document.createElement('strong');
        strong.textContent = `{{${cfg.key}}}`;
        pill.replaceWith(strong);
      } else {
        pill.replaceWith(document.createTextNode(`{{${cfg.key}}}`));
      }
    });

    // 2. Convert .sd-doc-sig-block -> {{Signature: Slot}}
    const sigBlocks = clone.querySelectorAll('.sd-doc-sig-block');
    sigBlocks.forEach(sig => {
      const slot = (sig.getAttribute('data-sig-slot') || 'Submitter').trim();
      signatureSlots.push(slot);
      sig.replaceWith(document.createTextNode(`{{Signature: ${slot}}}`));
    });

    // 3. Convert .sd-doc-system-tag -> {{SystemTag}}
    const sysTags = clone.querySelectorAll('.sd-doc-system-tag');
    sysTags.forEach(tag => {
      const name = (tag.getAttribute('data-sys-tag') || 'Form ID').trim();
      systemTags.push(name);
      tag.replaceWith(document.createTextNode(`{{${name}}}`));
    });

    const cleanHtml = clone.innerHTML;
    return { cleanHtml, fields, signatureSlots, systemTags };
  };

  const [printingDoc, setPrintingDoc] = useState(false);

  // Print current Word document authored in Studio
  const handlePrintStudioDoc = async () => {
    if (printingDoc) return;
    try {
      setPrintingDoc(true);
      addToast('Preparing Word Document', 'Generating Microsoft Word document with authentic layout for print...', 'info');
      const compiled = compileDocument();
      if (!compiled) return;
      const res = await apiService.htmlToDocx(compiled.cleanHtml, title.trim() || 'SmartDoc Form');
      if (!res?.fileBase64) throw new Error('Could not convert editor to Word document');
      await printWordDocument(res.fileBase64, { title: title.trim() || 'SmartDoc Word Form' });
    } catch (err) {
      console.error('Studio print error:', err);
      addToast('Print Error', err.message || 'Failed to print document', 'error');
    } finally {
      setPrintingDoc(false);
    }
  };

  // Save and Publish Template (ask whether to send for review first)
  const handlePublish = async () => {
    setErrorMsg('');
    if (!title.trim()) {
      setErrorMsg('Please enter a form template title');
      return;
    }
    if (normalizeWorkflowSteps(workflow).length === 0) {
      setErrorMsg('Please specify at least one department in the approval chain');
      return;
    }

    if (duplicateConflict) {
      setErrorMsg(`A document titled "${duplicateConflict.title}" already exists in this folder. Duplicate files are not allowed in the same folder.`);
      return;
    }

    const compiled = compileDocument();
    if (!compiled) return;

    if (compiled.fields.length === 0 && compiled.signatureSlots.length === 0) {
      setErrorMsg('Please insert at least one interactive form field or signature block into the document');
      return;
    }

    // If resuming from peer review, directly proceed to publish/commit without asking review again
    if (resume) {
      executeDirectPublish();
      return;
    }

    // Intercept: prompt user before publishing to ask if they want to send for peer review
    setShowPrePublishPrompt(true);
  };

  // Direct publication without peer review
  const executeDirectPublish = async () => {
    setShowPrePublishPrompt(false);

    // If editing an existing template, prompt for a Git commit message to record in version history
    if (isEditingExisting) {
      setCommitMessage(resume ? 'Merged changes from peer review' : 'Updated template layout and configuration');
      setShowCommitModal(true);
      return;
    }

    if (duplicateConflict) {
      setErrorMsg(`A document titled "${duplicateConflict.title}" already exists in this folder. Duplicate files are not allowed in the same folder.`);
      return;
    }

    const compiled = compileDocument();
    if (!compiled) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        department: activeDept,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: parseInt(defaultExpiryDays, 10) || 14,
        htmlContent: compiled.cleanHtml,
        fontFamily,
        fontSize,
        fields: compiled.fields,
        workflow: normalizeWorkflowSteps(workflow).map((dept, i) => ({ step: i + 1, department: dept })),
        status: 'ACTIVE',
        isDraft: false,
        fileName: `${title.trim().replace(/\W+/g, '_')}.docx`,
        reviewId: resume?.reviewId || undefined
      };

      const result = await createTemplate(payload);
      if (result) {
        addToast('Template Published', `"${title.trim()}" is now available in ${activeDept}`, 'success');
        onClose();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to publish form template');
    }
    setSaving(false);
  };

  const handleOpenSendForReview = () => {
    setShowPrePublishPrompt(false);
    setShowSendForReview(true);
  };

  const handleSendForReview = async ({ reviewerIds, message }) => {
    const compiled = compileDocument();
    if (!compiled) return false;

    setSaving(true);
    try {
      const payload = {
        templateId: targetTemplate?.id || targetTemplateId || null,
        title: title.trim(),
        description: description.trim(),
        department: activeDept,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: parseInt(defaultExpiryDays, 10) || 14,
        htmlContent: compiled.cleanHtml,
        fontFamily,
        fontSize,
        fields: compiled.fields,
        workflow: normalizeWorkflowSteps(workflow).map((dept, i) => ({ step: i + 1, department: dept })),
        reviewerIds,
        message
      };

      const result = await startReview(payload);
      if (result) {
        setShowSendForReview(false);
        onClose();
        return true;
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send template for review');
    } finally {
      setSaving(false);
    }
    return false;
  };

  // Commit version update for existing template
  const handleSaveEdit = async () => {
    setErrorMsg('');
    if (normalizeWorkflowSteps(workflow).length === 0) {
      setErrorMsg('Please specify at least one department in the approval chain');
      return;
    }
    if (duplicateConflict) {
      setErrorMsg(`A document titled "${duplicateConflict.title}" already exists in this folder. Duplicate files are not allowed in the same folder.`);
      return;
    }
    const compiled = compileDocument();
    if (!compiled) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        department: activeDept,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: parseInt(defaultExpiryDays, 10) || 14,
        htmlContent: compiled.cleanHtml,
        fontFamily,
        fontSize,
        fields: compiled.fields,
        workflow: normalizeWorkflowSteps(workflow).map((dept, i) => ({ step: i + 1, department: dept })),
        status: 'ACTIVE',
        isDraft: false,
        commitMessage: commitMessage.trim() || 'Updated form template',
        changeSummary: commitMessage.trim() || 'Updated form template',
        reviewId: resume?.reviewId || undefined
      };

      const resolvedId = targetTemplate?.id || targetTemplateId;
      const result = await updateTemplate(resolvedId, payload);
      if (result) {
        addToast('Template Updated', `"${title.trim()}" committed as version ${(targetTemplate?.version || 1) + 1}`, 'success');
        setShowCommitModal(false);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update form template');
    }
    setSaving(false);
  };

  // Save template directly as an unpublished draft without publishing
  const handleSaveDraft = async () => {
    setErrorMsg('');
    if (!title.trim()) {
      setErrorMsg('Please enter a form template title');
      return;
    }
    if (duplicateConflict) {
      setErrorMsg(`A document titled "${duplicateConflict.title}" already exists in this folder. Duplicate files are not allowed in the same folder.`);
      return;
    }
    const compiled = compileDocument();
    if (!compiled) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        department: activeDept,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: parseInt(defaultExpiryDays, 10) || 14,
        htmlContent: compiled.cleanHtml,
        fontFamily,
        fontSize,
        fields: compiled.fields,
        workflow: normalizeWorkflowSteps(workflow).map((dept, i) => ({ step: i + 1, department: dept })),
        status: 'DRAFT',
        isDraft: true,
        fileName: `${title.trim().replace(/\W+/g, '_')}.docx`
      };

      if (isEditingExisting) {
        const resolvedId = targetTemplate?.id || targetTemplateId;
        payload.commitMessage = 'Saved draft revisions';
        payload.changeSummary = 'Saved draft revisions';
        const result = await updateTemplate(resolvedId, payload);
        if (result) {
          addToast('Draft Saved', `Draft "${title.trim()}" saved successfully`, 'success');
          onClose();
        }
      } else {
        const result = await createTemplate(payload);
        if (result) {
          addToast('Draft Saved', `"${title.trim()}" saved as draft in ${activeDept}`, 'success');
          onClose();
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  // Add in-form comment or objection
  const handleAddComment = async () => {
    if (!newCommentText.trim()) return;
    const newComment = {
      id: 'cm_' + Math.random().toString(36).slice(2, 9),
      author: currentUser?.name || 'Administrator',
      authorId: currentUser?.id,
      department: currentUser?.department || 'System',
      text: newCommentText.trim(),
      type: newCommentType,
      status: newCommentType === 'OBJECTION' ? 'OBJECTION' : 'OPEN',
      timestamp: new Date().toISOString()
    };

    const resolvedId = targetTemplate?.id || targetTemplateId;
    if (isEditingExisting && resolvedId) {
      await addTemplateComment(resolvedId, newComment);
    }
    setComments(prev => [...prev, newComment]);
    setNewCommentText('');
    addToast('Comment added', 'Note posted to document margin', 'info');
  };

  // Accept or reject in-form comment
  const handleUpdateCommentStatus = async (commentId, nextStatus) => {
    const resolvedId = targetTemplate?.id || targetTemplateId;
    if (isEditingExisting && resolvedId) {
      await updateTemplateComment(resolvedId, commentId, { status: nextStatus });
    }
    setComments(prev => prev.map(c => c.id === commentId ? {
      ...c,
      status: nextStatus,
      resolvedAt: new Date().toISOString(),
      resolvedBy: currentUser?.name
    } : c));
    addToast('Decision saved', `Comment marked as ${nextStatus}`, 'success');
  };


  // Reviewer: submit the edited copy back to the person who started the review
  const handleSubmitReview = async () => {
    flushTyping();
    const el = editorRef.current;
    if (!el) return;
    setSaving(true);
    const compiled = compileDocument();
    const html = compiled ? compiled.cleanHtml : getCleanEditorHtml(el);
    const r = await submitReview(reviewSession.review.id, {
      htmlContent: html,
      comment: reviewComment,
      hasChanges: docHasChanges(reviewSession.review.baseHtml, html)
    });
    setSaving(false);
    if (r) {
      setShowSubmitReview(false);
      onClose();
    }
  };

  // Workflow step management
  const moveWorkflowStep = (idx, delta) => {
    setWorkflow(prev => {
      const next = [...normalizeWorkflowSteps(prev)];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeWorkflowStep = (idx) => {
    setWorkflow(prev => normalizeWorkflowSteps(prev).filter((_, i) => i !== idx));
  };

  const addWorkflowStep = (deptName) => {
    if (!deptName) return;
    const clean = typeof deptName === 'string' ? deptName.trim() : (deptName?.department || '').trim();
    if (!clean) return;
    setWorkflow(prev => {
      const normalized = normalizeWorkflowSteps(prev);
      return normalized.includes(clean) ? normalized : [...normalized, clean];
    });
  };

  return (
    <div className="sd-studio-modal-backdrop">
      <div className="sd-studio-container">
        {/* Top Header Bar */}
        <header className="sd-studio-header">
          <div className="sd-studio-header-left">
            <button
              className="sd-icon-btn"
              title="Close Word Studio"
              onClick={onClose}
              disabled={saving}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="sd-studio-title-block">
              <input
                className="sd-studio-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Document Form Title…"
                maxLength={120}
                readOnly={isReviewer}
              />
              {duplicateConflict && (
                <span className="sd-badge sd-badge-danger" title={`A file named "${duplicateConflict.title}" already exists in this folder.`} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                  <AlertCircle size={11} /> Name exists in folder
                </span>
              )}
              {isReviewer ? (
                <span className="sd-badge sd-badge-amber">
                  <UserCheck size={11} /> Reviewing · from {reviewSession.review.initiatorName}
                </span>
              ) : targetTemplate?.isDraft ? (
                <span className="sd-badge sd-badge-warn" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', borderColor: 'rgba(234, 179, 8, 0.4)' }}>
                  <FileEdit size={11} /> Unpublished Draft
                </span>
              ) : isEditingExisting ? (
                <span className="sd-badge sd-badge-accent">
                  <Edit3 size={11} /> {resume ? 'Reviewed Draft · Committing ' : 'Editing Form '}v{targetTemplate?.version || 1}
                </span>
              ) : (
                <span className="sd-badge sd-badge-accent">
                  <FileText size={11} /> Word Form Studio
                </span>
              )}
            </div>
          </div>

          <div className="sd-studio-header-actions">
            <div className="sd-view-toggle" role="group" aria-label="Editor view mode">
              <button
                id="btn-view-edit"
                className={`sd-view-toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
                onClick={() => setViewMode('edit')}
                title="Editor only"
              >
                <SquarePen size={13} /> Edit
              </button>
              <button
                id="btn-view-split"
                className={`sd-view-toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Editor and live form preview side by side"
              >
                <Columns2 size={13} /> Side by side
              </button>
              <button
                id="btn-view-preview"
                className={`sd-view-toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
                title="Preview the form only"
              >
                <Eye size={13} /> Preview
              </button>
            </div>

            <button
              className={`btn btn-secondary btn-sm ${showCommentsPane ? 'active' : ''}`}
              onClick={() => setShowCommentsPane(v => !v)}
              title="Show in-form margin comments & objections"
            >
              <MessageSquare size={14} /> Comments {comments.length > 0 ? `(${comments.length})` : ''}
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files?.[0]) loadDocxFile(e.target.files[0]);
                e.target.value = '';
              }}
            />
            {!isReviewer && (
              <>
                {!isEditingExisting && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={parsing || saving}
                      title="Upload and open an existing Word document (.doc, .docx)"
                    >
                      <UploadCloud size={14} /> Open Word (.doc / .docx)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={initializeBlankDocument}
                      disabled={saving}
                      title="Reset to blank template"
                    >
                      Blank Form
                    </button>
                  </>
                )}
                <button
                  id="btn-print-studio-doc"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handlePrintStudioDoc}
                  disabled={saving || parsing || printingDoc}
                  title="Print authentic Word document just like printing in Microsoft Word"
                >
                  {printingDoc ? <Loader2 size={14} className="sd-spin" /> : <Printer size={14} />}
                  <span>{printingDoc ? 'Formatting…' : 'Print'}</span>
                </button>
                <button
                  id="btn-save-studio-draft"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSaveDraft}
                  disabled={saving || parsing}
                  title="Save template as an unpublished draft without publishing"
                >
                  <FileEdit size={14} /> Save Draft
                </button>
                <button
                  id="btn-publish-word-form"
                  className="btn btn-primary btn-sm"
                  onClick={handlePublish}
                  disabled={saving || parsing}
                >
                  {saving ? (
                    <CheckCircle2 size={14} className="sd-spin" />
                  ) : isEditingExisting ? (
                    targetTemplate?.isDraft ? <Sparkles size={14} /> : <GitCommit size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {saving ? 'Saving…' : isEditingExisting ? (targetTemplate?.isDraft ? 'Publish Form' : `Save & Commit v${(targetTemplate?.version || 1) + 1}`) : 'Publish Template'}
                </button>
              </>
            )}
            {isReviewer && (
              <button
                id="btn-submit-review"
                className="btn btn-primary btn-sm"
                onClick={() => { flushTyping(); setShowSubmitReview(true); }}
                disabled={saving}
                title="Send your edited copy back to the person who started the review"
              >
                <Send size={14} /> Submit review
              </button>
            )}
          </div>
        </header>

        {/* Word Ribbon Bar */}
        <nav className="sd-ribbon-bar">
          <div className="sd-ribbon-tabs">
            <button
              className={`sd-ribbon-tab ${activeRibbonTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveRibbonTab('home')}
            >
              Home
            </button>
            <button
              className={`sd-ribbon-tab ${activeRibbonTab === 'insert' ? 'active' : ''}`}
              onClick={() => setActiveRibbonTab('insert')}
            >
              Insert Elements
            </button>
            <button
              className={`sd-ribbon-tab ${activeRibbonTab === 'layout' ? 'active' : ''}`}
              onClick={() => setActiveRibbonTab('layout')}
            >
              Page Layout
            </button>
            {!isReviewer && (
              <button
                className={`sd-ribbon-tab ${activeRibbonTab === 'workflow' ? 'active' : ''}`}
                onClick={() => setActiveRibbonTab('workflow')}
              >
                Workflow &amp; Approvals ({workflow.length} step{workflow.length === 1 ? '' : 's'})
              </button>
            )}
            {tableCtx.inTable && (
              <button
                id="tab-table-tools"
                className={`sd-ribbon-tab sd-ribbon-tab-contextual ${activeRibbonTab === 'table' ? 'active' : ''}`}
                onClick={() => setActiveRibbonTab('table')}
              >
                <TableIcon size={12} /> Table Tools
              </button>
            )}
          </div>

          <div className="sd-ribbon-panel">
            {/* TAB 1: HOME (Text Formatting) */}
            {activeRibbonTab === 'home' && (
              <div className="sd-ribbon-group-row">
                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">History</span>
                  <div className="sd-ribbon-tools">
                    <div className="sd-btn-group">
                      <button
                        className="sd-ribbon-btn"
                        title="Undo (Ctrl+Z)"
                        onClick={handleUndo}
                        disabled={!historyState.canUndo}
                      >
                        <Undo2 size={14} />
                      </button>
                      <button
                        className="sd-ribbon-btn"
                        title="Redo (Ctrl+Y)"
                        onClick={handleRedo}
                        disabled={!historyState.canRedo}
                      >
                        <Redo2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Font</span>
                  <div className="sd-ribbon-tools">
                    <select
                      className="sd-ribbon-select"
                      value={fontFamily}
                      onChange={e => handleFontChange(e.target.value)}
                    >
                      {FONTS.map(f => (
                        <option key={f.name} value={f.value}>{f.name}</option>
                      ))}
                    </select>

                    {/* Google Docs style font size control: [-] [ input ▼ ] [+] */}
                    <div className="sd-gdoc-font-size-group" ref={fontSizeDropdownRef}>
                      <button
                        type="button"
                        className="sd-gdoc-fs-btn"
                        title="Decrease font size"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleStepFontSize(-1)}
                      >
                        <Minus size={13} />
                      </button>
                      <div className="sd-gdoc-fs-input-wrap">
                        <input
                          type="text"
                          className="sd-gdoc-fs-input"
                          value={fontSizeInput}
                          onChange={e => setFontSizeInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitInputSize();
                              e.target.blur();
                            }
                          }}
                          onBlur={commitInputSize}
                          onFocus={e => e.target.select()}
                          title="Font size (pt)"
                        />
                        <button
                          type="button"
                          className="sd-gdoc-fs-arrow-btn"
                          title="Font size presets"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => setShowFontSizeDropdown(prev => !prev)}
                        >
                          <ChevronDown size={11} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="sd-gdoc-fs-btn"
                        title="Increase font size"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleStepFontSize(1)}
                      >
                        <Plus size={13} />
                      </button>

                      {showFontSizeDropdown && (
                        <div className="sd-gdoc-fs-dropdown">
                          {GOOGLE_DOCS_FONT_SIZES.map(sz => (
                            <button
                              key={sz}
                              type="button"
                              className={`sd-gdoc-fs-item ${fontSizeDisplay === sz ? 'is-active' : ''}`}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                applyFontSize(sz);
                                setShowFontSizeDropdown(false);
                              }}
                            >
                              <span>{sz}</span>
                              {fontSizeDisplay === sz && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="sd-btn-group">
                      <button className="sd-ribbon-btn" title="Bold (Ctrl+B)" onClick={() => execCmd('bold')}>
                        <Bold size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Italic (Ctrl+I)" onClick={() => execCmd('italic')}>
                        <Italic size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Underline (Ctrl+U)" onClick={() => execCmd('underline')}>
                        <Underline size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Strikethrough" onClick={() => execCmd('strikeThrough')}>
                        <Strikethrough size={14} />
                      </button>
                    </div>

                    <div className="sd-btn-group">
                      {/* Text Color Split Tool */}
                      <div className="sd-color-picker-split" ref={textColorDropdownRef}>
                        <button
                          type="button"
                          className="sd-color-split-main"
                          title={`Apply text color (${textColor && textColor !== 'inherit' ? textColor : 'Default'})`}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => applyTextColor(textColor || '#000000')}
                        >
                          <div className="sd-color-icon-stack">
                            <Baseline size={13} />
                            <span
                              className="sd-color-stripe"
                              style={{ backgroundColor: textColor && textColor !== 'inherit' ? textColor : '#000000' }}
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          className="sd-color-split-arrow"
                          title="Text color palette"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setShowHighlightPicker(false);
                            setShowTextColorPicker(prev => !prev);
                          }}
                        >
                          <ChevronDown size={10} />
                        </button>

                        {showTextColorPicker && (
                          <div className="sd-color-palette-popover" onMouseDown={e => e.preventDefault()}>
                            <div className="sd-color-popover-header">Text Color</div>

                            <button
                              type="button"
                              className="sd-color-reset-btn"
                              onClick={() => {
                                applyTextColor('inherit');
                                setShowTextColorPicker(false);
                              }}
                            >
                              <span className="sd-color-reset-swatch" style={{ background: '#1e293b', border: '1px solid #64748b' }} />
                              <span>Automatic / Reset</span>
                            </button>

                            <div className="sd-color-swatches-grid">
                              {TEXT_COLORS.map(c => (
                                <button
                                  key={c.value}
                                  type="button"
                                  className={`sd-color-swatch-item ${textColor?.toLowerCase() === c.value.toLowerCase() ? 'is-active' : ''}`}
                                  style={{ backgroundColor: c.value }}
                                  title={c.name}
                                  onClick={() => {
                                    applyTextColor(c.value);
                                    setShowTextColorPicker(false);
                                  }}
                                >
                                  {textColor?.toLowerCase() === c.value.toLowerCase() && (
                                    <Check size={11} color={c.value === '#ffffff' || c.value === '#a4fb4f' ? '#000000' : '#ffffff'} />
                                  )}
                                </button>
                              ))}
                            </div>

                            <div className="sd-color-custom-row">
                              <label className="sd-color-custom-label">
                                <span>Custom:</span>
                                <input
                                  type="color"
                                  className="sd-color-input-native"
                                  value={textColor && textColor !== 'inherit' ? textColor : '#000000'}
                                  onChange={e => applyTextColor(e.target.value)}
                                />
                                <span className="sd-color-hex-tag">{textColor && textColor !== 'inherit' ? textColor : 'Auto'}</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Highlight Color Split Tool */}
                      <div className="sd-color-picker-split" ref={highlightDropdownRef}>
                        <button
                          type="button"
                          className="sd-color-split-main"
                          title={`Apply highlight (${highlightColor && highlightColor !== 'transparent' ? highlightColor : 'Yellow'})`}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => applyHighlightColor(highlightColor && highlightColor !== 'transparent' ? highlightColor : '#fef08a')}
                        >
                          <div className="sd-color-icon-stack">
                            <Highlighter size={13} />
                            <span
                              className="sd-color-stripe"
                              style={{ backgroundColor: highlightColor && highlightColor !== 'transparent' ? highlightColor : '#fef08a' }}
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          className="sd-color-split-arrow"
                          title="Highlight color palette"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setShowTextColorPicker(false);
                            setShowHighlightPicker(prev => !prev);
                          }}
                        >
                          <ChevronDown size={10} />
                        </button>

                        {showHighlightPicker && (
                          <div className="sd-color-palette-popover" onMouseDown={e => e.preventDefault()}>
                            <div className="sd-color-popover-header">Highlight Color</div>

                            <button
                              type="button"
                              className="sd-color-reset-btn"
                              onClick={() => {
                                applyHighlightColor('transparent');
                                setShowHighlightPicker(false);
                              }}
                            >
                              <span className="sd-color-reset-swatch sd-color-no-color-swatch" />
                              <span>No color / Clear</span>
                            </button>

                            <div className="sd-color-swatches-grid">
                              {HIGHLIGHT_COLORS.map(c => (
                                <button
                                  key={c.value}
                                  type="button"
                                  className={`sd-color-swatch-item ${highlightColor?.toLowerCase() === c.value.toLowerCase() ? 'is-active' : ''}`}
                                  style={{ backgroundColor: c.value }}
                                  title={c.name}
                                  onClick={() => {
                                    applyHighlightColor(c.value);
                                    setShowHighlightPicker(false);
                                  }}
                                >
                                  {highlightColor?.toLowerCase() === c.value.toLowerCase() && (
                                    <Check size={11} color="#000000" />
                                  )}
                                </button>
                              ))}
                            </div>

                            <div className="sd-color-custom-row">
                              <label className="sd-color-custom-label">
                                <span>Custom:</span>
                                <input
                                  type="color"
                                  className="sd-color-input-native"
                                  value={highlightColor && highlightColor !== 'transparent' ? highlightColor : '#fef08a'}
                                  onChange={e => applyHighlightColor(e.target.value)}
                                />
                                <span className="sd-color-hex-tag">{highlightColor && highlightColor !== 'transparent' ? highlightColor : 'None'}</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Paragraph</span>
                  <div className="sd-ribbon-tools">
                    <div className="sd-btn-group">
                      <button className="sd-ribbon-btn" title="Align Left" onClick={() => execCmd('justifyLeft')}>
                        <AlignLeft size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Align Center" onClick={() => execCmd('justifyCenter')}>
                        <AlignCenter size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Align Right" onClick={() => execCmd('justifyRight')}>
                        <AlignRight size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Justify" onClick={() => execCmd('justifyFull')}>
                        <AlignJustify size={14} />
                      </button>
                    </div>

                    <div className="sd-btn-group">
                      <button className="sd-ribbon-btn" title="Bullet List" onClick={() => execCmd('insertUnorderedList')}>
                        <List size={14} />
                      </button>
                      <button className="sd-ribbon-btn" title="Numbered List" onClick={() => execCmd('insertOrderedList')}>
                        <ListOrdered size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Headings</span>
                  <div className="sd-ribbon-tools">
                    <button className="sd-ribbon-btn-text" onClick={() => execCmd('formatBlock', '<h1>')}>H1</button>
                    <button className="sd-ribbon-btn-text" onClick={() => execCmd('formatBlock', '<h2>')}>H2</button>
                    <button className="sd-ribbon-btn-text" onClick={() => execCmd('formatBlock', '<h3>')}>H3</button>
                    <button className="sd-ribbon-btn-text" onClick={() => execCmd('formatBlock', '<p>')}>Normal</button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Media</span>
                  <div className="sd-ribbon-tools">
                    <button
                      type="button"
                      className="sd-ribbon-btn-text"
                      title="Insert Image (Upload or Web URL)"
                      onClick={() => setShowImageModal(true)}
                    >
                      <ImageIcon size={14} style={{ marginRight: 5 }} /> Image
                    </button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Form Items</span>
                  <div className="sd-ribbon-tools">
                    <button
                      type="button"
                      className="sd-ribbon-btn-text"
                      title="Insert In-Text Click-to-Fill Placeholder (e.g. Name, Date, Amount)"
                      onClick={() => handleInsertField('text', 'New Placeholder', 'placeholder')}
                    >
                      <Tag size={13} style={{ marginRight: 5, color: 'var(--primary-500)' }} /> Placeholder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INSERT (Form Elements, Signatures, Tables) */}
            {activeRibbonTab === 'insert' && (
              <div className="sd-ribbon-group-row">
                {/* In-Text Placeholders */}
                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">In-Text Placeholders (Legal / Contracts)</span>
                  <div className="sd-ribbon-tools">
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary-500) 45%, var(--border-color))' }}
                      onClick={() => handleInsertField('text', 'Party / Name', 'placeholder')}
                      title="Insert clickable placeholder for legal name, party, address"
                    >
                      <Tag size={13} style={{ color: 'var(--primary-500)' }} /> Name / Text
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary-500) 45%, var(--border-color))' }}
                      onClick={() => handleInsertField('date', 'Agreement Date', 'placeholder')}
                      title="Insert clickable date placeholder (e.g. Effective Date)"
                    >
                      <Calendar size={13} style={{ color: 'var(--primary-500)' }} /> Date Placeholder
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary-500) 45%, var(--border-color))' }}
                      onClick={() => handleInsertField('number', 'Contract Amount', 'placeholder')}
                      title="Insert clickable amount/number placeholder"
                    >
                      <Hash size={13} style={{ color: 'var(--primary-500)' }} /> Amount / Number
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ borderColor: 'color-mix(in srgb, var(--primary-500) 45%, var(--border-color))' }}
                      onClick={() => handleInsertField('dropdown', 'Governing Law', 'placeholder')}
                      title="Insert clickable dropdown selection placeholder"
                    >
                      <ChevronDown size={13} style={{ color: 'var(--primary-500)' }} /> Dropdown Choice
                    </button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                {/* Direct On-Page Form Controls */}
                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Form Controls & Fields</span>
                  <div className="sd-ribbon-tools">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('text', 'Text Field', 'placeholder')}>
                      <Type size={13} /> Text Box
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('textarea', 'Detailed Notes', 'placeholder')}>
                      <FileText size={13} /> Long Text
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('date', 'Date Needed', 'placeholder')}>
                      <Calendar size={13} /> Date Picker
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('number', 'Quantity / Amount', 'placeholder')}>
                      <Hash size={13} /> Number
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('dropdown', 'Select Category', 'placeholder')}>
                      <ChevronDown size={13} /> Dropdown
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertField('checkbox', 'I Confirm Terms', 'placeholder')}>
                      <CheckSquare size={13} /> Checkbox
                    </button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Signatures &amp; Approvals</span>
                  <div className="sd-ribbon-tools">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInsertSignature('Submitter')}>
                      <PenTool size={13} /> Submitter Signature
                    </button>

                    <div className="sd-dropdown-btn-wrap">
                      <select
                        className="sd-ribbon-select"
                        onChange={e => {
                          if (e.target.value) {
                            handleInsertSignature(e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">+ Dept Approval Signature…</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name} Signature</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">System Tags &amp; Structure</span>
                  <div className="sd-ribbon-tools">
                    <select
                      className="sd-ribbon-select"
                      onChange={e => {
                        if (e.target.value) {
                          handleInsertSystemTag(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">Insert Auto-Tag…</option>
                      {SYSTEM_TAGS_LIST.map(tag => (
                        <option key={tag} value={tag}>{`{{${tag}}}`}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="Insert Image (Upload or Web URL)"
                      onClick={() => setShowImageModal(true)}
                    >
                      <ImageIcon size={13} /> Image
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Insert a table — hover the grid to choose its size"
                      onClick={e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setTablePicker({ x: r.left, y: r.bottom + 4 });
                      }}
                    >
                      <TableIcon size={13} /> Table <ChevronDown size={11} />
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => execCmd('insertHorizontalRule')}>
                      Horizontal Rule
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LAYOUT (Margins, Page sizing) */}
            {activeRibbonTab === 'layout' && (
              <div className="sd-ribbon-group-row">
                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Margins</span>
                  <div className="sd-ribbon-tools">
                    <button
                      className={`btn btn-sm ${margins === 'normal' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMargins('normal')}
                    >
                      Normal (1 in / 25mm)
                    </button>
                    <button
                      className={`btn btn-sm ${margins === 'narrow' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMargins('narrow')}
                    >
                      Narrow (0.5 in / 12mm)
                    </button>
                    <button
                      className={`btn btn-sm ${margins === 'wide' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setMargins('wide')}
                    >
                      Wide (1.5 in / 38mm)
                    </button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Page Size &amp; Orientation</span>
                  <div className="sd-ribbon-tools">
                    <button
                      className={`btn btn-sm ${pageSize === 'A4' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPageSize('A4')}
                    >
                      A4 (210 × 297 mm)
                    </button>
                    <button
                      className={`btn btn-sm ${pageSize === 'letter' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPageSize('letter')}
                    >
                      US Letter
                    </button>
                    <button
                      className={`btn btn-sm ${orientation === 'portrait' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setOrientation('portrait')}
                    >
                      Portrait
                    </button>
                    <button
                      className={`btn btn-sm ${orientation === 'landscape' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setOrientation('landscape')}
                    >
                      Landscape
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5 (contextual): TABLE TOOLS — only while the caret is inside a table */}
            {activeRibbonTab === 'table' && tableCtx.inTable && (
              <div className="sd-ribbon-group-row">
                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Rows &amp; Columns</span>
                  <div className="sd-ribbon-tools">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleTableInsertRow(false)}><ArrowUp size={13} /> Insert Above</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleTableInsertRow(true)}><ArrowDown size={13} /> Insert Below</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleTableInsertCol(false)}><ArrowLeft size={13} /> Insert Left</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleTableInsertCol(true)}><ArrowRight size={13} /> Insert Right</button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Delete</span>
                  <div className="sd-ribbon-tools">
                    <button className="btn btn-outline-danger btn-sm" onClick={handleTableDeleteRow}><Trash2 size={13} /> Row</button>
                    <button className="btn btn-outline-danger btn-sm" onClick={handleTableDeleteCol}><Trash2 size={13} /> Column</button>
                    <button className="btn btn-outline-danger btn-sm" onClick={handleTableDelete}><Trash2 size={13} /> Table</button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Merge</span>
                  <div className="sd-ribbon-tools">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleTableMerge}
                      disabled={!tableCtx.canMerge}
                      title="Drag across cells to select them, then merge"
                    >
                      Merge Cells
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleTableSplit}
                      disabled={!tableCtx.canSplit}
                      title="Split a merged cell back into single cells"
                    >
                      Split Cell
                    </button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Cell</span>
                  <div className="sd-ribbon-tools">
                    <select
                      className="sd-ribbon-select"
                      value="__"
                      onChange={e => { if (e.target.value !== '__') handleTableCellStyle('background', e.target.value === 'none' ? '' : e.target.value); }}
                    >
                      <option value="__">Shading…</option>
                      <option value="none">No shading</option>
                      <option value="#f1f5f9">Gray</option>
                      <option value="#dbeafe">Blue</option>
                      <option value="#dcfce7">Green</option>
                      <option value="#fef9c3">Yellow</option>
                      <option value="#fee2e2">Red</option>
                      <option value="#ede9fe">Purple</option>
                    </select>
                    <div className="sd-btn-group">
                      <button className="sd-ribbon-btn" title="Align cell left" onClick={() => handleTableCellStyle('textAlign', 'left')}><AlignLeft size={14} /></button>
                      <button className="sd-ribbon-btn" title="Align cell center" onClick={() => handleTableCellStyle('textAlign', 'center')}><AlignCenter size={14} /></button>
                      <button className="sd-ribbon-btn" title="Align cell right" onClick={() => handleTableCellStyle('textAlign', 'right')}><AlignRight size={14} /></button>
                    </div>
                    <select
                      className="sd-ribbon-select"
                      value="__"
                      onChange={e => { if (e.target.value !== '__') handleTableCellStyle('verticalAlign', e.target.value); }}
                    >
                      <option value="__">Vertical…</option>
                      <option value="top">Top</option>
                      <option value="middle">Middle</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Table</span>
                  <div className="sd-ribbon-tools">
                    <select
                      className="sd-ribbon-select"
                      value="__"
                      onChange={e => { if (e.target.value !== '__') handleTableBorders(e.target.value === 'all'); }}
                    >
                      <option value="__">Borders…</option>
                      <option value="all">All borders</option>
                      <option value="none">No borders</option>
                    </select>
                    <select
                      className="sd-ribbon-select"
                      value="__"
                      onChange={e => { if (e.target.value !== '__') handleTableWidth(e.target.value === 'full'); }}
                    >
                      <option value="__">Width…</option>
                      <option value="full">Full page width</option>
                      <option value="auto">Auto</option>
                    </select>
                    <button className="btn btn-secondary btn-sm" onClick={handleTableEqualize} title="Make all columns the same width">Equal Columns</button>
                  </div>
                </div>

                <div className="sd-ribbon-divider" />

                <div className="sd-ribbon-group">
                  <span className="sd-ribbon-group-title">Tips</span>
                  <span className="sd-hint">Drag across cells to select · drag a column border to resize · Tab moves to the next cell (adds a row at the end)</span>
                </div>
              </div>
            )}

            {/* TAB 4: WORKFLOW & APPROVALS */}
            {activeRibbonTab === 'workflow' && (
              <div className="sd-ribbon-workflow-panel">
                <div className="sd-workflow-config-row">
                  <div className="sd-workflow-field">
                    <span className="sd-workflow-field-label">Department:</span>
                    {isSuperAdmin ? (
                      <select
                        className="sd-input sd-input-sm"
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                      >
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="sd-workflow-badge-dept">
                        <Folder size={13} /> {activeDept}
                      </span>
                    )}
                  </div>

                  <div className="sd-workflow-field">
                    <span className="sd-workflow-field-label">Folder:</span>
                    <select
                      className="sd-input sd-input-sm"
                      value={folderId}
                      onChange={e => setFolderId(e.target.value)}
                    >
                      <option value="">(Department Root)</option>
                      {deptFolders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sd-workflow-field">
                    <span className="sd-workflow-field-label">Audience:</span>
                    <select
                      className="sd-input sd-input-sm"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                    >
                      <option value="DEPARTMENT">Department members only</option>
                      <option value="ALL">Everyone in organization</option>
                    </select>
                  </div>

                  <div className="sd-workflow-field">
                    <span className="sd-workflow-field-label">Decision Days:</span>
                    <div className="sd-workflow-days-wrap">
                      <input
                        type="number"
                        className="sd-input sd-input-sm"
                        min={1}
                        max={90}
                        value={defaultExpiryDays}
                        onChange={e => setDefaultExpiryDays(e.target.value)}
                      />
                      <span className="sd-workflow-days-suffix">days</span>
                    </div>
                  </div>
                </div>

                <div className="sd-workflow-chain-bar">
                  <span className="sd-workflow-chain-title">
                    <ShieldCheck size={14} /> Sequential Approval Chain:
                  </span>
                  <div className="sd-workflow-steps-pills">
                    <div className="sd-wf-step-pill applicant">
                      <span className="sd-wf-step-idx">1</span>
                      <span className="sd-wf-step-name">Applicant</span>
                      <span className="sd-wf-step-sub">(Submitter)</span>
                    </div>

                    {normalizeWorkflowSteps(workflow).map((item, idx) => {
                      const deptName = typeof item === 'string' ? item : (item?.department || 'Department');
                      return (
                        <React.Fragment key={idx}>
                          <span className="sd-wf-step-arrow">&rarr;</span>
                          <div className="sd-wf-step-pill">
                            <span className="sd-wf-step-idx">{idx + 2}</span>
                            <span className="sd-wf-step-name">{deptName}</span>
                            <div className="sd-wf-step-actions">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  className="sd-wf-step-btn"
                                  title="Move earlier"
                                  onClick={() => moveWorkflowStep(idx, -1)}
                                >
                                  <ArrowLeft size={11} />
                                </button>
                              )}
                              {idx < workflow.length - 1 && (
                                <button
                                  type="button"
                                  className="sd-wf-step-btn"
                                  title="Move later"
                                  onClick={() => moveWorkflowStep(idx, 1)}
                                >
                                  <ArrowRight size={11} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="sd-wf-step-btn remove"
                                title="Remove step"
                                onClick={() => removeWorkflowStep(idx)}
                              >
                                <X size={11} />
                              </button>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}

                    <span className="sd-wf-step-arrow">&rarr;</span>

                    <select
                      className="sd-wf-add-select"
                      value=""
                      onChange={e => {
                        if (e.target.value) {
                          addWorkflowStep(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">+ Add Dept Step…</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Studio workspace: editor canvas + optional live form preview */}
        <div className={`sd-studio-workspace mode-${viewMode}`}>
        {/* Studio Canvas Area (A4 Sheet Presentation) */}
        <main className="sd-studio-canvas-scroll">
          {isReviewer && (
            <div className="sd-studio-review-banner" id="review-banner">
              <UserCheck size={16} />
              <div>
                <strong>You are reviewing this form.</strong>{' '}
                Edit the document freely — fix wording, add or remove content — then press <em>Submit review</em>.
                {reviewSession.review.message && (
                  <span className="sd-studio-review-note">“{reviewSession.review.message}” — {reviewSession.review.initiatorName}</span>
                )}
              </div>
            </div>
          )}
          {resume && (
            <div className="sd-studio-review-banner is-done" id="resume-banner">
              <CheckCircle2 size={16} />
              <div>
                <strong>Review finished.</strong>{' '}
                The changes you accepted are applied below. Publish the template, or send it for another round of review.
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="sd-studio-alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
              <button className="sd-icon-btn sd-icon-btn-xs" onClick={() => setErrorMsg('')}>
                <X size={12} />
              </button>
            </div>
          )}

          {parsing && (
            <div className="sd-studio-loading-banner">
              <span className="sd-spin">⏳</span>
              <span>Converting Word document and loading into Word Studio…</span>
            </div>
          )}

          <div ref={canvasLayoutRef} className="sd-studio-canvas-layout">
            <div
              className={`sd-word-page-sheet margins-${margins} size-${pageSize.toLowerCase()} ${orientation}`}
            >
              {/* Page Header */}
              <div className="sd-word-page-header-mark" contentEditable="false">
                <span>{title || 'Document 1'}</span>
                <span>Department: {activeDept}</span>
              </div>

              {/* Editable Canvas */}
              <div
                ref={editorRef}
                className="sd-word-editor-body"
                contentEditable={true}
                suppressContentEditableWarning={true}
                onClick={handleEditorClick}
                onInput={handleEditorInput}
                onKeyDown={handleEditorKeyDown}
                onKeyUp={saveSelection}
                onMouseDown={handleEditorMouseDown}
                onMouseMove={handleEditorMouseMove}
                onMouseUp={handleEditorMouseUp}
                onPaste={handleEditorPaste}
                onDrop={handleEditorDrop}
                onDragOver={e => e.preventDefault()}
                spellCheck={true}
                style={{
                  fontFamily,
                  fontSize,
                  minHeight: '850px',
                  outline: 'none'
                }}
              />

              {/* Page Footer */}
              <div className="sd-word-page-footer-mark" contentEditable="false">
                <span>SmartDoc Enterprise Workflow System</span>
                <span>Page 1 of 1</span>
              </div>
            </div>

            {/* Floating Image Quick Toolbar */}
            {selectedImageEl && imageToolbarPos && (
              <div
                className="sd-image-toolbar-popover"
                style={{
                  top: `${imageToolbarPos.top}px`,
                  left: `${imageToolbarPos.left}px`
                }}
              >
                <span className="sd-img-tb-label">Size:</span>
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    className={`sd-img-tb-btn ${selectedImageEl.img?.style?.maxWidth === `${pct}%` ? 'is-active' : ''}`}
                    onClick={() => updateImageWidth(pct)}
                  >
                    {pct}%
                  </button>
                ))}
                <div className="sd-img-tb-divider" />
                <button
                  type="button"
                  className="sd-img-tb-btn"
                  title="Align Left"
                  onClick={() => updateImageAlign('left')}
                >
                  <AlignLeft size={13} />
                </button>
                <button
                  type="button"
                  className="sd-img-tb-btn"
                  title="Align Center"
                  onClick={() => updateImageAlign('center')}
                >
                  <AlignCenter size={13} />
                </button>
                <button
                  type="button"
                  className="sd-img-tb-btn"
                  title="Align Right"
                  onClick={() => updateImageAlign('right')}
                >
                  <AlignRight size={13} />
                </button>
                <div className="sd-img-tb-divider" />
                <button
                  type="button"
                  className="sd-img-tb-btn sd-img-tb-btn-danger"
                  title="Delete image"
                  onClick={removeSelectedImage}
                >
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  className="sd-img-tb-btn"
                  title="Close toolbar"
                  onClick={() => {
                    selectedImageEl.wrap?.classList?.remove('is-selected');
                    setSelectedImageEl(null);
                    setImageToolbarPos(null);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* MS Word style margin comments panel */}
            {showCommentsPane && (
              <aside className="sd-studio-comments-balloon-pane" aria-label="Review Comments">
                <div className="sd-comments-pane-header">
                  <div className="sd-comments-pane-title">
                    <MessageSquare size={15} />
                    <span>Comments &amp; Objections ({comments.length})</span>
                  </div>
                  <button
                    className="sd-icon-btn sd-icon-btn-xs"
                    title="Close comments pane"
                    onClick={() => setShowCommentsPane(false)}
                  >
                    <X size={13} />
                  </button>
                </div>

                <div className="sd-comments-pane-list">
                  {comments.length === 0 ? (
                    <div className="sd-comments-empty">
                      <MessageSquare size={22} className="sd-muted" />
                      <p>No comments or objections on this form yet.</p>
                      <span className="sd-muted sd-xs">Add comments in the margin below to suggest changes or raise objections.</span>
                    </div>
                  ) : (
                    comments.map(c => {
                      const isAccepted = c.status === 'ACCEPTED';
                      const isRejected = c.status === 'REJECTED';
                      const isObjection = c.type === 'OBJECTION' || c.status === 'OBJECTION';
                      const authorName = typeof c.author === 'object' && c.author
                        ? (c.author.name || c.author.username || 'User')
                        : String(c.author || 'User');
                      const authorDept = typeof c.department === 'object' && c.department
                        ? (c.department.name || '')
                        : String(c.department || (typeof c.author === 'object' && c.author?.department) || '');

                      return (
                        <div
                          key={c.id}
                          className={`sd-comment-balloon ${isAccepted ? 'is-accepted' : isRejected ? 'is-rejected' : isObjection ? 'is-objection' : ''}`}
                        >
                          <div className="sd-comment-balloon-header">
                            <div className="sd-comment-balloon-user">
                              <span className="sd-comment-avatar">
                                {authorName.slice(0, 2).toUpperCase()}
                              </span>
                              <div className="sd-comment-author-info">
                                <strong className="sd-comment-author-name">{authorName}</strong>
                                {authorDept && <span className="sd-comment-author-dept">{authorDept}</span>}
                              </div>
                            </div>
                            <div className="sd-comment-badge-wrap">
                              {isAccepted ? (
                                <span className="sd-badge sd-badge-green sd-badge-xs">
                                  <Check size={10} /> Accepted
                                </span>
                              ) : isRejected ? (
                                <span className="sd-badge sd-badge-red sd-badge-xs">
                                  <X size={10} /> Rejected
                                </span>
                              ) : isObjection ? (
                                <span className="sd-badge sd-badge-amber sd-badge-xs">
                                  <AlertTriangle size={10} /> Objection
                                </span>
                              ) : (
                                <span className="sd-badge sd-badge-accent sd-badge-xs">
                                  {c.type || 'Note'}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="sd-comment-balloon-body">
                            <p>{c.text}</p>
                            {c.resolvedBy && (
                              <div className="sd-comment-resolved-tag">
                                {isAccepted ? '✓ Accepted by ' : '✕ Rejected by '} {c.resolvedBy}
                              </div>
                            )}
                          </div>

                          <div className="sd-comment-balloon-footer">
                            <span className="sd-comment-time">
                              {c.timestamp ? new Date(c.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>

                            {!isAccepted && !isRejected && (
                              <div className="sd-comment-actions">
                                <button
                                  className="sd-comment-action-btn accept"
                                  title="Accept change"
                                  onClick={() => handleUpdateCommentStatus(c.id, 'ACCEPTED')}
                                >
                                  <Check size={12} /> Accept
                                </button>
                                <button
                                  className="sd-comment-action-btn reject"
                                  title="Reject change"
                                  onClick={() => handleUpdateCommentStatus(c.id, 'REJECTED')}
                                >
                                  <X size={12} /> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="sd-comments-pane-input-box">
                  <div className="sd-comments-input-head">
                    <label>Leave a note or objection:</label>
                    <select
                      value={newCommentType}
                      onChange={e => setNewCommentType(e.target.value)}
                      className="sd-comment-type-select"
                    >
                      <option value="COMMENT">General Note</option>
                      <option value="SUGGESTION">Suggestion</option>
                      <option value="CHANGE_REQUEST">Change Request</option>
                      <option value="OBJECTION">Objection</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    className="sd-input sd-comment-textarea"
                    placeholder="Add a comment to the margin…"
                    value={newCommentText}
                    onChange={e => setNewCommentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                  />
                  <div className="sd-comments-input-footer">
                    <span className="sd-muted sd-xs">Ctrl+Enter to post</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      disabled={!newCommentText.trim()}
                      onClick={handleAddComment}
                    >
                      Post Comment
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </main>

        {viewMode !== 'edit' && (
          <FormPreviewPane
            html={previewHtml}
            title={title}
            department={activeDept}
            workflow={workflow}
            margins={margins}
            fontFamily={fontFamily}
            fontSize={fontSize}
          />
        )}
        </div>

        {tablePicker && (
          <TableGridPicker
            x={tablePicker.x}
            y={tablePicker.y}
            onPick={handleInsertTable}
            onClose={() => setTablePicker(null)}
          />
        )}

        {showSubmitReview && (
          <Modal
            id="modal-submit-review"
            title="Submit your review"
            subtitle={`Your edited copy of "${title}" goes to ${reviewSession.review.initiatorName}, who will accept or reject each change.`}
            onClose={saving ? undefined : () => setShowSubmitReview(false)}
            footer={(
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSubmitReview(false)} disabled={saving}>
                  Keep editing
                </button>
                <button type="button" id="btn-confirm-submit-review" className="btn btn-primary" onClick={handleSubmitReview} disabled={saving}>
                  <Send size={15} /> {saving ? 'Submitting…' : 'Submit review'}
                </button>
              </>
            )}
          >
            <label className="sd-field">
              <span className="sd-label">Comment (optional)</span>
              <textarea
                className="sd-input"
                rows={3}
                maxLength={1000}
                autoFocus
                placeholder="Summarise what you changed and why…"
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
              />
            </label>
            <p className="sd-hint">You cannot edit this review again after submitting.</p>
          </Modal>
        )}

        {/* POPUP 1: Interactive Field Editor Popover */}
        {activeFieldEdit && (
          <div className="sd-field-edit-modal-backdrop">
            <div className="sd-field-edit-card" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="sd-field-edit-header">
                <div className="sd-field-edit-title-group">
                  <div className="sd-field-edit-icon-badge">
                    <Tag size={16} />
                  </div>
                  <div>
                    <h4>{activeFieldEdit.isNew ? 'Insert Form Field' : 'Customize Form Field'}</h4>
                    <span className="sd-field-edit-subtitle">
                      {activeFieldEdit.isNew
                        ? 'Configure field properties before placing it in the document'
                        : 'Configure how this field appears and behaves in the document'}
                    </span>
                  </div>
                </div>
                <button
                  className="sd-icon-btn sd-icon-btn-xs"
                  onClick={handleCancelFieldEdit}
                  title="Close (Esc)"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="sd-field-edit-body">
                {/* Live Document Token Preview */}
                <div className="sd-field-preview-card">
                  <div className="sd-field-preview-header">
                    <span className="sd-field-preview-title">Live Document Preview</span>
                    <span className="sd-field-preview-mode-tag">
                      {activeFieldEdit.mode === 'placeholder' ? 'In-Text Placeholder' : 'Direct Input Box'}
                    </span>
                  </div>
                  <div className="sd-field-preview-stage">
                    <span
                      className={`sd-doc-field-pill ${activeFieldEdit.mode === 'placeholder' ? 'is-placeholder' : ''} ${activeFieldEdit.bold ? 'is-bold' : ''}`}
                    >
                      <span className="sd-doc-pill-icon">{fieldIcon(activeFieldEdit.type)}</span>
                      <span className="sd-doc-pill-label" style={{ fontWeight: activeFieldEdit.bold ? 700 : 400 }}>
                        {`{{${(activeFieldEdit.label || activeFieldEdit.key || 'Field').trim()}}}`}
                      </span>
                      {activeFieldEdit.bold && (
                        <span className="sd-doc-pill-tag req" style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                          Bold
                        </span>
                      )}
                      <span className="sd-doc-pill-tag">{activeFieldEdit.type}</span>
                      {activeFieldEdit.mode === 'placeholder' && (
                        <span className="sd-doc-pill-tag" style={{ background: 'rgba(164, 251, 79, 0.15)', color: 'var(--primary-500, #a4fb4f)', borderColor: 'rgba(164, 251, 79, 0.35)' }}>
                          In-Text
                        </span>
                      )}
                      {activeFieldEdit.required && <span className="sd-doc-pill-tag req">Req</span>}
                    </span>
                  </div>
                </div>

                {/* Display Mode & Text Weight in a 2-Column Segmented Grid */}
                <div className="sd-field-two-col-grid">
                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">Display Mode</span>
                    <div className="sd-segmented-control">
                      <button
                        type="button"
                        className={`sd-segment-btn ${activeFieldEdit.mode === 'placeholder' ? 'is-active' : ''}`}
                        onClick={() => setActiveFieldEdit(prev => ({ ...prev, mode: 'placeholder' }))}
                      >
                        <Tag size={13} />
                        <span>In-Text Tag</span>
                      </button>
                      <button
                        type="button"
                        className={`sd-segment-btn ${activeFieldEdit.mode !== 'placeholder' ? 'is-active' : ''}`}
                        onClick={() => setActiveFieldEdit(prev => ({ ...prev, mode: 'input' }))}
                      >
                        <Type size={13} />
                        <span>Input Box</span>
                      </button>
                    </div>
                  </div>

                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">Text Weight</span>
                    <div className="sd-segmented-control">
                      <button
                        type="button"
                        className={`sd-segment-btn ${!activeFieldEdit.bold ? 'is-active' : ''}`}
                        onClick={() => setActiveFieldEdit(prev => ({ ...prev, bold: false }))}
                      >
                        <span>Normal</span>
                      </button>
                      <button
                        type="button"
                        className={`sd-segment-btn ${activeFieldEdit.bold ? 'is-active' : ''}`}
                        style={activeFieldEdit.bold ? { fontWeight: 800 } : undefined}
                        onClick={() => setActiveFieldEdit(prev => ({ ...prev, bold: true }))}
                      >
                        <Bold size={13} />
                        <span>Bold (700)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Field Label */}
                <div className="sd-field-row-group">
                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">
                      Field Label (Displayed on Form) <span className="sd-required-star">*</span>
                    </span>
                    <input
                      className="sd-input sd-input-modern"
                      value={activeFieldEdit.label}
                      placeholder="e.g. Agreement Date, Full Name..."
                      onChange={e => setActiveFieldEdit(prev => ({
                        ...prev,
                        label: e.target.value,
                        key: prev.key === prev.label ? e.target.value : prev.key
                      }))}
                    />
                  </div>
                </div>

                {/* Input Type & Validation Toggle Aligned */}
                <div className="sd-field-two-col-grid" style={{ alignItems: 'flex-end' }}>
                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">Input Type</span>
                    <select
                      className="sd-input sd-input-modern"
                      value={activeFieldEdit.type}
                      onChange={e => setActiveFieldEdit(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text (Textarea)</option>
                      <option value="number">Number</option>
                      <option value="date">Date Picker</option>
                      <option value="dropdown">Dropdown Select</option>
                      <option value="checkbox">Checkbox (Yes / No)</option>
                    </select>
                  </div>

                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">Requirement</span>
                    <button
                      type="button"
                      className={`sd-required-toggle-btn ${activeFieldEdit.required ? 'is-required' : 'is-optional'}`}
                      onClick={() => setActiveFieldEdit(prev => ({ ...prev, required: !prev.required }))}
                    >
                      <div className="sd-req-status-dot" />
                      <span>{activeFieldEdit.required ? 'Mandatory (Required *)' : 'Optional Field'}</span>
                    </button>
                  </div>
                </div>

                {/* Help Description / Guidance for Form Filler */}
                <div className="sd-field-row-group">
                  <div className="sd-field-setting-block">
                    <div className="sd-flex-between">
                      <span className="sd-field-setting-label">
                        <Info size={13} className="sd-muted" /> Field Description &amp; Guidance
                      </span>
                      <span className="sd-muted sd-xs">Available when filling form</span>
                    </div>
                    <textarea
                      rows={2}
                      className="sd-input sd-input-modern"
                      style={{ resize: 'vertical', minHeight: '52px' }}
                      value={activeFieldEdit.description || ''}
                      placeholder="e.g. Enter full legal entity name as shown on official incorporation documents."
                      onChange={e => setActiveFieldEdit(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Placeholder Hint */}
                <div className="sd-field-row-group">
                  <div className="sd-field-setting-block">
                    <span className="sd-field-setting-label">Input Box Placeholder (Optional)</span>
                    <input
                      className="sd-input sd-input-modern"
                      value={activeFieldEdit.placeholder}
                      placeholder="e.g. Acme Corporation LLC"
                      onChange={e => setActiveFieldEdit(prev => ({ ...prev, placeholder: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Contextual: Field Width (Only if Direct Input Box) */}
                {activeFieldEdit.mode !== 'placeholder' && (
                  <div className="sd-field-contextual-box">
                    <div className="sd-field-setting-block">
                      <div className="sd-flex-between">
                        <span className="sd-field-setting-label">Field Width on Form Row</span>
                        <span className="sd-muted sd-xs">Direct input grid width</span>
                      </div>
                      <select
                        className="sd-input sd-input-modern"
                        value={activeFieldEdit.width || 0}
                        onChange={e => setActiveFieldEdit(prev => ({ ...prev, width: parseInt(e.target.value, 10) || 0 }))}
                      >
                        <option value={0}>Auto (default)</option>
                        {WIDTH_OPTIONS.map(w => (
                          <option key={w} value={w}>{w}% of the row</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Contextual: Dropdown Options (Only if dropdown) */}
                {activeFieldEdit.type === 'dropdown' && (
                  <div className="sd-field-contextual-box">
                    <div className="sd-field-setting-block">
                      <span className="sd-field-setting-label">Dropdown Options (Comma separated)</span>
                      <input
                        className="sd-input sd-input-modern"
                        value={(activeFieldEdit.options || []).join(', ')}
                        placeholder="Option A, Option B, Option C"
                        onChange={e => setActiveFieldEdit(prev => ({
                          ...prev,
                          options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }))}
                      />
                      <span className="sd-hint">Separate options with commas</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sd-field-edit-footer">
                {!activeFieldEdit.isNew ? (
                  <button
                    type="button"
                    className="sd-btn-delete-field"
                    onClick={handleDeleteFieldEdit}
                  >
                    <Trash2 size={13} />
                    <span>Remove Field</span>
                  </button>
                ) : <div />}

                <div className="sd-field-footer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCancelFieldEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm sd-btn-apply-changes"
                    onClick={() => handleSaveFieldEdit(activeFieldEdit)}
                  >
                    <Check size={14} />
                    <span>{activeFieldEdit.isNew ? 'Insert Field' : 'Apply Changes'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* POPUP 2: Signature Slot Editor */}
        {activeSigEdit && (
          <div className="sd-field-edit-modal-backdrop">
            <div className="sd-field-edit-card" onClick={e => e.stopPropagation()}>
              <div className="sd-field-edit-header">
                <h4>Signature Block Settings</h4>
                <button className="sd-icon-btn sd-icon-btn-xs" onClick={() => setActiveSigEdit(null)}>
                  <X size={13} />
                </button>
              </div>

              <div className="sd-field-edit-body">
                <label className="sd-field">
                  <span className="sd-label">Signatory Role / Department</span>
                  <select
                    className="sd-input"
                    value={activeSigEdit.slot}
                    onChange={e => setActiveSigEdit(prev => ({ ...prev, slot: e.target.value }))}
                  >
                    <option value="Submitter">Submitter / Applicant Signature</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name} Department Admin Signature</option>
                    ))}
                  </select>
                  <span className="sd-hint">
                    Adding a department signature automatically synchronizes it with the sequential approval workflow.
                  </span>
                </label>
              </div>

              <div className="sd-field-edit-footer">
                <button className="btn btn-outline-danger btn-sm" onClick={handleDeleteSigEdit}>
                  <Trash2 size={13} /> Remove Block
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleSaveSigEdit(activeSigEdit.slot)}>
                  Apply Signature
                </button>
              </div>
            </div>
          </div>
        )}

        {/* POPUP 3: Git Commit Message Modal for Template Versioning */}
        {showCommitModal && isEditingExisting && (
          <Modal
            id="modal-commit-template"
            size="md"
            title={`Save & Commit Version ${(targetTemplate?.version || 1) + 1}`}
            subtitle={`Document: ${targetTemplate?.title || title}`}
            onClose={() => setShowCommitModal(false)}
            footer={
              <>
                <button className="btn btn-secondary" onClick={() => setShowCommitModal(false)} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveEdit}
                  disabled={saving || !commitMessage.trim()}
                >
                  {saving ? <span className="sd-spin">⏳</span> : <GitCommit size={14} />}
                  {saving ? 'Saving…' : `Commit & Bump to v${(targetTemplate?.version || 1) + 1}`}
                </button>
              </>
            }
          >
            <div className="sd-commit-modal-body">
              <div className="sd-alert sd-alert-info">
                <GitCommit size={16} />
                <div>
                  Template changes are versioned like a Git repository. Describe what was changed in this version.
                </div>
              </div>
              <label className="sd-field">
                <span className="sd-label">Commit Summary / Changes Made *</span>
                <textarea
                  rows={3}
                  className="sd-input"
                  placeholder="e.g., Added mandatory budget number field and changed 2nd approval step to Finance"
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  autoFocus
                />
                <span className="sd-hint">
                  This summary will be permanently recorded in the template's Git version log with your name and timestamp.
                </span>
              </label>
            </div>
          </Modal>
        )}

        {/* POPUP 4: Pre-Publish Review Prompt Modal */}
        {showPrePublishPrompt && (
          <PrePublishReviewPromptModal
            title={title}
            isPublishing={saving}
            isEditingExisting={isEditingExisting}
            onClose={() => setShowPrePublishPrompt(false)}
            onPublishDirect={executeDirectPublish}
            onSendForReview={handleOpenSendForReview}
          />
        )}

        {/* POPUP 5: Send for Review Modal */}
        {showSendForReview && (
          <SendForReviewModal
            title={title}
            onClose={() => setShowSendForReview(false)}
            onSend={handleSendForReview}
          />
        )}

        {/* POPUP 6: Insert Image Dialog */}
        <ImageInsertDialog
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          onInsert={insertImageAtCursor}
          addToast={addToast}
        />
      </div>
    </div>
  );
};

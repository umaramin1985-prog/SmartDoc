// SmartDoc Word template engine
// - Detects {{Placeholder}} tags inside uploaded .docx and legacy .doc files
// - Renders a filled .docx with form answers + PNG signature images stamped in
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import WordExtractor from 'word-extractor';
import mammoth from 'mammoth';
import htmlToDocx from 'html-to-docx';

const DELIMITERS = { start: '{{', end: '}}' };
const SIGNATURE_RE = /^(?:signature|sig)\s*:\s*([^|}]+?)(?:\s*\|.*)?$/i;

// Tags filled automatically by the system (never asked from the user)
export const SYSTEM_TAGS = ['Form ID', 'Submitted By', 'Submitted Date', 'Version', 'Department'];

const normalize = (s) =>
  String(s || '')
    .replace(/&(amp;)+/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function loadZip(base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  return new PizZip(Buffer.from(clean, 'base64'));
}

function friendlyError(err) {
  const inner = err?.properties?.errors;
  if (Array.isArray(inner) && inner.length) {
    return inner.map(e => e.properties?.explanation || e.message).join('; ');
  }
  return err?.properties?.explanation || err?.message || 'Unreadable Word document';
}

function categorizeTags(tags) {
  const fields = [];
  const signatureSlots = [];
  const systemTags = [];
  const seen = new Set();

  for (const tag of tags) {
    const key = normalize(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    const sig = tag.match(SIGNATURE_RE);
    if (sig) signatureSlots.push(sig[1].trim());
    else if (SYSTEM_TAGS.some(s => normalize(s) === key)) systemTags.push(tag);
    else fields.push(tag);
  }
  return { fields, signatureSlots, systemTags };
}

function extractRtfText(rtfString) {
  // Preserve {{...}} placeholders
  const placeholders = [];
  let s = String(rtfString || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, tag) => {
    placeholders.push(tag);
    return `__SD_TAG_${placeholders.length - 1}__`;
  });
  s = s
    .replace(/\\+par[d]?\b/g, '\n')
    .replace(/\\+tab\b/g, '\t')
    .replace(/\\+line\b/g, '\n')
    .replace(/\{\\*?\\+[a-z0-9]+[\s\S]*?\}/gi, '')
    .replace(/\\+([a-zA-Z]+)(-?\d+)? ?/g, '')
    .replace(/[{}\\\r]/g, '');

  placeholders.forEach((tag, i) => {
    s = s.replace(`__SD_TAG_${i}__`, `{{${tag}}}`);
  });
  return s.trim();
}

/**
 * Sanitizes HTML produced from uploaded Word (.docx / .doc) files so it strictly uses
 * only tags and formatting supported in Manual Mode (no inline margin/padding, no h4-h6, no thead/th).
 */
export function sanitizeHtmlToManualMode(rawHtml) {
  if (!rawHtml) return '<p></p>';
  let s = String(rawHtml);

  // Convert h4, h5, h6 to h3 (Manual Mode supports H1, H2, H3)
  s = s.replace(/<h[4-6]\b([^>]*)>([\s\S]*?)<\/h[4-6]>/gi, '<h3$1>$2</h3>');

  // Unwrap thead / tfoot and convert th cells to td with strong (matching Manual Mode tables)
  s = s.replace(/<\/?(?:thead|tfoot)\b[^>]*>/gi, '');
  s = s.replace(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi, (_, attrs, inner) => {
    const trimmed = inner.trim();
    const wrapped = /^<strong\b/i.test(trimmed) ? trimmed : `<strong>${trimmed}</strong>`;
    return `<td${attrs}>${wrapped}</td>`;
  });

  // Strip inline margin and padding declarations from paragraphs, headings, tables, and lists
  s = s.replace(/(<(?:p|h[1-3]|table|tr|td|ul|ol|li|blockquote)\b[^>]*?)\sstyle="([^"]*)"/gi, (full, tagStart, styleVal) => {
    const allowed = styleVal
      .split(';')
      .map(rule => rule.trim())
      .filter(Boolean)
      .filter(rule => {
        const prop = (rule.split(':')[0] || '').trim().toLowerCase();
        return ['text-align', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'width'].includes(prop);
      });
    return allowed.length > 0 ? `${tagStart} style="${allowed.join('; ')}"` : tagStart;
  });

  return s.trim() || '<p></p>';
}

/**
 * Convert extracted Word .doc text into structured HTML paragraphs, headings, and tables
 * strictly matching Manual Mode output (no inline margin/padding; uses <p><br/></p> line breaks).
 */
export function convertDocTextToHtml(text) {
  if (!text) return '<p></p>';
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const parts = [];

  for (let i = 0; i < blocks.length; i++) {
    const trimmed = blocks[i].trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const hasTabs = lines.some(l => l.includes('\t'));

    if (hasTabs && lines.length > 0) {
      let tbl = '<table><tbody>';
      for (const line of lines) {
        tbl += '<tr>';
        for (const cell of line.split('\t')) {
          tbl += `<td>${escXml(cell.trim()) || '&nbsp;'}</td>`;
        }
        tbl += '</tr>';
      }
      tbl += '</tbody></table>';
      parts.push(tbl);
    } else if (lines.length === 1 && trimmed.length < 80 && !/[.?!]$/.test(trimmed) && !trimmed.includes('{{') && (
      /^[A-Z0-9\s—–:-]{4,}$/.test(trimmed) || /^(agreement|contract|form|policy|application|request|memorandum|notice)\b/i.test(trimmed)
    )) {
      parts.push(`<h2>${escXml(trimmed)}</h2>`);
    } else {
      for (const line of lines) {
        const cleanLine = escXml(line.trim());
        if (cleanLine) {
          parts.push(`<p>${cleanLine}</p>`);
        }
      }
    }

    if (i < blocks.length - 1) {
      parts.push('<p><br/></p>');
    }
  }

  return parts.length ? parts.join('\n') : '<p></p>';
}

/**
 * Parse a Word document (.docx or .doc) and return detected placeholders.
 * @returns {Promise<{ fields: string[], signatureSlots: string[], systemTags: string[] }>}
 */
export async function parseTemplate(base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');

  // 1. Try parsing as standard .docx first (ZIP format with word/document.xml)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    try {
      const zip = new PizZip(buffer);
      if (zip.file('word/document.xml')) {
        const collected = [];
        new Docxtemplater(zip, {
          delimiters: DELIMITERS,
          paragraphLoop: true,
          linebreaks: true,
          parser: (tag) => { collected.push(tag); return { get: () => '' }; }
        });
        const tags = collected.map(t => String(t).trim()).filter(Boolean);
        return categorizeTags(tags);
      }
    } catch (err) {
      console.warn('[parseTemplate] docxtemplater parse error, trying WordExtractor:', err.message);
    }
  }

  // 2. Try parsing as legacy Word .doc using WordExtractor (supports OLE2 and OpenOffice)
  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    const bodyText = doc.getBody() || '';
    const headersText = (typeof doc.getHeaders === 'function' ? doc.getHeaders() : '') || '';
    const footersText = (typeof doc.getFooters === 'function' ? doc.getFooters() : '') || '';
    const fullText = `${headersText}\n${bodyText}\n${footersText}`;

    const matches = fullText.match(/\{\{\s*([^{}]+?)\s*\}\}/g) || [];
    const tags = matches.map(m => m.replace(/^\{\{\s*|\s*\}\}$/g, '').trim()).filter(Boolean);
    return categorizeTags(tags);
  } catch (err) {
    // 3. Fallback: check if it's RTF or plain text with {{tags}}
    const textSample = buffer.toString('utf8');
    if (textSample.includes('{{')) {
      const matches = textSample.match(/\{\{\s*([^{}]+?)\s*\}\}/g) || [];
      const tags = matches.map(m => m.replace(/^\{\{\s*|\s*\}\}$/g, '').trim()).filter(Boolean);
      return categorizeTags(tags);
    }
    throw new Error('Unreadable Word document. Please ensure the file is a valid .docx or .doc file.');
  }
}

/**
 * Universal Word Document Parser (.docx and .doc).
 * Converts the file to editable HTML and extracts form fields, signature slots, and system tags.
 */
export async function parseWordDocument(base64) {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  let html = '';
  let messages = [];
  let isLegacyDoc = false;

  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;

  if (isZip) {
    try {
      const res = await mammoth.convertToHtml({ buffer });
      html = res.value || '';
      messages = res.messages || [];
    } catch (err) {
      console.warn('[parseWordDocument] mammoth failed on docx, trying WordExtractor fallback:', err.message);
    }
  }

  if (!html) {
    isLegacyDoc = true;
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      const text = doc.getBody() || '';
      html = convertDocTextToHtml(text);
    } catch (err) {
      const isRtf = buffer.length >= 5 && buffer[0] === 0x7B && buffer[1] === 0x5C && buffer[2] === 0x72 && buffer[3] === 0x74 && buffer[4] === 0x66;
      const rawStr = buffer.toString('utf8');
      if (isRtf || rawStr.includes('{\\rtf')) {
        const text = extractRtfText(rawStr);
        html = convertDocTextToHtml(text);
      } else if (rawStr.includes('{{') || rawStr.trim().length > 10) {
        // Fallback for text-based doc templates
        html = convertDocTextToHtml(rawStr);
      } else {
        throw new Error('Failed to parse Word document (.doc / .docx): ' + err.message);
      }
    }
  }

  let parsed = { fields: [], signatureSlots: [], systemTags: [] };
  try {
    parsed = await parseTemplate(base64);
  } catch (err) {
    console.warn('[parseWordDocument] parseTemplate error:', err.message);
  }

  return {
    html: sanitizeHtmlToManualMode(html),
    fields: parsed.fields,
    signatureSlots: parsed.signatureSlots,
    systemTags: parsed.systemTags,
    messages,
    isLegacyDoc
  };
}

// ---------- signature image helpers ----------
const EMU_PER_PX = 9525;
const SIG_W_PX = 168; // ~1.75in
const SIG_H_PX = 60;

function drawingXml(rId, picId) {
  const cx = SIG_W_PX * EMU_PER_PX;
  const cy = SIG_H_PX * EMU_PER_PX;
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${picId}" name="SmartDoc Signature ${picId}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${picId}" name="signature${picId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

const escXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10);
};

function ensureNamespaces(xml) {
  const ns = {
    'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  };
  return xml.replace(/<w:document\b([^>]*)>/, (full, attrs) => {
    let a = attrs;
    for (const [k, v] of Object.entries(ns)) {
      if (!a.includes(`${k}=`)) a += ` ${k}="${v}"`;
    }
    return `<w:document${a}>`;
  });
}

/**
 * Render a filled .docx.
 * @param {string} templateBase64
 * @param {object} opts
 *   values: { [fieldLabel]: string }
 *   system: { [systemTag]: string }
 *   signatures: [{ slot: 'Submitter' | '<Department>', label, name, date, image (png data URL) }]
 * @returns {Buffer}
 */
export function renderFilledDocument(templateBase64, { values = {}, system = {}, signatures = [], fields = [], blank = false }) {
  const zip = loadZip(templateBase64);

  const valueMap = new Map(Object.entries(values || {}).map(([k, v]) => [normalize(k), v]));
  const systemMap = new Map(Object.entries(system || {}).map(([k, v]) => [normalize(k), v]));
  const sigBySlot = new Map((signatures || []).filter(s => s && s.image).map(s => [normalize(s.slot), s]));

  // Index template fields by key and label for formatting direct inputs
  const fieldMap = new Map();
  (Array.isArray(fields) ? fields : []).forEach(f => {
    if (!f) return;
    if (f.key) fieldMap.set(normalize(f.key), f);
    if (f.label) fieldMap.set(normalize(f.label), f);
  });

  const markers = []; // { marker, sig }
  let usedSignatureTag = false;

  const doc = new Docxtemplater(zip, {
    delimiters: DELIMITERS,
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => (blank ? '________________________________________' : ''),
    parser: (tag) => ({
      get: () => {
        const t = tag.trim();
        const sig = t.match(SIGNATURE_RE);
        if (sig) {
          usedSignatureTag = true;
          const slotName = sig[1].trim();
          const normSlot = normalize(slotName);
          if (blank) {
            return `________________________________________ (${slotName} Signature & Date)`;
          }
          const found = sigBySlot.get(normSlot)
            || (['submitter', 'applicant', 'originator'].includes(normSlot)
              ? (sigBySlot.get('submitter') || sigBySlot.get('applicant') || sigBySlot.get('originator'))
              : null);
          if (!found) {
            return `________________________________________ (${slotName} Signature & Date)`;
          }
          const marker = `@@SMARTDOC_SIG_${markers.length}@@`;
          markers.push({ marker, sig: found });
          return marker;
        }

        const key = normalize(t);
        if (systemMap.has(key)) return String(systemMap.get(key) ?? '');

        const f = fieldMap.get(key);
        const isDirect = f ? f.mode === 'input' : false;
        const fieldLabel = f?.label || f?.key || t;

        const rawVal = valueMap.has(key) ? String(valueMap.get(key) ?? '').trim() : '';
        const hasVal = rawVal.length > 0;

        if (blank) {
          return isDirect
            ? `${fieldLabel}: ________________________________________`
            : '________________________________________';
        }

        if (hasVal) {
          return isDirect
            ? `${fieldLabel}: ${rawVal}`
            : rawVal;
        }

        // If not blank, but field is unfilled when printed:
        return isDirect
          ? `${fieldLabel}: —`
          : '—';
      }
    })
  });

  try {
    doc.render({});
  } catch (err) {
    throw new Error(`Could not render document: ${friendlyError(err)}`);
  }

  const out = doc.getZip();
  let xml = out.file('word/document.xml').asText();
  let relsXml = out.file('word/_rels/document.xml.rels')?.asText()
    || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  let picCounter = 9000;
  const addImage = (dataUrl) => {
    picCounter += 1;
    const rId = `rIdSmartDocSig${picCounter}`;
    const fileName = `smartdoc_sig_${picCounter}.png`;
    out.file(`word/media/${fileName}`, Buffer.from(String(dataUrl).replace(/^data:[^;]+;base64,/, ''), 'base64'));
    relsXml = relsXml.replace('</Relationships>',
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/></Relationships>`);
    return drawingXml(rId, picCounter);
  };

  // 1. Inline signature placeholders -> image + name/date caption
  for (const { marker, sig } of markers) {
    if (!xml.includes(marker)) continue;
    const drawing = addImage(sig.image);
    const caption = `${sig.name || ''}${sig.date ? `  (${fmtDate(sig.date)})` : ''}`;
    const pkiText = sig.pkiFingerprint ? `[PKI Certified: ${sig.pkiFingerprint.slice(0, 26)}...]` : '';
    const pkiFragment = pkiText
      ? `</w:r><w:r><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="16"/></w:rPr><w:br/><w:t xml:space="preserve">${escXml(pkiText)}</w:t>`
      : '';
    xml = xml.replace(marker,
      `</w:t></w:r><w:r>${drawing}</w:r><w:r><w:br/><w:t xml:space="preserve">${escXml(caption)}</w:t>${pkiFragment}</w:r><w:r><w:t xml:space="preserve">`);
  }

  // 2. Template has no signature placeholders -> append an approval signature block
  if (!usedSignatureTag && signatures.some(s => s.image)) {
    let block = '<w:p><w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>Signatures</w:t></w:r></w:p>';
    for (const sig of signatures.filter(s => s.image)) {
      block += `<w:p><w:pPr><w:spacing w:before="200" w:after="0"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(sig.label || sig.slot)}</w:t></w:r></w:p>`;
      block += `<w:p><w:r>${addImage(sig.image)}</w:r></w:p>`;
      block += `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:t xml:space="preserve">${escXml(sig.name || '')}${sig.date ? `  —  ${escXml(fmtDate(sig.date))}` : ''}</w:t></w:r></w:p>`;
      if (sig.pkiFingerprint) {
        block += `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">[PKI Digitally Sealed: ${escXml(sig.pkiFingerprint)}]</w:t></w:r></w:p>`;
      }
    }
    const bodyEnd = xml.lastIndexOf('</w:body>');
    const sectIdx = xml.lastIndexOf('<w:sectPr', bodyEnd);
    const lastParaEnd = xml.lastIndexOf('</w:p>', bodyEnd);
    const insertAt = sectIdx > lastParaEnd ? sectIdx : bodyEnd;
    xml = xml.slice(0, insertAt) + block + xml.slice(insertAt);
  } else if (blank && !usedSignatureTag) {
    // Blank template without signature tags -> append blank signature lines for physical sign-off
    let block = '<w:p><w:pPr><w:spacing w:before="480" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>Signatures</w:t></w:r></w:p>';
    block += '<w:p><w:pPr><w:spacing w:before="200" w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Submitter / Applicant</w:t></w:r></w:p>';
    block += '<w:p><w:r><w:t>Signature: ________________________________________   Date: ______________</w:t></w:r></w:p>';
    block += '<w:p><w:pPr><w:spacing w:before="200" w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Department Approval</w:t></w:r></w:p>';
    block += '<w:p><w:r><w:t>Signature: ________________________________________   Date: ______________</w:t></w:r></w:p>';
    const bodyEnd = xml.lastIndexOf('</w:body>');
    const sectIdx = xml.lastIndexOf('<w:sectPr', bodyEnd);
    const lastParaEnd = xml.lastIndexOf('</w:p>', bodyEnd);
    const insertAt = sectIdx > lastParaEnd ? sectIdx : bodyEnd;
    xml = xml.slice(0, insertAt) + block + xml.slice(insertAt);
  }

  if (picCounter > 9000) {
    xml = ensureNamespaces(xml);
    out.file('word/_rels/document.xml.rels', relsXml);
    let ct = out.file('[Content_Types].xml').asText();
    if (!/Extension="png"/i.test(ct)) {
      ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
      out.file('[Content_Types].xml', ct);
    }
  }
  out.file('word/document.xml', xml);

  const rawBuf = out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return repairDocxBuffer(rawBuf);
}

// ---------- OpenXML & Microsoft Word Compatibility Engine ----------

const TBL_BORDERS_ORDER = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV', 'tl2br', 'tr2bl'];
const CELL_MAR_ORDER = ['top', 'left', 'bottom', 'right'];
const TBL_PR_ORDER = [
  'tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize',
  'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar',
  'tblLook', 'tblCaption', 'tblDescription'
];
const TC_PR_ORDER = [
  'cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap',
  'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'
];
const P_PR_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
  'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap',
  'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
  'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap',
  'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle',
  'rPr', 'sectPr'
];
const R_PR_ORDER = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike',
  'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden',
  'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect',
  'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath'
];

function sortXmlChildrenBySchema(innerXml, orderList) {
  const tokenRe = /<w:([a-zA-Z0-9]+)\b[^/>]*\/>|<w:([a-zA-Z0-9]+)\b[^/>]*>[\s\S]*?<\/w:\2>/g;
  const items = [];
  let m;
  while ((m = tokenRe.exec(innerXml)) !== null) {
    const tag = m[1] || m[2];
    const idx = orderList.indexOf(tag);
    items.push({ tag, xml: m[0], order: idx === -1 ? 999 : idx, pos: items.length });
  }
  if (items.length <= 1) return innerXml;
  items.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.pos - b.pos));
  return items.map(x => x.xml).join('');
}

export function cleanWordFontName(rawFont) {
  if (!rawFont) return 'Calibri';
  const first = String(rawFont).split(',')[0].replace(/['"]/g, '').trim();
  if (!first || /^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(first)) return 'Calibri';
  return first;
}

export function parseWordFontSizeHalfPts(rawSize) {
  if (!rawSize) return 22; // 11pt default
  const str = String(rawSize).trim().toLowerCase();
  const num = parseFloat(str);
  if (Number.isNaN(num) || num <= 0) return 22;
  if (str.endsWith('px')) {
    return Math.round((num * 0.75) * 2);
  }
  return Math.round(num * 2);
}

/**
 * Repairs all OpenXML schema & OPC packaging defects produced by html-to-docx
 * so Microsoft Word desktop opens the .docx file with zero errors:
 * - Removes directory entries (_rels/, word/, etc.) from the ZIP central directory
 * - Removes illegal <Override PartName="/_rels/.rels"> and <Override PartName="/word/_rels/document.xml.rels"> from [Content_Types].xml
 * - Fixes w:header="undefined" w:footer="undefined" w:gutter="undefined" on <w:pgMar>
 * - Removes broken unprefixed <hdr>/<ftr> header1.xml/footer1.xml and empty numbering.xml
 * - Moves <w:sectPr> from the start of <w:body> to the end of <w:body>
 * - Fixes <w:spacing w:lineRule="auto"/> without w:line, <w:br w:type="textWrapping"/>, and empty <w:r><w:rPr/></w:r>
 * - Reorders <w:tblPr>, <w:tblBorders>, <w:tblCellMar>, <w:tcPr>, <w:tcBorders> children to strict ISO/IEC 29500-1 order
 */
export function repairDocxBuffer(inputBuffer, options = {}) {
  const buf = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : Buffer.from(String(inputBuffer || '').replace(/^data:[^;]+;base64,/, ''), 'base64');

  const srcZip = new PizZip(buf);
  const fontName = options.fontFamily ? cleanWordFontName(options.fontFamily) : null;
  const fontHalfPts = options.fontSize ? parseWordFontSizeHalfPts(options.fontSize) : null;

  // 1. Check if header1.xml / footer1.xml are broken unprefixed <hdr>/<ftr> from html-to-docx
  let removeHeader1 = false;
  let removeFooter1 = false;
  let removeNumbering = false;

  const hdr1 = srcZip.file('word/header1.xml')?.asText() || '';
  if (hdr1 && (hdr1.includes('<hdr ') || !hdr1.includes('<w:hdr'))) {
    removeHeader1 = true;
  }
  const ftr1 = srcZip.file('word/footer1.xml')?.asText() || '';
  if (ftr1 && (ftr1.includes('<ftr ') || !ftr1.includes('<w:ftr'))) {
    removeFooter1 = true;
  }
  const numXml = srcZip.file('word/numbering.xml')?.asText() || '';
  if (numXml && !/<w:(?:abstractNum|num)\b/.test(numXml)) {
    removeNumbering = true;
  }

  // 2. Repair word/document.xml
  let docXml = srcZip.file('word/document.xml')?.asText() || '';
  if (docXml) {
    // Fix "undefined" attributes in <w:pgMar>
    docXml = docXml
      .replace(/w:header="undefined"/g, 'w:header="720"')
      .replace(/w:footer="undefined"/g, 'w:footer="720"')
      .replace(/w:gutter="undefined"/g, 'w:gutter="0"');

    // Remove broken headerReference / footerReference
    if (removeHeader1) {
      docXml = docXml.replace(/<w:headerReference\b[^>]*\/>/g, '');
    }
    if (removeFooter1) {
      docXml = docXml.replace(/<w:footerReference\b[^>]*\/>/g, '');
    }

    // Fix <w:spacing w:lineRule="auto"/> without w:line
    docXml = docXml.replace(/<w:spacing\b([^>]*)\/>/g, (full, attrs) => {
      if (attrs.includes('w:lineRule="auto"') && !attrs.includes('w:line=')) {
        return `<w:spacing${attrs} w:line="260"/>`;
      }
      return full;
    });

    // Replace <w:br w:type="textWrapping"/> with standard <w:br/>
    docXml = docXml.replace(/<w:br\s+w:type="textWrapping"\s*\/>/g, '<w:br/>');

    // Remove empty <w:r><w:rPr/></w:r> runs that have no text, br, or drawing
    docXml = docXml.replace(/<w:r>\s*<w:rPr\/>\s*<\/w:r>/g, '');

    // Fix double/multiple-escaped &amp;amp; inside {{...}} tags
    docXml = docXml.replace(/(\{\{[^{}]*)&(amp;){2,}([^{}]*\}\})/gi, '$1&amp;$3');

    // Strict schema ordering for <w:tblBorders> and <w:tcBorders>
    docXml = docXml.replace(/<w:(tblBorders|tcBorders)>([\s\S]*?)<\/w:\1>/g, (_, tag, inner) => {
      return `<w:${tag}>${sortXmlChildrenBySchema(inner, TBL_BORDERS_ORDER)}</w:${tag}>`;
    });

    // Strict schema ordering for <w:tblCellMar> and <w:tcMar>
    docXml = docXml.replace(/<w:(tblCellMar|tcMar)>([\s\S]*?)<\/w:\1>/g, (_, tag, inner) => {
      return `<w:${tag}>${sortXmlChildrenBySchema(inner, CELL_MAR_ORDER)}</w:${tag}>`;
    });

    // Strict schema ordering for <w:tblPr>
    docXml = docXml.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/g, (_, inner) => {
      let fixedInner = inner;
      if (!fixedInner.includes('<w:tblW')) {
        fixedInner = `<w:tblW w:w="5000" w:type="pct"/>` + fixedInner;
      }
      return `<w:tblPr>${sortXmlChildrenBySchema(fixedInner, TBL_PR_ORDER)}</w:tblPr>`;
    });

    // Strict schema ordering for <w:tcPr>
    docXml = docXml.replace(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g, (_, inner) => {
      return `<w:tcPr>${sortXmlChildrenBySchema(inner, TC_PR_ORDER)}</w:tcPr>`;
    });

    // Strict schema ordering for <w:rPr>
    docXml = docXml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_, inner) => {
      return `<w:rPr>${sortXmlChildrenBySchema(inner, R_PR_ORDER)}</w:rPr>`;
    });

    // Strict schema ordering for <w:pPr>
    docXml = docXml.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (_, inner) => {
      return `<w:pPr>${sortXmlChildrenBySchema(inner, P_PR_ORDER)}</w:pPr>`;
    });

    // Move body-level <w:sectPr> from start of <w:body> to end of <w:body>
    const bodyStartMatch = docXml.match(/(<w:body[^>]*>)\s*(<w:sectPr>[\s\S]*?<\/w:sectPr>)/);
    if (bodyStartMatch) {
      const sectPrXml = bodyStartMatch[2];
      docXml = docXml.replace(bodyStartMatch[0], bodyStartMatch[1]);
      const bodyEndIdx = docXml.lastIndexOf('</w:body>');
      if (bodyEndIdx !== -1) {
        // Ensure at least one <w:p> precedes <w:sectPr>
        const beforeEnd = docXml.slice(0, bodyEndIdx);
        const needsTrailingP = /<\/w:tbl>\s*$/.test(beforeEnd);
        const trailingP = needsTrailingP ? '<w:p/>' : '';
        docXml = beforeEnd + trailingP + sectPrXml + docXml.slice(bodyEndIdx);
      }
    }

    srcZip.file('word/document.xml', docXml);
  }

  // 3. Repair word/_rels/document.xml.rels
  let relsXml = srcZip.file('word/_rels/document.xml.rels')?.asText() || '';
  if (relsXml) {
    relsXml = relsXml.replace(/\s+TargetMode="Internal"/g, '');
    if (removeHeader1) {
      relsXml = relsXml.replace(/<Relationship\b[^>]*Target="header1\.xml"[^>]*\/>/g, '');
    }
    if (removeFooter1) {
      relsXml = relsXml.replace(/<Relationship\b[^>]*Target="footer1\.xml"[^>]*\/>/g, '');
    }
    if (removeNumbering) {
      relsXml = relsXml.replace(/<Relationship\b[^>]*Target="numbering\.xml"[^>]*\/>/g, '');
    }
    srcZip.file('word/_rels/document.xml.rels', relsXml);
  }

  // 4. Repair [Content_Types].xml (remove illegal <Override> for .rels parts and removed parts)
  let ctXml = srcZip.file('[Content_Types].xml')?.asText() || '';
  if (ctXml) {
    ctXml = ctXml
      .replace(/<Override\b[^>]*PartName="\/_rels\/\.rels"[^>]*\/>/g, '')
      .replace(/<Override\b[^>]*PartName="\/word\/_rels\/document\.xml\.rels"[^>]*\/>/g, '');
    if (removeHeader1) {
      ctXml = ctXml.replace(/<Override\b[^>]*PartName="\/word\/header1\.xml"[^>]*\/>/g, '');
    }
    if (removeFooter1) {
      ctXml = ctXml.replace(/<Override\b[^>]*PartName="\/word\/footer1\.xml"[^>]*\/>/g, '');
    }
    if (removeNumbering) {
      ctXml = ctXml.replace(/<Override\b[^>]*PartName="\/word\/numbering\.xml"[^>]*\/>/g, '');
    }
    srcZip.file('[Content_Types].xml', ctXml);
  }

  // 5. Sync fontFamily & fontSize in word/styles.xml and word/theme/theme1.xml if specified
  if (fontName || fontHalfPts) {
    let stylesXml = srcZip.file('word/styles.xml')?.asText() || '';
    if (stylesXml) {
      if (fontName) {
        stylesXml = stylesXml.replace(
          /<w:rFonts\b[^>]*\/>/,
          `<w:rFonts w:ascii="${escXml(fontName)}" w:hAnsi="${escXml(fontName)}" w:cs="${escXml(fontName)}"/>`
        );
      }
      if (fontHalfPts) {
        stylesXml = stylesXml.replace(
          /(<w:rPrDefault>[\s\S]*?<w:sz w:val=")\d+("[\s\S]*?<w:szCs w:val=")\d+(")/,
          `$1${fontHalfPts}$2${fontHalfPts}$3`
        );
      }
      srcZip.file('word/styles.xml', stylesXml);
    }
    if (fontName) {
      let themeXml = srcZip.file('word/theme/theme1.xml')?.asText() || '';
      if (themeXml) {
        themeXml = themeXml.replace(/typeface="Times New Roman"/g, `typeface="${escXml(fontName)}"`);
        srcZip.file('word/theme/theme1.xml', themeXml);
      }
    }
  }

  // 6. Repack into a clean PizZip archive WITHOUT directory entries (_rels/, word/, etc.)
  const cleanZip = new PizZip();
  for (const [entryName, entryObj] of Object.entries(srcZip.files)) {
    if (entryObj.dir || entryName.endsWith('/')) continue;
    if (removeHeader1 && entryName === 'word/header1.xml') continue;
    if (removeFooter1 && entryName === 'word/footer1.xml') continue;
    if (removeNumbering && entryName === 'word/numbering.xml') continue;
    cleanZip.file(entryName, entryObj.asNodeBuffer(), { createFolders: false });
  }

  return cleanZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Pre-processes HTML before passing to html-to-docx:
 * - Converts percentage widths on <td>/<th> (e.g. width: 50%) into pixel widths (e.g. width: 330px)
 *   because html-to-docx's buildTableCellWidth only supports pt/px/cm/in and throws on %
 */
function normalizeHtmlForDocx(rawHtml) {
  if (!rawHtml) return '<p></p>';
  const PAGE_CONTENT_PX = 660;
  let s = String(rawHtml);

  // Convert style="... width: XX% ..." on td/th to px
  s = s.replace(/<(td|th)\b([^>]*)>/gi, (full, tag, attrs) => {
    const fixedAttrs = attrs.replace(/style="([^"]*)"/i, (sFull, styleVal) => {
      const nextStyle = styleVal.replace(/\bwidth\s*:\s*([\d.]+)%/gi, (_, pct) => {
        const px = Math.max(40, Math.round((parseFloat(pct) / 100) * PAGE_CONTENT_PX));
        return `width: ${px}px`;
      });
      return `style="${nextStyle}"`;
    });
    return `<${tag}${fixedAttrs}>`;
  });

  return s;
}

/**
 * Compiles HTML into a 100% Microsoft Word-compatible .docx Buffer.
 */
export async function compileHtmlToValidDocx(html, options = {}) {
  const fontName = cleanWordFontName(options.fontFamily || options.font || 'Calibri');
  const fontHalfPts = parseWordFontSizeHalfPts(options.fontSize || '11pt');
  const safeHtml = normalizeHtmlForDocx(html || '<p></p>');

  const rawBuffer = await htmlToDocx(safeHtml, null, {
    title: options.title || 'SmartDoc Form',
    font: fontName,
    fontSize: fontHalfPts,
    complexScriptFontSize: fontHalfPts,
    header: false,
    footer: false,
    margins: {
      top: 1152,
      right: 1152,
      bottom: 1152,
      left: 1152,
      header: 720,
      footer: 720,
      gutter: 0
    }
  });

  return repairDocxBuffer(rawBuffer, {
    fontFamily: fontName,
    fontSize: options.fontSize || '11pt'
  });
}

/**
 * Renders a form template into a Filling-Form-style .docx Buffer where:
 * - Fonts (fontFamily & fontSize) match the form sheet
 * - System tags are resolved
 * - All unfilled direct input fields and in-text placeholders display a dash ('—') instead of {{placeholders}}
 * - Signature blocks render cleanly in their unsigned state
 */
export async function renderTemplateAsWordDocx(templateRow, actor = null) {
  const title = templateRow.title || 'Form Document';
  const department = templateRow.department || 'General';
  const version = templateRow.version || '1.0';
  const fontFamily = cleanWordFontName(templateRow.font_family || templateRow.fontFamily || 'Calibri');
  const fontSize = templateRow.font_size || templateRow.fontSize || '11pt';
  const rawFields = typeof templateRow.fields === 'string'
    ? JSON.parse(templateRow.fields || '[]')
    : (Array.isArray(templateRow.fields) ? templateRow.fields : []);

  const fieldsMap = new Map();
  rawFields.forEach(f => {
    if (!f) return;
    [f.key, f.label].forEach(k => {
      if (!k) return;
      const lower = String(k).toLowerCase().trim();
      const clean = lower.replace(/[*:\s]+$/, '').trim();
      fieldsMap.set(lower, f);
      fieldsMap.set(clean, f);
      fieldsMap.set(clean.replace(/\s+/g, '_'), f);
      fieldsMap.set(clean.replace(/\W+/g, '-'), f);
      fieldsMap.set(clean.replace(/\s+/g, ''), f);
    });
  });

  const lookupField = (rawTag) => {
    const fn = String(rawTag || '').trim().toLowerCase();
    const clean = fn.replace(/[*:\s]+$/, '').trim();
    return fieldsMap.get(fn)
      || fieldsMap.get(clean)
      || fieldsMap.get(clean.replace(/\s+/g, '_'))
      || fieldsMap.get(clean.replace(/\W+/g, '-'))
      || fieldsMap.get(clean.replace(/\s+/g, ''))
      || null;
  };

  let html = String(templateRow.html_content || templateRow.htmlContent || `<p>${escXml(title)}</p>`);

  // 1. Normalize Studio field pills into {{key}} tags first
  html = html.replace(/<span[^>]*class="[^"]*sd-doc-field-pill[^"]*"[^>]*data-field-key="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, (_, key) => `{{${key}}}`);

  // 2. Strip wrapping <strong>/<b> around {{field}} so field.bold controls weight
  html = html.replace(/<(strong|b)[^>]*>\s*(\{\{\s*[^}]+\}\})\s*<\/\1>/gi, '$2');

  // Helper to render a single direct input field cell
  const renderDirectFieldCell = (f, widthPct = 100) => {
    const label = f.label || f.key;
    const reqStar = f.required ? '<span style="color: #dc2626;"> *</span>' : '';
    const descHtml = f.description
      ? `<p style="font-size: 8pt; color: #64748b;">${escXml(f.description)}</p>`
      : '';
    const valHtml = f.type === 'checkbox'
      ? `<p>☐ ${escXml(f.placeholder || label || 'I Confirm & Agree')}</p>`
      : `<p>${f.bold ? '<strong>—</strong>' : '—'}</p>`;
    return `<td style="width: ${widthPct}%; border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: top;"><p style="font-size: 8.5pt; color: #475569;"><strong>${escXml(label)}</strong>${reqStar}</p>${descHtml}${valHtml}</td>`;
  };

  // 3. Convert paragraphs that contain only direct input {{fields}} into structured multi-column or single-column input box tables
  //    (done before system tag replacement so a user field named {{Department}} on its own line renders as a form field box)
  html = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (fullP, inner) => {
    const stripped = inner.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '').replace(/&nbsp;|\s|<br\s*\/?>/gi, '');
    if (stripped.length > 0) return fullP; // Paragraph has regular prose text too

    const tagMatches = [...inner.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
    if (tagMatches.length === 0) return fullP;
    if (tagMatches.some(m => SIGNATURE_RE.test(m[1].trim()))) return fullP;

    const matchedFields = tagMatches.map(m => lookupField(m[1])).filter(Boolean);
    if (matchedFields.length !== tagMatches.length) return fullP;

    const allDirect = matchedFields.every(f => f.mode === 'input' || (f.mode !== 'placeholder' && (f.width || f.type === 'textarea')));
    if (!allDirect) return fullP;

    const defaultW = Math.floor(100 / matchedFields.length);
    const cells = matchedFields.map(f => renderDirectFieldCell(f, f.width || defaultW)).join('');
    return `<table style="width: 100%; border-collapse: collapse;"><tbody><tr>${cells}</tr></tbody></table>`;
  });

  // 4. Resolve system tags
  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const submitterName = actor?.name || 'Submitter';

  html = html.replace(/\{\{\s*Form\s*ID\s*\}\}/gi, '[Auto-Generated on Submit]');
  html = html.replace(/\{\{\s*Submitted\s*By\s*\}\}/gi, escXml(submitterName));
  html = html.replace(/\{\{\s*Submitted\s*Date\s*\}\}/gi, escXml(todayFormatted));
  html = html.replace(/\{\{\s*Department\s*\}\}/gi, escXml(department));
  html = html.replace(/\{\{\s*Version\s*\}\}/gi, `v${escXml(version)}`);

  html = html.replace(/<span[^>]*class="[^"]*sd-doc-system-tag[^"]*"[^>]*data-sys-tag="([^"]+)"[^>]*>.*?<\/span>/gi, (_, tag) => {
    const t = tag.trim().toLowerCase();
    if (t === 'form id') return '[Auto-Generated on Submit]';
    if (t === 'submitted by') return escXml(submitterName);
    if (t === 'submitted date') return escXml(todayFormatted);
    if (t === 'department') return escXml(department);
    if (t === 'version') return `v${escXml(version)}`;
    return `[${escXml(tag)}]`;
  });

  // 5. Convert signature slots into clean Filling-Form signature blocks (unwrapping enclosing <p> tags)
  const renderSigHtml = (slotRaw) => {
    const slot = String(slotRaw || 'Submitter')
      .replace(/&(amp;)+/gi, '&')
      .trim();
    const isSub = ['submitter', 'applicant', 'originator'].includes(slot.toLowerCase());
    const roleTitle = isSub ? 'Applicant / Submitter' : `${slot} Approver`;
    const deptSub = isSub ? (actor?.department || department) : slot;
    return `<table style="width: 100%; border-collapse: collapse;"><tbody><tr><td style="width: 100%; border: 1px solid #cbd5e1; padding: 10px 12px; background-color: #f8fafc;"><p style="color: #64748b; font-size: 8.5pt;">${isSub ? 'Applicant / Submitter Signature (Signed on Submission)' : `Pending ${escXml(slot)} Department Approval`}</p><p>________________________________________</p><p><strong>${escXml(roleTitle)}</strong> — <span style="color: #475569;">${escXml(deptSub)}</span></p></td></tr></tbody></table>`;
  };

  html = html.replace(
    /<p\b[^>]*>\s*(?:<span[^>]*data-sig-width="[^"]*"[^>]*>)?\s*\{\{\s*(?:Signature|sig)\s*:\s*([^}|]+)(?:\|[^}]*)?\}\}\s*(?:<\/span>)?\s*<\/p>/gi,
    (_, slot) => renderSigHtml(slot)
  );
  html = html.replace(
    /<span[^>]*data-sig-width="[^"]*"[^>]*>\s*\{\{\s*(?:Signature|sig)\s*:\s*([^}|]+)(?:\|[^}]*)?\}\}\s*<\/span>/gi,
    (_, slot) => renderSigHtml(slot)
  );
  html = html.replace(
    /\{\{\s*(?:Signature|sig)\s*:\s*([^}|]+)(?:\|[^}]*)?\}\}/gi,
    (_, slot) => renderSigHtml(slot)
  );
  html = html.replace(
    /<div[^>]*class="[^"]*sd-doc-sig-block[^"]*"[^>]*data-sig-slot="([^"]+)"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
    (_, slot) => renderSigHtml(slot)
  );
  // Ensure no <table ...> remains nested inside a <p>
  html = html.replace(/<p\b[^>]*>\s*(<table\b[\s\S]*?<\/table>)\s*<\/p>/gi, '$1');

  // 6. Replace any remaining {{field}} tags (in-text placeholders or direct fields inside tables/prose)
  html = html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawTag) => {
    const f = lookupField(rawTag);
    if (!f) return '—';
    const isDirect = f.mode === 'input' || (f.mode !== 'placeholder' && (f.width || f.type === 'textarea'));
    if (!isDirect) {
      return f.bold ? '<strong>—</strong>' : '—';
    }
    const label = f.label || f.key;
    const reqStar = f.required ? '<span style="color: #dc2626;"> *</span>' : '';
    const valStr = f.type === 'checkbox'
      ? `☐ ${escXml(f.placeholder || label || 'I Confirm & Agree')}`
      : (f.bold ? '<strong>—</strong>' : '—');
    return `<strong>${escXml(label)}</strong>${reqStar}: ${valStr}`;
  });

  // 7. Prepend the subtle page header mark (matching FillFormModal .sd-word-page-header-mark)
  const headerBarHtml = `<table style="width: 100%; border-collapse: collapse;"><tbody><tr><td style="width: 65%; border: none; border-bottom: 1px solid #e2e8f0; padding: 0 0 6px 0; color: #64748b; font-size: 8.5pt;">${escXml(title)}</td><td style="width: 35%; border: none; border-bottom: 1px solid #e2e8f0; padding: 0 0 6px 0; text-align: right; color: #64748b; font-size: 8.5pt;">Department: ${escXml(department)}</td></tr></tbody></table><p><br/></p>`;

  const fullHtml = `<div style="font-family: ${escXml(fontFamily)}, sans-serif; font-size: ${escXml(fontSize)};">${headerBarHtml}${html}</div>`;

  return compileHtmlToValidDocx(fullHtml, {
    title,
    fontFamily,
    fontSize
  });
}

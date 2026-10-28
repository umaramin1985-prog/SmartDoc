// SmartDoc Word template engine
// - Detects {{Placeholder}} tags inside uploaded .docx and legacy .doc files
// - Renders a filled .docx with form answers + PNG signature images stamped in
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import WordExtractor from 'word-extractor';
import mammoth from 'mammoth';

const DELIMITERS = { start: '{{', end: '}}' };
const SIGNATURE_RE = /^(?:signature|sig)\s*:\s*([^|}]+?)(?:\s*\|.*)?$/i;

// Tags filled automatically by the system (never asked from the user)
export const SYSTEM_TAGS = ['Form ID', 'Submitted By', 'Submitted Date', 'Version', 'Department'];

const normalize = (s) => String(s || '').trim().toLowerCase();

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
 * Convert extracted Word .doc text into structured HTML paragraphs, headings, and tables.
 */
export function convertDocTextToHtml(text) {
  if (!text) return '<p></p>';
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const parts = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const hasTabs = lines.some(l => l.includes('\t'));

    if (hasTabs && lines.length > 0) {
      let tbl = '<table style="width: 100%; border-collapse: collapse; margin: 12px 0;"><tbody>';
      for (const line of lines) {
        tbl += '<tr>';
        for (const cell of line.split('\t')) {
          tbl += `<td style="border: 1px solid #d1d5db; padding: 6px 10px;">${escXml(cell.trim()) || '&nbsp;'}</td>`;
        }
        tbl += '</tr>';
      }
      tbl += '</tbody></table>';
      parts.push(tbl);
      continue;
    }

    // Heading heuristic: short single line in uppercase or typical title keyword
    if (lines.length === 1 && trimmed.length < 80 && !/[.?!]$/.test(trimmed) && !trimmed.includes('{{')) {
      if (/^[A-Z0-9\s—–:-]{4,}$/.test(trimmed) || /^(agreement|contract|form|policy|application|request|memorandum|notice)\b/i.test(trimmed)) {
        parts.push(`<h2 style="margin: 12px 0 8px;">${escXml(trimmed)}</h2>`);
        continue;
      }
    }

    const paraHtml = lines.map(l => escXml(l.trim())).filter(Boolean).join('<br>');
    if (paraHtml) {
      parts.push(`<p style="margin: 0 0 10px;">${paraHtml}</p>`);
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
    html,
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
      ? `<w:br/><w:rPr><w:sz w:val="16"/><w:color w:val="555555"/><w:i/></w:rPr><w:t xml:space="preserve">${escXml(pkiText)}</w:t>`
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
        block += `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="555555"/><w:i/></w:rPr><w:t xml:space="preserve">[PKI Digitally Sealed: ${escXml(sig.pkiFingerprint)}]</w:t></w:r></w:p>`;
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

  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

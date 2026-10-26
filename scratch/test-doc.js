import fs from 'node:fs';
import WordExtractor from 'word-extractor';
import mammoth from 'mammoth';

const buf = fs.readFileSync('sample_templates/Car_Request_Template.docx');
const clean = buf.toString('base64');

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function convertDocTextToHtml(text) {
  if (!text) return '<p></p>';
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
          tbl += `<td style="border: 1px solid #d1d5db; padding: 6px 10px;">${escapeHtml(cell.trim()) || '&nbsp;'}</td>`;
        }
        tbl += '</tr>';
      }
      tbl += '</tbody></table>';
      parts.push(tbl);
      continue;
    }
    const paraHtml = lines.map(l => escapeHtml(l.trim())).filter(Boolean).join('<br>');
    if (paraHtml) parts.push(`<p style="margin: 0 0 10px;">${paraHtml}</p>`);
  }
  return parts.length ? parts.join('\n') : '<p></p>';
}

const extractor = new WordExtractor();
const doc = await extractor.extract(buf);
console.log('Doc text extracted successfully, paragraphs:', doc.getBody().split('\n').length);
const html = convertDocTextToHtml(doc.getBody());
console.log('HTML generated successfully, length:', html.length);

// Builds sample .docx templates for testing the SmartDoc Word engine.
// Usage: node make_test_docx.mjs
import PizZip from 'pizzip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample_templates');
fs.mkdirSync(dir, { recursive: true });

function buildDocx(paragraphs) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  const body = paragraphs.map(p => {
    // split text into two runs to simulate Word splitting placeholders across runs
    const mid = Math.floor(p.length / 2);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<w:p><w:r><w:t xml:space="preserve">${esc(p.slice(0, mid))}</w:t></w:r><w:r><w:t xml:space="preserve">${esc(p.slice(mid))}</w:t></w:r></w:p>`;
  }).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

fs.writeFileSync(path.join(dir, 'Car_Request_Template.docx'), buildDocx([
  'COMPANY CAR REQUEST FORM',
  'Form No: {{Form ID}}    Date: {{Submitted Date}}',
  'Employee Name: {{Employee Name}}',
  'Employee ID: {{Employee ID}}',
  'Purpose of Use: {{Purpose}}',
  'Start Date: {{Start Date}}',
  'Remarks: {{Remarks}}',
  'Requested by: {{Signature: Submitter}}',
  'HR Approval: {{Signature: Human Resources}}',
  'Finance Approval: {{Signature: Finance & Accounting}}'
]));

fs.writeFileSync(path.join(dir, 'Leave_Request_NoSigTags.docx'), buildDocx([
  'LEAVE REQUEST',
  'Name: {{Full Name}}',
  'From: {{From Date}}  To: {{To Date}}',
  'Reason: {{Reason}}'
]));

console.log('Created test templates in', dir);

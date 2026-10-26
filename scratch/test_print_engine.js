import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import htmlToDocx from 'html-to-docx';
import { renderFilledDocument } from '../server/docxEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('Testing Word Print Document generation...');

  // 1. Create a sample .docx template with placeholders
  const sampleHtml = `
    <h1>EMPLOYEE ONBOARDING AGREEMENT</h1>
    <p>This agreement is entered into by <strong>{{Employee Name}}</strong> on date <strong>{{Start Date}}</strong> in department <strong>{{Department}}</strong>.</p>
    <table style="width: 100%; border: 1px solid #ccc;">
      <tr><td>Field</td><td>Value</td></tr>
      <tr><td>Job Title</td><td>{{Designation}}</td></tr>
      <tr><td>Base Salary</td><td>{{Salary}}</td></tr>
    </table>
    <p>Please sign below:</p>
    <p>{{Signature: Submitter}}</p>
  `;

  const docxBuf = await htmlToDocx(sampleHtml, null, {
    title: 'Test Template',
    header: true,
    footer: true,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
  });

  const base64 = docxBuf.toString('base64');
  console.log('Generated base template docx, size:', docxBuf.length, 'bytes');

  // 2. Test filled rendering
  const filledBuf = renderFilledDocument(base64, {
    values: {
      'employee name': 'John Doe',
      'start date': '2026-11-01',
      'designation': 'Senior Solutions Architect',
      'salary': '$145,000'
    },
    system: {
      'Department': 'Engineering',
      'Form ID': 'FRM-2026-0099'
    },
    signatures: [
      {
        slot: 'Submitter',
        label: 'Submitter Signature',
        name: 'John Doe',
        date: '2026-10-25',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        pkiFingerprint: '9A7B3C1D2E...'
      }
    ],
    blank: false
  });

  console.log('Successfully rendered FILLED Word document for printing, size:', filledBuf.length, 'bytes');

  // 3. Test blank rendering
  const blankBuf = renderFilledDocument(base64, {
    values: {},
    system: {},
    signatures: [],
    blank: true
  });

  console.log('Successfully rendered BLANK Word document for printing, size:', blankBuf.length, 'bytes');
  console.log('ALL WORD PRINT GENERATION TESTS PASSED!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

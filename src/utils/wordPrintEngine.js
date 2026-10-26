import { renderAsync } from 'docx-preview';

/**
 * Escape HTML special characters for safe document titles.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert base64 or ArrayBuffer to a Blob of type docx.
 */
function toDocxBlob(data) {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  if (typeof data === 'string') {
    const clean = data.replace(/^data:[^;]+;base64,/, '');
    const byteCharacters = atob(clean);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  throw new Error('Unsupported Word document data format');
}

/**
 * Wait for all images inside an element or document to finish loading.
 */
async function waitForImagesAndFonts(doc) {
  const images = Array.from(doc.images || []);
  const imagePromises = images.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.decode) {
      return img.decode().catch(() => {});
    }
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });

  await Promise.all(imagePromises);

  if (doc.fonts && doc.fonts.ready) {
    try {
      await doc.fonts.ready;
    } catch (_) {}
  }

  // Micro-task yield for browser layout calculation
  await new Promise(r => setTimeout(r, 150));
}

/**
 * Print a Microsoft Word (.docx) document with genuine MS Word pagination,
 * true document fonts, headers, footers, table borders, and zero browser HTML chrome.
 *
 * @param {Blob|ArrayBuffer|string} docxData - The Word document binary data
 * @param {object} options
 * @param {string} [options.title='SmartDoc Word Document'] - Print job title
 * @returns {Promise<void>}
 */
export async function printWordDocument(docxData, options = {}) {
  const blob = toDocxBlob(docxData);
  const title = options.title || 'SmartDoc Word Document';

  // Clean up any stale print frames
  const existingFrame = document.getElementById('smartdoc-word-print-frame');
  if (existingFrame) {
    try { existingFrame.remove(); } catch (_) {}
  }

  // Create an isolated hidden printing iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'smartdoc-word-print-frame';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1200px';
  iframe.style.height = '1600px';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-9999';

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div id="word-print-root"></div>
  </body>
</html>`);
  iframeDoc.close();

  const printRoot = iframeDoc.getElementById('word-print-root');

  // Render the Word document via docx-preview into the iframe
  // Directing styles into iframeDoc.head preserves 100% of Word typography, fonts, and table metrics
  await renderAsync(blob, printRoot, iframeDoc.head, {
    inWrapper: true,
    hideWrapperOnPrint: false,
    breakPages: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true,
    trimXmlDeclaration: true,
    ignoreLastRenderedPageBreak: true
  });

  // Detect orientation from the rendered Word document sections
  const firstSection = printRoot.querySelector('section.docx');
  let isLandscape = false;
  if (firstSection) {
    const rect = firstSection.getBoundingClientRect();
    if (rect.width > rect.height) {
      isLandscape = true;
    }
  }

  // Inject Microsoft Word print formatting stylesheet into the iframe
  const printStyle = iframeDoc.createElement('style');
  printStyle.id = 'sd-ms-word-print-rules';
  printStyle.textContent = `
    @page {
      size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
      margin: 0 !important;
    }

    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }

    #word-print-root {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* docx-preview wrapper reset */
    .docx-wrapper {
      background: transparent !important;
      padding: 0 !important;
      margin: 0 auto !important;
      display: block !important;
      box-shadow: none !important;
    }

    /* Word sections / pages */
    .docx-wrapper > section.docx,
    section.docx {
      background: #ffffff !important;
      box-shadow: none !important;
      margin: 0 auto !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    .docx-wrapper > section.docx:last-of-type,
    section.docx:last-of-type {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    /* Word table fidelity and pagination */
    table {
      border-collapse: collapse !important;
    }

    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    td, th {
      vertical-align: top !important;
    }

    /* Heading orphan prevention */
    h1, h2, h3, h4, h5, h6, .docx-heading {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    /* Images & Signatures */
    img {
      max-width: 100% !important;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
  `;
  iframeDoc.head.appendChild(printStyle);

  // Wait for all document images (signatures, seals, logos) and fonts to fully load
  await waitForImagesAndFonts(iframeDoc);

  // Execute native print through the iframe content window
  const printWindow = iframe.contentWindow;
  if (!printWindow) throw new Error('Could not access print window');

  // Trigger print
  printWindow.focus();
  try {
    printWindow.print();
  } catch (printErr) {
    console.warn('Iframe print failed, falling back to popup window:', printErr);
    // Fallback: popup window if iframe printing is blocked
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(iframeDoc.documentElement.outerHTML);
      win.document.close();
      win.focus();
      setTimeout(() => {
        try {
          win.print();
          setTimeout(() => win.close(), 1000);
        } catch (_) {}
      }, 300);
    }
  }

  // Clean up iframe after printing is done or dismissed
  const cleanup = () => {
    setTimeout(() => {
      try {
        if (document.body.contains(iframe)) {
          iframe.remove();
        }
      } catch (_) {}
    }, 1500);
  };

  printWindow.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 45000);
}

/**
 * Print a high-resolution static image with authentic margins.
 */
export function printImageDocument(imageUrl, title = 'Document Image') {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: auto; margin: 10mm; }
      body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
      img { max-width: 100%; max-height: 96vh; object-fit: contain; }
    </style>
  </head>
  <body>
    <img src="${imageUrl}" onload="window.focus(); window.print();" />
  </body>
</html>`);
  win.document.close();
}

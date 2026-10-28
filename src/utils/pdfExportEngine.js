import { renderAsync } from 'docx-preview';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Wait for all images and fonts inside a container to finish loading and layout to settle.
 */
async function waitForAssets(container) {
  const images = Array.from(container.querySelectorAll('img'));
  const imagePromises = images.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.decode) {
      return img.decode().catch(() => { });
    }
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  });

  await Promise.all(imagePromises);

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) { }
  }

  // Microtask yield for layout calculation and subpixel font rendering
  await new Promise(r => setTimeout(r, 180));
}

/**
 * Convert base64, ArrayBuffer, or Blob to a Word Blob.
 */
function toBlob(data) {
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
    return new Blob([new Uint8Array(byteNumbers)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }
  throw new Error('Unsupported document data format');
}

/**
 * Deep-clone an authentic form sheet (.sd-form-filler-sheet) preserving
 * all live input values, checkboxes, signatures, and stamps, while stripping
 * transient interactive highlights (such as green rail active glows).
 */
export function deepCloneFormSheet(source) {
  if (!source) return null;
  const clone = source.cloneNode(true);

  // 1. Copy live input values, textareas, selects, and checkboxes
  const sourceInputs = Array.from(source.querySelectorAll('input, textarea, select'));
  const cloneInputs = Array.from(clone.querySelectorAll('input, textarea, select'));

  sourceInputs.forEach((srcInput, idx) => {
    const cloneInput = cloneInputs[idx];
    if (!cloneInput) return;

    if (srcInput.type === 'checkbox' || srcInput.type === 'radio') {
      cloneInput.checked = srcInput.checked;
      if (srcInput.checked) {
        cloneInput.setAttribute('checked', 'checked');
      } else {
        cloneInput.removeAttribute('checked');
      }
    } else if (srcInput.tagName.toLowerCase() === 'select') {
      cloneInput.value = srcInput.value;
      cloneInput.selectedIndex = srcInput.selectedIndex;
      Array.from(cloneInput.options).forEach((opt, optIdx) => {
        if (optIdx === srcInput.selectedIndex) opt.setAttribute('selected', 'selected');
        else opt.removeAttribute('selected');
      });
    } else if (srcInput.tagName.toLowerCase() === 'textarea') {
      cloneInput.value = srcInput.value;
      cloneInput.textContent = srcInput.value;
    } else {
      cloneInput.value = srcInput.value;
      cloneInput.setAttribute('value', srcInput.value);
    }
  });

  // 2. Strip transient active field target highlights and error rings
  clone.querySelectorAll('.is-active-target').forEach(el => el.classList.remove('is-active-target'));
  clone.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  clone.querySelectorAll('.sd-doc-live-input').forEach(el => {
    el.style.borderColor = '#cbd5e1';
    el.style.boxShadow = 'none';
    el.style.outline = 'none';
  });
  clone.querySelectorAll('.sd-doc-live-field-label').forEach(el => {
    el.style.color = '#475569';
  });

  // 3. Remove all print-hidden elements (buttons, connectors, banners)
  clone.querySelectorAll('.sd-print-hide').forEach(el => el.remove());

  // 4. Force exact A4 dimensions and clean document styling
  clone.style.width = '794px';
  clone.style.maxWidth = '794px';
  clone.style.boxSizing = 'border-box';
  clone.style.margin = '0 auto';
  clone.style.padding = '48px 56px';
  clone.style.background = '#ffffff';
  clone.style.color = '#0f172a';
  clone.style.boxShadow = 'none';
  clone.style.border = 'none';

  // 5. Ensure input fields have crisp borders without active glow
  clone.querySelectorAll('.sd-doc-live-field-wrap').forEach(w => {
    w.style.boxShadow = 'none';
    w.style.outline = 'none';
  });

  clone.querySelectorAll('.sd-doc-live-field-label').forEach(lbl => {
    lbl.style.color = '#475569';
    lbl.style.fontWeight = '700';
    lbl.style.fontSize = '7.5pt';
  });

  clone.querySelectorAll('.sd-doc-live-input').forEach(inp => {
    inp.style.border = '1.5px solid #cbd5e1';
    inp.style.borderRadius = '4px';
    inp.style.background = '#ffffff';
    inp.style.color = '#0f172a';
    inp.style.padding = '5px 8px';
    inp.style.fontSize = '8.5pt';
    inp.style.boxShadow = 'none';
    inp.style.outline = 'none';
    inp.style.fontFamily = 'inherit';
    inp.removeAttribute('placeholder');
    inp.placeholder = '';
  });

  // Ensure date inputs in clone render as text without browser mm/dd/yyyy prompt
  clone.querySelectorAll('input[type="date"]').forEach(inp => {
    const rawVal = inp.value;
    inp.type = 'text';
    inp.removeAttribute('placeholder');
    inp.placeholder = '';
    if (!rawVal) {
      inp.value = '';
      inp.setAttribute('value', '');
    }
  });

  // Remove placeholders from all textarea and select elements in clone
  clone.querySelectorAll('textarea, select').forEach(el => {
    el.removeAttribute('placeholder');
    if (el.tagName.toLowerCase() === 'select' && el.options && el.options[0] && el.options[0].value === '') {
      el.options[0].text = '';
    }
  });

  // Replace custom <input type="checkbox"> with explicit DOM boxes so html2canvas renders checkmarks crisply
  clone.querySelectorAll('.sd-doc-live-checkbox input[type="checkbox"]').forEach(cb => {
    const isChecked = cb.checked || cb.hasAttribute('checked');
    const box = document.createElement('span');
    box.style.display = 'inline-flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.width = '16px';
    box.style.height = '16px';
    box.style.minWidth = '16px';
    box.style.minHeight = '16px';
    box.style.borderRadius = '4px';
    box.style.border = isChecked ? '2px solid #0f172a' : '2px solid #475569';
    box.style.background = isChecked ? '#0f172a' : '#ffffff';
    box.style.color = '#ffffff';
    box.style.fontSize = '11px';
    box.style.fontWeight = '900';
    box.style.lineHeight = '1';
    box.style.flexShrink = '0';
    box.textContent = isChecked ? '✓' : '';
    cb.replaceWith(box);
  });

  // 6. For in-text placeholders: if empty, replace with dash
  clone.querySelectorAll('.sd-doc-live-placeholder.is-empty').forEach(el => {
    el.innerHTML = '<span class="sd-ph-empty-print-dash" style="display:inline !important; color:#0f172a !important; font-weight:inherit;">—</span>';
  });
  clone.querySelectorAll('.sd-ph-tag-token').forEach(el => el.remove());
  clone.querySelectorAll('.sd-ph-empty-print-dash').forEach(el => {
    el.style.display = 'inline';
    el.style.color = '#0f172a';
  });

  // 7. Ensure signature blocks have clean transparent styling and unhide blank signature lines for pending/blank slots
  clone.querySelectorAll('.sd-print-blank-sig-block').forEach(blankSig => {
    blankSig.style.setProperty('display', 'block', 'important');
  });

  clone.querySelectorAll('.sd-doc-signature-block').forEach(block => {
    const parentSlot = block.closest('.sd-live-slot-sig');
    const hasCustomWidth = parentSlot && parentSlot.getAttribute('data-width') && parentSlot.getAttribute('data-width') !== 'auto';
    block.style.display = hasCustomWidth ? 'flex' : 'inline-flex';
    if (hasCustomWidth) {
      block.style.width = '100%';
      block.style.maxWidth = '100%';
    }
    block.style.flexDirection = 'column';
    block.style.alignItems = 'flex-start';
    block.style.background = 'transparent';
    block.style.border = 'none';
    block.style.boxShadow = 'none';
    block.style.padding = '0';
    block.style.margin = '10px 0 6px 0';
  });

  clone.querySelectorAll('.sd-doc-signature-img').forEach(img => {
    img.style.maxHeight = '48px';
    img.style.maxWidth = '190px';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.marginBottom = '4px';
    img.style.background = 'transparent';
  });

  clone.querySelectorAll('.sd-doc-signature-name').forEach(name => {
    name.style.fontSize = '9.5pt';
    name.style.fontWeight = '600';
    name.style.color = '#0f172a';
    name.style.lineHeight = '1.3';
    name.style.margin = '0';
    name.style.padding = '0';
  });

  clone.querySelectorAll('.sd-doc-signature-dept').forEach(dept => {
    dept.style.fontSize = '8.5pt';
    dept.style.fontWeight = '400';
    dept.style.color = '#475569';
    dept.style.lineHeight = '1.3';
    dept.style.margin = '0';
    dept.style.padding = '0';
  });

  return clone;
}

/**
 * Dedicated export for an authentic live form sheet (.sd-form-filler-sheet)
 * directly to a razor-sharp, lossless PDF file matching the on-screen form sheet.
 *
 * @param {HTMLElement} sheetElement - The .sd-form-filler-sheet element
 * @param {string} fileName - Destination PDF file name
 * @param {function} [onProgress] - Optional progress callback
 * @returns {Promise<void>}
 */
export async function exportFormSheetToPdf(sheetElement, fileName = 'Form_Submission.pdf', onProgress = null) {
  const pdfFileName = String(fileName).replace(/\.(docx?|pdf|png|jpe?g)$/i, '') + '.pdf';
  let tempWrapper = null;

  try {
    const rawSheet = sheetElement.classList?.contains('sd-form-filler-sheet')
      ? sheetElement
      : sheetElement.querySelector('.sd-form-filler-sheet') || sheetElement;

    tempWrapper = document.createElement('div');
    tempWrapper.setAttribute('aria-hidden', 'true');
    tempWrapper.id = 'smartdoc-form-sheet-export-staging';
    tempWrapper.style.position = 'fixed';
    tempWrapper.style.top = '0';
    tempWrapper.style.left = '0';
    tempWrapper.style.width = '794px'; // 210mm at 96 DPI
    tempWrapper.style.minHeight = '1123px'; // 297mm at 96 DPI
    tempWrapper.style.background = '#ffffff';
    tempWrapper.style.zIndex = '-99999';
    tempWrapper.style.opacity = '0.01';
    tempWrapper.style.pointerEvents = 'none';
    tempWrapper.style.overflow = 'visible';
    tempWrapper.style.webkitFontSmoothing = 'antialiased';
    tempWrapper.style.mozOsxFontSmoothing = 'grayscale';
    tempWrapper.style.textRendering = 'geometricPrecision';

    const clonedSheet = deepCloneFormSheet(rawSheet);
    tempWrapper.appendChild(clonedSheet);
    document.body.appendChild(tempWrapper);

    onProgress?.({ current: 0, total: 1, status: 'Preparing razor-sharp form sheet…' });
    await waitForAssets(tempWrapper);

    const sheetWidth = 794;
    const sheetHeight = Math.max(clonedSheet.offsetHeight, clonedSheet.scrollHeight, 1123);

    // 3.5x scale (~336 DPI) for ultra-sharp typography and crisp lines
    const exportScale = 3.5;

    onProgress?.({ current: 1, total: 1, status: 'Rendering razor-sharp PDF document…' });

    const canvas = await html2canvas(clonedSheet, {
      scale: exportScale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: sheetWidth,
      height: sheetHeight,
      windowWidth: sheetWidth,
      windowHeight: sheetHeight,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      imageTimeout: 15000
    });

    const pageHeightPx = 1123; // Standard A4 page height in pixels at 96 DPI
    const totalPages = Math.max(1, Math.ceil(sheetHeight / pageHeightPx));
    const a4WidthMm = 210;
    const a4HeightMm = 297;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [a4WidthMm, a4HeightMm]
    });

    if (totalPages === 1) {
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, a4WidthMm, a4HeightMm, undefined, 'SLOW');
    } else {
      // Multi-page slicing for longer forms
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.round(pageHeightPx * exportScale);
      const pageCtx = pageCanvas.getContext('2d');

      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage([a4WidthMm, a4HeightMm], 'portrait');
        pageCtx.fillStyle = '#ffffff';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        const sy = Math.round(p * pageHeightPx * exportScale);
        const sHeight = Math.min(pageCanvas.height, canvas.height - sy);

        pageCtx.drawImage(
          canvas,
          0, sy, canvas.width, sHeight,
          0, 0, pageCanvas.width, sHeight
        );

        const pageImg = pageCanvas.toDataURL('image/png');
        pdf.addImage(pageImg, 'PNG', 0, 0, a4WidthMm, a4HeightMm, undefined, 'SLOW');
      }
    }

    onProgress?.({ current: 1, total: 1, status: 'Saving PDF file…' });
    pdf.save(pdfFileName);
  } finally {
    if (tempWrapper) {
      try { tempWrapper.remove(); } catch (_) { }
    }
  }
}

/**
 * Exports a Microsoft Word (.docx) document to an authentic, razor-sharp PDF file.
 * Uses 3.5x resolution scaling (~336 DPI) and lossless PNG rendering to eliminate blurriness.
 *
 * @param {Blob|ArrayBuffer|string|HTMLElement} source - The docx Blob or existing rendered DOM element
 * @param {string} fileName - Destination filename (e.g. 'Employment_Contract.pdf')
 * @param {function} [onProgress] - Optional progress callback ({ current, total, status })
 * @returns {Promise<void>}
 */
export async function exportWordToPdf(source, fileName = 'document.pdf', onProgress = null) {
  const pdfFileName = String(fileName).replace(/\.(docx?|pdf|png|jpe?g)$/i, '') + '.pdf';
  let tempWrapper = null;
  let renderRoot = null;

  try {
    let blob = null;
    if (source instanceof Blob || source instanceof ArrayBuffer || typeof source === 'string') {
      blob = toBlob(source);
    }

    // Always create an isolated, pristine staging container in the active viewport coordinate space
    // Using opacity 0.01 and z-index -99999 ensures Chromium keeps full subpixel font smoothing
    tempWrapper = document.createElement('div');
    tempWrapper.setAttribute('aria-hidden', 'true');
    tempWrapper.id = 'smartdoc-pdf-export-staging';
    tempWrapper.style.position = 'fixed';
    tempWrapper.style.top = '0';
    tempWrapper.style.left = '0';
    tempWrapper.style.width = '794px'; // Standard A4 width (210mm at 96 DPI)
    tempWrapper.style.minHeight = '1123px'; // Standard A4 height (297mm at 96 DPI)
    tempWrapper.style.background = '#ffffff';
    tempWrapper.style.zIndex = '-99999';
    tempWrapper.style.opacity = '0.01';
    tempWrapper.style.pointerEvents = 'none';
    tempWrapper.style.overflow = 'visible';
    tempWrapper.style.webkitFontSmoothing = 'antialiased';
    tempWrapper.style.mozOsxFontSmoothing = 'grayscale';
    tempWrapper.style.textRendering = 'geometricPrecision';

    renderRoot = document.createElement('div');
    renderRoot.style.width = '100%';
    renderRoot.style.background = '#ffffff';
    tempWrapper.appendChild(renderRoot);
    document.body.appendChild(tempWrapper);

    onProgress?.({ current: 0, total: 1, status: 'Rendering high-fidelity document layout…' });

    // Check if source is a live form sheet
    const isFormFillerSheet = (source instanceof HTMLElement) &&
      (source.classList?.contains('sd-form-filler-sheet') || !!source.querySelector?.('.sd-form-filler-sheet'));

    if (isFormFillerSheet) {
      const sheetElem = source.classList?.contains('sd-form-filler-sheet')
        ? source
        : source.querySelector('.sd-form-filler-sheet');
      const clone = deepCloneFormSheet(sheetElem);
      renderRoot.appendChild(clone);
    } else if (blob) {
      // Clean isolated docx-preview render without outer wrapper margins/shadows
      await renderAsync(blob, renderRoot, undefined, {
        inWrapper: false,
        breakPages: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        ignoreLastRenderedPageBreak: true
      });
    } else if (source instanceof HTMLElement) {
      // Clone sections into the isolated container
      const sourceSections = source.querySelectorAll('section.docx');
      if (sourceSections.length > 0) {
        sourceSections.forEach(s => {
          const clone = s.cloneNode(true);
          clone.style.boxShadow = 'none';
          clone.style.margin = '0 auto';
          renderRoot.appendChild(clone);
        });
      } else {
        const clone = source.cloneNode(true);
        clone.style.boxShadow = 'none';
        clone.style.margin = '0 auto';
        renderRoot.appendChild(clone);
      }
    }

    onProgress?.({ current: 0, total: 1, status: 'Preparing razor-sharp pages…' });
    await waitForAssets(renderRoot);

    // Find all rendered Word sections/pages
    let sections = Array.from(renderRoot.querySelectorAll('section.docx'));
    if (sections.length === 0) {
      sections = [renderRoot];
    }

    // Clean any unwanted shadows, backgrounds, or borders
    sections.forEach(s => {
      s.style.boxShadow = 'none';
      s.style.background = '#ffffff';
      s.style.margin = '0 auto';
      s.style.webkitFontSmoothing = 'antialiased';
      s.style.textRendering = 'geometricPrecision';
    });
    renderRoot.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    });

    let pdf = null;
    const totalPages = sections.length;

    // Use 3.5x scale factor (~336 DPI) for ultra-sharp vector-grade clarity
    const exportScale = 3.5;

    for (let i = 0; i < totalPages; i++) {
      const section = sections[i];
      onProgress?.({
        current: i + 1,
        total: totalPages,
        status: `Generating razor-sharp PDF page ${i + 1} of ${totalPages}…`
      });

      // Measure exact dimensions
      const rect = section.getBoundingClientRect();
      const sectionWidth = Math.round(rect.width || section.offsetWidth || 794);
      const sectionHeight = Math.round(rect.height || section.offsetHeight || 1123);

      const canvas = await html2canvas(section, {
        scale: exportScale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: sectionWidth,
        height: sectionHeight,
        windowWidth: sectionWidth,
        windowHeight: sectionHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        imageTimeout: 15000
      });

      // Determine page orientation
      const isLandscape = canvas.width > canvas.height;
      const a4WidthMm = isLandscape ? 297 : 210;
      const a4HeightMm = isLandscape ? 210 : 297;

      // Lossless PNG data - zero compression artifacts, razor-sharp black text on white
      const imgData = canvas.toDataURL('image/png');

      if (i === 0) {
        pdf = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [a4WidthMm, a4HeightMm]
        });
      } else {
        pdf.addPage([a4WidthMm, a4HeightMm], isLandscape ? 'landscape' : 'portrait');
      }

      // 'SLOW' compression in jsPDF ensures bicubic/high-quality interpolation in PDF viewers
      pdf.addImage(imgData, 'PNG', 0, 0, a4WidthMm, a4HeightMm, undefined, 'SLOW');
    }

    if (pdf) {
      onProgress?.({ current: totalPages, total: totalPages, status: 'Saving PDF file…' });
      pdf.save(pdfFileName);
    }
  } finally {
    if (tempWrapper) {
      try { tempWrapper.remove(); } catch (_) { }
    }
  }
}

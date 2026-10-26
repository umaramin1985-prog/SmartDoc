// Shared layout rule for form fields, used by the fill form and the Word Studio live preview
// so both always render identically.

// Columns (of a 12-column grid) a field spans: admin-chosen width (%), otherwise
// half a row (full row for long text).
export const fieldColumnSpan = (field) => {
  const w = parseInt(field?.width, 10);
  if (w > 0) return Math.max(3, Math.min(12, Math.round((w / 100) * 12)));
  return field?.type === 'textarea' ? 12 : 6;
};

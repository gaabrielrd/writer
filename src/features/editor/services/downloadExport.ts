/** Keeps browser download mechanics outside presentation components. */
export function downloadExport(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Browsers can consume the object URL after the click handler has returned.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

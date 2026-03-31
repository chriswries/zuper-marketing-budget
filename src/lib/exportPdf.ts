/**
 * Triggers the browser's native print dialog, which allows saving as PDF.
 * Sets the document title so the default PDF filename is descriptive.
 */
export function exportReportToPdf(reportTitle: string): void {
  const originalTitle = document.title;
  document.title = reportTitle;
  window.print();
  document.title = originalTitle;
}

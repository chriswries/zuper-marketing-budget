import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportReportToPdf(
  elementId: string,
  filename: string,
  orientation: 'landscape' | 'portrait' = 'landscape'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id "${elementId}" not found`);
    return;
  }

  // Temporarily hide elements with class 'no-print'
  const noPrintElements = element.querySelectorAll('.no-print');
  noPrintElements.forEach(el => ((el as HTMLElement).style.display = 'none'));

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    let page = 0;

    while (heightLeft > 0) {
      if (page > 0) {
        pdf.addPage();
      }

      pdf.addImage(
        imgData,
        'PNG',
        margin,
        margin - position,
        imgWidth,
        imgHeight,
        undefined,
        'FAST'
      );

      position += usableHeight;
      heightLeft -= usableHeight;
      page++;
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    // Restore hidden elements
    noPrintElements.forEach(el => ((el as HTMLElement).style.display = ''));
  }
}

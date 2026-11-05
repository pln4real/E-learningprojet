// Charge pdf.js seulement quand une page en a besoin (lecteur de cours, bibliothèque, admin).
export async function chargerPdfjs() {
  const pdfjs = await import('pdfjs-dist/build/pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  return pdfjs;
}

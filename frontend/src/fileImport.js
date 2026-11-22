// Reads an uploaded army list file into the text the Import List dialog
// works with.
//
//  - .txt (or anything textual): used as-is.
//  - .pdf with real text in it: the text, line by line.
//  - .pdf that is only pictures (New Recruit's warscroll-card view saved via
//    "Microsoft Print to PDF" is one) and images: read by OCR in the browser.
//
// If the text is already a New Recruit list ("<name> (N points)") it goes
// straight into the box. Otherwise it is treated as a warscroll-card
// printout: the page texts go to /api/import/cards, which identifies each
// card against the database and answers with a list in the usual format.
//
// pdf.js and tesseract.js are loaded from jsDelivr only when a file needs
// them, so the site's bundle doesn't carry a few MB of OCR for a rare path.
import axios from 'axios';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete scripts[src]; reject(new Error('Could not load the file reader — check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

async function getPdfjs() {
  await loadScript(PDFJS);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return lib;
}

// pdf.js gives positioned text runs; rebuild lines by their baseline.
function pageTextFromContent(content) {
  const rows = [];
  for (const it of content.items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.transform[4], s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n');
}

let workerPromise = null;
async function getOcr(onProgress) {
  await loadScript(TESSERACT);
  if (!workerPromise) {
    // A blocked download leaves createWorker pending forever; give up after
    // two minutes with a message instead of a dialog stuck on "Loading".
    const timeout = new Promise((_, reject) => setTimeout(
      () => reject(new Error('Text recognition took too long to load — check your connection and try again.')), 120000));
    workerPromise = Promise.race([window.Tesseract.createWorker('eng'), timeout])
      .catch(e => { workerPromise = null; throw e; });
  }
  onProgress?.('Loading text recognition…');
  return workerPromise;
}

async function ocrCanvas(canvas, onProgress) {
  const worker = await getOcr(onProgress);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

async function readPdf(file, onProgress) {
  const lib = await getPdfjs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let title = '';
  try { title = (await pdf.getMetadata())?.info?.Title || ''; } catch { /* no metadata */ }

  const texts = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    texts.push(pageTextFromContent(await page.getTextContent()));
  }
  const textChars = texts.join('').replace(/\s/g, '').length;
  if (textChars >= 60 * pdf.numPages) return { pages: texts, title, ocr: false };

  // Pictures only: render each page and read it.
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(`Reading page ${n} of ${pdf.numPages}…`);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(await ocrCanvas(canvas, onProgress));
    page.cleanup();
  }
  return { pages, title, ocr: true };
}

async function readImage(file, onProgress) {
  onProgress?.('Reading the picture…');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That picture could not be opened.'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return { pages: [await ocrCanvas(canvas, onProgress)], title: '', ocr: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const looksLikeList = text => /\(\s*\d+\s*points?\s*\)/i.test(text);
const baseName = name => String(name || '').replace(/\.[^.]+$/, '');

/**
 * @returns {Promise<{ text: string, notes: string[] }>}
 */
export async function readListFile(file, onProgress) {
  const name = file.name || '';
  const type = file.type || '';
  let read;
  if (/\.pdf$/i.test(name) || type === 'application/pdf') {
    onProgress?.('Opening the PDF…');
    read = await readPdf(file, onProgress);
  } else if (/^image\//.test(type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(name)) {
    read = await readImage(file, onProgress);
  } else {
    const text = await file.text();
    return { text, notes: [] };
  }

  const joined = read.pages.join('\n');
  if (!joined.trim()) throw new Error('No text could be read from that file.');
  if (looksLikeList(joined)) {
    return { text: joined, notes: read.ocr ? ['Read by text recognition — check names and points before importing.'] : [] };
  }

  onProgress?.('Matching the warscrolls…');
  const { data } = await axios.post('/api/import/cards', { pages: read.pages, title: read.title || baseName(name) });
  return { text: data.text || '', notes: data.notes || [] };
}

import type { Worker } from 'tesseract.js';

/**
 * Reads a printed number (the CR No on a booklet) from a camera picture, for when the
 * barcode won't scan: a torn or smudged sticker, or a booklet with no barcode.
 *
 * Tesseract OCR running in the browser. Its files are served by this app from /ocr/
 * (copied there by scripts/copy-ocr-assets.mjs), never from the internet, so it works on
 * the on-site server during an outage. They are about 7 MB, downloaded the first time
 * Scan Text is used and cached after that.
 *
 * Two quick passes over the same picture:
 *  1. Locate: an ordinary read finds where the run of digits is. Letters are read as
 *     letters here, so the "CR No:" printed beside the number is told apart from it.
 *     (Reading digits only from the start turns "No" into a 0 and glues it onto the
 *     front of the number, which would look like a valid, wrong CR No.)
 *  2. Read: just that part is read again with the reader limited to 0-9.
 * Anything that is not 0-9 is then removed. The two passes must agree on how many digits
 * there are, much as a barcode must be read the same way twice; if they don't, nothing
 * is returned and the person is asked to try again rather than given a guess.
 */

/** Unused for this long, the reader is closed to give its memory back. */
const IDLE_MS = 3 * 60_000;

const DIGITS = '0123456789';

let workerPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let busy = 0;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const base = `${window.location.origin}/ocr`;
    const starting = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
      });
    })();
    workerPromise = starting;
    // A failed start (say the files couldn't load) is tried again next time.
    starting.catch(() => {
      if (workerPromise === starting) workerPromise = null;
    });
  }
  return workerPromise;
}

function closeWhenIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (busy > 0 || !workerPromise) return;
    const closing = workerPromise;
    workerPromise = null;
    closing.then((w) => w.terminate()).catch(() => {});
  }, IDLE_MS);
}

/** Whether the reader is already loaded, so the first, slower start can say so. */
export function isNumberReaderReady(): boolean {
  return workerPromise !== null;
}

/** Only the digits 0-9: letters, spaces, punctuation and anything else removed. */
export function digitsOnly(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Sym = { text: string; bbox: Box };
type LineLike = { words: { symbols: Sym[] }[] };
type BlockLike = { paragraphs: { lines: LineLike[] }[] };

// Letters an ordinary read may give for a smudged digit (O for 0, l for 1, S for 5...).
const LOOKALIKE = /^[OoQDIl|SZB]$/;
const isDigit = (s?: Sym) => !!s && /^[0-9]$/.test(s.text);
const isLookalike = (s?: Sym) => !!s && LOOKALIKE.test(s.text);
const isOtherLetter = (s?: Sym) => !!s && /^\p{L}$/u.test(s.text) && !LOOKALIKE.test(s.text);

/**
 * Pass 1: the longest run of digits on any line, and where it is in the picture.
 *
 * A run carries on across the gaps between words, so a number printed in groups
 * ("1991 9230 0897 363") is one run; any other character ends it. A digit read as a
 * look-alike letter (1991923OO897363) stays in the run, so it isn't cut in two, but not
 * at a run's edge next to another letter: that is the label's "o" in "No".
 */
export function findDigitRun(blocks: BlockLike[]): { length: number; digits: string; box: Box } | null {
  let best: { length: number; digits: string; box: Box } | null = null;
  for (const line of blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines))) {
    const symbols = line.words.flatMap((w) => w.symbols);
    let start = -1;
    const close = (end: number) => {
      // symbols[start..end) is a run of digits and look-alikes.
      let from = start;
      let to = end;
      if (isOtherLetter(symbols[from - 1])) while (from < to && isLookalike(symbols[from])) from++;
      if (isOtherLetter(symbols[to])) while (to > from && isLookalike(symbols[to - 1])) to--;
      const run = symbols.slice(from, to);
      if (run.some(isDigit) && (!best || run.length > best.length)) {
        best = {
          length: run.length,
          digits: run.map((s) => s.text).join(''),
          box: {
            x0: Math.min(...run.map((s) => s.bbox.x0)),
            y0: Math.min(...run.map((s) => s.bbox.y0)),
            x1: Math.max(...run.map((s) => s.bbox.x1)),
            y1: Math.max(...run.map((s) => s.bbox.y1)),
          },
        };
      }
      start = -1;
    };
    symbols.forEach((s, i) => {
      const inRun = isDigit(s) || isLookalike(s);
      if (inRun && start < 0) start = i;
      if (!inRun && start >= 0) close(i);
    });
    if (start >= 0) close(symbols.length);
  }
  return best;
}

/**
 * Reads the number in a picture, as a string of digits 0-9 only. Null when no number
 * was found, when it was not read clearly, or when `accept` turns it down.
 */
export async function readNumber(
  image: HTMLCanvasElement,
  accept?: (digits: string) => boolean
): Promise<string | null> {
  busy++;
  clearTimeout(idleTimer);
  try {
    const worker = await getWorker();
    const { PSM } = await import('tesseract.js');

    // 1. Locate the digits.
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const first = await worker.recognize(image, {}, { text: true, blocks: true });
    const run = findDigitRun((first.data.blocks ?? []) as unknown as BlockLike[]);
    if (!run) return null;

    // 2. Read just them, digits only. A little room around the run, less than a
    //    character's width, so the label beside it stays out.
    const h = run.box.y1 - run.box.y0;
    const padX = Math.round(h * 0.2);
    const padY = Math.round(h * 0.3);
    const left = Math.max(0, run.box.x0 - padX);
    const top = Math.max(0, run.box.y0 - padY);
    const rectangle = {
      left,
      top,
      width: Math.min(image.width, run.box.x1 + padX) - left,
      height: Math.min(image.height, run.box.y1 + padY) - top,
    };
    await worker.setParameters({ tessedit_char_whitelist: DIGITS, tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const second = await worker.recognize(image, { rectangle });
    const digits = digitsOnly(second.data.text ?? '');

    const ok = (d: string) => d.length > 0 && (!accept || accept(d));
    if (digits.length === run.length && ok(digits)) return digits;
    // The digits-only read disagreed. The first read stands only if it saw nothing but
    // plain digits (no look-alike letters it might have guessed wrong).
    if (run.digits === digitsOnly(run.digits) && ok(run.digits)) return run.digits;
    return null;
  } finally {
    busy--;
    closeWhenIdle();
  }
}

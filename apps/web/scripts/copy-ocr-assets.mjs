// Copies the text reader (Tesseract OCR) into public/ocr/, so the camera's "Scan Text"
// button works from this server alone. Tesseract.js would otherwise download these
// files from a CDN, which fails when the hospital's internet is down.
//
// Runs after `pnpm install` and before `pnpm build` (package.json). public/ocr/ is not
// in git: it is rebuilt from node_modules, so it always matches the installed version.
//
// Only the LSTM engine is copied (the app uses it alone), in the three builds the worker
// picks between by browser support, plus the small English model (digits are all we read).

import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(appDir, 'package.json'));
const out = join(appDir, 'public', 'ocr');

const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(createRequire(join(tesseract, 'package.json')).resolve('tesseract.js-core/package.json'));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

const files = [
  [join(tesseract, 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(core, 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
];

mkdirSync(out, { recursive: true });
let bytes = 0;
for (const [from, name] of files) {
  copyFileSync(from, join(out, name));
  bytes += statSync(from).size;
}
console.log(`OCR files copied to public/ocr/ (${files.length} files, ${(bytes / 1048576).toFixed(1)} MB)`);

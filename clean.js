const fs = require('fs');
const path = require('path');

const root = 'd:\\AIIMS KALYANI WORK\\OPD_Queue_Management\\apps\\api';
const distPath = path.join(root, 'dist');
const dbPath = path.join(root, 'hospital-local.sqlite');

try {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('Deleted dist');
} catch (e) {
  console.error('Failed to delete dist', e.message);
}

try {
  fs.unlinkSync(dbPath);
  console.log('Deleted sqlite');
} catch (e) {
  console.error('Failed to delete sqlite', e.message);
}

try {
  const tsbuild = path.join(root, 'tsconfig.tsbuildinfo');
  fs.unlinkSync(tsbuild);
  console.log('Deleted tsbuildinfo');
} catch (e) {
}

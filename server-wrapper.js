import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appareilIndex = path.join(__dirname, 'dist', 'appareil', 'index.html');
const injection = '<script src="/appareil/history-fix.js?v=20260729-1"></script>';

try {
  const html = await fs.readFile(appareilIndex, 'utf8');
  if (!html.includes('/appareil/history-fix.js')) {
    await fs.writeFile(appareilIndex, html.replace('</body>', `${injection}</body>`), 'utf8');
    console.log('Appareil photo history fix injected.');
  }
} catch (error) {
  console.error('Unable to inject appareil history fix:', error);
}

await import('./server.js');

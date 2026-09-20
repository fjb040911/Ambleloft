import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// macOS asset export; preserves the approved PNG's transparency.
const root = fileURLToPath(new URL('../', import.meta.url));
const master = path.join(root, 'build/icons/ambleloft-master.png');
const output = path.join(root, 'public/brand');
const temporary = await mkdtemp(path.join(tmpdir(), 'ambleloft-icons-'));
const resize = (size, destination) => execFileSync('/usr/bin/sips', ['-z', String(size), String(size), master, '--out', destination], { stdio: 'ignore' });
try {
  await mkdir(output, { recursive: true });
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) resize(size, path.join(output, `icon-${size}.png`));
  resize(180, path.join(output, 'apple-touch-icon.png'));
  // Modern ICNS entries embed PNG images, including Retina resolutions.
  const chunks = [];
  for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]]) {
    const frame = await readFile(path.join(output, `icon-${size}.png`));
    const chunk = Buffer.alloc(8);
    chunk.write(type);
    chunk.writeUInt32BE(frame.length + 8, 4);
    chunks.push(chunk, frame);
  }
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write('icns');
  icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  await writeFile(path.join(root, 'build/icons/ambleloft.icns'), Buffer.concat([icnsHeader, ...chunks]));
  // ICO supports embedded PNG frames, retaining full RGBA at every size.
  const sizes = [16, 32, 48, 64, 128, 256];
  const frames = [];
  for (const size of sizes) {
    const file = path.join(temporary, `${size}.png`);
    resize(size, file);
    frames.push(await readFile(file));
  }
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const position = 6 + index * 16;
    header[position] = header[position + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(frame.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += frame.length;
  });
  const ico = Buffer.concat([header, ...frames]);
  await writeFile(path.join(root, 'build/icons/ambleloft.ico'), ico);
  await writeFile(path.join(output, 'favicon.ico'), ico);
  console.log('Exported Ambleloft PNG, ICNS and ICO icons.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}

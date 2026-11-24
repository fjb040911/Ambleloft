const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_PDF_BYTES = 32 * 1024 * 1024;

async function readAttachmentPdf(input) {
  const file = input?.path;
  if (typeof file !== 'string' || file.length > 4096 || file.includes('\0') ||
      !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.pdf') {
    return {error: '附件路径无效'};
  }
  let handle;
  try {
    // Use nonblocking open so that a named pipe cannot stall a preview.
    handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile()) return {error: '无法预览此 PDF'};
    if (stat.size > MAX_PDF_BYTES) return {error: '文件超过 32 MiB，请使用外部应用打开。'};
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const {bytesRead} = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) return {error: '无法预览此 PDF'};
      offset += bytesRead;
    }
    if (!data.subarray(0, 1024).includes('%PDF-')) return {error: '无法预览此 PDF'};
    return {data};
  } catch {
    return {error: 'PDF 文件不可访问，可能已移动或删除'};
  } finally {
    await handle?.close();
  }
}
module.exports = {readAttachmentPdf};

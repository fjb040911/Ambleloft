const fs = require('node:fs');
const path = require('node:path');
const file = process.argv[2] || path.join(process.env.APPDATA, 'Ambleloft Update Test/updates/updater.jsonl');
const attempts = [];
let attempt;
for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
  const entry = JSON.parse(line);
  if (entry.event === 'log' && entry.message.startsWith('Downloading update from ')) {
    attempt = {from: entry.version, startedAt: entry.at, mode: 'unknown', payloadBytes: 0, complete: false};
    attempts.push(attempt);
  }
  if (!attempt) continue;
  if (entry.event === 'log' && entry.message.startsWith('Full: ')) {
    attempt.plan = entry.message; attempt.mode = 'differential';
  }
  if (entry.event === 'log' && entry.message.includes('fallback to full download')) {
    attempt.mode = 'full-fallback'; attempt.fallbackReason = entry.message.split('\n')[0];
  }
  if (entry.event === 'log' && entry.message.includes('has already been downloaded')) attempt.mode = 'cached';
  if (entry.event === 'download-progress') {
    attempt.payloadBytes = entry.transferred; attempt.payloadTotal = entry.total;
  }
  if (entry.event === 'update-downloaded') {
    attempt.to = entry.target; attempt.finishedAt = entry.at; attempt.complete = true;
  }
  if (entry.event === 'update-cancelled') attempt.cancelled = true;
}
console.log(JSON.stringify({note:'Payload bytes from updater progress; excludes metadata, blockmaps, headers and previous attempts.', attempts}, null, 2));

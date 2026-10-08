process.parentPort.postMessage({ versions: process.versions, execPath: process.execPath, parentPort: !!process.parentPort });
process.parentPort.on('message', ({ data }) => { if (data === 'stop') process.exit(0); });

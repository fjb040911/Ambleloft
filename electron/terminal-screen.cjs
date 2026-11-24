const {Terminal} = require('@xterm/headless');
const {SerializeAddon} = require('@xterm/addon-serialize');

const HIGH_WATER = 256 * 1024;
const FRAME_MS = 16;

// The PTY owns one bounded VT screen. The renderer attaches a disposable view.
// An outstanding read sleeps until data or exit; a detached view has no reader.
class TerminalScreen {
  constructor(pty, size, onExit) {
    this.pty = pty;
    this.model = new Terminal({...size, scrollback:5000, allowProposedApi:true});
    this.serializer = new SerializeAddon();
    this.model.loadAddon(this.serializer);
    this.pending = 0;
    this.exited = false;
    this.exitCode = null;
    this.model.onData(data => {
      if (!this.view && !this.ended) pty.write(data);
    });
    this.data = pty.onData(data => this.ingest(data));
    this.exit = pty.onExit(({exitCode}) => {
      this.ended = true;
      // An exit can precede the parser callback for the final bytes.
      this.model.write('', () => {
        if (this.closed) return;
        this.exited = true;
        this.exitCode = exitCode;
        this.wake();
        onExit(exitCode);
      });
    });
  }

  ingest(data) {
    this.pending += data.length;
    if (this.pending >= HIGH_WATER && !this.paused) {
      this.paused = true;
      this.pty.pause();
    }
    this.model.write(data, () => {
      if (this.closed) return;
      this.pending -= data.length;
      if (this.paused && this.pending < HIGH_WATER / 2 && !this.ended) {
        this.paused = false;
        this.pty.resume();
      }
      const view = this.view;
      if (!view) return;
      if (view.partialSequence) {
        view.snapshotNeeded = true;
      } else if (!view.snapshotNeeded) {
        if (view.data.length + data.length > HIGH_WATER) {
          view.data = '';
          view.snapshotNeeded = true;
        } else {
          view.data += data;
        }
      }
      this.wake();
    });
  }

  frame(snapshot) {
    const data = snapshot ? this.serializer.serialize() : this.view.data;
    // Serialization captures cells, but not an escape sequence split across PTY
    // chunks. Refresh from the host until the parser returns to its ground state.
    if (snapshot) this.view.partialSequence = this.model._core._inputHandler._parser.currentState !== 0;
    this.view.data = '';
    this.view.snapshotNeeded = false;
    return {data, snapshot, cols:this.model.cols, rows:this.model.rows, exited:this.exited, exitCode:this.exitCode};
  }

  attach(token) {
    if (typeof token !== 'string' || !token) throw Error('Invalid terminal attachment');
    this.detach();
    this.view = {token, data:'', snapshotNeeded:false};
    return this.frame(true);
  }

  read(token) {
    if (!this.view || this.view.token !== token) return null;
    if (this.view.reader) throw Error('Terminal read already pending');
    return new Promise(resolve => {
      this.view.reader = resolve;
      this.wake();
    });
  }

  wake() {
    const view = this.view;
    if (!view?.reader || this.timer || !(view.data || view.snapshotNeeded || this.exited)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const resolve = view.reader;
      view.reader = undefined;
      resolve(this.frame(view.snapshotNeeded));
    }, FRAME_MS);
  }

  detach(token = this.view?.token) {
    if (!this.view || token !== this.view.token) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.view.reader?.(null);
    this.view = undefined;
  }

  resize({cols,rows}) {
    if (!this.ended) this.pty.resize(cols,rows);
    this.model.write('', () => { if (!this.closed) this.model.resize(cols,rows); });
  }

  clear() {
    this.model.write('', () => {
      if (this.closed) return;
      this.model.clear();
      if (this.view) { this.view.snapshotNeeded = true; this.wake(); }
    });
  }

  dispose() {
    this.closed = true;
    this.detach();
    this.data.dispose();
    this.exit.dispose();
    this.model.dispose();
  }
}

module.exports = {TerminalScreen};

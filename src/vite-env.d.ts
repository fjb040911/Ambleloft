/// <reference types="vite/client" />

declare const __AMBLE_BUILD__: {version:string;commit:string|null;dirty:boolean|null;builtAt:string};

declare module '*?terminal-retry' {
  const TerminalPanel: typeof import('./TerminalPanel').default;
  export default TerminalPanel;
}

import type {ITheme,Terminal} from '@xterm/xterm';

const light: ITheme = {
 black:'#262c35',red:'#b42318',green:'#216e39',yellow:'#805600',
 blue:'#2456a6',magenta:'#8040a0',cyan:'#096b72',white:'#58616f',
 brightBlack:'#606773',brightRed:'#c42b24',brightGreen:'#28783e',brightYellow:'#896000',
 brightBlue:'#3265b4',brightMagenta:'#9250ad',brightCyan:'#147780',brightWhite:'#737b88',
};
const dark: ITheme = {
 black:'#454b58',red:'#f48781',green:'#8fca96',yellow:'#e5c07b',
 blue:'#82aaff',magenta:'#c792ea',cyan:'#79cbd5',white:'#d5d9e2',
 brightBlack:'#929baa',brightRed:'#ffaaa2',brightGreen:'#b3dfa9',brightYellow:'#f4d99a',
 brightBlue:'#a9c7ff',brightMagenta:'#dfb8f3',brightCyan:'#a0e2e8',brightWhite:'#f5f6fa',
};

/** Update the existing renderer; never recreate a terminal or its PTY on theme changes. */
export function followTerminalTheme(term:Terminal) {
 const root=document.documentElement,media=matchMedia('(prefers-color-scheme: dark)');
 const update=()=>{
  const style=getComputedStyle(root),token=(name:string)=>style.getPropertyValue(name).trim();
  const background=token('--surface'),foreground=token('--text');
  term.options.theme={
   ...(style.colorScheme==='dark'?dark:light),background,foreground,
   cursor:foreground,cursorAccent:background,
   selectionBackground:token('--selection'),selectionInactiveBackground:token('--selection'),selectionForeground:foreground,
  };
 };
 const observer=new MutationObserver(update);
 observer.observe(root,{attributes:true,attributeFilter:['data-theme']});
 media.addEventListener('change',update);update();
 return()=>{observer.disconnect();media.removeEventListener('change',update);};
}

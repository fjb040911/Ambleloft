export function filePathParts(path:string){const folders=path.split('/');return {filename:folders.pop()||path,folders};}
/** Stable across filtering/pagination; repeated references to the same path share a hint. */
export function fileDirectoryHints(paths:string[],rootLabel='项目根目录'):Map<string,string>{
 const unique=[...new Set(paths)],groups=new Map<string,string[]>(),hints=new Map<string,string>();
 for(const path of unique){const {filename}=filePathParts(path);groups.set(filename,[...(groups.get(filename)||[]),path]);}
 for(const path of unique){const {filename,folders}=filePathParts(path);let count=(groups.get(filename)?.length||0)>1?Math.min(1,folders.length):Math.min(2,folders.length);
  while(count<folders.length&&(groups.get(filename)||[]).some(other=>other!==path&&filePathParts(other).folders.slice(-count).join('/')===folders.slice(-count).join('/')))count++;
  hints.set(path,folders.length?(folders.length>count?'…/':'')+folders.slice(-count).join('/'):rootLabel);
 }
 return hints;
}

import {useState} from 'react';
import {Puzzle} from 'lucide-react';
import './extension-icon.css';
function IconImage({source,size}:{source:string;size:number}) {
 const [failed,setFailed]=useState(false);
 return failed||!source.startsWith('data:image/png;base64,')?<Puzzle size={size} aria-hidden="true"/>:<img src={source} alt="" width={size} height={size} draggable={false} onError={()=>setFailed(true)}/>;
}
/** Image bytes are validated and captured at installation; no extension activation. */
export default function ExtensionIcon({icon,size=18}:{icon?:{light:string;dark:string};size?:number}) {
 if(!icon)return <Puzzle size={size} aria-hidden="true"/>;
 return <span className="extension-custom-icon" aria-hidden="true" style={{width:size,height:size}}><span className="extension-icon-light"><IconImage key={icon.light} source={icon.light} size={size}/></span><span className="extension-icon-dark"><IconImage key={icon.dark} source={icon.dark} size={size}/></span></span>;
}

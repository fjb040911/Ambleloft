type TurnScrollAnchor={viewport:HTMLElement;row:HTMLElement;offset:number};

export function captureTurnScrollAnchor(viewport:HTMLElement|null):TurnScrollAnchor|null{
 if(!viewport?.clientHeight||viewport.hasAttribute('data-turn-jump')||
    viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<=2)return null;
 const bounds=viewport.getBoundingClientRect();
 let placeholder:TurnScrollAnchor|null=null;
 for(const row of viewport.querySelectorAll<HTMLElement>('[data-turn-id]')){
  const rect=row.getBoundingClientRect();
  if(rect.bottom<=bounds.top||rect.top>=bounds.bottom)continue;
  const anchor={viewport,row,offset:rect.top-bounds.top};
  if(!row.querySelector('[data-virtualized=placeholder]'))return anchor;
  placeholder??=anchor;
 }
 return placeholder;
}

export function restoreTurnScrollAnchor(anchor:TurnScrollAnchor|null){
 if(!anchor?.row.isConnected)return;
 const {viewport,row,offset}=anchor;
 const delta=row.getBoundingClientRect().top-viewport.getBoundingClientRect().top-offset;
 if(Math.abs(delta)>.5)viewport.scrollTop+=delta;
}

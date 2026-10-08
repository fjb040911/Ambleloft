const {randomUUID}=require('node:crypto');
class WindowRegistry {
 constructor(trustedURL){this.trustedURL=new URL(trustedURL).href;this.records=new Map();}
 add(window,profileId){const record={id:randomUUID(),window,profileId};const webContentsId=window.webContents.id;this.records.set(webContentsId,record);window.once('closed',()=>this.records.delete(webContentsId));return record;}
 authorize(event){const r=this.records.get(event.sender?.id),frame=event.senderFrame;if(!r||r.window.isDestroyed()||event.sender!==r.window.webContents||frame!==event.sender.mainFrame||frame.url.split('#')[0]!==this.trustedURL)throw Error('FORBIDDEN: 不受信任的窗口');return r;}
 focused(){return [...this.records.values()].find(r=>r.window.isFocused())?.window||[...this.records.values()].find(r=>!r.window.isDestroyed())?.window;}
 broadcast(profileId,channel,value){for(const r of this.records.values())if(r.profileId===profileId&&!r.window.isDestroyed())r.window.webContents.send(channel,value);}
}
module.exports={WindowRegistry};

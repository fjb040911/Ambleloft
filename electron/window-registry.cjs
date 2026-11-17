const {randomUUID}=require('node:crypto');
class WindowRegistry {
 constructor(trustedURL){this.trustedURL=new URL(trustedURL).href;this.records=new Map();}
 add(window,profileId){const record={id:randomUUID(),window,profileId};const webContentsId=window.webContents.id;this.records.set(webContentsId,record);if(this.runSnapshot)record.delivery=this.delivery(window);window.once('closed',()=>{record.delivery?.close();this.records.delete(webContentsId);});return record;}
 delivery(window){return new(require('./run-delivery.cjs').RunDelivery)(frame=>{if(!window.isDestroyed())window.webContents.send('agent:frame',frame);},id=>this.runSnapshot(id));}
 configureRunDelivery(snapshot){this.runSnapshot=snapshot;for(const record of this.records.values())record.delivery??=this.delivery(record.window);}
 authorize(event){const r=this.records.get(event.sender?.id),frame=event.senderFrame;if(!r||r.window.isDestroyed()||event.sender!==r.window.webContents||frame!==event.sender.mainFrame||frame.url.split('#')[0]!==this.trustedURL)throw Error('FORBIDDEN: 不受信任的窗口');return r;}
 focused(){return [...this.records.values()].find(r=>r.window.isFocused())?.window||[...this.records.values()].find(r=>!r.window.isDestroyed())?.window;}
 broadcast(profileId,channel,value){for(const r of this.records.values())if(r.profileId===profileId&&!r.window.isDestroyed()){if(channel==='agent:event'&&r.delivery&&value.kind?.startsWith('run-'))r.delivery.push(value);else r.window.webContents.send(channel,value);}}
}
module.exports={WindowRegistry};

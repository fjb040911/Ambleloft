const base=require('./electron-builder.cjs');
module.exports={
 ...base,
 beforePack:'./build/verify-engine.linux.cjs',
 extraResources:base.extraResources.map(resource=>resource.to==='engine'?{from:'vendor/engine/linux-${arch}',to:'engine'}:resource),
 linux:{...base.linux,target:['AppImage','deb'],category:'Development',artifactName:'Ambleloft-${version}-linux-${arch}.${ext}'},
};

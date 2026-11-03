function overlap(a,b){return a.namespace===b.namespace&&(a.path===b.path||a.path.startsWith(b.path.replace(/\/$/,'')+'/')||b.path.startsWith(a.path.replace(/\/$/,'')+'/'));}
module.exports={overlap};

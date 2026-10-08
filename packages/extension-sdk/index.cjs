'use strict';
/** This helper never activates code or grants access; the host owns both. */
function defineExtension(extension) {
 if(!extension||typeof extension.activate!=='function'||extension.deactivate!==undefined&&typeof extension.deactivate!=='function')throw new TypeError('An extension must export activate(context) and an optional deactivate()');
 return Object.freeze({activate:extension.activate,...(extension.deactivate?{deactivate:extension.deactivate}:{})});
}
module.exports={defineExtension};

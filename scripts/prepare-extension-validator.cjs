const path = require('node:path');
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../core/extensions/manifest.cjs')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(__dirname, '../build/extension-manifest.cjs') });

require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../core/forms/template.cjs')],bundle:true,platform:'node',target:'node22',format:'cjs',outfile:path.join(__dirname,'../build/form-template.cjs')});

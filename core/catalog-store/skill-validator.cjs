// Loaded only by the existing bounded package worker; never executes package code.
const fs = require('node:fs');
const path = require('node:path');
const {parseSkill} = require('../../electron/skills.cjs');
function validatePackage(directory) {
  try {
    const file = path.join(directory, 'SKILL.md'), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 210000) throw Error('Invalid SKILL.md');
    const skill = parseSkill(fs.readFileSync(file, 'utf8'));
    // A full-directory digest also enforces the tighter skill count/size limit.
    require('./catalog.cjs').hashDirectory(directory);
    return {ok: true, extensionId: 'store-skill', manifest: {name: skill.name, skills: []}, icons: {}, dictionaries: {}};
  } catch (error) { return {ok: false, errors: [{path: 'SKILL.md', message: error.message}]}; }
}
module.exports = {validatePackage};

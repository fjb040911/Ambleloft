// Resolve only the capabilities explicitly requested by this authorization action.
function selectGrantPermissions(declared,capabilities){
 if(capabilities===undefined)return declared;
 if(!Array.isArray(capabilities)||!capabilities.length||capabilities.some(c=>typeof c!=='string'||!declared.some(p=>p.capability===c)))throw Error('INVALID_ARGUMENT: Undeclared permission');
 return declared.filter(p=>capabilities.includes(p.capability));
}
module.exports={selectGrantPermissions};

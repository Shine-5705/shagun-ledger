const assert = require('assert'); const { parseEntry } = require('../public/parse.js');
const cases = [['Sharma uncle ne 2100 diye','Sharma uncle',2100],['Gupta parivar ne ₹5,100 aur ek saree di','Gupta parivar',5100],['मेहता जी ने ११०० रुपये दिए','मेहता जी',1100],['Priya didi gave 1001 and a silver coin','Priya didi',1001],['Verma aunty ne do hazaar ek sau diye','Verma aunty',2100]];
for (const [t,g,a] of cases){ const e = parseEntry(t); assert.strictEqual(e.guest,g,t); assert.strictEqual(e.amount,a,t); console.log('ok', t); }

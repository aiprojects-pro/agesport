// Exclude Dockerfile: build platforms may augment the recipe with build metadata.
// Fingerprint only application source; never read environment files or uploads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const hash = crypto.createHash('sha256');
const files = {};
function visit(relative) {
  if (relative === 'public/version.json') return;
  const absolute = path.join(root, relative);
  if (fs.statSync(absolute).isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) visit(relative + '/' + name);
  } else {
    const content = fs.readFileSync(absolute);
    files[relative] = crypto.createHash('sha256').update(content).digest('hex');
    hash.update(relative + '\0'); hash.update(content);
  }
}
for (const name of ['package.json','package-lock.json','server.js','controllers','middleware','routes','services','config','database','public','scripts']) visit(name);
const data = {version:require('../package.json').version, sourceHash:hash.digest('hex'), files};
fs.writeFileSync(path.join(root,'public/version.json'), JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({version:data.version,sourceHash:data.sourceHash}));

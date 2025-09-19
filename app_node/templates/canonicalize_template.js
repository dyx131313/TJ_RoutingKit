const crypto = require('crypto');
const fs = require('fs');

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') {
      // fixed precision for floats
      return Number(obj).toFixed(6);
    }
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  // object: sort keys
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function sign(canonicalJson, secret) {
  return crypto.createHmac('sha256', secret).update(canonicalJson).digest('hex');
}

if (require.main === module) {
  if (process.argv.length < 4) {
    console.error('Usage: node canonicalize_template.js <template.json> <secret>');
    process.exit(2);
  }
  const tpl = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const secret = process.argv[3];
  const canon = canonicalize(tpl);
  console.log('CANONICAL_JSON=', canon);
  console.log('SIGNATURE=', sign(canon, secret));
}

module.exports = { canonicalize, sign };

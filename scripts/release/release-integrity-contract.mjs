import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

if (!pkg.version || !lock.version || lock.packages?.['']?.version !== pkg.version || lock.version !== pkg.version) {
  throw new Error(`VERSION_DRIFT: package=${pkg.version} lock=${lock.version} root-lock=${lock.packages?.['']?.version}`);
}

if (!/^\d+\.\d+\.\d+([-.+].*)?$/.test(pkg.version)) {
  throw new Error(`INVALID_SEMVER: ${pkg.version}`);
}

let tags = [];
try {
  tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--sort=-v:refname'], { encoding: 'utf8' })
    .split('\n').map(x => x.trim()).filter(x => /^v\d+\.\d+\.\d+$/.test(x));
} catch {}

if (tags[0]) {
  const [a,b,c] = pkg.version.split('.').map(Number);
  const [x,y,z] = tags[0].slice(1).split('.').map(Number);
  if (a*1000000+b*1000+c < x*1000000+y*1000+z) {
    throw new Error(`VERSION_REGRESSION: package.json=${pkg.version} latest_tag=${tags[0]}`);
  }
}

console.log(`RELEASE_INTEGRITY_OK ${pkg.version}`);

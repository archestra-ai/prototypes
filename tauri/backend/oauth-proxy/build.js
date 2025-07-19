const { execSync } = require('child_process');
const fs = require('fs');

const ext = process.platform === 'win32' ? '.exe' : '';

const rustInfo = execSync('rustc -vV');
const targetTriple = /host: (\S+)/g.exec(rustInfo)[1];
if (!targetTriple) {
  console.error('Failed to determine platform target triple');
}
fs.renameSync(
  `dist/oauth-proxy${ext}`,
  `../../src-tauri/binaries/oauth-proxy-${targetTriple}${ext}`
);

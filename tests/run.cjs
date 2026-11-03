// Runs every tests/*.test.cjs with Node's built-in runner, so each feature can keep its own test file.
// (Node 18 has no glob support in --test; this keeps `npm test` working on Node 18+ and on Windows.)
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const files = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join(__dirname, name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);

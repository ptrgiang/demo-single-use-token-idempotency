import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const revision = git('rev-parse', 'HEAD');
if (git('status', '--porcelain', '--untracked-files=normal')) {
  throw new Error('Commit source changes first: evidence must identify a clean tested revision.');
}
await mkdir(resolve(root, 'evidence'), { recursive: true });
const run = (entry, args) => execFileSync(process.execPath, [resolve(root, entry), ...args], {
  cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
run('node_modules/typescript/bin/tsc', ['--noEmit']);
run('scripts/check-client-syntax.mjs', []);
run('node_modules/vitest/vitest.mjs', ['run', '--reporter=default', '--reporter=json', '--outputFile=evidence/vitest.json']);
run('scripts/network-smoke.mjs', []);
run('scripts/mini-smoke.mjs', []);
if (git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Tracked source changed during verification');
const files = git('ls-files').split('\n');
const manifest = [];
for (const path of files) {
  const bytes = await readFile(resolve(root, path));
  manifest.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(resolve(root, 'evidence/source-manifest.json'), JSON.stringify({ revision, files: manifest }, null, 2)+'\n');
const vitest = JSON.parse(await readFile(resolve(root, 'evidence/vitest.json'), 'utf8'));
const artifacts = [];
for (const path of ['vitest.json','network-smoke.json','mini-smoke.json','source-manifest.json']) {
  const bytes = await readFile(resolve(root, 'evidence', path));
  artifacts.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const summary = {
  recordedAt: new Date().toISOString(), testedCommit: revision, cleanWorktree: true,
  repository: 'https://github.com/ptrgiang/demo-single-use-token-idempotency',
  node: process.version, platform: process.platform,
  checks: { typecheck: 'passed', testsPassed: vitest.numPassedTests,
    testsTotal: vitest.numTotalTests, testsFailed: vitest.numFailedTests,
    networkResponseLoss: 'passed', miniWebHttp: 'passed' }, artifacts,
  scope: 'Standalone public demo only; separate from the private Project 2 regression suite',
};
await writeFile(resolve(root, 'evidence/summary.json'), JSON.stringify(summary, null, 2)+'\n');
console.log(JSON.stringify(summary, null, 2));

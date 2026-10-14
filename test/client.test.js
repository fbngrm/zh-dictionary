// Runs the Go server (server/) and checks that the API client returns
// exactly what the bundled library returns. Skipped when Go isn't
// installed. CONTRACT_STEP=1 compares every word (default: every 20th).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createClient } from '@fbngrm/zh-dictionary/client';
import * as zh from '@fbngrm/zh-dictionary/zh';
import * as cedict from '@fbngrm/zh-dictionary/cedict';
import zhData from '@fbngrm/zh-dictionary/data/zh.json' with { type: 'json' };
import cedictData from '@fbngrm/zh-dictionary/data/cedict.json' with { type: 'json' };
import hanzi from '@fbngrm/zh-dictionary/data/hanzi.json' with { type: 'json' };

const hasGo = spawnSync('go', ['version']).status === 0;
const step = Number(process.env.CONTRACT_STEP ?? 20);
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
let baseUrl;
let binDir;

before(async () => {
  if (!hasGo) return;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  // Build and run the binary directly: killing `go run` would leave the
  // compiled server running.
  binDir = mkdtempSync(`${tmpdir()}/zh-dictionary-server-`);
  const build = spawnSync('go', ['build', '-buildvcs=false', '-o', `${binDir}/server`, '.'], { cwd: `${root}server`, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('go build failed');
  server = spawn(`${binDir}/server`, {
    env: { ...process.env, DATA_DIR: `${root}data`, ADDR: `127.0.0.1:${port}` },
    stdio: 'inherit',
  });
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  if (binDir) rmSync(binDir, { recursive: true, force: true });
});

for (const [mode, local, data] of [['zh', zh, zhData], ['cedict', cedict, cedictData]]) {
  test(`client matches the ${mode} mode`, { skip: !hasGo && 'Go not installed' }, async () => {
    const client = createClient({ baseUrl, mode });
    const words = Object.keys(data).filter((_, i) => i % step === 0);
    const traditional = words.flatMap((w) => [data[w]].flat().map((e) => e.traditional).filter(Boolean));
    const chars = Object.keys(hanzi).filter((_, i) => i % step === 0);

    await inBatches([...words, ...traditional], async (word) => {
      assert.deepEqual(await client.describe(word), local.describe(word), `describe ${word}`);
      assert.deepEqual(await client.lookupAll(word), local.lookupAll(word), `lookupAll ${word}`);
    });
    await inBatches(chars, async (char) => {
      assert.deepEqual(await client.character(char), local.character(char), `character ${char}`);
    });
    assert.deepEqual(await client.lookup('好'), local.lookup('好'));
    assert.equal(await client.lookup('不存在的词'), null);
    assert.equal(await client.describe('不存在的词'), null);
    assert.equal(await client.has('constructor'), false);
    assert.equal(await client.attribution(), local.attribution);
  });
}

test('client reports HTTP errors', { skip: !hasGo && 'Go not installed' }, async () => {
  await assert.rejects(createClient({ baseUrl, mode: 'xx' }).lookup('好'), /HTTP 404/);
});

async function inBatches(items, fn, size = 64) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

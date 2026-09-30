import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSerpApiClient, trimSearch, trimNews } from '../scripts/serpapi-client.js';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const silent = { info() {}, warn() {} };
const search = { position: 1, title: ' A  title ', link: 'https://example.org/search', snippet: ' some\n text ', date: undefined, ignored: true };
const news = { title: ' News ', link: 'https://example.org/news', source: { name: ' Publisher ' }, date: ' today ', ignored: true };
const raw = { query: 'topic', pulledAt: new Date().toISOString(), search: trimSearch({ organic_results: [search] }), news: trimNews({ news_results: [news] }) };
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status });

async function runner(alert, compare) {
  const context = vm.createContext({ console, process: { argv: [] }, URL });
  const module = new vm.SourceTextModule(await readFile(`${root}/scripts/pull-and-diff.js`, 'utf8'), { context, identifier: pathToFileURL(`${root}/scripts/pull-and-diff.js`).href });
  await module.link(async (specifier) => {
    if (specifier === './diff-engine.js' && !compare) return new vm.SourceTextModule(await readFile(`${root}/scripts/diff-engine.js`, 'utf8'), { context });
    if (specifier === './frequency.js' || specifier.endsWith('/frequency.js')) return new vm.SourceTextModule(await readFile(`${root}/scripts/frequency.js`, 'utf8'), { context });
    const exports = specifier === 'node:url' ? { pathToFileURL } : specifier.includes('serpapi-client') ? { createSerpApiClient } : specifier.includes('diff-engine') ? { diff: compare } : alert ? { sendDiffAlert: alert, isAlertConfigured: () => true } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return module.namespace.runPipeline;
}
function database(previous = null, email = null) {
  const state = { snapshots: [], diffs: [], updates: [], queries: [], pending: [], rollback: false };
  const tx = {
    snapshot: {
      async findFirst(args) { state.queries.push(args); return previous; },
      async create({ data }) { const value = { id: 'current', ...data }; state.snapshots.push(value); return value; },
    },
    diff: { async create({ data }) { const value = { id: 'diff', ...data }; state.diffs.push(value); return value; } },
  };
  return { state, topic: { async findMany() { return [{ id: 'topic-1', query: 'topic', alertEmail: email }]; } },
    async $transaction(fn) { try { return await fn(tx); } catch (error) { state.snapshots = []; state.diffs = []; state.rollback = true; throw error; } },
    diff: { async findMany() { return state.pending; }, async update(args) { state.updates.push(args); } },
  };
}
const client = { async pullSnapshot() { return structuredClone(raw); } };

test('exact shape, trimming, omitted snippets and top ten bounds', () => {
  const s = trimSearch({ organic_results: Array(12).fill(search) });
  assert.equal(s.length, 10);
  assert.deepEqual(s[0], { position: 1, title: 'A title', link: search.link, snippet: 'some text', date: null });
  assert.deepEqual(trimNews({ news_results: [news] })[0], { title: 'News', link: news.link, source: 'Publisher', date: 'today', snippet: '' });
  assert.equal(trimNews({ news_results: [{ highlight: news, stories: Array(12).fill(news) }] }).length, 10);
});
test('reject empty, malformed and invalid URL results', () => {
  for (const payload of [{}, { organic_results: [] }, { organic_results: [{ ...search, link: 'bad' }] }, { organic_results: [{ ...search, title: '' }] }]) assert.throws(() => trimSearch(payload));
  for (const payload of [{}, { news_results: [] }, { news_results: [null] }, { news_results: [{ stories: [] }] }, { news_results: [{ ...news, source: {} }] }]) assert.throws(() => trimNews(payload));
});
test('429 without JSON and quota response rotate; News reuses successful key', async () => {
  const calls = [], logs = [];
  const api = createSerpApiClient({ env: { SERPAPI_KEY_1: 'fake-one', SERPAPI_KEY_2: 'fake-two', SERPAPI_KEY_4: 'fake-four' }, logger: { info: (x) => logs.push(x), warn: (x) => logs.push(x) }, fetchImpl: async (url) => {
    calls.push(Object.fromEntries(url.searchParams));
    if (calls.length === 1) return new Response('not json', { status: 429 });
    if (calls.length === 2) return response({ error: 'Your account has run out of searches.' });
    return response(url.searchParams.get('engine') === 'google' ? { organic_results: [search] } : { news_results: [news] });
  } });
  const data = await api.pullSnapshot('topic');
  assert.deepEqual(Object.keys(data), ['query', 'pulledAt', 'search', 'news']);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((x) => x.api_key), ['fake-one', 'fake-two', 'fake-four', 'fake-four']);
  assert.equal(calls[3].engine, 'google_news');
  assert.ok(logs.some((x) => x.includes('index 4')));
  assert.ok(!logs.join('').includes('fake-'));
  assert.deepEqual(api.getUsage(), [
    { keyIndex: 1, attempts: 1, successfulResponses: 0 },
    { keyIndex: 2, attempts: 1, successfulResponses: 0 },
    { keyIndex: 4, attempts: 2, successfulResponses: 2 },
  ]);
});
test('all four exhausted keys fail clearly, missing keys fail', async () => {
  let count = 0;
  const api = createSerpApiClient({ env: Object.fromEntries([1, 2, 3, 4].map((x) => [`SERPAPI_KEY_${x}`, `fake-${x}`])), logger: silent, fetchImpl: async () => { count++; return response({ error: 'Monthly quota exceeded' }, 403); } });
  await assert.rejects(api.googleSearch('topic'), /All configured SerpApi keys/);
  assert.equal(count, 4);
  assert.throws(() => createSerpApiClient({ env: {} }), /SERPAPI_KEY_1/);
});
test('non-quota, invalid JSON and network errors fail without key leaks or rotation', async () => {
  for (const fail of [async () => response({ error: 'bad fake-secret' }, 401), async () => new Response('bad'), async () => { throw new Error('fake-secret'); }]) {
    let calls = 0;
    const api = createSerpApiClient({ env: { SERPAPI_KEY_1: 'fake-secret', SERPAPI_KEY_2: 'fake-second' }, logger: silent, fetchImpl: async () => { calls++; return fail(); } });
    await assert.rejects(api.googleSearch('topic'), (error) => !error.message.includes('fake-secret'));
    assert.equal(calls, 1);
  }
});
test('first snapshot has no diff call; unchanged snapshot has no Diff', async () => {
  let compared = false;
  const run = await runner(undefined, () => { compared = true; throw new Error(); });
  const first = database();
  await run({ db: first, client, logger: silent });
  assert.equal(first.state.snapshots.length, 1);
  assert.equal(compared, false);
  const unchanged = database({ id: 'old', rawData: structuredClone(raw) });
  await (await runner())({ db: unchanged, client, logger: silent });
  assert.equal(unchanged.state.diffs.length, 0);
});
test('real diff engine creates Diff, sends alert then marks alerted', async () => {
  const old = structuredClone(raw); old.search[0].title = 'Old title';
  const db = database({ id: 'old', rawData: old }, 'test@example.org');
  await (await runner(async (topic, change) => {
    assert.equal(topic.alertEmail, 'test@example.org');
    assert.equal(change.alerted, false);
    assert.equal(db.state.diffs.length, 1);
    assert.equal(db.state.updates.length, 0);
  }))({ db, client, logger: silent });
  assert.equal(db.state.updates[0].data.alerted, true);
  assert.match(db.state.diffs[0].summary, /Changed title/);
  assert.equal(db.state.queries[0].where.topicId, 'topic-1');
});
test('delivery throws or returns false: Diff persists unalerted and runner rejects', async () => {
  for (const alert of [async () => { throw new Error('SMTP fake-secret'); }, async () => false]) {
    const db = database({ rawData: { ...raw, search: [] } }, 'test@example.org');
    await assert.rejects((await runner(alert))({ db, client, logger: silent }), /sending the diff alert/);
    assert.equal(db.state.diffs.length, 1);
    assert.equal(db.state.diffs[0].alerted, false);
    assert.equal(db.state.updates.length, 0);
  }
});
test('a later run retries stored unalerted diffs before pulling fresh data', async () => {
  const db = database(null, 'test@example.org');
  db.state.pending = [{ id: 'previous-diff', summary: 'Earlier real change', sourceUrls: ['https://example.org'] }];
  const order = [];
  await (await runner(async () => { order.push('sent'); }))({ db, client: { async pullSnapshot() { order.push('pulled'); return raw; } }, logger: silent });
  assert.deepEqual(order, ['sent', 'pulled']);
  assert.equal(db.state.updates[0].where.id, 'previous-diff');
  assert.equal(db.state.updates[0].data.alerted, true);
});
test('missing alert implementation fails before any snapshot writes', async () => {
  const db = database(null, 'test@example.org');
  await assert.rejects((await runner())({ db, client, logger: silent }), /must export sendDiffAlert/);
  assert.equal(db.state.snapshots.length, 0);
});
test('failed News or empty component causes no writes', async () => {
  let calls = 0;
  const api = createSerpApiClient({ env: { SERPAPI_KEY_1: 'fake' }, logger: silent, fetchImpl: async () => ++calls === 1 ? response({ organic_results: [search] }) : response({ news_results: [] }) });
  for (const incomplete of [api, { async pullSnapshot() { return { ...raw, news: [] }; } }]) {
    const db = database();
    await assert.rejects((await runner())({ db, client: incomplete, logger: silent }));
    assert.equal(db.state.snapshots.length, 0);
  }
});
test('diff errors roll back new snapshot, DB errors reject', async () => {
  const db = database({ rawData: raw });
  await assert.rejects((await runner(undefined, () => { throw new Error('diff failed'); }))({ db, client, logger: silent }), /computing its diff/);
  assert.equal(db.state.rollback, true);
  assert.equal(db.state.snapshots.length, 0);
  db.topic.findMany = async () => { throw new Error('DB down'); };
  await assert.rejects((await runner())({ db, client, logger: silent }), /DB down/);
});

test('CLI exits nonzero on missing configuration, DB errors, and absent alert export', async () => {
  const { spawnSync } = await import('node:child_process');
  // Dependency mocks exist only in this external test file, never in production modules.
  const loaderSource = `
    export async function resolve(specifier, context, nextResolve) {
      let source;
      if (specifier === 'dotenv') source = 'export default { config() {} };';
      if (specifier === '@prisma/client') source = \`export class PrismaClient {
        topic = { findMany: async () => {
          if (process.env.TEST_CASE === 'db') throw new Error('fake-key database failure');
          return process.env.TEST_CASE === 'alert' ? [{ alertEmail: 'test@example.org' }] : [];
        } };
        async $disconnect() { console.log('TEST_DISCONNECTED'); }
      }\`;
      return source ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true } : nextResolve(specifier, context);
    }
  `;
  const loader = 'data:text/javascript,' + encodeURIComponent(loaderSource);
  for (const [kind, status, expected] of [['missing', 1, /DATABASE_URL is required/], ['db', 1, /\[REDACTED\] database failure/], ['alert', 1, /SMTP_HOST/], ['ok', 0, /Pipeline completed: 0/]]) {
    const result = spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', loader, `${root}/scripts/pull-and-diff.js`], {
      encoding: 'utf8', env: { PATH: process.env.PATH, TEST_CASE: kind, ...(kind === 'missing' ? {} : { DATABASE_URL: 'postgresql://fake', SERPAPI_KEY_1: 'fake-key' }) },
    });
    assert.equal(result.status, status, result.stderr);
    assert.match(result.stdout + result.stderr, expected);
    assert.ok(!result.stderr.includes('fake-key'));
    if (kind !== 'missing') assert.match(result.stdout, /TEST_DISCONNECTED/);
  }
});


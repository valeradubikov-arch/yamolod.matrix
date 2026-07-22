import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractRows,
  loadDashboardData,
  normalizeRow,
  validateAndNormalizeRows,
} from '../server/data-source.mjs';

const validRawRow = {
  source_id: '1',
  updated_at: '2026-07-21T19:46:06Z',
  source_table: 'TABLE_A',
  Data_nachala: '2026-07-15',
  Data_okonchania: '2026-07-16',
  ID: '1',
  Nazvanie_meropriyatiya___tema_vospitatelnogo_chasa: 'Региональный добровольческий форум',
  Status: 'Актуально',
  KMF___soobschestvo: 'Волонтёры',
  Uroven_meropriyatiya___vospitatelnogo_chasa: 'Региональный',
  Kategoriya_meropriyatiya___vospitatelnogo_chasa: 'Гражданское',
  Otvetstvennoe_uchrezhdenie: 'ОМЦ',
  Otvetstvenniy: 'Иванов Иван',
  Munitsipalnoe_obrazovanie: 'Салехард',
  Format_provedeniya: 'Очно',
  FYUS_Summa_dovedyonnaya_na_01_yanvarya_2026__v_rub_: '12 500',
  FYUS_Summa_soglasovannoy_smet: '7 000',
};

test('extractRows supports array and common wrapper objects', () => {
  assert.equal(extractRows([validRawRow]).length, 1);
  assert.equal(extractRows({ rows: [validRawRow] }).length, 1);
  assert.equal(extractRows({ payload: { records: [validRawRow, validRawRow] } }).length, 2);
});

test('normalizeRow maps Loginom transliterated fields to dashboard model', () => {
  const row = normalizeRow(validRawRow);
  assert.equal(row.source_id, '1');
  assert.equal(row.title, 'Региональный добровольческий форум');
  assert.equal(row.dateRaw, '2026-07-15');
  assert.equal(row.endDateRaw, '2026-07-16');
  assert.equal(row.level, 'Региональный');
  assert.equal(row.status, 'Актуально');
  assert.equal(row.institution, 'ОМЦ');
  assert.equal(row.place, 'Салехард');
  assert.equal(row.budgetRaw, '12 500');
});

test('normalizeRow does not map short ID fields into unrelated optional fields', () => {
  const row = normalizeRow({
    ...validRawRow,
    FYUS_Uchrezhdenie_derzhatel_subsidii: '',
  });

  assert.equal(row.id, '1');
  assert.equal(row.holder, '');
});

test('validation keeps valid rows and rejects malformed or incomplete rows', () => {
  const result = validateAndNormalizeRows([
    validRawRow,
    null,
    { source_id: '2', Data_nachala: '2026-07-20' },
    { ...validRawRow, source_id: '1', ID: 'duplicate' },
  ]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rejectedRecords.length, 3);
  assert.deepEqual(result.rejectedRecords.map(item => item.reasons[0]), [
    'row_is_not_object',
    'missing_title',
    'duplicate_source_id',
  ]);
});

test('loadDashboardData returns rows plus freshness meta from local fixture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yamolod-data-'));
  const file = join(dir, 'events.json');
  await writeFile(file, JSON.stringify({
    updated_at: '2026-07-21T19:46:06Z',
    rows: [validRawRow],
  }));

  const data = await loadDashboardData({
    localJsonPath: file,
    yandexToken: '',
    publicUrl: '',
    diskPath: '',
    cacheSeconds: 0,
    allowLocalFallback: false,
  });

  assert.equal(data.rows.length, 1);
  assert.equal(data.meta.recordCount, 1);
  assert.equal(data.meta.rejectedRecordCount, 0);
  assert.equal(data.meta.sourceUpdatedAt, '2026-07-21T19:46:06Z');
  assert.equal(data.meta.sourceStatus, 'success');
});

test('Yandex private flow requests a download href and parses downloaded JSON', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (calls.length === 1) {
      return new Response(JSON.stringify({ href: 'https://download.example/events.json' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify([validRawRow]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const data = await loadDashboardData({
      yandexToken: 'token',
      diskPath: '/Loginom/Сводная таблица.json',
      publicUrl: '',
      localJsonPath: '',
      cacheSeconds: 0,
      allowLocalFallback: false,
    });
    assert.equal(data.rows.length, 1);
    assert.equal(data.source, 'yandex-disk-private');
    assert.match(calls[0], /cloud-api\.yandex\.net\/v1\/disk\/resources\/download/);
    assert.equal(calls[1], 'https://download.example/events.json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('malformed downloaded JSON fails instead of returning an empty success', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(JSON.stringify({ href: 'https://download.example/events.json' }), { status: 200 });
    }
    return new Response('{bad json', { status: 200 });
  };

  await assert.rejects(
    loadDashboardData({
      yandexToken: 'token',
      diskPath: '/Loginom/Сводная таблица.json',
      publicUrl: '',
      localJsonPath: '',
      cacheSeconds: 0,
      allowLocalFallback: false,
    }),
    /not valid JSON/
  );

  globalThis.fetch = originalFetch;
});

test('schema without an events array fails instead of becoming an empty dashboard', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yamolod-schema-'));
  const file = join(dir, 'events.json');
  await writeFile(file, JSON.stringify({ unexpected: { value: true } }));

  await assert.rejects(
    loadDashboardData({
      localJsonPath: file,
      yandexToken: '',
      publicUrl: '',
      diskPath: '',
      cacheSeconds: 0,
      allowLocalFallback: false,
    }),
    /events array/
  );
});

import { readFile } from 'node:fs/promises';

const DEFAULT_DISK_PATH = '/Loginom/Сводная таблица.json';
const DEFAULT_PUBLIC_URL = 'https://disk.yandex.ru/d/X2LAAlT4PyzKCA';

export function getConfig(env = process.env) {
  return {
    yandexToken: env.YANDEX_DISK_TOKEN || '',
    diskPath: env.YANDEX_DISK_PATH || DEFAULT_DISK_PATH,
    publicUrl: env.YANDEX_PUBLIC_URL || DEFAULT_PUBLIC_URL,
    localJsonPath: env.LOCAL_JSON_PATH || new URL('../data/sample-events.json', import.meta.url).pathname,
    cacheSeconds: numberOrDefault(env.CACHE_SECONDS, 0),
  };
}

export async function loadDashboardData(config = getConfig(), options = {}) {
  const loaded = await loadRawJson(config, options);
  const rawRows = extractRows(loaded.data);
  const rows = rawRows.map(normalizeRow).filter(row => row.title);
  const diagnostics = buildDiagnostics(rows, loaded, rawRows);

  return {
    updatedAt: getDatasetUpdatedAt(loaded.data, rows) || new Date().toISOString(),
    source: loaded.source,
    sourcePath: loaded.sourcePath,
    rows,
    diagnostics,
  };
}

async function loadRawJson(config, options) {
  if (options.forceLocal) {
    return loadLocalJson(config.localJsonPath);
  }

  if (config.yandexToken) {
    return loadPrivateDiskJson(config);
  }

  if (config.publicUrl) {
    try {
      return await loadPublicDiskJson(config.publicUrl);
    } catch (error) {
      const local = await loadLocalJson(config.localJsonPath);
      return {
        ...local,
        source: 'local-fallback',
        sourceError: error.message,
      };
    }
  }

  return loadLocalJson(config.localJsonPath);
}

async function loadPrivateDiskJson(config) {
  const url = new URL('https://cloud-api.yandex.net/v1/disk/resources/download');
  url.searchParams.set('path', config.diskPath);

  const linkResponse = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `OAuth ${config.yandexToken}`,
    },
  });

  if (!linkResponse.ok) {
    throw new Error(`Yandex Disk link request failed: ${linkResponse.status} ${await safeText(linkResponse)}`);
  }

  const linkData = await linkResponse.json();
  if (!linkData.href) {
    throw new Error('Yandex Disk did not return download href');
  }

  const data = await downloadJson(linkData.href);
  return {
    data,
    source: 'yandex-disk-private',
    sourcePath: config.diskPath,
  };
}

async function loadPublicDiskJson(publicUrl) {
  const url = new URL('https://cloud-api.yandex.net/v1/disk/public/resources/download');
  url.searchParams.set('public_key', publicUrl);

  const linkResponse = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!linkResponse.ok) {
    throw new Error(`Yandex public link request failed: ${linkResponse.status} ${await safeText(linkResponse)}`);
  }

  const linkData = await linkResponse.json();
  if (!linkData.href) {
    throw new Error('Yandex public API did not return download href');
  }

  const data = await downloadJson(linkData.href);
  return {
    data,
    source: 'yandex-disk-public',
    sourcePath: publicUrl,
  };
}

async function downloadJson(href) {
  const fileResponse = await fetch(href, {
    headers: {
      accept: 'application/json,text/plain,*/*',
    },
  });

  if (!fileResponse.ok) {
    throw new Error(`JSON download failed: ${fileResponse.status} ${await safeText(fileResponse)}`);
  }

  const text = await fileResponse.text();
  try {
    return JSON.parse(stripBom(text));
  } catch (error) {
    throw new Error(`Downloaded file is not valid JSON: ${error.message}`);
  }
}

async function loadLocalJson(path) {
  const text = await readFile(path, 'utf8');
  return {
    data: JSON.parse(stripBom(text)),
    source: 'local-json',
    sourcePath: path,
  };
}

function extractRows(data) {
  if (Array.isArray(data)) return data;

  for (const key of ['rows', 'data', 'items', 'result', 'records', 'events']) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return findLargestObjectArray(data);
}

export function normalizeRow(row) {
  const startDate = firstValue(row, [
    'Дата начала мероприятия / воспитательного часа',
    'Дата начала',
    'Дата',
    'date_start',
    'start_date',
    'dateRaw',
  ]);
  const endDate = firstValue(row, [
    'Дата окончания мероприятия / воспитательного часа',
    'Дата окончания',
    'date_end',
    'end_date',
    'endDateRaw',
  ]);
  const place = joinValue(firstValue(row, [
    'Прощадка',
    'Площадка',
    'Место проведения',
    'Муниципальное образование',
    'place',
  ]));
  const level = textValue(firstValue(row, [
    'Уровень мероприятия / воспитательного часа',
    'Уровень',
    'level',
  ]));
  const category = joinValue(firstValue(row, [
    'Категория мероприятия / воспитательного часа',
    'Категория',
    'category',
  ]));
  const title = textValue(firstValue(row, [
    'Название мероприятия / тема воспитательного часа',
    'Название мероприятия',
    'Мероприятие',
    'Название',
    'title',
  ]));

  return {
    sourceRow: row,
    source_id: textValue(firstValue(row, ['source_id', '_id', 'ID', 'id'])),
    source_table: textValue(firstValue(row, ['source_table', 'table_name', 'Таблица'])),
    updated_at: textValue(firstValue(row, ['updated_at', 'Дата выгрузки', 'updatedAt'])),
    id: textValue(firstValue(row, ['ID', 'id', 'source_id', '_id'])),
    title,
    community: joinValue(firstValue(row, ['КМФ / сообщество', 'КМФ/Сообщество', 'КМФ', 'community'])),
    dateRaw: normalizeDate(startDate) || textValue(startDate),
    endDateRaw: normalizeDate(endDate) || textValue(endDate),
    level,
    category,
    budgetRaw: firstValue(row, [
      'Бюджет',
      'Сумма доведённая на 01 января 2026 (в руб)',
      'Сумма доведённая 01.01.2026',
      'budget',
    ]),
    estimateRaw: firstValue(row, ['Сумма согласованной сметы', 'Согласованная смета', 'estimate']),
    balanceRaw: firstValue(row, ['Остаток суммы сметы', 'Остаток', 'balance']),
    fundingSource: joinValue(firstValue(row, ['Источник финансирования', 'fundingSource'])),
    travelSource: joinValue(firstValue(row, ['Источник финансирования на проезд', 'travelSource'])),
    travelAmountRaw: firstValue(row, ['Сумма проезда', 'travelAmount']),
    institution: joinValue(firstValue(row, ['Ответственное учреждение', 'Учреждение', 'institution'])),
    holder: joinValue(firstValue(row, ['Учреждение-держатель субсидии', 'holder'])),
    owner: textValue(firstValue(row, ['Ответственный', 'Отв. исполнитель', 'Ответственный исполнитель', 'owner'])),
    department: textValue(firstValue(row, ['Ответственный отдел', 'department'])),
    reachRaw: firstValue(row, ['Планируемый охват', 'Охват', 'reach']),
    place,
    format: textValue(firstValue(row, ['Формат проведения', 'format'])),
    isOutbound: isOutboundRow({ level, category, place, format: row['Формат проведения'] }),
  };
}

function buildDiagnostics(rows, loaded, rawRows = rows) {
  const ids = new Set();
  const duplicates = [];
  let missingTitle = 0;
  let missingDate = 0;

  for (const row of rows) {
    const id = row.source_id || row.id;
    if (id) {
      if (ids.has(id)) duplicates.push(id);
      ids.add(id);
    }
    if (!row.title) missingTitle += 1;
    if (!row.dateRaw) missingDate += 1;
  }

  return {
    rowCount: rows.length,
    rawRowCount: rawRows.length,
    droppedRows: Math.max(0, rawRows.length - rows.length),
    uniqueIdCount: ids.size,
    duplicateIds: duplicates.slice(0, 50),
    duplicateCount: duplicates.length,
    missingTitle,
    missingDate,
    sourceError: loaded.sourceError || '',
    rawShape: describeShape(loaded.data),
  };
}

function getDatasetUpdatedAt(data, rows) {
  return data?.updatedAt || data?.updated_at || rows.find(row => row.updated_at)?.updated_at || '';
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== '') {
      return row[key];
    }
  }
  return '';
}

function findLargestObjectArray(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  let best = [];
  if (Array.isArray(value)) {
    if (value.some(item => item && typeof item === 'object' && !Array.isArray(item))) {
      best = value;
    }

    for (const item of value) {
      const found = findLargestObjectArray(item, seen);
      if (found.length > best.length) best = found;
    }
    return best;
  }

  for (const item of Object.values(value)) {
    const found = findLargestObjectArray(item, seen);
    if (found.length > best.length) best = found;
  }

  return best;
}

function describeShape(data) {
  if (Array.isArray(data)) return { type: 'array', length: data.length };
  if (!data || typeof data !== 'object') return { type: typeof data };
  const keys = Object.keys(data).slice(0, 20);
  const arrays = [];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) arrays.push({ key, length: value.length });
  }

  return {
    type: 'object',
    keys,
    arrays,
  };
}

function joinValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return textValue(value);
}

function textValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = raw.match(/^([0-3]?\d)[.\/-]([01]?\d)[.\/-](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, '0')}-${ru[1].padStart(2, '0')}`;
  return '';
}

function isOutboundRow(row) {
  const text = Object.values(row).join(' ').toLowerCase();
  return text.includes('выезд') || text.includes('очно') || text.includes('поездка') || text.includes('смена');
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

async function safeText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

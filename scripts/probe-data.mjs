import { getConfig, loadDashboardData } from '../server/data-source.mjs';

try {
  const config = getConfig();
  const data = await loadDashboardData(config);
  const first = data.rows[0] || {};

  console.log(JSON.stringify({
    ok: true,
    source: data.source,
    sourcePath: data.sourcePath,
    updatedAt: data.updatedAt,
    rows: data.rows.length,
    diagnostics: data.diagnostics,
    firstRow: {
      id: first.id,
      source_id: first.source_id,
      source_table: first.source_table,
      title: first.title,
      dateRaw: first.dateRaw,
      endDateRaw: first.endDateRaw,
      level: first.level,
      category: first.category,
      institution: first.institution,
      owner: first.owner,
      place: first.place,
      reachRaw: first.reachRaw,
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}

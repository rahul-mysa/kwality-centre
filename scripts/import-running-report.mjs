import { config } from 'dotenv';
config({ path: '.env.local' });
import { readFileSync } from 'fs';
import postgres from 'postgres';

const REPORT_PATH = process.argv[2] || '/Users/rahul/GitRepo/mysa-clients/apps/mysa-home-e2e/.artifacts/running-report-data.json';
const PROJECT_ID = process.argv[3] || '4c142e69-c281-4fab-b1a6-56d94eba217f';

const sql = postgres(process.env.DATABASE_URL);

function parseTimestamp(ts) {
  // "2025-08-01T13-46-07" -> Date
  const iso = ts.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
  return new Date(iso + 'Z');
}

async function main() {
  const raw = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  const entries = raw.data || raw;
  console.log(`Found ${entries.length} runs to import for project ${PROJECT_ID}`);

  const existing = await sql`SELECT started_at FROM automated_runs WHERE project_id = ${PROJECT_ID}`;
  const existingSet = new Set(existing.map(r => r.started_at?.toISOString()));
  console.log(`${existingSet.size} runs already in DB`);

  let imported = 0;
  let skipped = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const rows = [];

    for (const entry of batch) {
      const startedAt = parseTimestamp(entry.timestamp);
      if (existingSet.has(startedAt.toISOString())) {
        skipped++;
        continue;
      }

      rows.push({
        project_id: PROJECT_ID,
        name: `Run ${entry.timestamp}`,
        app_version: entry.appVersion || null,
        passed: entry.passedTests || 0,
        failed: entry.failedTests || 0,
        skipped: entry.skippedTests || 0,
        total: entry.totalTests || 0,
        duration: entry.duration || null,
        started_at: startedAt,
        results: JSON.stringify(entry),
      });
    }

    if (rows.length > 0) {
      await sql`
        INSERT INTO automated_runs ${sql(rows, 'project_id', 'name', 'app_version', 'passed', 'failed', 'skipped', 'total', 'duration', 'started_at', 'results')}
      `;
      imported += rows.length;
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= entries.length) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length} (imported: ${imported}, skipped: ${skipped})`);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped (duplicate): ${skipped}`);
  await sql.end();
}

main().catch(err => { console.error(err); process.exit(1); });

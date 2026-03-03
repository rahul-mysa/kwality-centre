import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, created_at FROM projects ORDER BY created_at`;
console.log("Projects:");
for (const r of rows) {
  console.log(`  ${r.id} — ${r.name} (${r.created_at})`);
}
if (rows.length === 0) console.log("  (none)");

const tcCount = await sql`SELECT COUNT(*) as count FROM test_cases`;
console.log(`\nTest cases: ${tcCount[0].count}`);

const folderCount = await sql`SELECT COUNT(*) as count FROM folders`;
console.log(`Folders: ${folderCount[0].count}`);

await sql.end();

import { config } from 'dotenv';
config({ path: '.env.local' });

const PROJECT_ID = '4c142e69-c281-4fab-b1a6-56d94eba217f';
const USER_ID = '00000000-0000-0000-0000-000000000000';

const { importFromXray } = await import('../src/services/xray-import.ts');

console.log("Starting Xray import...\n");

const result = await importFromXray(PROJECT_ID, USER_ID, (p) => {
  process.stdout.write(`  [${p.phase}] ${p.message}\r`);
});

console.log("\n\n=== IMPORT COMPLETE ===\n");
console.log(`Test cases imported: ${result.testCasesImported}`);
console.log(`Test cases skipped:  ${result.testCasesSkipped} (duplicates)`);
console.log(`Steps imported:      ${result.stepsImported}`);
console.log(`Folders created:     ${result.foldersCreated}`);
console.log(`Duration:            ${result.duration}s`);
console.log(`Errors:              ${result.errors.length}`);

if (result.errors.length > 0) {
  console.log("\nErrors:");
  result.errors.forEach((e) => console.log(`  - ${e}`));
}

process.exit(0);

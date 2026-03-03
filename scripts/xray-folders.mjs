import { config } from "dotenv";
config({ path: ".env.local" });

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, JIRA_PROJECT_KEY } = process.env;

async function authenticate() {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
  });
  const token = await res.text();
  return token.replace(/"/g, "");
}

async function graphql(token, query) {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main() {
  const token = await authenticate();

  // 1. Get the folder tree using getFolder
  console.log("=== FOLDER TREE ===\n");
  const folderQuery = await graphql(token, `{
    getFolder(projectId: "${JIRA_PROJECT_KEY}", path: "/") {
      name
      path
      testsCount
      folders
    }
  }`);

  if (folderQuery.errors) {
    console.log("Errors:", JSON.stringify(folderQuery.errors, null, 2));
  } else {
    console.log("Root folder:", JSON.stringify(folderQuery.data?.getFolder, null, 2));
  }

  // 2. Scan ALL tests to collect unique folder paths
  console.log("\n=== ALL UNIQUE FOLDER PATHS ===\n");
  const folderMap = new Map();
  let start = 0;
  const limit = 100;
  let total = 0;

  while (true) {
    const result = await graphql(token, `{
      getTests(jql: "project = ${JIRA_PROJECT_KEY}", limit: ${limit}, start: ${start}) {
        total
        results {
          issueId
          jira(fields: ["key"])
          folder {
            path
            name
          }
        }
      }
    }`);

    const tests = result.data?.getTests;
    if (!tests?.results?.length) break;

    total = tests.total;
    for (const t of tests.results) {
      const folderPath = t.folder?.path || "(no folder)";
      if (!folderMap.has(folderPath)) {
        folderMap.set(folderPath, { name: t.folder?.name || "(root)", count: 0 });
      }
      folderMap.get(folderPath).count++;
    }

    start += limit;
    process.stdout.write(`\r  Scanned ${start}/${total} tests...`);
    if (start >= total) break;
  }

  console.log(`\r  Scanned ${total} tests total.          \n`);

  // Sort and display
  const sorted = [...folderMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let totalInFolders = 0;
  for (const [path, info] of sorted) {
    console.log(`  ${path} (${info.count} tests)`);
    totalInFolders += info.count;
  }
  console.log(`\n  Total tests in folders: ${totalInFolders}`);
  console.log(`  API total: ${total}`);

  // 3. Check for preconditions count
  console.log("\n=== PRECONDITIONS COUNT ===\n");
  const preconQuery = await graphql(token, `{
    getPreconditions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      total
    }
  }`);
  if (preconQuery.errors) {
    console.log("Precondition query errors:", JSON.stringify(preconQuery.errors, null, 2));
  } else {
    console.log(`Preconditions: ${preconQuery.data?.getPreconditions?.total || 0}`);
  }

  // 4. Check test sets
  console.log("\n=== TEST SETS COUNT ===\n");
  const setQuery = await graphql(token, `{
    getTestSets(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      total
    }
  }`);
  if (setQuery.errors) {
    console.log("Test set query errors:", JSON.stringify(setQuery.errors, null, 2));
  } else {
    console.log(`Test Sets: ${setQuery.data?.getTestSets?.total || 0}`);
  }

  // 5. Check test plans
  console.log("\n=== TEST PLANS COUNT ===\n");
  const planQuery = await graphql(token, `{
    getTestPlans(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      total
    }
  }`);
  if (planQuery.errors) {
    console.log("Test plan query errors:", JSON.stringify(planQuery.errors, null, 2));
  } else {
    console.log(`Test Plans: ${planQuery.data?.getTestPlans?.total || 0}`);
  }
}

main().catch(console.error);

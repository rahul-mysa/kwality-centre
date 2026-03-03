import { config } from "dotenv";
config({ path: ".env.local" });

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, JIRA_PROJECT_KEY } = process.env;

async function authenticate() {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const token = await res.text();
  return token.replace(/"/g, "");
}

async function graphql(token, query) {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const token = await authenticate();
  console.log("Authenticated!\n");

  // 1. Check total count with different queries
  console.log("=== COUNT INVESTIGATION ===\n");

  const countQuery1 = await graphql(token, `{
    getTests(jql: "project = ${JIRA_PROJECT_KEY} AND issuetype = Test", limit: 1) {
      total
    }
  }`);
  console.log(`JQL "issuetype = Test": ${countQuery1.data.getTests.total} tests`);

  const countQuery2 = await graphql(token, `{
    getTests(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      total
    }
  }`);
  console.log(`JQL "project only": ${countQuery2.data.getTests.total} tests`);

  // 2. Check for folder/repository structure
  console.log("\n=== FOLDER STRUCTURE INVESTIGATION ===\n");

  // Try to get folder info from test repository
  const folderQuery = await graphql(token, `{
    getTests(jql: "project = ${JIRA_PROJECT_KEY}", limit: 5) {
      total
      results {
        issueId
        jira(fields: ["key", "summary", "components", "fixVersions"])
        testType { name }
        folder {
          path
          name
        }
      }
    }
  }`);

  if (folderQuery.errors) {
    console.log("Folder query errors:", JSON.stringify(folderQuery.errors, null, 2));
    
    // Try without folder field to see what fields are available
    console.log("\nTrying without folder field...");
    const basicQuery = await graphql(token, `{
      getTests(jql: "project = ${JIRA_PROJECT_KEY}", limit: 3) {
        results {
          issueId
          jira(fields: ["key", "summary", "components", "labels"])
        }
      }
    }`);
    console.log("Basic result:", JSON.stringify(basicQuery.data?.getTests?.results?.[0], null, 2));
  } else {
    const tests = folderQuery.data?.getTests;
    console.log(`Total: ${tests?.total}`);
    console.log("\nSample tests with folder info:");
    tests?.results?.forEach((t) => {
      const fields = t.jira || {};
      console.log(`  ${fields.key}: ${fields.summary}`);
      console.log(`    Folder: ${t.folder ? `${t.folder.path} / ${t.folder.name}` : "(none)"}`);
      console.log(`    Components: ${JSON.stringify(fields.components)}`);
    });
  }

  // 3. Try to get the folder/repository tree
  console.log("\n=== REPOSITORY FOLDERS ===\n");
  
  try {
    const repoQuery = await graphql(token, `{
      getTestRepositoryFolders(projectId: "${JIRA_PROJECT_KEY}", limit: 50) {
        total
        results {
          name
          path
          testsCount
          folders(limit: 50) {
            results {
              name
              path
              testsCount
            }
          }
        }
      }
    }`);

    if (repoQuery.errors) {
      console.log("Repository query errors:", JSON.stringify(repoQuery.errors, null, 2));
    } else {
      const folders = repoQuery.data?.getTestRepositoryFolders;
      console.log(`Total top-level folders: ${folders?.total}`);
      folders?.results?.forEach((f) => {
        console.log(`\n  📁 ${f.name} (${f.testsCount} tests) — path: ${f.path}`);
        f.folders?.results?.forEach((sub) => {
          console.log(`    📁 ${sub.name} (${sub.testsCount} tests) — path: ${sub.path}`);
        });
      });
    }
  } catch (err) {
    console.log("Repository tree query failed:", err.message);
  }

  // 4. Try getting folders via different API
  console.log("\n=== ALTERNATIVE FOLDER QUERY ===\n");
  try {
    const altQuery = await graphql(token, `{
      getFolder(projectId: "${JIRA_PROJECT_KEY}", path: "/") {
        name
        path
        testsCount
        folders(limit: 50) {
          results {
            name
            path
            testsCount
            folders(limit: 50) {
              results {
                name
                path
                testsCount
              }
            }
          }
        }
      }
    }`);

    if (altQuery.errors) {
      console.log("Alt folder query errors:", JSON.stringify(altQuery.errors, null, 2));
    } else {
      console.log("Root folder:", JSON.stringify(altQuery.data?.getFolder, null, 2));
    }
  } catch (err) {
    console.log("Alt query failed:", err.message);
  }
}

main().catch(console.error);

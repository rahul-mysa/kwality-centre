import { config } from "dotenv";
config({ path: ".env.local" });

const {
  XRAY_VERSION,
  JIRA_BASE_URL,
  XRAY_CLIENT_ID,
  XRAY_CLIENT_SECRET,
  JIRA_PAT,
  JIRA_PROJECT_KEY,
} = process.env;

console.log("=== Xray Import Test ===\n");
console.log(`Version:     ${XRAY_VERSION}`);
console.log(`Jira URL:    ${JIRA_BASE_URL}`);
console.log(`Project Key: ${JIRA_PROJECT_KEY}\n`);

async function authenticateXrayCloud() {
  console.log("Authenticating with Xray Cloud...");
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: XRAY_CLIENT_ID,
      client_secret: XRAY_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }

  const token = await res.text();
  console.log("Authenticated successfully!\n");
  return token.replace(/"/g, "");
}

async function fetchTestsXrayCloud(token) {
  console.log(`Fetching test cases from project ${JIRA_PROJECT_KEY}...\n`);

  const graphqlQuery = {
    query: `{
      getTests(jql: "project = ${JIRA_PROJECT_KEY} AND issuetype = Test", limit: 10) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "description", "priority", "labels", "status"])
          testType {
            name
          }
          steps {
            id
            action
            data
            result
          }
          preconditions(limit: 10) {
            results {
              issueId
              jira(fields: ["summary"])
            }
          }
        }
      }
    }`,
  };

  const res = await fetch("https://xray.cloud.getxray.app/api/v2/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function fetchTestsXrayServer() {
  const jql = encodeURIComponent(
    `project = ${JIRA_PROJECT_KEY} AND issuetype = Test`
  );
  const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${jql}&maxResults=10`;

  console.log(`Fetching test cases from project ${JIRA_PROJECT_KEY}...\n`);

  const headers = JIRA_PAT
    ? { Authorization: `Bearer ${JIRA_PAT}` }
    : {
        Authorization: `Basic ${Buffer.from(
          `${process.env.JIRA_USERNAME}:${process.env.JIRA_API_TOKEN}`
        ).toString("base64")}`,
      };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();

  console.log(`Found ${data.total} test cases total (showing first 10):\n`);

  for (const issue of data.issues) {
    console.log(`  ${issue.key}: ${issue.fields.summary}`);
    console.log(`    Priority: ${issue.fields.priority?.name || "None"}`);
    console.log(`    Status:   ${issue.fields.status?.name || "Unknown"}`);
    console.log(`    Labels:   ${issue.fields.labels?.join(", ") || "None"}`);
    console.log();
  }

  // Fetch steps for the first test case
  if (data.issues.length > 0) {
    const firstKey = data.issues[0].key;
    console.log(`\nFetching steps for ${firstKey}...\n`);

    const stepsUrl = `${JIRA_BASE_URL}/rest/raven/1.0/api/test/${firstKey}/step`;
    const stepsRes = await fetch(stepsUrl, { headers });

    if (stepsRes.ok) {
      const steps = await stepsRes.json();
      console.log(`Steps for ${firstKey}:`);
      steps.forEach((step, i) => {
        console.log(`  Step ${i + 1}:`);
        console.log(`    Action:   ${step.action || "(empty)"}`);
        console.log(`    Data:     ${step.data || "(empty)"}`);
        console.log(`    Expected: ${step.result || "(empty)"}`);
      });
    } else {
      console.log(`Could not fetch steps: ${stepsRes.status}`);
    }
  }

  return data;
}

async function main() {
  try {
    if (XRAY_VERSION === "cloud") {
      const token = await authenticateXrayCloud();
      const data = await fetchTestsXrayCloud(token);

      const tests = data.data?.getTests;
      console.log(`Found ${tests?.total || 0} test cases total (showing first 10):\n`);

      if (tests?.results) {
        for (const test of tests.results) {
          const fields = typeof test.jira === "string" ? JSON.parse(test.jira) : (test.jira || {});
          const key = fields.key || test.issueId;
          console.log(`  ${key} (id: ${test.issueId}): ${fields.summary || "(no title)"}`);
          console.log(`    Priority:  ${fields.priority?.name || "None"}`);
          console.log(`    Status:    ${fields.status?.name || "Unknown"}`);
          console.log(`    Labels:    ${(fields.labels || []).join(", ") || "None"}`);
          console.log(`    Test Type: ${test.testType?.name || "Unknown"}`);

          if (test.steps?.length) {
            console.log(`    Steps (${test.steps.length}):`);
            test.steps.forEach((step, i) => {
              console.log(`      ${i + 1}. Action:   ${step.action || "(empty)"}`);
              console.log(`         Expected: ${step.result || "(empty)"}`);
            });
          }

          if (test.preconditions?.results?.length) {
            console.log(`    Preconditions:`);
            test.preconditions.results.forEach((pc) => {
              const pcFields = typeof pc.jira === "string" ? JSON.parse(pc.jira) : (pc.jira || {});
              console.log(`      - ${pcFields.summary || pc.issueId}`);
            });
          }
          console.log();
        }
      }

      console.log("\n=== Raw Response (first test) ===\n");
      console.log(JSON.stringify(tests?.results?.[0], null, 2));
    } else {
      await fetchTestsXrayServer();
    }

    console.log("\n=== Import test complete! ===");
    console.log("The data structure above is what we'll map into Kwality Centre.");
  } catch (err) {
    console.error("\nError:", err.message);
    console.error("\nTroubleshooting:");
    console.error("  1. Check your .env.local values are correct");
    console.error("  2. Ensure the project key exists and has Xray tests");
    console.error("  3. For Cloud: verify Client ID/Secret from Xray API Keys settings");
    console.error("  4. For Server: verify your PAT or credentials have read access");
  }
}

main();

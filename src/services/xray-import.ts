import { db } from '../db/index.js';
import { folders, testCases, testSteps } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const XRAY_AUTH_URL = 'https://xray.cloud.getxray.app/api/v2/authenticate';
const XRAY_GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';

export type ImportProgress = {
  phase: string;
  current: number;
  total: number;
  message: string;
};

export type ImportResult = {
  testCasesImported: number;
  testCasesSkipped: number;
  stepsImported: number;
  foldersCreated: number;
  errors: string[];
  duration: number;
};

type XrayTest = {
  issueId: string;
  jira: {
    key: string;
    summary: string;
    description?: string | null;
    priority?: { name: string; id: string } | null;
    status?: { name: string; statusCategory?: { key: string } } | null;
    labels?: string[];
  };
  testType?: { name: string } | null;
  folder?: { path: string; name: string } | null;
  steps?: Array<{ id: string; action: string; data: string; result: string }>;
  preconditions?: { results: Array<{ issueId: string; jira?: { summary?: string } }> };
};

async function authenticate(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(XRAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Xray auth failed: ${res.status} ${await res.text()}`);
  const token = await res.text();
  return token.replace(/"/g, '');
}

async function graphql(token: string, query: string): Promise<any> {
  const res = await fetch(XRAY_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Xray GraphQL failed: ${res.status}`);
  return res.json();
}

function mapPriority(xrayPriority: { name: string; id: string } | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  if (!xrayPriority) return 'medium';
  const id = xrayPriority.id;
  if (id === '1') return 'critical';
  if (id === '2') return 'high';
  if (id === '4' || id === '5') return 'low';
  return 'medium';
}

function mapStatus(xrayStatus: { name: string; statusCategory?: { key: string } } | null | undefined): 'draft' | 'active' | 'deprecated' {
  if (!xrayStatus) return 'draft';
  const cat = xrayStatus.statusCategory?.key;
  if (cat === 'new') return 'draft';
  if (cat === 'done' || cat === 'indeterminate') return 'active';
  const name = xrayStatus.name.toLowerCase();
  if (name.includes('deprecated')) return 'deprecated';
  return 'active';
}

function convertWikiMarkup(text: string | null | undefined): string {
  if (!text) return '';
  let result = text;
  result = result.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, '```\n$1\n```');
  result = result.replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/g, '```\n$1\n```');
  result = result.replace(/\[([^|]+)\|([^\]]+)\]/g, '[$1]($2)');
  result = result.replace(/\{color:[^}]*\}([\s\S]*?)\{color\}/g, '$1');
  result = result.replace(/\{\{([^}]+)\}\}/g, '`$1`');
  result = result.replace(/h([1-6])\.\s*/g, (_, level) => '#'.repeat(parseInt(level)) + ' ');
  result = result.replace(/\*([^*]+)\*/g, '**$1**');
  result = result.replace(/_([^_]+)_/g, '*$1*');

  const lines = result.split('\n');
  const out: string[] = [];
  let didSeparator = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('||') && t.endsWith('||')) {
      const cells = t.split('||').filter(Boolean);
      out.push('| ' + cells.map((c) => c.replace(/\*\*/g, '')).join(' | ') + ' |');
      out.push('|' + cells.map(() => ' --- ').join('|') + '|');
      didSeparator = true;
    } else if (didSeparator && t.startsWith('|') && t.endsWith('|')) {
      const cells = t.slice(1, -1).split('|');
      out.push('| ' + cells.join(' | ') + ' |');
    } else {
      didSeparator = false;
      out.push(line);
    }
  }
  result = out.join('\n');

  return result.trim();
}

async function buildFolderHierarchy(
  projectId: string,
  folderPaths: Set<string>
): Promise<Map<string, string>> {
  const pathToId = new Map<string, string>();

  const sortedPaths = Array.from(folderPaths)
    .filter((p) => p && p !== '/')
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

  for (const fullPath of sortedPaths) {
    const segments = fullPath.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      currentPath = currentPath ? `${currentPath}/${name}` : `/${name}`;

      if (pathToId.has(currentPath)) continue;

      const parentPath = i > 0 ? '/' + segments.slice(0, i).join('/') : null;
      const parentId = parentPath ? pathToId.get(parentPath) || null : null;

      const existing = await db
        .select()
        .from(folders)
        .where(eq(folders.projectId, projectId))
        .then((rows) => rows.find((r) => r.path === currentPath));

      if (existing) {
        pathToId.set(currentPath, existing.id);
      } else {
        const [created] = await db
          .insert(folders)
          .values({ projectId, parentId, name, path: currentPath })
          .returning();
        pathToId.set(currentPath, created.id);
      }
    }
  }

  return pathToId;
}

export async function importFromXray(
  projectId: string,
  userId: string,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  const clientId = process.env.XRAY_CLIENT_ID;
  const clientSecret = process.env.XRAY_CLIENT_SECRET;
  const projectKey = process.env.JIRA_PROJECT_KEY;

  if (!clientId || !clientSecret || !projectKey) {
    throw new Error('Missing XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, or JIRA_PROJECT_KEY in environment');
  }

  onProgress?.({ phase: 'auth', current: 0, total: 0, message: 'Authenticating with Xray Cloud...' });
  const token = await authenticate(clientId, clientSecret);

  onProgress?.({ phase: 'count', current: 0, total: 0, message: 'Counting test cases...' });
  const countData = await graphql(token, `{
    getTests(jql: "project = ${projectKey} AND issuetype = Test", limit: 1) { total }
  }`);
  const totalTests = countData.data?.getTests?.total || 0;

  onProgress?.({ phase: 'fetch', current: 0, total: totalTests, message: `Fetching ${totalTests} test cases...` });

  const allTests: XrayTest[] = [];
  for (let start = 0; start < totalTests; start += 100) {
    const data = await graphql(token, `{
      getTests(jql: "project = ${projectKey} AND issuetype = Test", limit: 100, start: ${start}) {
        results {
          issueId
          jira(fields: ["key", "summary", "description", "priority", "labels", "status"])
          testType { name }
          folder { path name }
          steps { id action data result }
          preconditions(limit: 10) { results { issueId jira(fields: ["summary"]) } }
        }
      }
    }`);

    if (data.errors) {
      errors.push(`GraphQL error at offset ${start}: ${JSON.stringify(data.errors)}`);
      continue;
    }

    const batch = data.data?.getTests?.results || [];
    for (const test of batch) {
      const jira = typeof test.jira === 'string' ? JSON.parse(test.jira) : (test.jira || {});
      allTests.push({ ...test, jira });
    }

    onProgress?.({ phase: 'fetch', current: allTests.length, total: totalTests, message: `Fetched ${allTests.length} of ${totalTests}...` });
  }

  // Build folders
  onProgress?.({ phase: 'folders', current: 0, total: 0, message: 'Creating folder structure...' });
  const folderPaths = new Set<string>();
  for (const test of allTests) {
    if (test.folder?.path && test.folder.path !== '/') {
      folderPaths.add(test.folder.path);
    }
  }
  const pathToFolderId = await buildFolderHierarchy(projectId, folderPaths);
  const foldersCreated = pathToFolderId.size;

  // Check for existing imports (duplicate detection by xray_key)
  const existingKeys = new Set<string>();
  const existingCases = await db
    .select({ xrayKey: testCases.xrayKey })
    .from(testCases)
    .where(eq(testCases.projectId, projectId));
  for (const row of existingCases) {
    if (row.xrayKey) existingKeys.add(row.xrayKey);
  }

  // Import test cases
  let imported = 0;
  let skipped = 0;
  let stepsImported = 0;

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const xrayKey = test.jira.key;

    if (existingKeys.has(xrayKey)) {
      skipped++;
      continue;
    }

    try {
      const folderId = test.folder?.path && test.folder.path !== '/'
        ? pathToFolderId.get(test.folder.path) || null
        : null;

      const preconditionText = test.preconditions?.results
        ?.map((pc) => {
          const pcJira = typeof pc.jira === 'string' ? JSON.parse(pc.jira) : (pc.jira || {});
          return pcJira.summary || `Precondition ${pc.issueId}`;
        })
        .join('\n') || null;

      const [tc] = await db.insert(testCases).values({
        projectId,
        folderId,
        title: test.jira.summary || `Untitled (${xrayKey})`,
        description: convertWikiMarkup(test.jira.description),
        preconditions: preconditionText ? convertWikiMarkup(preconditionText) : null,
        priority: mapPriority(test.jira.priority),
        type: 'functional' as const,
        status: mapStatus(test.jira.status),
        tags: test.jira.labels?.length ? test.jira.labels : null,
        xrayKey,
        xrayIssueId: test.issueId,
        createdBy: userId,
      }).returning();

      if (test.steps?.length) {
        const stepValues = test.steps
          .filter((s) => s.action?.trim())
          .map((s, idx) => ({
            testCaseId: tc.id,
            stepNumber: idx + 1,
            action: convertWikiMarkup(s.action),
            data: convertWikiMarkup(s.data) || null,
            expectedResult: convertWikiMarkup(s.result) || null,
          }));

        if (stepValues.length > 0) {
          await db.insert(testSteps).values(stepValues);
          stepsImported += stepValues.length;
        }
      }

      imported++;
    } catch (err: any) {
      errors.push(`Failed to import ${xrayKey}: ${err.message}`);
    }

    if (i % 50 === 0 || i === allTests.length - 1) {
      onProgress?.({
        phase: 'import',
        current: i + 1,
        total: allTests.length,
        message: `Imported ${imported}, skipped ${skipped} duplicates...`,
      });
    }
  }

  return {
    testCasesImported: imported,
    testCasesSkipped: skipped,
    stepsImported,
    foldersCreated,
    errors,
    duration: Math.round((Date.now() - startTime) / 1000),
  };
}

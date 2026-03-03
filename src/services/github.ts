const GITHUB_API = 'https://api.github.com';

function getToken(): string {
  return process.env.GITHUB_TOKEN || '';
}

async function githubFetch(path: string): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'KwalityCentre',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  return res.json();
}

const fileTreeCache = new Map<string, { data: SpecFileEntry[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export type SpecFileEntry = {
  path: string;
  name: string;
  folder: string;
};

export async function listSpecFiles(
  owner: string,
  repo: string,
  branch: string,
  basePath: string,
): Promise<SpecFileEntry[]> {
  const cacheKey = `${owner}/${repo}/${branch}/${basePath}`;
  const cached = fileTreeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);

  const specFiles: SpecFileEntry[] = [];
  const prefix = basePath.endsWith('/') ? basePath : basePath + '/';

  for (const item of tree.tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(prefix)) continue;
    if (!item.path.endsWith('.spec.ts') && !item.path.endsWith('.test.ts')) continue;

    const relativePath = item.path.substring(prefix.length);
    const parts = relativePath.split('/');
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const name = parts[parts.length - 1];

    specFiles.push({ path: item.path, name, folder });
  }

  specFiles.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  fileTreeCache.set(cacheKey, { data: specFiles, expires: Date.now() + CACHE_TTL });
  return specFiles;
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  const data = await githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return data.content;
}

export type TestNode = {
  type: 'describe' | 'it';
  title: string;
  children: TestNode[];
};

export function parseSpecFile(content: string): TestNode[] {
  const root: TestNode[] = [];
  const stack: TestNode[][] = [root];
  const depthStack: number[] = [0];
  let braceDepth = 0;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    const describeMatch = trimmed.match(/^(?:test\.)?describe\s*\(\s*(['"`])(.+?)\1/);
    if (describeMatch) {
      const node: TestNode = { type: 'describe', title: describeMatch[2], children: [] };
      stack[stack.length - 1].push(node);
      stack.push(node.children);
      depthStack.push(braceDepth);
    }

    const itMatch = trimmed.match(/^(?:it|test)\s*\(\s*(['"`])(.+?)\1/);
    if (itMatch && !trimmed.startsWith('test.describe')) {
      stack[stack.length - 1].push({ type: 'it', title: itMatch[2], children: [] });
    }

    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }

    while (stack.length > 1 && braceDepth <= depthStack[depthStack.length - 1]) {
      stack.pop();
      depthStack.pop();
    }
  }

  return root;
}

function countTests(nodes: TestNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === 'it') count++;
    count += countTests(n.children);
  }
  return count;
}

export { countTests };

const testCountCache = new Map<string, { data: Map<string, number>; expires: number }>();

export async function fetchTestCounts(
  owner: string,
  repo: string,
  branch: string,
  specFiles: SpecFileEntry[],
): Promise<Map<string, number>> {
  const cacheKey = `counts:${owner}/${repo}/${branch}`;
  const cached = testCountCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const counts = new Map<string, number>();
  const batchSize = 10;

  for (let i = 0; i < specFiles.length; i += batchSize) {
    const batch = specFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (f) => {
        try {
          const content = await fetchFileContent(owner, repo, branch, f.path);
          const tree = parseSpecFile(content);
          return { path: f.path, count: countTests(tree) };
        } catch {
          return { path: f.path, count: 0 };
        }
      })
    );
    for (const r of results) {
      counts.set(r.path, r.count);
    }
  }

  testCountCache.set(cacheKey, { data: counts, expires: Date.now() + CACHE_TTL });
  return counts;
}

export async function testConnection(owner: string, repo: string): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}`);
    return { ok: true, message: `Connected to ${data.full_name} (${data.visibility})` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

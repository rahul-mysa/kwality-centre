import type { FC } from 'hono/jsx';
import { PriorityBadge, StatusBadge } from '../components/badge.js';
import { EmptyState } from '../components/empty-state.js';
import { FolderTreePanel, type FolderNode } from './folder-tree.js';

type TestCase = {
  id: string;
  title: string;
  priority: string;
  type: string;
  status: string;
  tags: string[] | null;
  xrayKey: string | null;
  stepCount: number;
  updatedAt: Date;
};

type Filters = {
  search: string;
  priority: string;
  type: string;
  status: string;
  sort: string;
  dir: string;
  folder: string;
  subfolders: string;
};

type Props = {
  project: { id: string; name: string };
  testCases: TestCase[];
  total: number;
  page: number;
  totalPages: number;
  filters: Filters;
  folderTree: FolderNode[];
  activeFolderId: string | null;
  rootCount: number;
  totalCount: number;
};

const SortHeader: FC<{ label: string; field: string; current: string; dir: string; projectId: string; filters: Filters }> = ({ label, field, current, dir, projectId, filters }) => {
  const newDir = current === field && dir === 'asc' ? 'desc' : 'asc';
  const arrow = current === field ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  const params = new URLSearchParams({
    search: filters.search, priority: filters.priority, type: filters.type,
    status: filters.status, sort: field, dir: newDir, folder: filters.folder,
    subfolders: filters.subfolders, page: '1',
  });
  return (
    <th>
      <a href={`/projects/${projectId}/test-cases?${params}`} class="link link-hover">
        {label}{arrow}
      </a>
    </th>
  );
};

const buildQueryString = (filters: Filters, overrides: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    search: filters.search, priority: filters.priority, type: filters.type,
    status: filters.status, sort: filters.sort, dir: filters.dir,
    folder: filters.folder, subfolders: filters.subfolders, page: '1', ...overrides,
  });
  return params.toString();
};

export const TestCaseListView: FC<Props> = ({ project, testCases, total, page, totalPages, filters, folderTree, activeFolderId, rootCount, totalCount }) => (
  <div id="test-case-list-container">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold">Test Cases</h1>
        <p class="text-base-content/60 text-sm mt-1">{project.name} — {total} test case{total !== 1 ? 's' : ''}</p>
      </div>
      <a href={`/projects/${project.id}/test-cases/new${filters.folder && filters.folder !== 'root' ? `?folder=${filters.folder}` : ''}`} class="btn btn-primary btn-sm gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
        New Test Case
      </a>
    </div>

    <div class="flex gap-4">
      <div class="w-64 shrink-0 hidden lg:block">
        <FolderTreePanel
          projectId={project.id}
          folders={folderTree}
          activeFolderId={activeFolderId}
          rootCount={rootCount}
          totalCount={totalCount}
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-4 mb-4">
          <form method="GET" action={`/projects/${project.id}/test-cases`} class="flex flex-wrap gap-3 items-end">
            <div class="form-control flex-1 min-w-[200px]">
              <label class="label py-1"><span class="label-text text-xs">Search</span></label>
              <input
                type="text"
                name="search"
                value={filters.search}
                placeholder="Search by title..."
                class="input input-bordered input-sm w-full"
                hx-get={`/projects/${project.id}/test-cases`}
                hx-trigger="keyup changed delay:300ms"
                hx-target="#test-case-list-container"
                hx-swap="outerHTML"
                hx-include="closest form"
              />
            </div>
            <div class="form-control">
              <label class="label py-1"><span class="label-text text-xs">Priority</span></label>
              <select name="priority" class="select select-bordered select-sm"
                hx-get={`/projects/${project.id}/test-cases`}
                hx-trigger="change"
                hx-target="#test-case-list-container"
                hx-swap="outerHTML"
                hx-include="closest form">
                <option value="">All</option>
                <option value="critical" selected={filters.priority === 'critical'}>Critical</option>
                <option value="high" selected={filters.priority === 'high'}>High</option>
                <option value="medium" selected={filters.priority === 'medium'}>Medium</option>
                <option value="low" selected={filters.priority === 'low'}>Low</option>
              </select>
            </div>
            <div class="form-control">
              <label class="label py-1"><span class="label-text text-xs">Type</span></label>
              <select name="type" class="select select-bordered select-sm"
                hx-get={`/projects/${project.id}/test-cases`}
                hx-trigger="change"
                hx-target="#test-case-list-container"
                hx-swap="outerHTML"
                hx-include="closest form">
                <option value="">All</option>
                <option value="functional" selected={filters.type === 'functional'}>Functional</option>
                <option value="regression" selected={filters.type === 'regression'}>Regression</option>
                <option value="smoke" selected={filters.type === 'smoke'}>Smoke</option>
                <option value="integration" selected={filters.type === 'integration'}>Integration</option>
                <option value="e2e" selected={filters.type === 'e2e'}>E2E</option>
              </select>
            </div>
            <div class="form-control">
              <label class="label py-1"><span class="label-text text-xs">Status</span></label>
              <select name="status" class="select select-bordered select-sm"
                hx-get={`/projects/${project.id}/test-cases`}
                hx-trigger="change"
                hx-target="#test-case-list-container"
                hx-swap="outerHTML"
                hx-include="closest form">
                <option value="">All</option>
                <option value="draft" selected={filters.status === 'draft'}>Draft</option>
                <option value="active" selected={filters.status === 'active'}>Active</option>
                <option value="deprecated" selected={filters.status === 'deprecated'}>Deprecated</option>
              </select>
            </div>
            <input type="hidden" name="sort" value={filters.sort} />
            <input type="hidden" name="dir" value={filters.dir} />
            <input type="hidden" name="folder" value={filters.folder} />
            <input type="hidden" name="subfolders" value={filters.subfolders} />
            <input type="hidden" name="page" value="1" />
          </form>
        </div>

        {filters.folder && filters.folder !== 'root' && (
          <div class="mb-3 flex items-center gap-2">
            <label class="label cursor-pointer gap-2 py-0">
              <input
                type="checkbox"
                class="toggle toggle-xs toggle-primary"
                checked={filters.subfolders === 'true'}
                onchange={`window.location='/projects/${project.id}/test-cases?${buildQueryString(filters, { subfolders: filters.subfolders === 'true' ? '' : 'true' })}'`}
              />
              <span class="label-text text-xs">Include sub-folders</span>
            </label>
          </div>
        )}

        {testCases.length === 0 && !filters.search && !filters.priority && !filters.type && !filters.status ? (
          <EmptyState
            title={filters.folder ? 'No test cases in this folder' : 'No test cases yet'}
            description={filters.folder ? 'This folder is empty. Create a test case or move existing ones here.' : 'Create your first test case or import from Xray.'}
            actionUrl={`/projects/${project.id}/test-cases/new${filters.folder && filters.folder !== 'root' ? `?folder=${filters.folder}` : ''}`}
            actionLabel="Create Test Case"
          />
        ) : testCases.length === 0 ? (
          <div class="text-center py-12 text-base-content/50">
            <p>No test cases match your filters.</p>
          </div>
        ) : (
          <div>
            {/* Bulk action toolbar */}
            <div id="bulk-toolbar" class="hidden mb-3 flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-box px-4 py-2">
              <span class="text-sm font-medium"><span id="bulk-count">0</span> selected</span>
              <div class="flex-1" />
              <form method="post" action={`/projects/${project.id}/test-cases/bulk-status`} id="bulk-status-form" class="flex items-center gap-2">
                <div id="bulk-status-ids"></div>
                <select name="status" class="select select-bordered select-xs">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
                </select>
                <button type="submit" class="btn btn-xs btn-outline">Update Status</button>
              </form>
              <form method="post" action={`/projects/${project.id}/test-cases/bulk-delete`} id="bulk-delete-form" onsubmit="return confirm('Delete selected test cases? This cannot be undone.')">
                <div id="bulk-delete-ids"></div>
                <button type="submit" class="btn btn-xs btn-error btn-outline gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete
                </button>
              </form>
            </div>

            <div class="bg-base-100 rounded-box shadow-sm border border-base-300 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th class="w-10"><input type="checkbox" class="checkbox checkbox-sm" id="select-all-tc" /></th>
                    <SortHeader label="Title" field="title" current={filters.sort} dir={filters.dir} projectId={project.id} filters={filters} />
                    <SortHeader label="Priority" field="priority" current={filters.sort} dir={filters.dir} projectId={project.id} filters={filters} />
                    <th>Type</th>
                    <SortHeader label="Status" field="status" current={filters.sort} dir={filters.dir} projectId={project.id} filters={filters} />
                    <th>Steps</th>
                    <th>Xray</th>
                    <SortHeader label="Updated" field="updated_at" current={filters.sort} dir={filters.dir} projectId={project.id} filters={filters} />
                  </tr>
                </thead>
                <tbody>
                  {testCases.map((tc) => (
                    <tr class="hover cursor-pointer" onclick={`if(event.target.type!=='checkbox')window.location='/projects/${project.id}/test-cases/${tc.id}'`}>
                      <td onclick="event.stopPropagation()"><input type="checkbox" class="checkbox checkbox-sm tc-checkbox" value={tc.id} /></td>
                      <td class="font-medium max-w-md">
                        <span class="line-clamp-1">{tc.title}</span>
                      </td>
                      <td><PriorityBadge priority={tc.priority} /></td>
                      <td><span class="badge badge-sm badge-outline">{tc.type}</span></td>
                      <td><StatusBadge status={tc.status} /></td>
                      <td class="text-base-content/60">{tc.stepCount}</td>
                      <td class="text-base-content/60 text-xs">{tc.xrayKey || '—'}</td>
                      <td class="text-base-content/60 text-xs">{tc.updatedAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <script dangerouslySetInnerHTML={{ __html: `
              (function() {
                var selectAll = document.getElementById('select-all-tc');
                var toolbar = document.getElementById('bulk-toolbar');
                var countEl = document.getElementById('bulk-count');
                var boxes = document.querySelectorAll('.tc-checkbox');
                function syncIds() {
                  var checked = document.querySelectorAll('.tc-checkbox:checked');
                  var count = checked.length;
                  countEl.textContent = count;
                  toolbar.classList.toggle('hidden', count === 0);
                  var statusIds = document.getElementById('bulk-status-ids');
                  var deleteIds = document.getElementById('bulk-delete-ids');
                  statusIds.innerHTML = '';
                  deleteIds.innerHTML = '';
                  checked.forEach(function(cb) {
                    statusIds.innerHTML += '<input type="hidden" name="ids" value="' + cb.value + '">';
                    deleteIds.innerHTML += '<input type="hidden" name="ids" value="' + cb.value + '">';
                  });
                  if (selectAll) selectAll.checked = count === boxes.length && boxes.length > 0;
                }
                if (selectAll) {
                  selectAll.addEventListener('change', function() {
                    boxes.forEach(function(cb) { cb.checked = selectAll.checked; });
                    syncIds();
                  });
                }
                boxes.forEach(function(cb) { cb.addEventListener('change', syncIds); });
              })();
            ` }} />

            {totalPages > 1 && (
              <div class="flex justify-center mt-4">
                <div class="join">
                  {page > 1 && (
                    <a href={`/projects/${project.id}/test-cases?${buildQueryString(filters, { page: String(page - 1) })}`} class="join-item btn btn-sm">&laquo;</a>
                  )}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = i + 1;
                    return (
                      <a href={`/projects/${project.id}/test-cases?${buildQueryString(filters, { page: String(p) })}`} class={`join-item btn btn-sm ${p === page ? 'btn-active' : ''}`}>{p}</a>
                    );
                  })}
                  {page < totalPages && (
                    <a href={`/projects/${project.id}/test-cases?${buildQueryString(filters, { page: String(page + 1) })}`} class="join-item btn btn-sm">&raquo;</a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

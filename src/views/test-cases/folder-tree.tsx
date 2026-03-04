import type { FC } from 'hono/jsx';

export type FolderNode = {
  id: string;
  name: string;
  path: string;
  children: FolderNode[];
  testCount: number;
};

type FolderTreeProps = {
  projectId: string;
  folders: FolderNode[];
  activeFolderId: string | null;
  rootCount: number;
  totalCount: number;
};

const FolderIcon: FC<{ open?: boolean }> = ({ open }) => (
  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    {open
      ? <path stroke-linecap="round" stroke-linejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
      : <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    }
  </svg>
);

const FolderActions: FC<{ node: FolderNode; projectId: string }> = ({ node, projectId }) => (
  <div class="dropdown dropdown-end" onclick="event.stopPropagation();">
    <label tabindex={0} class="btn btn-ghost btn-xs px-1 opacity-0 group-hover:opacity-100">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" /></svg>
    </label>
    <ul tabindex={0} class="dropdown-content menu menu-xs bg-base-100 rounded-box shadow-lg border border-base-300 w-36 z-50 p-1">
      <li><button class="editor-action" onclick={`event.preventDefault(); document.getElementById('rename-folder-modal-${node.id}').showModal()`}>Rename</button></li>
      <li><button class="editor-action" onclick={`event.preventDefault(); document.getElementById('move-folder-modal-${node.id}').showModal()`}>Move</button></li>
      <li><button class="text-error admin-action" onclick={`event.preventDefault(); document.getElementById('delete-folder-modal-${node.id}').showModal()`}>Delete</button></li>
    </ul>
  </div>
);

const FolderItem: FC<{ node: FolderNode; projectId: string; activeFolderId: string | null; depth: number; allFolders: { id: string; name: string; path: string }[] }> = ({ node, projectId, activeFolderId, depth, allFolders }) => {
  const isActive = activeFolderId === node.id;
  const hasChildren = node.children.length > 0;
  const detailsId = `folder-${node.id}`;

  return (
    <li>
      {hasChildren ? (
        <details id={detailsId} open={isActive || isDescendantActive(node, activeFolderId)}>
          <summary
            class={`group flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer text-sm hover:bg-base-200 ${isActive ? 'bg-primary/10 text-primary font-semibold' : ''}`}
            style={`padding-left: ${depth * 16 + 8}px`}
          >
            <FolderIcon open />
            <a href={`/projects/${projectId}/test-cases?folder=${node.id}`} class="flex-1 truncate" onclick="event.stopPropagation()">
              {node.name}
            </a>
            <FolderActions node={node} projectId={projectId} />
            <span class="badge badge-xs badge-ghost">{node.testCount}</span>
          </summary>
          <ul>
            {node.children.map((child) => (
              <FolderItem node={child} projectId={projectId} activeFolderId={activeFolderId} depth={depth + 1} allFolders={allFolders} />
            ))}
          </ul>
        </details>
      ) : (
        <div
          class={`group flex items-center gap-2 py-1.5 px-2 rounded-lg text-sm hover:bg-base-200 ${isActive ? 'bg-primary/10 text-primary font-semibold' : ''}`}
          style={`padding-left: ${depth * 16 + 8}px`}
        >
          <FolderIcon />
          <a href={`/projects/${projectId}/test-cases?folder=${node.id}`} class="flex-1 truncate">{node.name}</a>
          <FolderActions node={node} projectId={projectId} />
          <span class="badge badge-xs badge-ghost">{node.testCount}</span>
        </div>
      )}

      {/* Rename modal */}
      <dialog id={`rename-folder-modal-${node.id}`} class="modal">
        <div class="modal-box max-w-sm">
          <h3 class="text-lg font-bold mb-4">Rename Folder</h3>
          <form method="post" action={`/projects/${projectId}/folders/${node.id}/rename`}>
            <div class="form-control mb-4">
              <label class="label"><span class="label-text">New Name</span></label>
              <input type="text" name="name" value={node.name} class="input input-bordered w-full" required autofocus />
            </div>
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onclick={`document.getElementById('rename-folder-modal-${node.id}').close()`}>Cancel</button>
              <button type="submit" class="btn btn-primary editor-action">Rename</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Move modal */}
      <dialog id={`move-folder-modal-${node.id}`} class="modal">
        <div class="modal-box max-w-sm">
          <h3 class="text-lg font-bold mb-4">Move Folder</h3>
          <p class="text-sm text-base-content/60 mb-3">Move <strong>{node.name}</strong> to:</p>
          <form method="post" action={`/projects/${projectId}/folders/${node.id}/move`}>
            <div class="form-control mb-4">
              <select name="parentId" class="select select-bordered w-full">
                <option value="">Root (top level)</option>
                {allFolders.filter((f) => f.id !== node.id).map((f) => (
                  <option value={f.id}>{f.path}</option>
                ))}
              </select>
            </div>
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onclick={`document.getElementById('move-folder-modal-${node.id}').close()`}>Cancel</button>
              <button type="submit" class="btn btn-primary editor-action">Move</button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>

      {/* Delete confirmation modal */}
      <dialog id={`delete-folder-modal-${node.id}`} class="modal">
        <div class="modal-box max-w-sm">
          <h3 class="text-lg font-bold text-error mb-2">Delete Folder</h3>
          <p class="text-sm text-base-content/70 mb-1">
            This will permanently delete <strong>{node.name}</strong>{node.children.length > 0 ? ` and ${node.children.length} sub-folder${node.children.length !== 1 ? 's' : ''}` : ''}.
          </p>
          {node.testCount > 0 && (
            <div class="alert alert-warning text-sm py-2 px-3 my-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <span>{node.testCount} test case{node.testCount !== 1 ? 's' : ''} will be moved to Unfiled.</span>
            </div>
          )}
          <p class="text-sm text-base-content/60 mt-3 mb-2">
            Type <strong class="font-mono text-error">{node.name}</strong> to confirm:
          </p>
          <form method="post" action={`/projects/${projectId}/folders/${node.id}/delete`} id={`delete-folder-form-${node.id}`}>
            <input
              type="text"
              class="input input-bordered w-full mb-4"
              placeholder={node.name}
              id={`delete-folder-confirm-${node.id}`}
              autocomplete="off"
              required
            />
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onclick={`document.getElementById('delete-folder-modal-${node.id}').close()`}>Cancel</button>
              <button type="submit" class="btn btn-error admin-action" id={`delete-folder-btn-${node.id}`} disabled>Delete</button>
            </div>
          </form>
          <script dangerouslySetInnerHTML={{ __html: `
            (function() {
              var input = document.getElementById('delete-folder-confirm-${node.id}');
              var btn = document.getElementById('delete-folder-btn-${node.id}');
              var expected = ${JSON.stringify(node.name)};
              input.addEventListener('input', function() {
                btn.disabled = input.value !== expected;
              });
            })();
          ` }} />
        </div>
        <form method="dialog" class="modal-backdrop"><button>close</button></form>
      </dialog>
    </li>
  );
};

function isDescendantActive(node: FolderNode, activeFolderId: string | null): boolean {
  if (!activeFolderId) return false;
  for (const child of node.children) {
    if (child.id === activeFolderId) return true;
    if (isDescendantActive(child, activeFolderId)) return true;
  }
  return false;
}

export const FolderTreePanel: FC<FolderTreeProps> = ({ projectId, folders, activeFolderId, rootCount, totalCount }) => {
  const allFlat = flattenFolders(folders);
  return (
    <div class="bg-base-100 rounded-box shadow-sm border border-base-300 mb-4 lg:mb-0">
      {/* Quick filters — not folders */}
      <div class="p-3 pb-0">
        <h3 class="text-xs font-semibold uppercase text-base-content/50 px-2 mb-2">Filter</h3>
        <a
          href={`/projects/${projectId}/test-cases`}
          class={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-sm hover:bg-base-200 ${!activeFolderId ? 'bg-primary/10 text-primary font-semibold' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span class="flex-1">All Test Cases</span>
          <span class="text-xs text-base-content/40">{totalCount}</span>
        </a>
        <a
          href={`/projects/${projectId}/test-cases?folder=root`}
          class={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-sm hover:bg-base-200 ${activeFolderId === 'root' ? 'bg-primary/10 text-primary font-semibold' : ''}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="flex-1">Unfiled</span>
          <span class="text-xs text-base-content/40">{rootCount}</span>
        </a>
      </div>

      <div class="border-t border-base-200 my-2" />

      {/* Actual folder tree */}
      <div class="p-3 pt-0">
        <div class="flex justify-between items-center mb-2 px-2">
          <h3 class="text-xs font-semibold uppercase text-base-content/50">Folders</h3>
          <button
            class="btn btn-ghost btn-xs editor-action"
            onclick="document.getElementById('new-folder-modal').showModal()"
            title="New folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {folders.length === 0 ? (
          <p class="text-xs text-base-content/40 px-2 py-1">No folders yet.</p>
        ) : (
          <ul class="space-y-0.5">
            {folders.map((folder) => (
              <FolderItem node={folder} projectId={projectId} activeFolderId={activeFolderId} depth={0} allFolders={allFlat} />
            ))}
          </ul>
        )}
      </div>

      <NewFolderModal projectId={projectId} folders={allFlat} />
    </div>
  );
};

function flattenFolders(nodes: FolderNode[], result: { id: string; name: string; path: string }[] = []): { id: string; name: string; path: string }[] {
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, path: node.path });
    flattenFolders(node.children, result);
  }
  return result;
}

const NewFolderModal: FC<{ projectId: string; folders: { id: string; name: string; path: string }[] }> = ({ projectId, folders }) => (
  <dialog id="new-folder-modal" class="modal">
    <div class="modal-box max-w-sm">
      <h3 class="text-lg font-bold mb-4">New Folder</h3>
      <form method="POST" action={`/projects/${projectId}/folders`}>
        <div class="form-control mb-3">
          <label class="label"><span class="label-text">Folder Name</span></label>
          <input type="text" name="name" placeholder="e.g., Regression Tests" class="input input-bordered w-full" required autofocus />
        </div>
        <div class="form-control mb-4">
          <label class="label"><span class="label-text">Parent Folder</span></label>
          <select name="parentId" class="select select-bordered w-full">
            <option value="">Root (top level)</option>
            {folders.map((f) => (
              <option value={f.id}>{f.path}</option>
            ))}
          </select>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" onclick="document.getElementById('new-folder-modal').close()">Cancel</button>
          <button type="submit" class="btn btn-primary editor-action">Create</button>
        </div>
      </form>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>
);

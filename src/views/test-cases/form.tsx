import type { FC } from 'hono/jsx';

type FolderOption = { id: string; name: string; path: string };

type TestCaseFormProps = {
  project: { id: string; name: string };
  testCase?: { id: string; title: string; description: string | null; preconditions: string | null; priority: string; type: string; status: string; tags: string[] | null; folderId: string | null };
  existingSteps?: Array<{ action: string; data: string | null; expectedResult: string | null }>;
  folders?: FolderOption[];
  preselectedFolderId?: string;
  error?: string;
  values?: Record<string, any>;
};

export const TestCaseFormView: FC<TestCaseFormProps> = ({ project, testCase, existingSteps, folders, preselectedFolderId, error, values }) => {
  const isEdit = !!testCase;
  const steps = existingSteps || [];
  const currentFolderId = values?.folderId || testCase?.folderId || preselectedFolderId || '';
  const sortedFolders = (folders || []).slice().sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div class="max-w-3xl">
      <h1 class="text-2xl font-bold mb-6">{isEdit ? 'Edit Test Case' : 'New Test Case'}</h1>

      {error && (
        <div class="alert alert-error mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span>{error}</span>
        </div>
      )}

      <form method="POST" action={isEdit ? `/projects/${project.id}/test-cases/${testCase.id}` : `/projects/${project.id}/test-cases`}>
        <div class="space-y-4">
          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Title *</span></label>
            <input type="text" name="title" value={values?.title || testCase?.title || ''} placeholder="e.g., Verify login with valid credentials" class="input input-bordered w-full" required autofocus />
          </div>

          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Description</span></label>
            <textarea name="description" placeholder="What does this test verify?" class="textarea textarea-bordered w-full h-20">{values?.description || testCase?.description || ''}</textarea>
          </div>

          <div class="form-control">
            <label class="label"><span class="label-text font-medium">Preconditions</span></label>
            <textarea name="preconditions" placeholder="What must be true before running this test?" class="textarea textarea-bordered w-full h-16">{values?.preconditions || testCase?.preconditions || ''}</textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">Priority</span></label>
              <select name="priority" class="select select-bordered w-full">
                {['low', 'medium', 'high', 'critical'].map((p) => (
                  <option value={p} selected={p === (values?.priority || testCase?.priority || 'medium')}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">Type</span></label>
              <select name="type" class="select select-bordered w-full">
                {['functional', 'regression', 'smoke', 'integration', 'e2e'].map((t) => (
                  <option value={t} selected={t === (values?.type || testCase?.type || 'functional')}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">Status</span></label>
              <select name="status" class="select select-bordered w-full">
                {['draft', 'active', 'deprecated'].map((s) => (
                  <option value={s} selected={s === (values?.status || testCase?.status || 'draft')}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">Folder</span></label>
              <select name="folderId" class="select select-bordered w-full">
                <option value="">No folder (root)</option>
                {sortedFolders.map((f) => (
                  <option value={f.id} selected={f.id === currentFolderId}>{f.path}</option>
                ))}
              </select>
            </div>
            <div class="form-control">
              <label class="label"><span class="label-text font-medium">Tags</span></label>
              <input type="text" name="tags" value={values?.tags || testCase?.tags?.join(', ') || ''} placeholder="e.g., login, smoke, critical-path (comma-separated)" class="input input-bordered w-full" />
            </div>
          </div>

          <div class="divider">Test Steps</div>

          <div id="steps-container">
            {steps.length > 0 ? steps.map((step, i) => (
              <StepRow index={i} action={step.action} data={step.data || ''} expected={step.expectedResult || ''} />
            )) : (
              <StepRow index={0} action="" data="" expected="" />
            )}
          </div>

          <button type="button" class="btn btn-ghost btn-sm gap-2" onclick={`
            const container = document.getElementById('steps-container');
            const count = container.querySelectorAll('.step-row').length;
            const div = document.createElement('div');
            div.innerHTML = \`<div class="step-row bg-base-200 rounded-lg p-4 mb-3">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-semibold text-base-content/70">Step \${count + 1}</span>
                <button type="button" class="btn btn-ghost btn-xs text-error" onclick="this.closest('.step-row').remove()">Remove</button>
              </div>
              <div class="space-y-2">
                <textarea name="step_action" placeholder="Action — What the tester should do" class="textarea textarea-bordered textarea-sm w-full h-16"></textarea>
                <textarea name="step_data" placeholder="Test data (optional)" class="textarea textarea-bordered textarea-sm w-full h-10"></textarea>
                <textarea name="step_expected" placeholder="Expected result" class="textarea textarea-bordered textarea-sm w-full h-16"></textarea>
              </div>
            </div>\`;
            container.appendChild(div.firstElementChild);
          `}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Step
          </button>
        </div>

        <div class="flex gap-3 pt-6">
          <button type="submit" class="btn btn-primary">{isEdit ? 'Update Test Case' : 'Create Test Case'}</button>
          <a href={isEdit ? `/projects/${project.id}/test-cases/${testCase.id}` : `/projects/${project.id}/test-cases`} class="btn btn-ghost">Cancel</a>
        </div>
      </form>
    </div>
  );
};

const StepRow: FC<{ index: number; action: string; data: string; expected: string }> = ({ index, action, data, expected }) => (
  <div class="step-row bg-base-200 rounded-lg p-4 mb-3">
    <div class="flex justify-between items-center mb-2">
      <span class="text-sm font-semibold text-base-content/70">Step {index + 1}</span>
      {index > 0 && (
        <button type="button" class="btn btn-ghost btn-xs text-error" onclick="this.closest('.step-row').remove()">Remove</button>
      )}
    </div>
    <div class="space-y-2">
      <textarea name="step_action" placeholder="Action — What the tester should do" class="textarea textarea-bordered textarea-sm w-full h-16">{action}</textarea>
      <textarea name="step_data" placeholder="Test data (optional)" class="textarea textarea-bordered textarea-sm w-full h-10">{data}</textarea>
      <textarea name="step_expected" placeholder="Expected result" class="textarea textarea-bordered textarea-sm w-full h-16">{expected}</textarea>
    </div>
  </div>
);

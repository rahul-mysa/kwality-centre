import type { FC } from 'hono/jsx';

type ProjectFormProps = {
  project?: { id: string; name: string };
  error?: string;
  values?: {
    name: string;
    description: string;
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
    githubTestPath?: string;
  };
};

export const ProjectFormView: FC<ProjectFormProps> = ({ project, error, values }) => {
  const isEdit = !!project;
  return (
    <div class="max-w-lg">
      <h1 class="text-2xl font-bold mb-6">{isEdit ? 'Edit Project' : 'New Project'}</h1>

      {error && (
        <div class="alert alert-error mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span>{error}</span>
        </div>
      )}

      <form method="post" action={isEdit ? `/projects/${project.id}` : '/projects'} class="space-y-4">
        <div class="form-control">
          <label class="label">
            <span class="label-text font-medium">Project Name *</span>
          </label>
          <input
            type="text"
            name="name"
            value={values?.name || ''}
            placeholder="e.g., Mobile App QA"
            class="input input-bordered w-full"
            required
            autofocus
          />
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text font-medium">Description</span>
          </label>
          <textarea
            name="description"
            placeholder="Brief description of the project..."
            class="textarea textarea-bordered w-full h-24"
          >{values?.description || ''}</textarea>
        </div>

        <div class="divider text-xs text-base-content/40">Automation (optional)</div>

        <p class="text-xs text-base-content/50">
          Connect a GitHub repo to show automated test cases and import run results.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-sm">GitHub Owner</span></label>
            <input type="text" name="githubOwner" value={values?.githubOwner || ''} placeholder="e.g., getmysa" class="input input-bordered input-sm w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-sm">Repository</span></label>
            <input type="text" name="githubRepo" value={values?.githubRepo || ''} placeholder="e.g., mysa-clients" class="input input-bordered input-sm w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-sm">Branch</span></label>
            <input type="text" name="githubBranch" value={values?.githubBranch || 'main'} placeholder="main" class="input input-bordered input-sm w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-sm">Test Path</span></label>
            <input type="text" name="githubTestPath" value={values?.githubTestPath || ''} placeholder="e.g., apps/mysa-home-e2e/src/tests" class="input input-bordered input-sm w-full" />
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button type="submit" class="btn btn-primary">
            {isEdit ? 'Update Project' : 'Create Project'}
          </button>
          <a href={isEdit ? `/projects/${project.id}` : '/projects'} class="btn btn-ghost">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
};

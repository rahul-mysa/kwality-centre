import type { FC } from 'hono/jsx';
import { PriorityBadge, StatusBadge } from '../components/badge.js';

type Props = {
  project: { id: string; name: string };
  testCase: {
    id: string;
    title: string;
    description: string | null;
    preconditions: string | null;
    priority: string;
    type: string;
    status: string;
    tags: string[] | null;
    xrayKey: string | null;
    xrayIssueId: string | null;
    folderId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  steps: Array<{
    id: string;
    stepNumber: number;
    action: string;
    data: string | null;
    expectedResult: string | null;
  }>;
  folderPath?: string | null;
};

export const TestCaseDetailView: FC<Props> = ({ project, testCase, steps, folderPath }) => (
  <div class="max-w-4xl">
    <div class="flex justify-between items-start mb-6">
      <div>
        <div class="text-sm breadcrumbs mb-2">
          <ul>
            <li><a href={`/projects/${project.id}`}>{project.name}</a></li>
            <li><a href={`/projects/${project.id}/test-cases`}>Test Cases</a></li>
            <li>{testCase.title}</li>
          </ul>
        </div>
        <h1 class="text-2xl font-bold">{testCase.title}</h1>
        <div class="flex items-center gap-2 mt-2">
          <PriorityBadge priority={testCase.priority} />
          <StatusBadge status={testCase.status} />
          <span class="badge badge-sm badge-outline">{testCase.type}</span>
          {testCase.xrayKey && (
            <span class="badge badge-sm badge-info badge-outline">{testCase.xrayKey}</span>
          )}
          {folderPath && (
            <a href={`/projects/${project.id}/test-cases?folder=${testCase.folderId}`} class="badge badge-sm badge-ghost gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              {folderPath}
            </a>
          )}
        </div>
      </div>
      <div class="flex gap-2">
        <a href={`/projects/${project.id}/test-cases/${testCase.id}/edit`} class="btn btn-ghost btn-sm">Edit</a>
        <form method="POST" action={`/projects/${project.id}/test-cases/${testCase.id}/duplicate`}>
          <button type="submit" class="btn btn-ghost btn-sm">Duplicate</button>
        </form>
        <form method="POST" action={`/projects/${project.id}/test-cases/${testCase.id}/delete`} onsubmit="return confirm('Delete this test case?')">
          <button type="submit" class="btn btn-ghost btn-sm text-error">Delete</button>
        </form>
      </div>
    </div>

    {testCase.description && (
      <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-5 mb-4">
        <h2 class="text-sm font-semibold text-base-content/50 uppercase mb-2">Description</h2>
        <p class="whitespace-pre-wrap">{testCase.description}</p>
      </div>
    )}

    {testCase.preconditions && (
      <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-5 mb-4">
        <h2 class="text-sm font-semibold text-base-content/50 uppercase mb-2">Preconditions</h2>
        <p class="whitespace-pre-wrap">{testCase.preconditions}</p>
      </div>
    )}

    {testCase.tags && testCase.tags.length > 0 && (
      <div class="flex gap-2 mb-4">
        {testCase.tags.map((tag) => (
          <span class="badge badge-sm badge-outline">{tag}</span>
        ))}
      </div>
    )}

    <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-5 mb-4">
      <h2 class="text-sm font-semibold text-base-content/50 uppercase mb-4">
        Test Steps {steps.length > 0 && `(${steps.length})`}
      </h2>

      {steps.length === 0 ? (
        <p class="text-base-content/50 text-sm">No steps defined.</p>
      ) : (
        <div class="space-y-4">
          {steps.map((step) => (
            <div class="border border-base-300 rounded-lg p-4">
              <div class="flex items-start gap-3">
                <div class="badge badge-primary badge-sm mt-1">{step.stepNumber}</div>
                <div class="flex-1 space-y-2">
                  <div>
                    <span class="text-xs font-semibold text-base-content/50 uppercase">Action</span>
                    <p class="whitespace-pre-wrap mt-0.5">{step.action}</p>
                  </div>
                  {step.data && (
                    <div>
                      <span class="text-xs font-semibold text-base-content/50 uppercase">Test Data</span>
                      <p class="whitespace-pre-wrap mt-0.5 text-sm bg-base-200 p-2 rounded">{step.data}</p>
                    </div>
                  )}
                  {step.expectedResult && (
                    <div>
                      <span class="text-xs font-semibold text-base-content/50 uppercase">Expected Result</span>
                      <p class="whitespace-pre-wrap mt-0.5 text-sm">{step.expectedResult}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <div class="text-xs text-base-content/40 mt-6">
      Created {testCase.createdAt.toLocaleDateString()} · Updated {testCase.updatedAt.toLocaleDateString()}
      {testCase.xrayKey && ` · Imported from Xray: ${testCase.xrayKey} (ID: ${testCase.xrayIssueId})`}
    </div>
  </div>
);

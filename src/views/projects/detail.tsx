import type { FC } from 'hono/jsx';
import { RunStatusBadge } from '../components/badge.js';

type ProjectDetailProps = {
  project: { id: string; name: string; description: string | null; createdAt: Date };
  testCaseCount: number;
  runCount: number;
  recentRuns: Array<{
    id: string;
    name: string;
    status: string;
    environment: string | null;
    createdAt: Date;
  }>;
};

export const ProjectDetailView: FC<ProjectDetailProps> = ({ project, testCaseCount, runCount, recentRuns }) => (
  <div>
    <div class="flex justify-between items-start mb-6">
      <div>
        <h1 class="text-2xl font-bold">{project.name}</h1>
        {project.description && (
          <p class="text-base-content/60 mt-1">{project.description}</p>
        )}
      </div>
      <div class="flex gap-2">
        <a href={`/projects/${project.id}/edit`} class="btn btn-ghost btn-sm editor-action">Edit</a>
        <form method="POST" action={`/projects/${project.id}/delete`} onsubmit="return confirm('Delete this project and all its data?')">
          <button type="submit" class="btn btn-ghost btn-sm text-error admin-action">Delete</button>
        </form>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <a href={`/projects/${project.id}/test-cases`} class="stat bg-base-100 rounded-box shadow-sm border border-base-300 hover:shadow-md transition-shadow">
        <div class="stat-title">Test Cases</div>
        <div class="stat-value text-primary">{testCaseCount}</div>
        <div class="stat-desc">Click to manage</div>
      </a>
      <a href={`/projects/${project.id}/suites`} class="stat bg-base-100 rounded-box shadow-sm border border-base-300 hover:shadow-md transition-shadow">
        <div class="stat-title">Test Suites</div>
        <div class="stat-value">—</div>
        <div class="stat-desc">Click to manage</div>
      </a>
      <a href={`/projects/${project.id}/runs`} class="stat bg-base-100 rounded-box shadow-sm border border-base-300 hover:shadow-md transition-shadow">
        <div class="stat-title">Test Runs</div>
        <div class="stat-value">{runCount}</div>
        <div class="stat-desc">Click to view history</div>
      </a>
    </div>

    <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
      <h2 class="text-lg font-semibold mb-4">Recent Test Runs</h2>
      {recentRuns.length === 0 ? (
        <p class="text-base-content/50 text-sm">No test runs yet. Create a test suite and start a run.</p>
      ) : (
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Environment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr class="hover cursor-pointer" onclick={`window.location='/projects/${project.id}/runs/${run.id}'`}>
                  <td class="font-medium">{run.name}</td>
                  <td><RunStatusBadge status={run.status} /></td>
                  <td class="text-base-content/60">{run.environment || '—'}</td>
                  <td class="text-base-content/60">{run.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
);

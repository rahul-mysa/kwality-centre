import type { FC } from 'hono/jsx';
import { EmptyState } from '../components/empty-state.js';

type Project = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  testCaseCount: number;
  suiteCount: number;
  runCount: number;
};

export const ProjectListView: FC<{ projects: Project[] }> = ({ projects }) => (
  <div>
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold">Projects</h1>
        <p class="text-base-content/60 text-sm mt-1">Manage your test projects — {projects.length} project{projects.length !== 1 ? 's' : ''}</p>
      </div>
      <a href="/projects/new" class="btn btn-primary btn-sm gap-2 editor-action">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
        New Project
      </a>
    </div>

    {projects.length === 0 ? (
      <EmptyState
        title="No projects yet"
        description="Create your first project to start managing test cases."
        actionUrl="/projects/new"
        actionLabel="Create Project"
      />
    ) : (
      <div class="bg-base-100 rounded-box border border-base-300 overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr class="text-xs uppercase text-base-content/50">
              <th>Name</th>
              <th>Test Cases</th>
              <th>Suites</th>
              <th>Runs</th>
              <th>Created</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${project.id}'`}>
                <td class="max-w-sm">
                  <a href={`/projects/${project.id}`} class="link link-hover font-medium block truncate">{project.name}</a>
                  {project.description && (
                    <span class="text-xs text-base-content/50 line-clamp-1">{project.description}</span>
                  )}
                </td>
                <td class="text-sm text-base-content/70">{project.testCaseCount}</td>
                <td class="text-sm text-base-content/70">{project.suiteCount}</td>
                <td class="text-sm text-base-content/70">{project.runCount}</td>
                <td class="text-sm text-base-content/60 whitespace-nowrap">{project.createdAt.toLocaleDateString()}</td>
                <td class="text-sm text-base-content/60 whitespace-nowrap">{project.updatedAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

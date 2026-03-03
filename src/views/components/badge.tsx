import type { FC } from 'hono/jsx';

const priorityColors: Record<string, string> = {
  critical: 'badge-error',
  high: 'badge-warning',
  medium: 'badge-info',
  low: 'badge-ghost',
};

const statusColors: Record<string, string> = {
  draft: 'badge-ghost',
  active: 'badge-success',
  deprecated: 'badge-warning',
};

const runStatusColors: Record<string, string> = {
  planned: 'badge-ghost',
  in_progress: 'badge-info',
  completed: 'badge-success',
};

const resultStatusColors: Record<string, string> = {
  not_run: 'badge-ghost',
  passed: 'badge-success',
  failed: 'badge-error',
  blocked: 'badge-warning',
  skipped: 'badge-ghost',
};

export const PriorityBadge: FC<{ priority: string }> = ({ priority }) => (
  <span class={`badge badge-sm ${priorityColors[priority] || 'badge-ghost'}`}>
    {priority}
  </span>
);

export const StatusBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`badge badge-sm ${statusColors[status] || 'badge-ghost'}`}>
    {status.replace('_', ' ')}
  </span>
);

export const RunStatusBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`badge badge-sm ${runStatusColors[status] || 'badge-ghost'}`}>
    {status.replace('_', ' ')}
  </span>
);

export const ResultStatusBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`badge badge-sm ${resultStatusColors[status] || 'badge-ghost'}`}>
    {status.replace('_', ' ')}
  </span>
);

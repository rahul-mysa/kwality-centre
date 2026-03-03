import type { FC } from 'hono/jsx';

type EmptyStateProps = {
  title: string;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
};

export const EmptyState: FC<EmptyStateProps> = ({ title, description, actionUrl, actionLabel }) => (
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-base-content/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
      <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
    <h3 class="text-lg font-semibold text-base-content/70">{title}</h3>
    <p class="text-sm text-base-content/50 mt-1 max-w-sm">{description}</p>
    {actionUrl && actionLabel && (
      <a href={actionUrl} class="btn btn-primary btn-sm mt-4">{actionLabel}</a>
    )}
  </div>
);

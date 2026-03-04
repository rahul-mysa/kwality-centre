import type { FC } from 'hono/jsx';

export type UserRole = 'admin' | 'editor' | 'viewer';

export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type ActiveProject = {
  id: string;
  name: string;
  hasGithub?: boolean;
};

export type Breadcrumb = {
  label: string;
  href?: string;
};

type LayoutProps = {
  title?: string;
  user?: User | null;
  activeProject?: ActiveProject | null;
  activePage?: string;
  breadcrumbs?: Breadcrumb[];
  children: any;
};

export const Layout: FC<LayoutProps> = ({ title, user, activeProject, activePage, breadcrumbs, children }) => (
  <html lang="en" data-theme="nord">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title ? `${title} — Kwality Centre` : 'Kwality Centre'}</title>
      <link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet" />
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde@2/dist/easymde.min.css" />
      <script src="https://cdn.jsdelivr.net/npm/easymde@2/dist/easymde.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
      <style>{`
        .EasyMDEContainer .CodeMirror { font-size: 13px; min-height: 120px; }
        .EasyMDEContainer .editor-toolbar { padding: 0 2px; }
        .EasyMDEContainer .editor-toolbar button { width: 26px; height: 26px; }
        .editor-preview { padding: 8px 12px !important; }
        .editor-preview table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .editor-preview table th, .editor-preview table td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; font-size: 13px; }
        .editor-preview table th { background: #f3f4f6; font-weight: 600; }
        .editor-preview ul { list-style: disc; padding-left: 1.5em; margin: 4px 0; }
        .editor-preview ol { list-style: decimal; padding-left: 1.5em; margin: 4px 0; }
        .editor-preview li { margin: 2px 0; }
        .prose ul { list-style: disc; padding-left: 1.5em; }
        .prose ol { list-style: decimal; padding-left: 1.5em; }
        .prose table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .prose table th, .prose table td { border: 1px solid #d1d5db; padding: 4px 8px; text-align: left; font-size: 13px; }
        .prose table th { background: #f3f4f6; font-weight: 600; }
        .role-viewer .editor-action, .role-viewer .admin-action { display: none !important; }
        .role-editor .admin-action { display: none !important; }
        .kc-toast { animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 3.7s forwards; }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .htmx-indicator { opacity: 0; transition: opacity 200ms ease-in; }
        .htmx-request .htmx-indicator, .htmx-request.htmx-indicator { opacity: 1; }
      `}</style>
    </head>
    <body class={`min-h-screen bg-base-200 ${user ? `role-${user.role}` : ''}`}>
      {user ? (
        <div class="flex h-screen">
          <Sidebar activeProject={activeProject} activePage={activePage} />
          <div class="flex-1 flex flex-col overflow-hidden">
            <Navbar user={user} breadcrumbs={breadcrumbs} />
            <main class="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      ) : (
        <main>{children}</main>
      )}
      <div id="toast-container" class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm"></div>
      <script dangerouslySetInnerHTML={{ __html: `
        function showToast(msg, type) {
          var tc = document.getElementById('toast-container');
          var cls = type === 'error' ? 'alert-error' : type === 'warning' ? 'alert-warning' : 'alert-success';
          var el = document.createElement('div');
          el.className = 'alert ' + cls + ' shadow-lg text-sm py-2 px-4 kc-toast';
          el.innerHTML = '<span>' + msg + '</span>';
          tc.appendChild(el);
          setTimeout(function() { el.remove(); }, 4000);
        }
        (function() {
          var p = new URLSearchParams(window.location.search);
          var msg = p.get('toast');
          if (msg) {
            var type = p.get('toast_type') || 'success';
            showToast(msg, type);
            p.delete('toast'); p.delete('toast_type');
            var clean = window.location.pathname + (p.toString() ? '?' + p.toString() : '');
            history.replaceState(null, '', clean);
          }
        })();
        document.body.addEventListener('htmx:afterRequest', function(e) {
          var trigger = e.detail.xhr.getResponseHeader('HX-Trigger');
          if (trigger) {
            try {
              var data = JSON.parse(trigger);
              if (data.showToast) showToast(data.showToast.message || data.showToast, data.showToast.type || 'success');
            } catch(ex) {}
          }
        });
        document.addEventListener('submit', function(e) {
          var form = e.target;
          if (form.tagName !== 'FORM' || form.method === 'get') return;
          var btn = form.querySelector('button[type="submit"], button:not([type])');
          if (btn && !btn.disabled) {
            btn.disabled = true;
            btn.dataset.origHtml = btn.innerHTML;
            btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> ' + btn.textContent.trim();
          }
        });
      ` }} />
    </body>
  </html>
);

const Navbar: FC<{ user: User; breadcrumbs?: Breadcrumb[] }> = ({ user, breadcrumbs }) => (
  <nav class="navbar bg-base-100 border-b border-base-300 px-6">
    <div class="flex-1">
      <div class="text-sm breadcrumbs">
        <ul>
          <li><a href="/">Dashboard</a></li>
          {breadcrumbs?.map((crumb, i) => (
            <li>
              {crumb.href && i < (breadcrumbs.length - 1)
                ? <a href={crumb.href}>{crumb.label}</a>
                : <span>{crumb.label}</span>
              }
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div class="flex-none gap-3">
      <div class="dropdown dropdown-end">
        <div tabindex={0} role="button" class="btn btn-ghost btn-circle avatar">
          {user.avatarUrl ? (
            <div class="w-9 rounded-full">
              <img src={user.avatarUrl} alt={user.name} referrerpolicy="no-referrer" />
            </div>
          ) : (
            <div class="w-9 rounded-full bg-primary text-primary-content flex items-center justify-center text-sm font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <ul tabindex={0} class="dropdown-content menu menu-sm bg-base-100 rounded-box shadow-lg border border-base-300 w-64 mt-3 z-50 p-2">
          <li class="menu-title px-4 py-2">
            <span class="font-semibold truncate">{user.name}</span>
            <span class="text-xs opacity-60 truncate max-w-full">{user.email}</span>
            <span class={`badge badge-xs mt-1 ${user.role === 'admin' ? 'badge-error' : user.role === 'editor' ? 'badge-info' : 'badge-ghost'}`}>{user.role}</span>
          </li>
          {user.role === 'admin' && <li><a href="/admin/users">Manage Users</a></li>}
          <li><a href="/auth/logout">Logout</a></li>
        </ul>
      </div>
    </div>
  </nav>
);

type SidebarLinkProps = {
  href: string;
  label: string;
  icon: string;
  active: boolean;
};

const sidebarIcons: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  projects: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  overview: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  'test-cases': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  suites: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  runs: 'M13 10V3L4 14h7v7l9-11h-7z',
  'auto-tests': 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  'auto-runs': 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  import: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
};

const SidebarLink: FC<SidebarLinkProps> = ({ href, label, icon, active }) => (
  <li>
    <a href={href} class={`flex items-center gap-3 ${active ? 'active font-semibold' : ''}`}>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d={sidebarIcons[icon] || sidebarIcons.dashboard} />
      </svg>
      {label}
    </a>
  </li>
);

const Sidebar: FC<{ activeProject?: ActiveProject | null; activePage?: string }> = ({ activeProject, activePage }) => (
  <aside class="w-64 bg-base-100 border-r border-base-300 flex flex-col">
    <div class="p-5 border-b border-base-300">
      <a href="/" class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-lg font-bold">Kwality Centre</span>
      </a>
    </div>

    <nav class="flex-1 p-4 overflow-y-auto">
      <ul class="menu menu-sm gap-1">
        <SidebarLink href="/" label="Dashboard" icon="dashboard" active={activePage === 'dashboard'} />
        <SidebarLink href="/projects" label="Projects" icon="projects" active={activePage === 'projects'} />
      </ul>

      {activeProject ? (
        <div class="mt-4 border-t border-base-300 pt-4">
          <a href={`/projects/${activeProject.id}`} class="block px-3 mb-3">
            <p class="text-sm font-bold text-base-content truncate">{activeProject.name}</p>
          </a>
          <ul class="menu menu-sm gap-1">
            <SidebarLink href={`/projects/${activeProject.id}`} label="Overview" icon="overview" active={activePage === 'overview'} />
          </ul>

          <p class="text-xs font-semibold uppercase text-base-content/40 px-3 mt-3 mb-1">Manual</p>
          <ul class="menu menu-sm gap-1">
            <SidebarLink href={`/projects/${activeProject.id}/test-cases`} label="Test Cases" icon="test-cases" active={activePage === 'test-cases'} />
            <SidebarLink href={`/projects/${activeProject.id}/suites`} label="Suites" icon="suites" active={activePage === 'suites'} />
            <SidebarLink href={`/projects/${activeProject.id}/runs`} label="Test Runs" icon="runs" active={activePage === 'runs'} />
          </ul>

          {activeProject.hasGithub && (
            <div>
              <p class="text-xs font-semibold uppercase text-base-content/40 px-3 mt-3 mb-1">Automated</p>
              <ul class="menu menu-sm gap-1">
                <SidebarLink href={`/projects/${activeProject.id}/automated-tests`} label="Test Cases" icon="auto-tests" active={activePage === 'auto-tests'} />
                <SidebarLink href={`/projects/${activeProject.id}/automated-runs`} label="Test Runs" icon="auto-runs" active={activePage === 'auto-runs'} />
              </ul>
            </div>
          )}

          <ul class="menu menu-sm gap-1 mt-1 admin-action">
            <li class="border-t border-base-200 my-1" />
            <SidebarLink href={`/projects/${activeProject.id}/import`} label="Import" icon="import" active={activePage === 'import'} />
          </ul>
        </div>
      ) : (
        <div id="project-nav" hx-get="/api/sidebar-projects" hx-trigger="load" hx-swap="innerHTML">
        </div>
      )}

    </nav>
  </aside>
);

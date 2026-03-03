import type { FC } from 'hono/jsx';
import { RunStatusBadge } from './components/badge.js';
import { EmptyState } from './components/empty-state.js';

type DashboardProps = {
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    testCaseCount: number;
    suiteCount: number;
    runCount: number;
  }>;
  recentRuns: Array<{
    id: string;
    name: string;
    status: string;
    projectId: string;
    projectName: string;
    environment: string | null;
    createdAt: Date;
  }>;
  totalTestCases: number;
  totalRuns: number;
  resultBreakdown: Record<string, number>;
  trendData: Array<{ name: string; date: string; passed: number; failed: number; total: number }>;
};

export const DashboardView: FC<DashboardProps> = ({ projects, recentRuns, totalTestCases, totalRuns, resultBreakdown, trendData }) => {
  const passed = resultBreakdown['passed'] || 0;
  const failed = resultBreakdown['failed'] || 0;
  const blocked = resultBreakdown['blocked'] || 0;
  const skipped = resultBreakdown['skipped'] || 0;
  const notRun = resultBreakdown['not_run'] || 0;
  const totalResults = passed + failed + blocked + skipped + notRun;
  const passRate = totalResults > 0 ? Math.round((passed / totalResults) * 100) : 0;

  return (
    <div>
      <div class="mb-6">
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-base-content/60 text-sm mt-1">Overview of your test management</p>
      </div>

      {/* Stats row */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="stat bg-base-100 rounded-box shadow-sm border border-base-300 py-4">
          <div class="stat-title text-xs">Projects</div>
          <div class="stat-value text-2xl text-primary">{projects.length}</div>
        </div>
        <div class="stat bg-base-100 rounded-box shadow-sm border border-base-300 py-4">
          <div class="stat-title text-xs">Test Cases</div>
          <div class="stat-value text-2xl">{totalTestCases}</div>
        </div>
        <div class="stat bg-base-100 rounded-box shadow-sm border border-base-300 py-4">
          <div class="stat-title text-xs">Test Runs</div>
          <div class="stat-value text-2xl">{totalRuns}</div>
        </div>
        <div class="stat bg-base-100 rounded-box shadow-sm border border-base-300 py-4">
          <div class="stat-title text-xs">Pass Rate</div>
          <div class="stat-value text-2xl">{passRate}%</div>
          <div class="stat-desc text-xs">{passed} of {totalResults} results</div>
        </div>
      </div>

      {/* Charts row */}
      {totalResults > 0 && (
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Result breakdown doughnut */}
          <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
            <h2 class="text-sm font-semibold mb-4">Result Breakdown</h2>
            <div class="flex items-center gap-6">
              <div class="w-40 h-40 shrink-0">
                <canvas id="result-chart"></canvas>
              </div>
              <div class="space-y-2 text-sm">
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-success inline-block"></span> Passed: {passed}</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-error inline-block"></span> Failed: {failed}</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-warning inline-block"></span> Blocked: {blocked}</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-info inline-block"></span> Skipped: {skipped}</div>
                <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-base-300 inline-block"></span> Not Run: {notRun}</div>
              </div>
            </div>
          </div>

          {/* Run trend bar chart */}
          {trendData.length > 0 && (
            <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
              <h2 class="text-sm font-semibold mb-4">Pass Rate Trend (Last {trendData.length} Runs)</h2>
              <div class="h-40">
                <canvas id="trend-chart"></canvas>
              </div>
            </div>
          )}
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects table */}
        <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-sm font-semibold">Projects</h2>
            <a href="/projects/new" class="btn btn-primary btn-xs gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
              New
            </a>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create your first project to get started."
              actionUrl="/projects/new"
              actionLabel="Create Project"
            />
          ) : (
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="text-xs text-base-content/50">
                    <th>Name</th>
                    <th>Cases</th>
                    <th>Suites</th>
                    <th>Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${p.id}'`}>
                      <td>
                        <a href={`/projects/${p.id}`} class="link link-hover font-medium text-sm">{p.name}</a>
                      </td>
                      <td class="text-sm text-base-content/60">{p.testCaseCount}</td>
                      <td class="text-sm text-base-content/60">{p.suiteCount}</td>
                      <td class="text-sm text-base-content/60">{p.runCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent runs */}
        <div class="bg-base-100 rounded-box shadow-sm border border-base-300 p-6">
          <h2 class="text-sm font-semibold mb-4">Recent Test Runs</h2>
          {recentRuns.length === 0 ? (
            <p class="text-base-content/50 text-sm">No test runs yet.</p>
          ) : (
            <div class="overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr class="text-xs text-base-content/50">
                    <th>Run</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => (
                    <tr class="hover:bg-base-200 cursor-pointer" onclick={`window.location='/projects/${run.projectId}/runs/${run.id}'`}>
                      <td class="font-medium text-sm max-w-[200px] truncate">
                        <a href={`/projects/${run.projectId}/runs/${run.id}`} class="link link-hover">{run.name}</a>
                      </td>
                      <td class="text-xs text-base-content/50">{run.projectName}</td>
                      <td><RunStatusBadge status={run.status} /></td>
                      <td class="text-xs text-base-content/50 whitespace-nowrap">{run.createdAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Chart.js scripts */}
      {totalResults > 0 && (
        <script dangerouslySetInnerHTML={{ __html: `
          document.addEventListener('DOMContentLoaded', function() {
            if (typeof Chart === 'undefined') return;

            // Doughnut chart
            var rc = document.getElementById('result-chart');
            if (rc) {
              new Chart(rc, {
                type: 'doughnut',
                data: {
                  labels: ['Passed', 'Failed', 'Blocked', 'Skipped', 'Not Run'],
                  datasets: [{
                    data: [${passed}, ${failed}, ${blocked}, ${skipped}, ${notRun}],
                    backgroundColor: ['#36d399', '#f87272', '#fbbd23', '#3abff8', '#d1d5db'],
                    borderWidth: 0,
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: true,
                  cutout: '60%',
                  plugins: { legend: { display: false } }
                }
              });
            }

            // Trend chart
            var tc = document.getElementById('trend-chart');
            if (tc) {
              var trendData = ${JSON.stringify(trendData)};
              var labels = trendData.map(function(d) { return d.name.length > 20 ? d.name.substring(0, 20) + '...' : d.name; });
              var passRates = trendData.map(function(d) { return d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0; });
              new Chart(tc, {
                type: 'bar',
                data: {
                  labels: labels,
                  datasets: [{
                    label: 'Pass Rate %',
                    data: passRates,
                    backgroundColor: passRates.map(function(r) { return r >= 80 ? '#36d399' : r >= 50 ? '#fbbd23' : '#f87272'; }),
                    borderRadius: 4,
                    maxBarThickness: 32,
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: function(v) { return v + '%'; } } },
                    x: { display: false }
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        title: function(items) { return trendData[items[0].dataIndex].name; },
                        afterTitle: function(items) { return trendData[items[0].dataIndex].date; },
                        label: function(item) {
                          var d = trendData[item.dataIndex];
                          return item.raw + '% (' + d.passed + '/' + d.total + ' passed, ' + d.failed + ' failed)';
                        }
                      }
                    }
                  }
                }
              });
            }
          });
        ` }} />
      )}
    </div>
  );
};

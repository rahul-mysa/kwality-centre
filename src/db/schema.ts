import { pgTable, uuid, text, timestamp, pgEnum, integer, jsonb } from 'drizzle-orm/pg-core';

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'critical']);
export const testTypeEnum = pgEnum('test_type', ['functional', 'regression', 'smoke', 'integration', 'e2e']);
export const testCaseStatusEnum = pgEnum('test_case_status', ['draft', 'active', 'deprecated']);
export const runStatusEnum = pgEnum('run_status', ['planned', 'in_progress', 'completed']);
export const resultStatusEnum = pgEnum('result_status', ['not_run', 'passed', 'failed', 'blocked', 'skipped']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  githubOwner: text('github_owner'),
  githubRepo: text('github_repo'),
  githubBranch: text('github_branch'),
  githubTestPath: text('github_test_path'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const folders = pgTable('folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testCases = pgTable('test_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  preconditions: text('preconditions'),
  priority: priorityEnum('priority').default('medium').notNull(),
  type: testTypeEnum('type').default('functional').notNull(),
  status: testCaseStatusEnum('status').default('draft').notNull(),
  tags: text('tags').array(),
  xrayKey: text('xray_key'),
  xrayIssueId: text('xray_issue_id'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testSteps = pgTable('test_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  testCaseId: uuid('test_case_id').references(() => testCases.id, { onDelete: 'cascade' }).notNull(),
  stepNumber: integer('step_number').notNull(),
  action: text('action').notNull(),
  data: text('data'),
  expectedResult: text('expected_result'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const testSuites = pgTable('test_suites', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const suiteTestCases = pgTable('suite_test_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  suiteId: uuid('suite_id').references(() => testSuites.id, { onDelete: 'cascade' }).notNull(),
  testCaseId: uuid('test_case_id').references(() => testCases.id, { onDelete: 'cascade' }).notNull(),
  position: integer('position').notNull(),
});

export const testRuns = pgTable('test_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  suiteId: uuid('suite_id').references(() => testSuites.id),
  name: text('name').notNull(),
  status: runStatusEnum('status').default('planned').notNull(),
  environment: text('environment'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testResults = pgTable('test_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').references(() => testRuns.id, { onDelete: 'cascade' }).notNull(),
  testCaseId: uuid('test_case_id').references(() => testCases.id).notNull(),
  status: resultStatusEnum('status').default('not_run').notNull(),
  notes: text('notes'),
  defectUrl: text('defect_url'),
  durationSeconds: integer('duration_seconds'),
  executedBy: uuid('executed_by').references(() => users.id),
  executedAt: timestamp('executed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const automatedRuns = pgTable('automated_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  platform: text('platform'),
  appVersion: text('app_version'),
  passed: integer('passed').notNull(),
  failed: integer('failed').notNull(),
  skipped: integer('skipped').notNull(),
  total: integer('total').notNull(),
  duration: integer('duration'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  results: jsonb('results').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  testResultId: uuid('test_result_id').references(() => testResults.id, { onDelete: 'cascade' }),
  testCaseId: uuid('test_case_id').references(() => testCases.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  filepath: text('filepath').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

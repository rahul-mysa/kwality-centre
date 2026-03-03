# Bugs & Issues

Add bugs below. I'll fix them when you ask.

## Open

<!-- Add bugs here in this format:
- [ ] Short description of the bug. (Page/feature where it happens)
-->

- [x] test case count is incorrect on the project tile view and dashboard — Drizzle ORM correlated subqueries inside `sql` template literals return 0. Switched to separate GROUP BY count queries merged in JS.
- [ ] EasyMDE editor: empty lines / newlines not preserved when saving comments via the browser form submit

## Fixed

- [x] Expanding test folders do not work in test suite. It just shows loading. — HTMX `toggle` event was on `<summary>` but fires on `<details>`. Moved HTMX attrs to `<details>`.
- [x] Count of tests in a suite is shown as 0 on the tile in test suites screen. — PostgreSQL `COUNT(*)` returns bigint string. Added `::int` cast.

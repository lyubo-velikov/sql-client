# Plan: Server-Side Table Filtering

## Task Description
Add a filtering UI to the TableView component that allows users to filter table data by column values. Filters are applied server-side as parameterized WHERE clauses so pagination remains correct with large tables. The UX follows the TablePlus pattern: a filter bar between the toolbar and the data grid where users can add multiple filter rows (column + operator + value), combined with AND logic.

## Objective
When browsing a table via the sidebar, users can add one or more filters to narrow down rows. Filters are sent to the backend, applied as SQL WHERE clauses with parameterized values, and the filtered count/pagination reflects the filtered result set.

## Problem Statement
Currently the TableView only supports sorting and pagination. Users cannot filter rows by column values, which is a core feature of any database browser. Without server-side filtering, users must either scan through pages manually or switch to the query editor and write SQL by hand.

## Solution Approach
Thread a `filters` array through the entire data path: UI state in TableView -> preload API -> IPC -> main process SQL builder. The main process builds parameterized WHERE clauses using postgres.js tagged template literals to prevent SQL injection. The filter bar UI lives in TableView.svelte (not DataGrid, which stays a pure presentation component).

## Relevant Files
Use these files to complete the task:

- `src/preload/index.d.ts` - Add `Filter` type export and update `getTableData` params type to include `filters?`
- `src/preload/index.ts` - Pass `filters` through to IPC (already passes full params object, just needs type update)
- `src/main/index.ts` - Update `db:table-data` handler to build WHERE clauses from filters array
- `src/renderer/src/components/grid/TableView.svelte` - Add filter bar UI, manage `filters` state, pass to `fetchData()`
- `src/main/db.ts` - Reference only; uses `postgres` library (tagged template SQL)
- `src/renderer/src/app.css` - Reference only; theme variables for styling

**Not modified:**
- `src/renderer/src/components/grid/DataGrid.svelte` - Pure presentation, no changes needed

## Implementation Phases

### Phase 1: Types & API Layer
Define the `Filter` interface and thread it through the preload bridge and IPC handler types.

### Phase 2: Backend SQL Builder
Build parameterized WHERE clauses in the `db:table-data` handler. This is the most critical part — must handle all operators safely and apply filters to both the count query and the data query.

### Phase 3: Filter Bar UI
Add the filter bar to TableView with column/operator/value inputs, add/remove buttons, and reactive data fetching.

## Step by Step Tasks

### 1. Add Filter type to `src/preload/index.d.ts`
- Add a `Filter` interface at the top of the file:
  ```ts
  export interface Filter {
    column: string
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE' | 'IS NULL' | 'IS NOT NULL'
    value: string
  }
  ```
- Update the `getTableData` params type to include `filters?: Filter[]`

### 2. Update `src/preload/index.ts` to pass filters
- Update the `getTableData` param type to include `filters?` in its type annotation
- The function already passes the full `params` object to `ipcRenderer.invoke`, so no logic change needed — just the type

### 3. Build WHERE clauses in `src/main/index.ts`
- Update the `db:table-data` handler params type to include `filters?: Array<{ column: string; operator: string; value: string }>`
- Extract filters from params
- Build a WHERE fragment using postgres.js. The approach:
  - For each filter, validate the operator against an allowlist
  - For `IS NULL` / `IS NOT NULL`, no value parameter is needed
  - For `LIKE` / `NOT LIKE`, use the value as-is (user provides `%` wildcards)
  - For all other operators, pass the value as a parameter
  - Combine multiple filters with `AND`
- Use `sql.unsafe()` is NOT acceptable. Instead, use postgres.js dynamic query building:
  ```ts
  // postgres.js supports dynamic fragments via sql`...`
  // Build each condition and combine them

  const allowedOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL']

  function buildWhereClause(sql, filters) {
    if (!filters || filters.length === 0) return sql``

    const conditions = filters.map(f => {
      if (!allowedOperators.includes(f.operator)) return null

      if (f.operator === 'IS NULL') return sql`${sql(f.column)} IS NULL`
      if (f.operator === 'IS NOT NULL') return sql`${sql(f.column)} IS NOT NULL`
      if (f.operator === '=') return sql`${sql(f.column)} = ${f.value}`
      if (f.operator === '!=') return sql`${sql(f.column)} != ${f.value}`
      if (f.operator === '>') return sql`${sql(f.column)} > ${f.value}`
      if (f.operator === '<') return sql`${sql(f.column)} < ${f.value}`
      if (f.operator === '>=') return sql`${sql(f.column)} >= ${f.value}`
      if (f.operator === '<=') return sql`${sql(f.column)} <= ${f.value}`
      if (f.operator === 'LIKE') return sql`${sql(f.column)} LIKE ${f.value}`
      if (f.operator === 'NOT LIKE') return sql`${sql(f.column)} NOT LIKE ${f.value}`
      return null
    }).filter(Boolean)

    if (conditions.length === 0) return sql``

    // Combine with AND: postgres.js doesn't have a built-in "join" for fragments,
    // so we reduce them manually
    let combined = conditions[0]
    for (let i = 1; i < conditions.length; i++) {
      combined = sql`${combined} AND ${conditions[i]}`
    }
    return sql`WHERE ${combined}`
  }
  ```
- Apply the WHERE clause to BOTH the count query and the data query:
  ```ts
  const where = buildWhereClause(sql, filters)

  const countResult = await sql`
    SELECT count(*)::int as total_count
    FROM ${sql(schema)}.${sql(table)}
    ${where}
  `

  // Similarly for the data query (with/without sort)
  ```

### 4. Add filter bar UI to `src/renderer/src/components/grid/TableView.svelte`
- Add filter state:
  ```ts
  interface Filter {
    column: string
    operator: string
    value: string
  }
  let filters = $state<Filter[]>([])
  let showFilters = $state(false)
  ```
- Add filter management functions:
  - `addFilter()` — pushes a new filter with defaults (first column, '=', empty value)
  - `removeFilter(index)` — removes filter at index
  - `updateFilter(index, partial)` — updates a filter's column/operator/value
  - `applyFilters()` — called when filters change; resets page to 1, pins tab, triggers fetchData
  - `clearFilters()` — removes all filters
- Pass `filters` to `fetchData()` by including them in the `getTableData` call
- Track `filters` in the `$effect` that refetches data (serialize to JSON string for stable comparison)
- Reset filters when schema/table changes
- Add to the toolbar: a "Filter" toggle button (like the existing "Refresh" button) with a badge showing active filter count
- Render the filter bar between the toolbar and error banner when `showFilters` is true:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ [table icon] public.users   123 rows    [Filter ▾] [Refresh] │  <- toolbar
  ├─────────────────────────────────────────────────────┤
  │ [column ▾] [operator ▾] [value input] [× remove]   │  <- filter row 1
  │ [column ▾] [operator ▾] [value input] [× remove]   │  <- filter row 2
  │ [+ Add filter]                        [Clear all]   │  <- actions
  ├─────────────────────────────────────────────────────┤
  │ (data grid)                                         │
  ```
- Each filter row contains:
  - Column `<select>` populated from `columns` state
  - Operator `<select>` with options: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `NOT LIKE`, `IS NULL`, `IS NOT NULL`
  - Value `<input>` (hidden when operator is `IS NULL` or `IS NOT NULL`)
  - Remove button (small `x`)
- "Add filter" button at the bottom of the filter list
- Style using existing theme classes: `bg-surface-secondary`, `border-border-primary`, `text-text-secondary`, etc.
- Inputs/selects styled with: `bg-surface-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent`
- Filters auto-apply on change (debounce value input ~400ms to avoid excessive queries while typing)

### 5. Validate the implementation
- Run the dev server and open a table from the sidebar
- Toggle the filter bar, add a filter, verify the data grid updates
- Add multiple filters and confirm AND logic
- Test `IS NULL` / `IS NOT NULL` operators (value input should hide)
- Test `LIKE` with `%` wildcards
- Verify pagination shows filtered count
- Switch tables and confirm filters reset
- Test with invalid/empty values to ensure no crashes

## Testing Strategy
- Manual testing: open a table, add filters with various operators, verify correct rows returned
- Edge cases:
  - Empty value string: should return no rows for `=` (or all rows if column has empty strings)
  - `IS NULL` with no value: should work correctly
  - `LIKE` with `%pattern%`: should match substring
  - Multiple filters on same column: should AND them
  - Switching tables: filters should reset
  - No filters: should behave exactly as before (no regression)
- SQL injection: try entering `'; DROP TABLE --` as a value — postgres.js parameterization should handle it safely

## Acceptance Criteria
- [ ] Filter button visible in TableView toolbar with active filter count badge
- [ ] Clicking Filter toggles the filter bar
- [ ] Users can add multiple filter rows with column/operator/value
- [ ] `IS NULL` and `IS NOT NULL` operators hide the value input
- [ ] Filters are applied server-side as parameterized WHERE clauses
- [ ] Pagination reflects the filtered row count
- [ ] Page resets to 1 when filters change
- [ ] Filters reset when switching to a different table
- [ ] No SQL injection possible (values are parameterized)
- [ ] Existing sort + pagination functionality is unaffected

## Validation Commands
Execute these commands to validate the task is complete:
- `cd /Users/lyubomir.velikov/Development/sql-client && npx tsc --noEmit` - TypeScript compiles without errors
- `cd /Users/lyubomir.velikov/Development/sql-client && npm run build` - Full build succeeds (or the project's build command)

## Notes
- postgres.js uses tagged template literals for parameterized queries. `sql(columnName)` is used for identifiers (column/table names), while `${value}` in the template is automatically parameterized. This is already the pattern used for sort column names in the existing code.
- The `columnTypes` map already exists in TableView and could be used in the future to show type-appropriate operators (e.g., hide `LIKE` for numeric columns), but this is not required for the initial implementation.
- No new dependencies needed.

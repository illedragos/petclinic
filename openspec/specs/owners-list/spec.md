# owners-list Specification

## Purpose

Defines the server-driven Owners list capability: a paginated `GET /api/owners` endpoint with server-side search across all visible columns, a server-built deterministic sort chain, and query-parameter validation; plus the Owners list screen behaviour (server-driven paging/sort/search, URL-encoded list state, debounced search, and loading UX).

## Requirements

### Requirement: Paginated owners list response

`GET /api/owners` SHALL return a paginated envelope `OwnerPageDto` with fields `content` (array of `OwnerDto`), `totalElements`, `totalPages`, `number` (the 0-based index of the returned page), and `size` (the requested page size). The endpoint SHALL NOT return a bare array. Each owner in `content` SHALL carry its full `pets` (with type and visits) exactly as the pre-existing single-owner projection does.

#### Scenario: Default page when no params supplied

- **WHEN** a client issues `GET /api/owners` with no query parameters
- **THEN** the response is an `OwnerPageDto` with `number` = 0 and `size` = 10
- **AND** `content` holds at most 10 owners
- **AND** `totalElements` is the total count of owners matching the (empty) filter
- **AND** `totalPages` = ceil(`totalElements` / `size`)

#### Scenario: Requested page and size are honoured

- **WHEN** a client issues `GET /api/owners?page=2&size=5`
- **THEN** `number` = 2 and `size` = 5
- **AND** `content` holds the owners at offset 10..14 of the ordered result set
- **AND** `content` length is at most 5

#### Scenario: No unpaged mode

- **WHEN** a client issues `GET /api/owners` expecting every owner in one response
- **THEN** the response is still a single page bounded by the default `size` (10)
- **AND** because `size` is capped at 100 (see "Query parameter validation"), there is no parameter combination that returns all owners unbounded in one page

### Requirement: Server-side search across all visible columns

`GET /api/owners` SHALL accept a `?q=` parameter that filters owners server-side. The term SHALL be split on whitespace into tokens; an owner SHALL match only if EVERY token matches. A token matches when it is a case-insensitive substring ("contains") of any of the owner's `firstName`, `lastName`, `address`, `city`, `telephone`, OR of any of the owner's pet names. An empty or whitespace-only `q` SHALL match every owner. The behaviour SHALL be identical to the e2e `filterByTerm` oracle. The legacy `?lastName=` prefix filter SHALL be removed.

#### Scenario: Single token matches across columns

- **WHEN** a client issues `GET /api/owners?q=madi` and an owner has city "Madison"
- **THEN** that owner appears in `content` (subject to paging)
- **AND** `totalElements` counts every owner whose first/last name, address, city, telephone, or a pet name contains "madi" (case-insensitive)

#### Scenario: Every token must match somewhere

- **WHEN** a client issues `GET /api/owners?q=franklin madison`
- **THEN** only owners whose combined visible text (including pet names) contains BOTH "franklin" AND "madison" (case-insensitive, in any column) are counted and returned

#### Scenario: Token matches a pet name

- **WHEN** a client issues `GET /api/owners?q=leo` and some owner has a pet named "Leo"
- **THEN** that owner is matched
- **AND** the owner is counted exactly once regardless of how many pets it has

#### Scenario: Empty term returns all owners

- **WHEN** a client issues `GET /api/owners?q=` or omits `q`
- **THEN** every owner matches the filter (subject to paging)

### Requirement: Server-built sort chain

`GET /api/owners` SHALL accept a `?sort=<column>,<dir>` parameter where `<column>` is one of `name`, `address`, `city`, `telephone` and `<dir>` is `asc` or `desc`. The server SHALL expand the single client column into a deterministic multi-column ORDER BY, always ending with `id ASC` as the final tiebreaker. The direction SHALL apply to the leading column; tiebreaker columns SHALL remain ascending. The `pets` column SHALL NOT be sortable.

#### Scenario: Name expands to lastName, firstName, id

- **WHEN** a client issues `GET /api/owners?sort=name,asc`
- **THEN** owners are ordered by `lastName ASC, firstName ASC, id ASC`

#### Scenario: Address expands with name tiebreakers

- **WHEN** a client issues `GET /api/owners?sort=address,desc`
- **THEN** owners are ordered by `address DESC, lastName ASC, firstName ASC, id ASC`

#### Scenario: City expands with name tiebreakers

- **WHEN** a client issues `GET /api/owners?sort=city,asc`
- **THEN** owners are ordered by `city ASC, lastName ASC, firstName ASC, id ASC`

#### Scenario: Telephone is sortable

- **WHEN** a client issues `GET /api/owners?sort=telephone,asc`
- **THEN** owners are ordered by `telephone ASC, lastName ASC, firstName ASC, id ASC`

#### Scenario: id is always the final tiebreaker

- **WHEN** two owners share the same leading sort value (e.g. identical lastName and firstName)
- **THEN** their relative order is determined by `id ASC`
- **AND** the order is stable across page boundaries

#### Scenario: Pets is not a sortable column

- **WHEN** a client requests `GET /api/owners?sort=pets,asc`
- **THEN** the request is rejected with 400 (pets is not in the sortable allowlist)
- **AND** no ambiguous collection-based ordering is ever produced

#### Scenario: Default sort when none is supplied

- **WHEN** a client issues `GET /api/owners` with no `sort` param
- **THEN** owners are ordered by the Name chain `lastName ASC, firstName ASC, id ASC`
- **AND** the list is never returned in an undefined/unsorted order

### Requirement: Pagination counts owners, not joined rows

When the result set is hydrated with each owner's pets (and pet types/visits) via joins, a page SHALL contain exactly `size` owners (or fewer on the last page) regardless of how many pets each owner has. `totalElements` SHALL count owners, not joined rows.

#### Scenario: Owners with many pets do not shrink the page

- **WHEN** `GET /api/owners?size=10` is requested and several owners have multiple pets each
- **THEN** `content` holds 10 distinct owners (assuming at least 10 match)
- **AND** each owner's `pets` are fully populated
- **AND** `totalElements` equals the number of matching owners, not the number of owner-pet rows

### Requirement: Query parameter validation

`GET /api/owners` SHALL validate its query parameters and reject invalid input with HTTP 400 (RFC-7807 ProblemDetail), rather than coercing it into an unbounded or failing query. `page` MUST be an integer `>= 0`. `size` MUST be an integer in `[1, 100]`. `sort`, when present, MUST match one of the sortable columns (`name`, `address`, `city`, `telephone`) paired with a direction (`asc`/`desc`); `pets`, unknown columns, and unknown directions are invalid. `q` is an optional free-text string.

#### Scenario: size=0 is rejected

- **WHEN** a client issues `GET /api/owners?size=0`
- **THEN** the response is 400
- **AND** the server never executes a query with the LIMIT dropped (no accidental full-table return)

#### Scenario: size above the cap is rejected

- **WHEN** a client issues `GET /api/owners?size=1000000`
- **THEN** the response is 400 (size exceeds the maximum of 100)

#### Scenario: negative page is rejected

- **WHEN** a client issues `GET /api/owners?page=-1`
- **THEN** the response is 400
- **AND** the server never issues a query with a negative OFFSET

#### Scenario: non-integer page or size is rejected

- **WHEN** a client issues `GET /api/owners?page=abc` or `GET /api/owners?size=2.5`
- **THEN** the response is 400

#### Scenario: malformed sort is rejected

- **WHEN** a client issues `GET /api/owners?sort=name,sideways` or `GET /api/owners?sort=unknown,asc`
- **THEN** the response is 400

#### Scenario: valid params within bounds are accepted

- **WHEN** a client issues `GET /api/owners?page=0&size=20&sort=city,desc&q=ma`
- **THEN** the request succeeds (200) and is processed with those values

### Requirement: Owners list screen is fully server-driven

The Owners list screen SHALL request a single page from the server for the current search term, page index, page size, and sort, and SHALL NOT filter, sort, or paginate client-side. The page size selector SHALL offer 5, 10, and 20, defaulting to 10.

#### Scenario: Changing page requests the next page from the server

- **WHEN** the user clicks the paginator "next page" control
- **THEN** the frontend issues a new `GET /api/owners` with the incremented `page`
- **AND** the table renders only that page's owners

#### Scenario: Page size selector offers 5/10/20 defaulting to 10

- **WHEN** the Owners screen first loads
- **THEN** the page size is 10
- **AND** the selector allows choosing 5, 10, or 20

### Requirement: Name column shows "Lastname, Firstname"

The Name column SHALL render each owner as "Lastname, Firstname". Sorting on the Name column SHALL order by `lastName, firstName, id`.

#### Scenario: Name cell rendering

- **WHEN** an owner has firstName "George" and lastName "Franklin"
- **THEN** the Name cell displays "Franklin, George"

#### Scenario: Name sort matches display order

- **WHEN** the user sorts by the Name column ascending
- **THEN** rows are ordered by surname then first name (matching the displayed "Lastname, Firstname" order)

### Requirement: Single-column sort toggle

The list SHALL support single-column sorting only. Clicking a new column header SHALL sort by it ascending. Clicking the currently active column SHALL flip its direction ascending↔descending. The sort SHALL never clear to an unsorted state.

#### Scenario: Click a new column sorts ascending

- **WHEN** the City column is not the active sort and the user clicks its header
- **THEN** the list sorts by City ascending

#### Scenario: Click the active column flips direction

- **WHEN** City is the active sort ascending and the user clicks its header
- **THEN** the list sorts by City descending
- **AND** clicking again returns to City ascending (never to "no sort")

#### Scenario: Fresh load defaults to Name ascending

- **WHEN** the Owners screen loads with no `sort` in the URL
- **THEN** the Name column is the active sort, ascending, and its header shows the active ascending indicator
- **AND** the table is never shown without an active sorted column

### Requirement: Search term, page, size, and sort live in the URL

The current search term `q`, `page`, `size`, and `sort` SHALL all be reflected in the URL query string so the view is bookmarkable, shareable, and back-button friendly. Changing the search term, page size, or sort SHALL reset the page index to the first page (0).

#### Scenario: Deep link restores list state including the search term

- **WHEN** the user opens a URL carrying `q`, `page`, `size`, and `sort` query params
- **THEN** the list loads that exact search term, page, size, and sort
- **AND** the search input shows the term from the URL

#### Scenario: Back button restores the previous list state

- **WHEN** the user changes sort and then presses the browser back button
- **THEN** the list returns to the previous `q`/sort/page/size state encoded in the URL

#### Scenario: Back button restores a previous search term

- **WHEN** the user types a search term (navigating the URL) and then presses the browser back button
- **THEN** the search input and results return to the prior term

#### Scenario: Filter, size, or sort change snaps to page 1

- **WHEN** the user edits the search term, changes the page size, or changes the sort while not on the first page
- **THEN** the page index resets to 0 before fetching

### Requirement: Loading UX keeps prior rows visible

While a list fetch is in flight, the previously rendered rows SHALL remain visible but dimmed, with a spinner overlay, rather than being cleared.

#### Scenario: Spinner overlay during fetch

- **WHEN** a new page/sort/search fetch is in progress
- **THEN** the existing rows stay visible and dimmed
- **AND** a spinner overlay is shown until the new page arrives

### Requirement: Search input is debounced

Because search now executes server-side, the list SHALL debounce the search input (~300 ms) so that a burst of keystrokes results in a single request for the final term, not one request per keystroke.

#### Scenario: Rapid typing issues one request

- **WHEN** the user types several characters in quick succession
- **THEN** the frontend waits for the input to settle (~300 ms) before issuing a single `GET /api/owners` for the final term
- **AND** intermediate keystrokes do not each trigger their own request

#### Scenario: Settled term triggers exactly one fetch

- **WHEN** the user stops typing
- **THEN** exactly one search request is issued for the current term, resetting to page 0

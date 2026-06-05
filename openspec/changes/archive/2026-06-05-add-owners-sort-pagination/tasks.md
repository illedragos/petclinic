## 1. Backend — response envelope & DTO

- [x] 1.1 Add `test/owner.e2e-spec.ts` cases (RED) asserting `GET /api/owners` returns an `OwnerPageDto` envelope (`content`, `totalElements`, `totalPages`, `number`, `size`) with defaults `number=0`, `size=10`, and that `content` owners carry full `pets`. Confirm they fail.
- [x] 1.2 Add a concrete hand-written `OwnerPageDto` in `src/owners/dto/` (`content: OwnerDto[]`, `totalElements`, `totalPages`, `number` 0-based, `size`) with `@nestjs/swagger` annotations. No generic `PageDto<T>`.
- [x] 1.3 Change `listOwners` to return `OwnerPageDto` (page 0 / size 10 defaults, no unpaged mode) so 1.1 goes GREEN.

## 2. Backend — query-params validation DTO

- [x] 2.1 Add e2e cases (RED) for invalid params returning 400 ProblemDetail: `size=0`, `size=1000000` (over cap), `page=-1`, `page=abc`, `size=2.5`, `sort=name,sideways`, `sort=pets,asc`, `sort=unknown,asc`; and a valid `page=0&size=20&sort=city,desc&q=ma` returning 200. Confirm the 400 cases fail (currently no validation).
- [x] 2.2 Add `ListOwnersQueryDto` validated by the existing global `ValidationPipe`: `@Type(() => Number) @IsInt() @Min(0) page = 0`; `@Type(() => Number) @IsInt() @Min(1) @Max(100) size = 10`; `@IsOptional() @IsString() q = ''`; `@IsOptional() @Matches(/^(name|address|city|telephone),(asc|desc)$/i) sort`. (Explicit `@Type` is required — `enableImplicitConversion` is off.) Switch the controller to `@Query() query: ListOwnersQueryDto`. Make 2.1 GREEN. This closes the `take(0)`/negative-OFFSET footguns and the uncapped-`size` unpaged hole.

## 3. Backend — search (`?q=`) with full #24 parity

- [x] 3.1 Add e2e cases (RED) for `?q=` parity: whitespace-tokenised, every token must match, case-insensitive "contains" across firstName/lastName/address/city/telephone AND pet names; empty `q` matches all; an owner matching via a pet name is counted exactly once. Use the same fixtures the e2e `filterByTerm` oracle uses.
- [x] 3.2 Implement the `?q=` filter in the controller query: per-token bracket `(lower(col) LIKE :t OR … OR EXISTS(pet-name subquery))` AND-ed across tokens; escape LIKE wildcards in tokens. Remove the old `?lastName=` prefix param. Make 3.1 GREEN.

## 4. Backend — sort chain & default sort

- [x] 4.1 Add a controller-level Jest unit test (RED) pinning sort-chain expansion: `name→lastName,firstName,id`; `address→address,lastName,firstName,id`; `city→city,…`; `telephone→telephone,…`; direction applies to the leading column, tiebreakers stay ASC, `id ASC` always last; **no `sort` param → defaults to `name,asc`** (D9).
- [x] 4.2 Implement the server-built sort-chain expansion helper (default `name,asc`) and wire `?sort=<column>,<dir>` into the query `orderBy`. Make 4.1 GREEN. (Invalid sort columns are rejected upstream by the DTO from task 2.)

## 5. Backend — pagination correctness

- [x] 5.1 Add a test (RED) asserting a page holds N distinct owners even when owners have many pets each, and `totalElements` counts owners (not joined rows). Seed/fixture owners with multiple pets.
- [x] 5.2 Build the single `getManyAndCount` query: `leftJoinAndSelect` pets/type/visits + the `?q=` WHERE + sort chain + `skip(page*size).take(size)`; map to `OwnerPageDto`. Make 5.1 GREEN. (Fallback only if TypeORM miscounts: explicit two-query IDs→hydrate→reorder.)

## 6. Backend — OpenAPI guardrail

- [x] 6.1 Regenerate `openapi.yaml` and the frontend `src/app/generated/api-types.ts` from the updated Swagger decorators (`OwnerPageDto` + the query params).
- [x] 6.2 Run the OpenAPI sync guardrail (`test/guardrails/schema-sync.spec.ts`) and the full backend `npm test` + `npm run test:e2e`; confirm green.

## 7. Frontend — service & data model

- [x] 7.1 Update `owner.service.ts` to call the paginated endpoint with `q`, `page`, `size`, `sort`, returning `OwnerPage` (existing `owner-page.ts` already matches the envelope). Remove dead `searchOwners()` and its spec reference.
- [x] 7.2 Update/trim `owner.service.spec.ts` to the new paginated signature.

## 8. Frontend — Owners list UI

- [x] 8.1 Rebuild `owner-list.component.ts` to be fully server-driven: hold `q`/`page`/`size`/`sort`, fetch one page, no client-side filter/sort/paging. Reset page to 0 when `q`, `size`, or `sort` changes. Default sort = Name ascending on fresh load (D9).
- [x] 8.2 Update `owner-list.component.html`: render Name as "Lastname, Firstname"; add `matSort` to the header (sortable: Name, Address, City, Telephone; Pets not sortable) with single-column toggle (new→asc, active→flip, never clears) and Name ascending active by default; add `<mat-paginator>` (page sizes 5/10/20, default 10) below the existing Bootstrap table.
- [x] 8.3 Wire `q`, `page`, `size`, `sort` into the URL query string (bookmarkable, back-button friendly, search term shareable); restore all four from query params on load.
- [x] 8.4 Debounce the search input (~300 ms) so a burst of keystrokes issues a single request for the final term; each search resets to page 0.
- [x] 8.5 Add the loading UX: keep prior rows visible but dimmed with a spinner overlay during fetch (component flag + CSS in `owner-list.component.css`).
- [x] 8.6 Ensure the required Angular Material modules (sort, paginator, progress-spinner) are imported in `owners.module.ts`; `npm run build` is clean.

## 9. E2E (Playwright) — rework for pagination

- [x] 9.1 Update `tests/support/api-client.ts`: replace the "fetch all" helper with one that **pages through** (fetch page 0, read `totalPages`, fetch the rest with `size<=100`) — do not rely on an uncapped `size`. Keep `filterByTerm`/`visibleText` as the oracle; remove dead `fetchOwnersByPrefix`/`choosePrefixFrom`/`extractLastName`.
- [x] 9.2 Update `tests/pages/OwnersPage.ts` for the "Lastname, Firstname" cell, paginator controls, sort headers, and current-page reads.
- [x] 9.3 Rewrite `tests/owners.spec.ts` to cover: search (`q`) parity incl. pet names + debounced typing, sort (each sortable column + direction toggle + default Name-asc on load), paginate (next/prev, page size 5/10/20), deep-link via URL params (incl. `q`), and back-button state restore (incl. the search term).
- [x] 9.4 Run the e2e suite against running backend+frontend; confirm green. (CI-only — not added to pre-commit.)

## 10. Final verification

- [x] 10.1 Run all suites: backend unit + e2e (incl. the 400-on-bad-params and page-holds-N-owners tests), frontend build, Playwright e2e, and the OpenAPI guardrail — all green.
- [x] 10.2 Manually verify the Owners screen: debounced search, sort toggle + default Name-asc, page size 5/10/20, deep link (incl. `q`), back button, dimmed-rows-with-spinner loading.

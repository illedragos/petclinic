## 1. Backend — response envelope & DTO

- [ ] 1.1 Add `test/owner.e2e-spec.ts` cases (RED) asserting `GET /api/owners` returns an `OwnerPageDto` envelope (`content`, `totalElements`, `totalPages`, `number`, `size`) with defaults `number=0`, `size=10`, and that `content` owners carry full `pets`. Confirm they fail.
- [ ] 1.2 Add a concrete hand-written `OwnerPageDto` in `src/owners/dto/` (`content: OwnerDto[]`, `totalElements`, `totalPages`, `number` 0-based, `size`) with `@nestjs/swagger` annotations. No generic `PageDto<T>`.
- [ ] 1.3 Change `listOwners` to return `OwnerPageDto` (page 0 / size 10 defaults, no unpaged mode) so 1.1 goes GREEN.

## 2. Backend — search (`?q=`) with full #24 parity

- [ ] 2.1 Add e2e cases (RED) for `?q=` parity: whitespace-tokenised, every token must match, case-insensitive "contains" across firstName/lastName/address/city/telephone AND pet names; empty `q` matches all; an owner matching via a pet name is counted exactly once. Use the same fixtures the e2e `filterByTerm` oracle uses.
- [ ] 2.2 Implement the `?q=` filter in the controller query: per-token bracket `(lower(col) LIKE :t OR … OR EXISTS(pet-name subquery))` AND-ed across tokens; escape LIKE wildcards in tokens. Remove the `?lastName=` prefix param. Make 2.1 GREEN.

## 3. Backend — sort chain

- [ ] 3.1 Add a controller-level Jest unit test (RED) pinning sort-chain expansion: `name→lastName,firstName,id`; `address→address,lastName,firstName,id`; `city→city,…`; `telephone→telephone,…`; direction applies to the leading column, tiebreakers stay ASC, `id ASC` always last; `pets`/unknown columns do not sort by collection (reject or default).
- [ ] 3.2 Implement the server-built sort-chain expansion helper and wire `?sort=<column>,<dir>` into the query `orderBy`. Make 3.1 GREEN.

## 4. Backend — pagination correctness

- [ ] 4.1 Add a test (RED) asserting a page holds N distinct owners even when owners have many pets each, and `totalElements` counts owners (not joined rows). Seed/fixture owners with multiple pets.
- [ ] 4.2 Build the single `getManyAndCount` query: `leftJoinAndSelect` pets/type/visits + the `?q=` WHERE + sort chain + `skip(page*size).take(size)`; map to `OwnerPageDto`. Make 4.1 GREEN. (Fallback only if TypeORM miscounts: explicit two-query IDs→hydrate→reorder.)

## 5. Backend — OpenAPI guardrail

- [ ] 5.1 Regenerate `openapi.yaml` and the frontend `src/app/generated/api-types.ts` from the updated Swagger decorators.
- [ ] 5.2 Run the OpenAPI sync guardrail (`test/guardrails/schema-sync.spec.ts`) and the full backend `npm test` + `npm run test:e2e`; confirm green.

## 6. Frontend — service & data model

- [ ] 6.1 Update `owner.service.ts` to call the paginated endpoint with `q`, `page`, `size`, `sort`, returning `OwnerPage` (existing `owner-page.ts` already matches the envelope). Remove dead `searchOwners()` and its spec reference.
- [ ] 6.2 Update/trim `owner.service.spec.ts` to the new paginated signature.

## 7. Frontend — Owners list UI

- [ ] 7.1 Rebuild `owner-list.component.ts` to be fully server-driven: hold `q`/`page`/`size`/`sort`, fetch one page, no client-side filter/sort/paging. Reset page to 0 when `q`, `size`, or `sort` changes.
- [ ] 7.2 Update `owner-list.component.html`: render Name as "Lastname, Firstname"; add `matSort` to the header (sortable: Name, Address, City, Telephone; Pets not sortable) with single-column toggle (new→asc, active→flip, never clears); add `<mat-paginator>` (page sizes 5/10/20, default 10) below the existing Bootstrap table.
- [ ] 7.3 Wire `page`/`size`/`sort` into the URL query string (bookmarkable, back-button friendly); restore state from query params on load.
- [ ] 7.4 Add the loading UX: keep prior rows visible but dimmed with a spinner overlay during fetch (component flag + CSS in `owner-list.component.css`).
- [ ] 7.5 Ensure the required Angular Material modules (sort, paginator, progress-spinner) are imported in `owners.module.ts`; `npm run build` is clean.

## 8. E2E (Playwright) — rework for pagination

- [ ] 8.1 Update `tests/support/api-client.ts`: fetch a full set via explicit large `size`; keep `filterByTerm`/`visibleText` as the oracle; remove dead `fetchOwnersByPrefix`/`choosePrefixFrom`/`extractLastName`.
- [ ] 8.2 Update `tests/pages/OwnersPage.ts` for the "Lastname, Firstname" cell, paginator controls, sort headers, and current-page reads.
- [ ] 8.3 Rewrite `tests/owners.spec.ts` to cover: search (`q`) parity incl. pet names, sort (each sortable column + direction toggle), paginate (next/prev, page size 5/10/20), deep-link via URL params, and back-button state restore.
- [ ] 8.4 Run the e2e suite against running backend+frontend; confirm green. (CI-only — not added to pre-commit.)

## 9. Final verification

- [ ] 9.1 Run all suites: backend unit + e2e, frontend build, Playwright e2e, and the OpenAPI guardrail — all green.
- [ ] 9.2 Manually verify the Owners screen: search, sort toggle, page size 5/10/20, deep link, back button, dimmed-rows-with-spinner loading.

## Context

Issue #25 asks for sorting + pagination on the Owners screen. A maintainer attached a design from a 2026-05-27 grilling session, plus a 2026-06-02 follow-up note. Re-grilling that design against the current codebase surfaced three problems that this document resolves explicitly so the rationale survives:

1. **The design is written in Spring/Java terms** (`Page<OwnerDto>`, `WebMvcTest`, `OwnerTest`, `OwnerSteps`, `Sort`). The only backend in this repo is **NestJS + TypeORM + Postgres** (`petclinic-backend-ts`). Every Spring-ism is translated to its Nest/TypeORM/Jest equivalent below.
2. **The design predates and conflicts with #24** (commit `a284f65`), which shipped *client-side, all-column, case-insensitive "contains"* search. The design assumed a server-side `?lastName=` prefix filter. Server-side pagination makes client-side filtering impossible (the browser only holds one page), so search must move server-side — and to avoid regressing #24, it must move with full fidelity, not as a prefix filter.
3. **The two issue comments contradict each other on the Name column.** Comment 1 (2026-05-27): render "Lastname, Firstname", sort `lastName` first. Comment 2 (2026-06-02, later, flagged "to review with business"): render "Firstname Lastname" (today's behaviour), sort `firstName` first. This is a real fork, not a gap.

Current state worth pinning:
- `GET /api/owners` returns `OwnerDto[]`, eager-loading `pets → type/visits`, ordered by `owner.id ASC` (`owner.controller.ts`).
- The list component loads all owners and filters client-side over all visible columns including pet names (`owner-list.component.ts`); the e2e `api-client.filterByTerm`/`visibleText` mirror that exactly and act as the behavioural oracle.
- The frontend already has `owners/owner-page.ts` scaffolded with the exact Spring 5-field envelope.
- The MCP owner resource (`me://profile`) uses `findOne`, not the list endpoint — unaffected.
- An OpenAPI sync guardrail (`test/guardrails/schema-sync.spec.ts`) fails if `openapi.yaml` / generated `api-types.ts` drift from the Nest Swagger decorators.

## Goals / Non-Goals

**Goals:**
- Server-side search, sort, and pagination for the Owners list, scaling to ~100k owners.
- Preserve the #24 search UX exactly, but executed server-side.
- A stable, bookmarkable list: deterministic ordering and URL-encoded page/size/sort state.
- Keep the existing Bootstrap table; adopt Angular Material only for `matSort` + `mat-paginator`.

**Non-Goals (explicitly out of scope):**
- Fixing the broken `<tr>` inside `<td>` in the pets column.
- Removing `GET /api/owners/count`.
- Case-insensitive *prefix* lastName search (replaced wholesale by `?q=` contains).
- Wiring `api-types.ts` into `OwnerService` beyond what this change needs.
- Persisting page size across sessions.
- A generic, reusable `PageDto<T>` (Vets/Visits pagination is not in scope).

## Decisions

### D1 — Search moves server-side with full #24 parity (`?q=`)
Replace `?lastName=` prefix with `?q=`. Match #24 semantics exactly: split `q` on whitespace into tokens; an owner matches only if **every** token matches somewhere; each token matches case-insensitively as a substring across `firstName`, `lastName`, `address`, `city`, `telephone`, **and pet names**. Pet-name matching uses an `EXISTS` subquery on `pets` so it never multiplies owner rows. The e2e `filterByTerm` helper remains the oracle that backend and frontend must agree with.
- **Why:** Pagination makes client-side filtering see only one page. Anything less than full parity is a visible regression from a feature that shipped days ago.
- **Alternatives considered:** (a) keep `?lastName=` prefix only — regresses #24; (b) scalar columns only, drop pet-name match — smaller query but loses "find owner by pet's name"; (c) keep everything client-side — contradicts the 100k-owner scale rationale.

### D2 — `GET /api/owners` returns `OwnerPageDto`, evolved in place
Concrete hand-written `OwnerPageDto { content: OwnerDto[]; totalElements; totalPages; number; size }`, `number` **0-based**. **BREAKING** change to the endpoint contract; all in-repo consumers updated atomically.
- **Why 0-based:** Spring's `number`, Angular Material's `mat-paginator.pageIndex`, and the scaffolded `owner-page.ts` are all 0-based — zero translation at either boundary.
- **Why concrete, not generic:** A concrete DTO is trivial for `@nestjs/swagger` and the OpenAPI guardrail. A generic `PageDto<T>` needs `@ApiExtraModels` + `getSchemaPath`/`allOf` gymnastics, and nothing else paginates yet (YAGNI).
- **Why in place, not a new endpoint:** single full-stack repo; a parallel array endpoint would be dead weight and a second contract to keep in sync.
- **Alternatives considered:** generic `PageDto<T>`; idiomatic `{ data, total, page, pageSize }` rename (rejected — would force rewriting the already-correct `owner-page.ts` and diverge from the design).

### D3 — Always paginated; no unpaged mode; `size` capped
A bare `GET /api/owners` returns page 0, size 10. There is no "return everything" escape hatch, and the promise is **enforced**: `size` is bounded to `[1, 100]` (see D8). An uncapped `size` (e.g. `?size=1000000`) would silently re-open the unpaged mode this decision exists to kill, so the cap is part of the contract, not a nicety.
- **Why:** an unbounded "give me all" path at 100k owners is exactly what pagination exists to prevent. The e2e oracle, which needs the full set to compute expectations, **pages through** (fetch page 0, read `totalPages`, fetch the rest) rather than requesting one huge `size` — so the test exercises the real paginated contract instead of a hole in it.
- **Alternatives considered:** Spring-style `Pageable.unpaged()` when `page`/`size` are omitted — rejected; reintroduces the unbounded query. Letting `size` be arbitrarily large with the oracle slurping everything — rejected; that *is* unpaged mode wearing a query param.
- **Max value:** 100. Comfortably above the largest UI page size (20) with headroom; small enough that a single page is never a scale problem.

### D4 — Name column: phonebook ("Lastname, Firstname"), sort `lastName, firstName, id`
Resolves the comment-1-vs-comment-2 contradiction in favour of comment 1.
- **Why:** surname-alphabetical is the universal convention for people directories, and rendering "Lastname, Firstname" makes the visible order match the sort intent (you sort by what you read first). The displayed-name change ripples into the e2e name helpers, but those are being rewritten for pagination regardless.
- **Alternatives considered:** keep "Firstname Lastname" + sort first-name-first (comment 2 — internally consistent but unconventional for people lists); keep "Firstname Lastname" but sort by surname (display/sort mismatch — the exact confusion comment 2 warned about).

### D5 — Sortable columns: Name, Address, City, Telephone (not Pets)
The design listed only Name/Address/City; Telephone's omission is treated as an oversight (it is a plain scalar column, and the issue says "any column"). Pets stays unsortable (1→N collection — "sort by pets" is ambiguous). The server expands a single client column+direction into a deterministic chain, always ending in `id ASC` so pagination is stable even with duplicate (lastName, firstName) pairs:
- Name → `lastName, firstName, id`
- Address → `address, lastName, firstName, id`
- City → `city, lastName, firstName, id`
- Telephone → `telephone, lastName, firstName, id`

The chain is **server-built**: the client never sends a multi-column sort. Direction applies to the leading column; the tiebreakers stay ASC. An unsortable or unknown sort column (`pets`, anything not in the allowlist) or a bad direction is **rejected with 400**, not silently defaulted — see D8. (The earlier "rejects it or falls back" hedge is resolved here in favour of reject, for one consistent contract.)

### D6 — Query execution: single `getManyAndCount` builder
One TypeORM `QueryBuilder`: `leftJoinAndSelect` `owner.pets`, `pet.type`, `pet.visits` (hydration for display); `WHERE` built per token as `(lower(col) LIKE :t OR … OR EXISTS(pet-name subquery))` AND-ed across tokens; `orderBy` the server-built sort chain; `skip(page*size).take(size)`; `getManyAndCount()`.
- **Why it's safe:** the usual TypeORM footgun — `LIMIT` counting joined rows instead of root entities — only bites when you sort by or paginate against joined columns. Here the sort chain touches **only owner-root columns**, and the pet match is an `EXISTS` subquery (non-row-multiplying), so TypeORM's automatic distinct-root-id two-query plan paginates by owner correctly.
- **Guard:** a test pins this — a page must hold N *owners* even when those owners have many pets each (page size counts owners, not joined rows). If TypeORM ever regresses this, fall back to the explicit two-query (page IDs → hydrate by `In(ids)` → reorder in memory).
- **Alternative considered:** explicit two-query up front — more predictable SQL but more code; deferred to a fallback because the single-builder plan is provably safe given root-only sort.

### D7 — Tests (Nest/Jest/Playwright, not Spring)
- **Backend unit:** a controller-level Jest test pinning sort-chain expansion (each sortable column → full chain + `id` tiebreaker; unknown/`pets` sort rejected or defaulted).
- **Backend e2e:** extend `test/owner.e2e-spec.ts` for the paginated contract (envelope shape, defaults, `q` parity incl. pet names, the "page holds N owners regardless of pet count" guard).
- **E2E (Playwright):** rewrite `owners.spec.ts`, `OwnersPage.ts`, `api-client.ts` for the paginated model — cover sort, paginate, deep-link (URL state), back-button, and "Lastname, Firstname" rendering. Remove dead `fetchOwnersByPrefix`/`choosePrefixFrom`/`extractLastName`. CI-only (not pre-commit).
- **Frontend:** no Karma specs for the list (brittle, low value).
- All under the project's red-green TDD modifier: failing test first, confirm red, then implement.
- "WebMvcTest" from the design has no equivalent here; the controller-level Jest test is its translation.

### D8 — Validated query-params DTO (closes the unbounded/500 footguns)
The controller takes a single `@Query() ListOwnersQueryDto` validated by the existing global `ValidationPipe` (`transform: true`, `whitelist: true`, `enableImplicitConversion: false`, RFC-7807 factory). Bounds:
- `page`: integer, `>= 0`, default 0.
- `size`: integer, `1 <= size <= 100` (the D3 cap), default 10.
- `q`: optional string, default `''`.
- `sort`: optional string matching `^(name|address|city|telephone),(asc|desc)$` (case-insensitive); anything else → 400.

Because `enableImplicitConversion: false`, `page`/`size` need explicit `@Type(() => Number)` to coerce the string query values before `@IsInt`. Invalid input renders as a 400 ProblemDetail via the existing exception filter — no new error plumbing.
- **Why this is not optional polish:** raw `@Query` here is two real bugs, not just a convention miss. `?size=0` → `take(0)`, which TypeORM treats as falsy and may drop the `LIMIT` entirely → every row returned (another accidental unpaged path). `?page=-1` → `skip(-N)` → negative `OFFSET` → Postgres 500. The DTO bounds make both unreachable, and it restores the repo's class-validator-on-inputs convention.
- **Alternative considered:** clamp out-of-range values silently (e.g. coerce `size=1000`→100, `page=-1`→0) — rejected in favour of 400 for one predictable contract; the frontend only ever sends valid values, so 400 only fires on hand-crafted URLs.

### D9 — Default sort is `name,asc` (keeps "never unsorted" honest)
When no `sort` param is supplied, the server orders by the Name chain (`lastName, firstName, id`) ascending — not by bare `id`. The frontend reflects this on a fresh load (no URL sort): the Name header shows the active ascending arrow.
- **Why:** the UI contract says sort never clears to an unsorted state, yet a fresh load had no defined sort. Defaulting to a *visible* column (Name) means there is always an active, arrow-bearing column — a bare-`id` default would show no active header and contradict that invariant. Name also matches the phonebook display order (D4).

### D10 — Search term `q` is part of URL state, and typing is debounced
`q` joins `page`/`size`/`sort` in the URL query string (bookmarkable, shareable, back-button restores the typed term). Keystrokes are debounced (~300 ms) before issuing the request, and each fetch resets to page 0.
- **Why q in URL:** the original "live in the URL" requirement listed `page`/`size`/`sort` and silently omitted `q`, so a search was neither shareable nor back-button restorable. Putting `q` in the URL is the consistent, expected behaviour.
- **Why debounce (supersedes the earlier "debounce is out of scope" non-goal):** that non-goal made sense for a *client-side* instant filter. Moving search server-side turns every keystroke into an HTTP round-trip; without debounce the previously-instant box becomes chatty and laggy. For a server-backed search box, debounce is effectively mandatory, so it is pulled into scope.

## Risks / Trade-offs

- **TypeORM pagination + collection join miscounts a page** → mitigated by D6's root-only sort + `EXISTS` match and the explicit "page holds N owners" guard test; documented two-query fallback.
- **Search/oracle drift between backend, frontend, and e2e** → the e2e `filterByTerm` stays the single oracle; backend e2e asserts parity against the same fixtures.
- **Breaking `GET /api/owners` contract** → single repo, all consumers updated in one change; MCP confirmed unaffected; OpenAPI regenerated so the guardrail catches any missed drift.
- **Displayed-name change ("Lastname, Firstname")** → updates every e2e name assertion and `getFullNames`; acceptable because the e2e suite is being rewritten anyway.
- **`q` `LIKE '%term%'` is not index-friendly at 100k** → acceptable for this change; trigram/full-text indexing is a later optimisation, not a contract change.
- **Sort by nullable text columns** → Postgres default null-ordering is acceptable; the `id` tiebreaker keeps results deterministic regardless.
- **Malicious/hand-crafted query params** (`size=0` dropping the LIMIT, `page=-1` → negative OFFSET 500, `size=1e6` re-opening unpaged mode, bad `sort`) → closed by the D8 validated DTO with bounds + the D3 `size` cap; a 400-on-bad-params test pins it.

## Migration Plan

1. Backend: add `OwnerPageDto` + `ListOwnersQueryDto` (D8) + Swagger, rework `listOwners` (default sort D9), add sort-chain helper, regenerate `openapi.yaml` + `api-types.ts`, get guardrail green.
2. Frontend: wire `OwnerService` to the paginated endpoint, rebuild `owner-list` with `matSort` + `mat-paginator` + URL state (incl. `q`, D10) + debounced search + "Lastname, Firstname", remove dead `searchOwners()`.
3. E2E: rewrite specs/pages/api-client for the paginated model.
- **Rollback:** revert the change; the endpoint returns to `OwnerDto[]`. No DB migration is involved (no schema change), so rollback is code-only.

## Open Questions

None blocking. Deferred (non-blocking) optimisation: index strategy for `?q=` at production scale (trigram / full-text), to be evaluated separately from this contract change.

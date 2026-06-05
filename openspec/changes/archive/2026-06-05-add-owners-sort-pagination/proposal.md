## Why

The Owners screen loads every owner into the browser and filters/sorts client-side. That works for the seed data but will not scale to production volumes (~100k owners): the payload, the DOM, and the client-side filter all grow unbounded. GitHub issue #25 asks for column sorting and pagination — both of which only make sense server-side at that scale, which in turn forces search to move server-side too (a paginated client cannot filter rows it never received).

## What Changes

- **BREAKING**: `GET /api/owners` stops returning a bare `OwnerDto[]` and returns a paginated envelope `OwnerPageDto` (`content`, `totalElements`, `totalPages`, `number`, `size`; `number` is 0-based). The endpoint evolves **in place** — no parallel endpoint.
- **BREAKING**: the `?lastName=` prefix filter is replaced by a general `?q=` search. New query params: `?q=`, `?page=` (0-based, default 0), `?size=` (default 10), `?sort=<column>,<dir>`. A bare `GET /api/owners` returns page 0, size 10 — there is no "return everything" mode.
- Server-side search (`?q=`) reproduces the existing #24 client-side behaviour with full parity: whitespace-tokenised, every token must match (case-insensitive "contains") across `firstName`, `lastName`, `address`, `city`, `telephone`, **and** pet names.
- Server-side sorting on **Name, Address, City, Telephone**. The client sends one column + direction; the server expands it into a deterministic sort chain ending in `id ASC` (stable pagination). Pets is not sortable.
- Frontend Owners list switches to fully server-driven paging/sorting/search: `mat-paginator` + `matSort` layered onto the existing Bootstrap table, page sizes 5/10/20 (default 10), `page`/`size`/`sort` reflected in the URL query string (bookmarkable, back-button friendly), and the Name column rendered as **"Lastname, Firstname"**.
- The end-to-end suite (`petclinic-ui-test`) is reworked from the "all owners loaded + client-side filter" model to the paginated model; dead pre-#24 helpers are removed.
- `openapi.yaml` and the generated frontend `api-types.ts` are regenerated so the OpenAPI sync guardrail stays green.

## Capabilities

### New Capabilities
- `owners-list`: the behaviour of the Owners list endpoint and screen — server-side search, sorting, and pagination, including the response envelope contract, the sort-chain expansion rules, the search-matching semantics, and the list UI's paging/sort/search/URL-state behaviour.

### Modified Capabilities
<!-- No existing specs in openspec/specs/; nothing to modify. -->

## Impact

- **Backend** (`petclinic-backend-ts`): `src/owners/owner.controller.ts` (`listOwners` query + signature), new `OwnerPageDto` + Swagger annotations, regenerated `openapi.yaml`. Backend tests under `test/` (`owner.e2e-spec.ts`) and a controller-level sort-chain test.
- **Frontend** (`petclinic-frontend`): `owner-list` component + template + CSS, `owner.service.ts`, regenerated `src/app/generated/api-types.ts`; existing `owner-page.ts` already matches the new envelope. Dead `searchOwners()` removed.
- **E2E** (`petclinic-ui-test`): `tests/owners.spec.ts`, `tests/pages/OwnersPage.ts`, `tests/support/api-client.ts` reworked; dead prefix helpers removed.
- **Guardrails**: OpenAPI schema-sync guardrail (`test/guardrails/schema-sync.spec.ts`) requires the regenerated spec + types.
- **Unaffected**: the MCP owner resource (`me://profile`) uses `findOne`, not the list endpoint; `GET /api/owners/count` is retained.

# Owners search over all visible columns (issue #24)

**Issue:** https://github.com/victorrentea/petclinic/issues/24
**Date:** 2026-06-04
**Status:** Approved

## Problem

The Owners list page filters only by a **case-sensitive prefix** on last name
(`GET /api/owners?lastName=`, backend `owner.controller.ts`). Issue #24 asks for
search across **all visible columns**, **case-insensitive**, with **contains**
semantics, based on "the visible textual content shown in the table".

## Decisions

1. **Filter location: client-side.** Filter the already-loaded owners in the
   browser. The page already fetches all owners on init, and this matches the
   issue's "visible textual content shown in the table" wording literally. The
   backend and `OwnerService` are left untouched.
2. **Trigger: live as you type.** Remove the "Find Owner" button; the table
   filters instantly on each keystroke.
3. **Match strategy: all tokens must match.** Split the typed term on whitespace
   into tokens; a row matches when **every** token is a case-insensitive
   substring of that row's combined visible text. Empty term shows all owners.

## Row "visible text"

For each owner, the combined visible text is the rendered content of every
column joined by single spaces, lowercased:

```
firstName + ' ' + lastName + ' ' + address + ' ' + city + ' ' + telephone
          + ' ' + pets.map(p => p.name).join(' ')
```

A row matches the term when, for every whitespace-separated token `t` of the
lowercased term, `combinedText.includes(t)` is true. (Empty/whitespace-only term
yields no tokens → all rows match.)

## Changes

### Frontend component — `owner-list.component.ts`
- Keep the full list in `owners` (loaded once via `getOwners()` in `ngOnInit`).
- Add `filterTerm: string`.
- Add `get filteredOwners(): Owner[]` applying the token match.
- Add a pure helper (e.g. `ownerMatchesTokens(owner, tokens)` /
  `ownerVisibleText(owner)`) so matching is unit-testable in isolation.
- Delete `searchByLastName()`. The component no longer calls
  `ownerService.searchOwners`.

### Frontend template — `owner-list.component.html`
- Relabel "Last name" → "Search"; bind input `[(ngModel)]="filterTerm"`; rename
  input id `#lastName` → `#searchTerm`. Remove the submit button and the
  `#search-owner-form` wrapper (keep the input).
- `*ngFor` iterates `filteredOwners`.
- Show the table once owners are loaded; show a "No owners match …" message when
  `filteredOwners` is empty.

### Unit tests — `owner-list.component.spec.ts`
Replace the two `searchByLastName` specs (red-green TDD) with `filteredOwners` /
helper specs:
- filters by a city substring (cross-column match),
- case-insensitive match,
- multi-token "all must match" (e.g. last name + city),
- empty term shows all owners.
Keep the existing "`getOwners` called on init" spec.

### E2E tests — `owners.spec.ts` + `pages/OwnersPage.ts`
- Rewrite "filters owners by last name prefix" → "filters across visible columns
  (contains, case-insensitive)".
- Page object: replace `searchByLastNamePrefix` with `search(term)` that fills
  the input (no button click); update locators for the renamed input and removed
  button.
- Expected results computed client-side from the fetched owners (the prefix API
  helper is no longer used for this test).

## Out of scope
- Backend query / `OwnerService` changes.
- Pagination.

## Definition of done
- Unit tests (`npm run test-headless` in `petclinic-frontend/`) pass.
- E2E test (`npm test` in `petclinic-ui-test/`, apps running) passes.
- Manual check: typing in the search box filters the table live across columns,
  case-insensitively, with multi-token "all must match".

import { test, expect } from '@playwright/test';
import { OwnersPage } from './pages/OwnersPage';
import { ApiClient, OwnerDto } from './support/api-client';

const DEFAULT_SIZE = 10;

test.describe('Owners Page (server-side search, sort, pagination)', () => {
  let apiClient: ApiClient;
  let allOwners: OwnerDto[];

  test.beforeAll(async () => {
    apiClient = new ApiClient();
    allOwners = await apiClient.fetchAllOwners();
    expect(allOwners.length).toBeGreaterThan(DEFAULT_SIZE); // need >1 page for these tests
  });

  test('initial load shows page 0, default Name-ascending sort', async ({ page }) => {
    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    const expected = await apiClient.fetchOwnersPage({ page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));

    // Name column is the active ascending sort on a fresh load (D9).
    expect(await ownersPage.getAriaSort('name')).toBe('ascending');
    expect(await ownersPage.getRangeLabel()).toContain(`of ${expected.totalElements}`);
  });

  test('search (?q=) matches case-insensitive contains across columns', async ({ page }) => {
    const term = ApiClient.chooseContainsTermFrom(allOwners);

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();
    await ownersPage.search(term);

    const expected = await apiClient.fetchOwnersPage({ q: term, page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    // The server count must equal the oracle's full-set filter count.
    expect(expected.totalElements).toBe(ApiClient.filterByTerm(allOwners, term).length);
  });

  test('search requires every whitespace token to match', async ({ page }) => {
    // Build a two-token term (lastName + city) from one owner spanning two columns.
    const source = allOwners.find((o) => o.lastName?.trim() && o.city?.trim())!;
    const term = `${source.lastName!.trim()} ${source.city!.trim().split(/\s+/)[0]}`.toLowerCase();

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();
    await ownersPage.search(term);

    const expected = await apiClient.fetchOwnersPage({ q: term, page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    expect(expected.totalElements).toBeGreaterThan(0);
  });

  test('typing is debounced into a single request', async ({ page }) => {
    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    // Count search requests (those carrying ?q=) fired during a fast burst.
    let searchRequests = 0;
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (req.method() === 'GET' && u.pathname.endsWith('/api/owners') && u.searchParams.has('q')) {
        searchRequests += 1;
      }
    });

    const term = 'london';
    await ownersPage.typeSearch(term);

    const expected = await apiClient.fetchOwnersPage({ q: term, page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));

    // A 6-char burst must not produce 6 requests — debounce coalesces them.
    expect(searchRequests).toBeLessThan(term.length);
    expect(searchRequests).toBeGreaterThanOrEqual(1);
  });

  test('sorting by a column toggles ascending then descending', async ({ page }) => {
    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    // Click City -> ascending.
    await ownersPage.clickSort('city');
    let expected = await apiClient.fetchOwnersPage({ sort: 'city,asc', page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    expect(await ownersPage.getAriaSort('city')).toBe('ascending');
    expect(ownersPage.urlParams().get('sort')).toBe('city,asc');

    // Click City again -> descending (toggle, never clears).
    await ownersPage.clickSort('city');
    expected = await apiClient.fetchOwnersPage({ sort: 'city,desc', page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    expect(await ownersPage.getAriaSort('city')).toBe('descending');
    expect(ownersPage.urlParams().get('sort')).toBe('city,desc');
  });

  test('pagination: next page, and page-size change snaps to page 0', async ({ page }) => {
    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    // Next page -> server page 1.
    await ownersPage.nextPage();
    let expected = await apiClient.fetchOwnersPage({ page: 1, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    expect(ownersPage.urlParams().get('page')).toBe('1');

    // Change page size to 5 -> snaps back to page 0.
    await ownersPage.setPageSize(5);
    expected = await apiClient.fetchOwnersPage({ page: 0, size: 5 });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));
    expect(ownersPage.urlParams().get('size')).toBe('5');
    expect(ownersPage.urlParams().get('page')).toBe('0');
    expect(await ownersPage.getRangeLabel()).toContain(`of ${expected.totalElements}`);
  });

  test('deep link restores q, sort, page and size from the URL', async ({ page }) => {
    const term = ApiClient.chooseContainsTermFrom(allOwners);
    const ownersPage = new OwnersPage(page);
    await ownersPage.open(`?q=${encodeURIComponent(term)}&sort=city,desc&size=5&page=0`);

    const expected = await apiClient.fetchOwnersPage({ q: term, sort: 'city,desc', size: 5, page: 0 });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expected.content));

    await expect(ownersPage.searchInput).toHaveValue(term);
    expect(await ownersPage.getAriaSort('city')).toBe('descending');
  });

  test('back button restores the previous search term', async ({ page }) => {
    const ownersPage = new OwnersPage(page);
    const termA = ApiClient.chooseContainsTermFrom(allOwners);

    await ownersPage.open(`?q=${encodeURIComponent(termA)}`);
    const expectedA = await apiClient.fetchOwnersPage({ q: termA, page: 0, size: DEFAULT_SIZE });
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expectedA.content));

    // Change the term, then go back.
    await ownersPage.search('zzz-no-such-owner');
    await ownersPage.expectNames([]); // no matches

    await page.goBack();
    await expect(ownersPage.searchInput).toHaveValue(termA);
    await ownersPage.expectNames(ApiClient.getPhonebookNames(expectedA.content));
  });
});

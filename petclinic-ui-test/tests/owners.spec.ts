import { test, expect } from '@playwright/test';
import { OwnersPage } from './pages/OwnersPage';
import { ApiClient } from './support/api-client';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Owners Page', () => {
  let apiClient: ApiClient;
  let screenshotDir: string;

  test.beforeAll(() => {
    apiClient = new ApiClient();
    screenshotDir = path.join(__dirname, '..', 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture screenshot after each test
    const sanitizedTitle = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(screenshotDir, `${sanitizedTitle}_${timestamp}.png`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
  });

  test('shows all owners on initial load', async ({ page }) => {
    const ownersPage = new OwnersPage(page);

    // Fetch expected owners from API
    const expectedOwners = await apiClient.fetchOwners();
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);

    // Open the owners page
    await ownersPage.open();

    // Wait for the expected number of owners
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    // Get actual owner names from the page
    const actualFullNames = await ownersPage.getOwnerFullNames();

    // Assert that all expected owners are displayed
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });

  test('filters across visible columns (case-insensitive contains)', async ({ page }) => {
    // Derive an interior, lowercase substring of some owner's city: a 'contains'
    // term on a column other than last name, so it would not have matched the old
    // prefix-on-last-name search.
    const allOwners = await apiClient.fetchOwners();
    const term = ApiClient.chooseContainsTermFrom(allOwners);

    // Expected results computed client-side, mirroring the frontend filter.
    const expectedOwners = ApiClient.filterByTerm(allOwners, term);
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    await ownersPage.search(term);
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    const actualFullNames = await ownersPage.getOwnerFullNames();

    expect(actualFullNames.length).toBeGreaterThan(0);
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });

  test('requires every whitespace-separated token to match', async ({ page }) => {
    const allOwners = await apiClient.fetchOwners();

    // Build a two-token term from a single owner's last name + city, so that
    // owner matches both tokens while the term spans two different columns.
    const source = allOwners.find(o => o.lastName?.trim() && o.city?.trim());
    expect(source).toBeTruthy();
    const term = `${source!.lastName!.trim()} ${source!.city!.trim().split(/\s+/)[0]}`.toLowerCase();

    const expectedOwners = ApiClient.filterByTerm(allOwners, term);
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    await ownersPage.search(term);
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    const actualFullNames = await ownersPage.getOwnerFullNames();

    expect(actualFullNames.length).toBeGreaterThan(0);
    expect(actualFullNames).toContain(`${source!.firstName} ${source!.lastName}`.trim());
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });
});

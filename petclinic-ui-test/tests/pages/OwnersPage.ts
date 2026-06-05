import { Page, Locator, expect } from '@playwright/test';

/** Page object for the paginated / sortable / searchable Owners list. */
export class OwnersPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;
  readonly nameCells: Locator;
  readonly ownersTable: Locator;
  readonly paginator: Locator;
  readonly nextButton: Locator;
  readonly prevButton: Locator;
  readonly rangeLabel: Locator;
  readonly pageSizeSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h2:has-text("Owners")');
    this.searchInput = page.locator('#searchTerm');
    this.nameCells = page.locator('#ownersTable td.ownerFullName');
    this.ownersTable = page.locator('#ownersTable');
    this.paginator = page.locator('#ownersPaginator');
    this.nextButton = this.paginator.locator('button[aria-label="Next page"]');
    this.prevButton = this.paginator.locator('button[aria-label="Previous page"]');
    this.rangeLabel = this.paginator.locator('.mat-mdc-paginator-range-label');
    this.pageSizeSelect = this.paginator.locator('mat-select');
  }

  /** Opens /owners, optionally with a raw query string (e.g. "?sort=city,desc&page=1"). */
  async open(query = ''): Promise<void> {
    await this.page.goto(`/owners${query}`);
    await this.pageTitle.waitFor({ state: 'visible', timeout: 10000 });
    // Wait until the first page has rendered (table present).
    await this.ownersTable.waitFor({ state: 'visible', timeout: 10000 });
  }

  /** The "Lastname, Firstname" strings currently shown, in row order. */
  async getOwnerNames(): Promise<string[]> {
    const texts = await this.nameCells.allTextContents();
    return texts.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  /** Fills the search box in one shot (debounced before it hits the server). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  /** Types a term character-by-character (to exercise debounce). */
  async typeSearch(term: string): Promise<void> {
    await this.searchInput.click();
    await this.searchInput.fill('');
    await this.searchInput.pressSequentially(term, { delay: 20 });
  }

  /** Clicks a sortable column header by its sort key (name/address/city/telephone). */
  async clickSort(column: string): Promise<void> {
    await this.page.locator(`th[mat-sort-header="${column}"]`).click();
  }

  /** Reads aria-sort for a column header: "ascending" | "descending" | "none". */
  async getAriaSort(column: string): Promise<string | null> {
    return this.page.locator(`th[mat-sort-header="${column}"]`).getAttribute('aria-sort');
  }

  async nextPage(): Promise<void> {
    await this.nextButton.click();
  }

  async prevPage(): Promise<void> {
    await this.prevButton.click();
  }

  /** Picks a page size from the paginator's "items per page" select. */
  async setPageSize(size: number): Promise<void> {
    await this.pageSizeSelect.click();
    await this.page.getByRole('option', { name: String(size), exact: true }).click();
  }

  async getRangeLabel(): Promise<string> {
    return (await this.rangeLabel.textContent())?.trim() ?? '';
  }

  /** Current URL query params. */
  urlParams(): URLSearchParams {
    return new URL(this.page.url()).searchParams;
  }

  /** Waits until the displayed rows exactly match the expected phonebook names. */
  async expectNames(expected: string[]): Promise<void> {
    await expect(this.nameCells).toHaveText(expected);
  }
}

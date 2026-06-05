import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { finalize } from 'rxjs/operators';
import { Sort, SortDirection } from '@angular/material/sort';
import { PageEvent } from '@angular/material/paginator';

import { OwnerService } from '../owner.service';
import { Owner } from '../owner';

const PAGE_SIZE_OPTIONS = [5, 10, 20];
const DEFAULT_SIZE = 10;
const DEFAULT_SORT = 'name,asc';
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Owners list: fully server-driven search, sort and pagination.
 *
 * The URL query string (`q`, `page`, `size`, `sort`) is the single source of
 * truth — every user action navigates with merged query params, and the
 * resulting queryParams change drives exactly one server fetch. That gives
 * bookmarkable / shareable / back-button-friendly state for free.
 */
@Component({
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.css'],
})
export class OwnerListComponent implements OnInit, OnDestroy {
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  owners: Owner[] = [];
  totalElements = 0;
  loading = false;
  hasLoadedOnce = false;
  errorMessage = '';

  // URL-derived state.
  q = '';
  page = 0;
  size = DEFAULT_SIZE;
  sort = DEFAULT_SORT;

  // Search input model, debounced before it reaches the URL.
  filterTerm = '';

  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private ownerService: OwnerService,
  ) {}

  ngOnInit(): void {
    // Debounced typing -> URL (resetting to the first page).
    this.subs.add(
      this.search$
        .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged())
        .subscribe((term) => this.updateUrl({ q: term || null, page: 0 })),
    );
    // The URL is the source of truth: react to every query-param change.
    this.subs.add(this.route.queryParams.subscribe((params) => this.applyParamsAndFetch(params)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** The active sort column for matSort, e.g. "name". */
  get sortActive(): string {
    return this.sort.split(',')[0] || 'name';
  }

  /** The active sort direction for matSort. */
  get sortDirection(): SortDirection {
    return (this.sort.split(',')[1] as SortDirection) || 'asc';
  }

  onSearchInput(term: string): void {
    this.filterTerm = term;
    this.search$.next(term);
  }

  onSort(sort: Sort): void {
    // matSortDisableClear keeps direction non-empty; default defensively.
    const direction: SortDirection = sort.direction || 'asc';
    this.updateUrl({ sort: `${sort.active},${direction}`, page: 0 });
  }

  onPage(event: PageEvent): void {
    if (event.pageSize !== this.size) {
      // A page-size change snaps back to the first page.
      this.updateUrl({ size: event.pageSize, page: 0 });
    } else {
      this.updateUrl({ page: event.pageIndex });
    }
  }

  onSelect(owner: Owner): void {
    this.router.navigate(['/owners', owner.id]);
  }

  addOwner(): void {
    this.router.navigate(['/owners/add']);
  }

  private applyParamsAndFetch(params: Params): void {
    this.q = params['q'] ?? '';
    this.page = this.toInt(params['page'], 0);
    this.size = this.normalizeSize(this.toInt(params['size'], DEFAULT_SIZE));
    this.sort = params['sort'] ?? DEFAULT_SORT;
    this.filterTerm = this.q;
    this.fetch();
  }

  private fetch(): void {
    this.loading = true;
    this.ownerService
      .getOwnersPage({ q: this.q, page: this.page, size: this.size, sort: this.sort })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.hasLoadedOnce = true;
        }),
      )
      .subscribe(
        (pageData) => {
          this.owners = pageData.content;
          this.totalElements = pageData.totalElements;
        },
        (error) => (this.errorMessage = error as string),
      );
  }

  private updateUrl(changes: Params): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
    });
  }

  private toInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }

  /** The UI only offers 5/10/20; fall back to the default for anything else. */
  private normalizeSize(n: number): number {
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_SIZE;
  }
}

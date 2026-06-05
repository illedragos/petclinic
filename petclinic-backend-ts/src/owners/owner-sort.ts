/**
 * Server-built sort-chain expansion for the owners list (issue #25, D5/D9).
 *
 * The client sends a single column + direction (`?sort=city,desc`); the server
 * expands it into a deterministic ORDER BY chain. The chain always ends with
 * `id ASC` so pagination stays stable even with duplicate (lastName, firstName)
 * pairs. Direction applies only to the leading column; tiebreakers stay ASC.
 *
 * Sortable columns: name (-> lastName), address, city, telephone. The `pets`
 * column is rejected upstream by ListOwnersQueryDto and never reaches here.
 */
export type SortDirection = 'ASC' | 'DESC';

export interface OwnerSortColumn {
  /** Owner entity property name (the controller prefixes it with the alias). */
  field: string;
  direction: SortDirection;
}

/** Public sortable column -> the entity field it leads with. */
const LEADING_FIELD: Record<string, string> = {
  name: 'lastName',
  address: 'address',
  city: 'city',
  telephone: 'telephone',
};

/** Name tiebreakers, applied (ascending) after the leading column. */
const NAME_TIEBREAKERS = ['lastName', 'firstName'];
const ID_TIEBREAKER: OwnerSortColumn = { field: 'id', direction: 'ASC' };

/**
 * Expands a validated `<column>,<dir>` string (or undefined) into the full sort
 * chain. Defaults to `name,asc` when absent.
 */
export function buildOwnerSortChain(sort?: string): OwnerSortColumn[] {
  const [columnRaw, dirRaw] = (sort ?? 'name,asc').split(',');
  const column = (columnRaw ?? 'name').toLowerCase();
  const direction: SortDirection = (dirRaw ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const leadingField = LEADING_FIELD[column] ?? 'lastName';

  const chain: OwnerSortColumn[] = [{ field: leadingField, direction }];
  for (const field of NAME_TIEBREAKERS) {
    if (field !== leadingField) {
      chain.push({ field, direction: 'ASC' });
    }
  }
  chain.push(ID_TIEBREAKER);
  return chain;
}

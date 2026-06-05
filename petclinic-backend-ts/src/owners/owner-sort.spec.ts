import { buildOwnerSortChain } from './owner-sort';

/**
 * Pins the server-built sort-chain expansion (issue #25, design D5/D9).
 * The client sends a single column + direction; the server expands it into a
 * deterministic ORDER BY chain ending in `id ASC`. Direction applies only to
 * the leading column; tiebreakers stay ASC.
 */
describe('buildOwnerSortChain', () => {
  it('expands name -> lastName, firstName, id', () => {
    expect(buildOwnerSortChain('name,asc')).toEqual([
      { field: 'lastName', direction: 'ASC' },
      { field: 'firstName', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ]);
  });

  it('defaults to name,asc when sort is undefined (D9)', () => {
    expect(buildOwnerSortChain(undefined)).toEqual(buildOwnerSortChain('name,asc'));
  });

  it('expands address with name + id tiebreakers', () => {
    expect(buildOwnerSortChain('address,desc')).toEqual([
      { field: 'address', direction: 'DESC' },
      { field: 'lastName', direction: 'ASC' },
      { field: 'firstName', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ]);
  });

  it('expands city with name + id tiebreakers', () => {
    expect(buildOwnerSortChain('city,asc')).toEqual([
      { field: 'city', direction: 'ASC' },
      { field: 'lastName', direction: 'ASC' },
      { field: 'firstName', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ]);
  });

  it('expands telephone with name + id tiebreakers', () => {
    expect(buildOwnerSortChain('telephone,asc')).toEqual([
      { field: 'telephone', direction: 'ASC' },
      { field: 'lastName', direction: 'ASC' },
      { field: 'firstName', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ]);
  });

  it('applies direction only to the leading column; tiebreakers stay ASC; id is always last ASC', () => {
    const chain = buildOwnerSortChain('name,desc');
    expect(chain[0]).toEqual({ field: 'lastName', direction: 'DESC' });
    expect(chain.slice(1)).toEqual([
      { field: 'firstName', direction: 'ASC' },
      { field: 'id', direction: 'ASC' },
    ]);
    expect(chain[chain.length - 1]).toEqual({ field: 'id', direction: 'ASC' });
  });

  it('is case-insensitive on the direction token', () => {
    expect(buildOwnerSortChain('city,DESC')[0]).toEqual({ field: 'city', direction: 'DESC' });
  });
});

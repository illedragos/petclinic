import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';

import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  ensureSchema,
  getDataSource,
  isDbAvailable,
} from './test-app';
import { savePet, savePetType, saveOwner } from './fixtures';
import { todayIso } from './fixtures';

/**
 * End-to-end tests for the owners endpoints.
 * Covers owner CRUD, last-name filter, nested pet read/update, and validation.
 */
describe('OwnerController (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let available = false;

  let ownerId: number;
  let petId: number;
  let petTypeId: number;

  beforeAll(async () => {
    available = await isDbAvailable();
    if (!available) {
      return;
    }
    await ensureSchema();
    app = await createTestApp();
    ds = getDataSource();
  });

  afterAll(async () => {
    if (available) {
      await closeTestApp();
    }
  });

  beforeEach(async () => {
    if (!available) {
      return;
    }
    await cleanDatabase();
    const owner = await saveOwner(ds, { firstName: 'George', lastName: 'Franklin' });
    ownerId = owner.id;
    const type = await savePetType(ds, 'dog');
    petTypeId = type.id;
    const pet = await savePet(ds, owner, type, { name: 'Rosy', birthDate: todayIso() });
    petId = pet.id;
  });

  const http = () => request(app.getHttpServer());

  it('getByIdOk', async () => {
    if (!available) return;
    const res = await http().get(`/api/owners/${ownerId}`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.id).toBe(ownerId);
    expect(res.body.firstName).toBe('George');
    expect(res.body.lastName).toBe('Franklin');
  });

  it('getById_notFound', async () => {
    if (!available) return;
    await http().get('/api/owners/99999').expect(404);
  });

  it('count_returnsOwnerCount', async () => {
    if (!available) return;
    const res = await http().get('/api/owners/count').expect(200);
    expect(Number(res.text)).toBe(1);
  });

  it('getAll returns a paginated OwnerPageDto envelope with default page 0 / size 10', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body.content)).toBe(true);
    expect(res.body.number).toBe(0);
    expect(res.body.size).toBe(10);
    expect(typeof res.body.totalElements).toBe('number');
    expect(typeof res.body.totalPages).toBe('number');
    const match = res.body.content.find((o: { id: number }) => o.id === ownerId);
    expect(match).toMatchObject({ id: ownerId, firstName: 'George', lastName: 'Franklin' });
    // owners carry their full pets projection
    expect(Array.isArray(match.pets)).toBe(true);
    expect(match.pets.map((p: { name: string }) => p.name)).toContain('Rosy');
  });

  describe('GET /api/owners — list: validation, search, sort, pagination', () => {
    // Replace the single outer fixture with a controlled multi-owner dataset.
    beforeEach(async () => {
      if (!available) return;
      await cleanDatabase();
      const dog = await savePetType(ds, 'dog');
      const seed = async (
        firstName: string,
        lastName: string,
        address: string,
        city: string,
        telephone: string,
        petNames: string[],
      ): Promise<void> => {
        const owner = await saveOwner(ds, { firstName, lastName, address, city, telephone });
        for (const name of petNames) {
          await savePet(ds, owner, dog, { name });
        }
      };
      await seed('Betty', 'Davis', '638 Cardinal Ave.', 'Sun Prairie', '6085551749', ['Basil']);
      await seed('Harold', 'Davis', '563 Friendly St.', 'Windsor', '6085553198', ['Iggy']);
      await seed('Peter', 'Estaban', '2387 S. Fair Way', 'Madison', '6085552765', ['Lucky', 'Sly']);
      await seed('George', 'Franklin', '110 W. Liberty St.', 'Madison', '6085551023', ['Leo']);
      await seed('Eduardo', 'Rodriquez', '2693 Commerce St.', 'McFarland', '6085558763', [
        'Rosy',
        'Jewel',
        'Iggy',
      ]);
    });

    const names = (body: { content: Array<{ firstName: string; lastName: string }> }): string[] =>
      body.content.map((o) => `${o.lastName}, ${o.firstName}`);

    // ---- validation (task 2.1) ----
    it.each([
      ['size=0 drops no LIMIT', '/api/owners?size=0'],
      ['size over cap', '/api/owners?size=1000000'],
      ['negative page', '/api/owners?page=-1'],
      ['non-integer page', '/api/owners?page=abc'],
      ['fractional size', '/api/owners?size=2.5'],
      ['bad sort direction', '/api/owners?sort=name,sideways'],
      ['pets not sortable', '/api/owners?sort=pets,asc'],
      ['unknown sort column', '/api/owners?sort=unknown,asc'],
    ])('rejects invalid query (%s) with 400', async (_label, url) => {
      if (!available) return;
      await http().get(url).expect(400);
    });

    it('accepts valid params within bounds (200)', async () => {
      if (!available) return;
      await http().get('/api/owners?page=0&size=20&sort=city,desc&q=ma').expect(200);
    });

    // ---- search ?q= parity (task 3.1) ----
    it('q matches a single token across columns (city)', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?q=madi&size=100').expect(200);
      expect(res.body.totalElements).toBe(2);
      expect(names(res.body).sort()).toEqual(['Estaban, Peter', 'Franklin, George'].sort());
    });

    it('q requires every whitespace token to match (in any column)', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?q=davis%20sun&size=100').expect(200);
      expect(res.body.totalElements).toBe(1);
      expect(names(res.body)).toEqual(['Davis, Betty']);
    });

    it('q matches a pet name and counts each owner once', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?q=iggy&size=100').expect(200);
      // Rodriquez (Iggy among 3 pets) + Davis Harold (Iggy) = 2, no duplicates.
      expect(res.body.totalElements).toBe(2);
      expect(names(res.body).sort()).toEqual(['Davis, Harold', 'Rodriquez, Eduardo'].sort());
    });

    it('empty q matches every owner', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?q=&size=100').expect(200);
      expect(res.body.totalElements).toBe(5);
    });

    // ---- sort (task 4 — e2e confidence on top of the unit test) ----
    it('default sort (no param) is name asc: lastName, firstName, id', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?size=100').expect(200);
      expect(names(res.body)).toEqual([
        'Davis, Betty',
        'Davis, Harold',
        'Estaban, Peter',
        'Franklin, George',
        'Rodriquez, Eduardo',
      ]);
    });

    it('sort=city,asc expands to city, lastName, firstName, id', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?sort=city,asc&size=100').expect(200);
      expect(names(res.body)).toEqual([
        'Estaban, Peter', // Madison
        'Franklin, George', // Madison
        'Rodriquez, Eduardo', // McFarland
        'Davis, Betty', // Sun Prairie
        'Davis, Harold', // Windsor
      ]);
    });

    // ---- pagination counts owners, not joined rows (task 5.1) ----
    it('a full page holds N distinct owners even when owners have many pets', async () => {
      if (!available) return;
      const res = await http().get('/api/owners?size=5').expect(200);
      const ids = res.body.content.map((o: { id: number }) => o.id);
      expect(new Set(ids).size).toBe(5); // 5 distinct owners, not 7 owner-pet join rows
      expect(res.body.totalElements).toBe(5); // counts owners
      expect(res.body.content.length).toBe(5);
    });

    it('paginates: size=2 yields 3 pages over 5 owners', async () => {
      if (!available) return;
      const p0 = await http().get('/api/owners?size=2&sort=name,asc').expect(200);
      expect(p0.body.number).toBe(0);
      expect(p0.body.size).toBe(2);
      expect(p0.body.totalElements).toBe(5);
      expect(p0.body.totalPages).toBe(3);
      expect(names(p0.body)).toEqual(['Davis, Betty', 'Davis, Harold']);

      const p2 = await http().get('/api/owners?size=2&page=2&sort=name,asc').expect(200);
      expect(names(p2.body)).toEqual(['Rodriquez, Eduardo']);
    });
  });

  it('update_ok', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    existing.firstName = 'GeorgeI';
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(200);

    const updated = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    expect(updated.firstName).toBe('GeorgeI');
  });

  it('update_okNoBodyId', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    delete existing.id;
    existing.firstName = 'GeorgeII';
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(200);

    const updated = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    expect(updated.firstName).toBe('GeorgeII');
  });

  it('update_invalid', async () => {
    if (!available) return;
    const existing = (await http().get(`/api/owners/${ownerId}`).expect(200)).body;
    existing.firstName = ''; // invalid firstName (@Length min 1)
    await http().put(`/api/owners/${ownerId}`).send(existing).expect(400);
  });

  // deleteOwner loads the owner together with its pets (and their visits) and
  // removes them bottom-up before deleting the owner, so deleting an owner that
  // still has a pet cascades cleanly.
  it('delete_ok (cascades owner+pet)', async () => {
    if (!available) return;
    await http().delete(`/api/owners/${ownerId}`).expect(200);
    await http().get(`/api/owners/${ownerId}`).expect(404);
  });

  // Companion to delete_ok that DOES pass today: deleting an owner with no pets.
  it('delete_ok (owner without pets)', async () => {
    if (!available) return;
    const lonely = await saveOwner(ds, { lastName: 'NoPets' });
    await http().delete(`/api/owners/${lonely.id}`).expect(200);
    await http().get(`/api/owners/${lonely.id}`).expect(404);
  });

  it('delete_notFound', async () => {
    if (!available) return;
    await http().delete('/api/owners/9999').expect(404);
  });

  it('createPet_invalid (missing name)', async () => {
    if (!available) return;
    const newPet = {
      birthDate: todayIso(),
      type: { id: petTypeId, name: 'dog' },
      // missing name -> validation error
    };
    await http().post(`/api/owners/${ownerId}/pets`).send(newPet).expect(400);
  });

  it('createPet_ok (201 + Location)', async () => {
    if (!available) return;
    const newPet = {
      name: 'Thor',
      birthDate: '2020-01-15',
      type: { id: petTypeId, name: 'dog' },
    };
    const res = await http().post(`/api/owners/${ownerId}/pets`).send(newPet).expect(201);
    expect(res.headers['location']).toMatch(/^\/api\/pets\/\d+$/);
  });

  it('getOwnerPet_ok', async () => {
    if (!available) return;
    const res = await http().get(`/api/owners/${ownerId}/pets/${petId}`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.id).toBe(petId);
    expect(res.body.name).toBe('Rosy');
  });

  it('getOwnerPet_ownerNotFound', async () => {
    if (!available) return;
    await http().get(`/api/owners/99999/pets/${petId}`).expect(404);
  });

  it('getOwnerPet_petNotFound', async () => {
    if (!available) return;
    await http().get(`/api/owners/${ownerId}/pets/99999`).expect(404);
  });

  it('updateOwnerPet_ok', async () => {
    if (!available) return;
    const petDto = {
      id: petId,
      name: 'Rosy Updated',
      birthDate: '2020-01-15',
      type: { id: petTypeId, name: 'dog' },
    };
    await http().put(`/api/owners/${ownerId}/pets/${petId}`).send(petDto).expect(200);
  });

  it('updateOwnerPet_ownerNotFound (still updates the pet by id -> 200)', async () => {
    if (!available) return;
    const petDto = {
      name: 'Thor',
      birthDate: todayIso(),
      type: { id: petTypeId, name: 'dog' },
    };
    // The controller looks up the pet by petId, not the owner.
    await http().put(`/api/owners/99999/pets/${petId}`).send(petDto).expect(200);
  });

  it('updateOwnerPet_petNotFound', async () => {
    if (!available) return;
    const petDto = {
      name: 'Ghost',
      birthDate: '2020-01-01',
      type: { id: petTypeId, name: 'dog' },
    };
    await http().put(`/api/owners/${ownerId}/pets/99999`).send(petDto).expect(404);
  });
});

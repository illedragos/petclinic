import axios, { AxiosInstance } from 'axios';

export interface PetDto {
  name?: string;
}

export interface OwnerDto {
  firstName: string;
  lastName: string;
  id?: number;
  address?: string;
  city?: string;
  telephone?: string;
  pets?: PetDto[];
}

/** Mirrors the backend OwnerPageDto (Spring Page shape; `number` is 0-based). */
export interface OwnerPage {
  content: OwnerDto[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface OwnerQuery {
  q?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface VisitDto {
  id: number;
  date: string;
  description: string;
  petId: number;
  petName?: string;
  ownerId?: number;
  ownerFirstName?: string;
  ownerLastName?: string;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = process.env.API_BASE_URL || 'http://localhost:8080/api') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
    });
  }

  /** Fetches one page of owners with the given query — mirrors the UI's request. */
  async fetchOwnersPage(query: OwnerQuery = {}): Promise<OwnerPage> {
    const response = await this.client.get<OwnerPage>('/owners', { params: query });
    return response.data;
  }

  /**
   * Fetches every owner by paging through the contract (size<=100), rather than
   * relying on an uncapped size — the server caps size at 100, so "fetch all"
   * must page.
   */
  async fetchAllOwners(): Promise<OwnerDto[]> {
    const size = 100;
    const all: OwnerDto[] = [];
    let page = 0;
    let totalPages = 1;
    do {
      const res = await this.client.get<OwnerPage>('/owners', { params: { size, page } });
      all.push(...res.data.content);
      totalPages = res.data.totalPages;
      page += 1;
    } while (page < totalPages);
    return all;
  }

  async fetchVisits(): Promise<VisitDto[]> {
    const response = await this.client.get<VisitDto[]>('/visits');
    return response.data;
  }

  /** Phonebook rendering used by the Owners table: "Lastname, Firstname". */
  static phonebookName(owner: OwnerDto): string {
    return `${owner.lastName}, ${owner.firstName}`.trim();
  }

  static getPhonebookNames(owners: OwnerDto[]): string[] {
    return owners.map((o) => ApiClient.phonebookName(o)).filter((name) => name.length > 0);
  }

  static sorted(values: string[]): string[] {
    return [...values].sort();
  }

  static sortedByDate<T extends { date: string }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * The visible textual content of an owner's table row, joined and lowercased.
   * Mirrors the server-side ?q= search (firstName, lastName, address, city,
   * telephone, and each pet's name) so e2e expectations match the contract.
   */
  static visibleText(owner: OwnerDto): string {
    const petNames = (owner.pets ?? []).map((pet) => pet.name ?? '');
    return [
      owner.firstName,
      owner.lastName,
      owner.address,
      owner.city,
      owner.telephone,
      ...petNames,
    ]
      .join(' ')
      .toLowerCase();
  }

  /**
   * Filters owners the way the server's ?q= does: split the term on whitespace
   * and keep owners whose visible text contains every token (case-insensitive).
   */
  static filterByTerm(owners: OwnerDto[], term: string): OwnerDto[] {
    const tokens = (term ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return owners;
    }
    return owners.filter((owner) => {
      const text = ApiClient.visibleText(owner);
      return tokens.every((token) => text.includes(token));
    });
  }

  /**
   * Derives an interior (non-prefix) lowercase substring of some owner's city,
   * so the term exercises case-insensitive 'contains' matching on a column other
   * than last name. At least the source owner will match.
   */
  static chooseContainsTermFrom(owners: OwnerDto[]): string {
    for (const owner of owners) {
      const city = owner.city?.trim();
      if (city && city.length >= 3) {
        return city.substring(1, Math.min(city.length, 4)).toLowerCase();
      }
    }
    throw new Error('No owners with a usable city to derive a contains term');
  }
}

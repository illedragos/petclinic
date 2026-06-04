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

  async fetchOwners(): Promise<OwnerDto[]> {
    const response = await this.client.get<OwnerDto[]>('/owners');
    return response.data;
  }

  async fetchOwnersByPrefix(prefix: string): Promise<OwnerDto[]> {
    const response = await this.client.get<OwnerDto[]>('/owners', {
      params: { lastName: prefix }
    });
    return response.data;
  }

  async fetchVisits(): Promise<VisitDto[]> {
    const response = await this.client.get<VisitDto[]>('/visits');
    return response.data;
  }

  static getFullNames(owners: OwnerDto[]): string[] {
    return owners
      .map(owner => `${owner.firstName} ${owner.lastName}`.trim())
      .filter(name => name.length > 0);
  }

  static sorted(values: string[]): string[] {
    return [...values].sort();
  }

  static sortedByDate<T extends { date: string }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }

  static extractLastName(fullName: string): string {
    const firstSpace = fullName.indexOf(' ');
    if (firstSpace < 0 || firstSpace === fullName.length - 1) {
      return fullName;
    }
    return fullName.substring(firstSpace + 1);
  }

  static choosePrefixFrom(owners: OwnerDto[]): string {
    for (const owner of owners) {
      if (owner.lastName && owner.lastName.trim()) {
        const lastName = owner.lastName.trim();
        return lastName.substring(0, Math.min(2, lastName.length));
      }
    }
    throw new Error('No owners available to derive search prefix');
  }

  /**
   * The visible textual content of an owner's table row, joined and lowercased.
   * Mirrors the frontend OwnerListComponent so the e2e expectations match the UI
   * exactly (Name, Address, City, Telephone, and each pet's name).
   */
  static visibleText(owner: OwnerDto): string {
    const petNames = (owner.pets ?? []).map(pet => pet.name ?? '');
    return [
      owner.firstName,
      owner.lastName,
      owner.address,
      owner.city,
      owner.telephone,
      ...petNames,
    ].join(' ').toLowerCase();
  }

  /**
   * Filters owners the same way the frontend does: split the term on whitespace
   * and keep owners whose visible text contains every token (case-insensitive).
   */
  static filterByTerm(owners: OwnerDto[], term: string): OwnerDto[] {
    const tokens = (term ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return owners;
    }
    return owners.filter(owner => {
      const text = ApiClient.visibleText(owner);
      return tokens.every(token => text.includes(token));
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

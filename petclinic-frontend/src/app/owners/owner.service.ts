import { Injectable } from '@angular/core';
import { Owner } from './owner';
import { OwnerPage } from './owner-page';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { HandleError, HttpErrorHandler } from '../error.service';

/** Query parameters for the paginated owners list. */
export interface OwnerQuery {
  q?: string;
  page?: number;
  size?: number;
  sort?: string; // "<column>,<dir>", e.g. "name,asc"
}

@Injectable()
export class OwnerService {
  entityUrl = environment.REST_API_URL + 'owners';

  private readonly handlerError: HandleError;

  constructor(
    private http: HttpClient,
    private httpErrorHandler: HttpErrorHandler
  ) {
    this.handlerError = httpErrorHandler.createHandleError('OwnerService');
  }

  /**
   * Fetches a single page of owners from the server. Search (`q`), pagination
   * (`page`/`size`) and sorting (`sort`) are all applied server-side.
   */
  getOwnersPage(query: OwnerQuery = {}): Observable<OwnerPage> {
    let params = new HttpParams();
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.page != null) {
      params = params.set('page', query.page);
    }
    if (query.size != null) {
      params = params.set('size', query.size);
    }
    if (query.sort) {
      params = params.set('sort', query.sort);
    }
    return this.http
      .get<OwnerPage>(this.entityUrl, { params })
      .pipe(catchError(this.handlerError('getOwnersPage', emptyPage(query))));
  }

  getOwnerById(ownerId: number): Observable<Owner> {
    return this.http
      .get<Owner>(this.entityUrl + '/' + ownerId)
      .pipe(catchError(this.handlerError('getOwnerById', {} as Owner)));
  }

  addOwner(owner: Owner): Observable<Owner> {
    return this.http
      .post<Owner>(this.entityUrl, owner)
      .pipe(catchError(this.handlerError('addOwner', owner)));
  }

  updateOwner(ownerId: string, owner: Owner): Observable<{}> {
    return this.http
      .put<Owner>(this.entityUrl + '/' + ownerId, owner)
      .pipe(catchError(this.handlerError('updateOwner', owner)));
  }

  deleteOwner(ownerId: string): Observable<{}> {
    return this.http
      .delete<Owner>(this.entityUrl + '/' + ownerId)
      .pipe(catchError(this.handlerError('deleteOwner', [ownerId])));
  }
}

/** An empty page used as the safe fallback when a list fetch fails. */
function emptyPage(query: OwnerQuery): OwnerPage {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    number: query.page ?? 0,
    size: query.size ?? 10,
  };
}

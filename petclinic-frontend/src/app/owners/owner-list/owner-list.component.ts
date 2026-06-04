import {Component, OnInit} from '@angular/core';
import {OwnerService} from '../owner.service';
import {Owner} from '../owner';
import {Router} from '@angular/router';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.css']
})
export class OwnerListComponent implements OnInit {
  errorMessage: string;
  filterTerm: string = '';
  owners: Owner[];
  isOwnersDataReceived: boolean = false;

  constructor(private router: Router, private ownerService: OwnerService) {

  }

  ngOnInit() {
    this.ownerService.getOwners().pipe(
      finalize(() => {
        this.isOwnersDataReceived = true;
      })
    ).subscribe(
      owners => this.owners = owners,
      error => this.errorMessage = error as any);
  }

  /**
   * Owners filtered client-side over all visible columns. The term is split into
   * whitespace-separated tokens; a row matches when every token is a
   * case-insensitive substring of that row's combined visible text. An empty (or
   * whitespace-only) term matches every owner.
   */
  get filteredOwners(): Owner[] {
    const owners = this.owners ?? [];
    const tokens = (this.filterTerm ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return owners;
    }
    return owners.filter(owner => {
      const text = this.ownerVisibleText(owner);
      return tokens.every(token => text.includes(token));
    });
  }

  /** The visible textual content of an owner's row, joined and lowercased. */
  private ownerVisibleText(owner: Owner): string {
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

  onSelect(owner: Owner) {
    this.router.navigate(['/owners', owner.id]);
  }

  addOwner() {
    this.router.navigate(['/owners/add']);
  }


}

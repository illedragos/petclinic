/* tslint:disable:no-unused-variable */

import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {DebugElement, NO_ERRORS_SCHEMA} from '@angular/core';

import {OwnerListComponent} from './owner-list.component';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import { OwnerService } from '../owner.service';
import {Owner} from '../owner';
import {Pet} from '../../pets/pet';
import {Observable, of} from 'rxjs';
import {RouterTestingModule} from '@angular/router/testing';
import {CommonModule} from '@angular/common';
import {PartsModule} from '../../parts/parts.module';
import {ActivatedRouteStub} from '../../testing/router-stubs';
import {OwnerDetailComponent} from '../owner-detail/owner-detail.component';
import {OwnersModule} from '../owners.module';
import {DummyComponent} from '../../testing/dummy.component';
import {OwnerAddComponent} from '../owner-add/owner-add.component';
import {OwnerEditComponent} from '../owner-edit/owner-edit.component';
import Spy = jasmine.Spy;


class OwnerServiceStub {
  getOwners(): Observable<Owner[]> {
    return of();
  }
}

describe('OwnerListComponent', () => {

  let component: OwnerListComponent;
  let fixture: ComponentFixture<OwnerListComponent>;
  let ownerService = new OwnerServiceStub();
  let getOwnersSpy: Spy;
  let de: DebugElement;
  let el: HTMLElement;


  const franklin: Owner = {
    id: 1,
    firstName: 'George',
    lastName: 'Franklin',
    address: '110 W. Liberty St.',
    city: 'Madison',
    telephone: '6085551023',
    pets: [{ name: 'Leo' } as Pet]
  };
  const davis: Owner = {
    id: 2,
    firstName: 'Betty',
    lastName: 'Davis',
    address: '638 Cardinal Ave.',
    city: 'Sun Prairie',
    telephone: '6085551749',
    pets: []
  };
  let testOwners: Owner[];

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DummyComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [CommonModule, FormsModule, PartsModule, OwnersModule,
        RouterTestingModule.withRoutes(
          [{path: 'owners', component: OwnerListComponent},
            {path: 'owners/add', component: OwnerAddComponent},
            {path: 'owners/:id', component: OwnerDetailComponent},
            {path: 'owners/:id/edit', component: OwnerEditComponent}
          ])],
      providers: [
        {provide: OwnerService, useValue: ownerService},
        {provide: ActivatedRoute, useClass: ActivatedRouteStub}
      ]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    testOwners = [franklin, davis];

    fixture = TestBed.createComponent(OwnerListComponent);
    component = fixture.componentInstance;
    ownerService = fixture.debugElement.injector.get(OwnerService);
    getOwnersSpy = spyOn(ownerService, 'getOwners')
      .and.returnValue(of(testOwners));
  });

  it('should create OwnerListComponent', () => {
    expect(component).toBeTruthy();
  });

  it('should call ngOnInit() method', () => {
    fixture.detectChanges();
    expect(getOwnersSpy.calls.any()).toBe(true, 'getOwners called');
  });


  it(' should show full name after getOwners observable (async) ', waitForAsync(() => {
    fixture.detectChanges();
    fixture.whenStable().then(() => { // wait for async getOwners
      fixture.detectChanges();        // update view with name
      de = fixture.debugElement.query(By.css('.ownerFullName'));
      el = de.nativeElement;
      expect(el.innerText).toBe((franklin.firstName.toString() + ' ' + franklin.lastName.toString()));
    });
  }));

  describe('filteredOwners (client-side search over all visible columns)', () => {
    beforeEach(() => {
      component.owners = testOwners;
    });

    it('returns all owners when the term is empty', () => {
      component.filterTerm = '';
      expect(component.filteredOwners).toEqual(testOwners);
    });

    it('returns all owners when the term is only whitespace', () => {
      component.filterTerm = '   ';
      expect(component.filteredOwners).toEqual(testOwners);
    });

    it('filters by city (a non-name column)', () => {
      component.filterTerm = 'madison';
      expect(component.filteredOwners).toEqual([franklin]);
    });

    it('matches case-insensitively', () => {
      component.filterTerm = 'FRANKLIN';
      expect(component.filteredOwners).toEqual([franklin]);
    });

    it('matches using contains semantics, not prefix', () => {
      component.filterTerm = 'ankl';
      expect(component.filteredOwners).toEqual([franklin]);
    });

    it('matches by address substring', () => {
      component.filterTerm = 'cardinal';
      expect(component.filteredOwners).toEqual([davis]);
    });

    it('matches by telephone', () => {
      component.filterTerm = '6085551749';
      expect(component.filteredOwners).toEqual([davis]);
    });

    it('matches by pet name', () => {
      component.filterTerm = 'leo';
      expect(component.filteredOwners).toEqual([franklin]);
    });

    it('requires every token to match (across different columns)', () => {
      component.filterTerm = 'davis prairie';
      expect(component.filteredOwners).toEqual([davis]);
    });

    it('returns no rows when not all tokens match', () => {
      component.filterTerm = 'davis madison';
      expect(component.filteredOwners).toEqual([]);
    });
  });

});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Navtab } from './navtab';

describe('Navtab', () => {
  let component: Navtab;
  let fixture: ComponentFixture<Navtab>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navtab],
    }).compileComponents();

    fixture = TestBed.createComponent(Navtab);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

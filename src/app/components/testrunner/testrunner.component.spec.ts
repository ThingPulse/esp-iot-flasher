import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestrunnerComponent } from './testrunner.component';

describe('TestrunnerComponent', () => {
  let component: TestrunnerComponent;
  let fixture: ComponentFixture<TestrunnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TestrunnerComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestrunnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

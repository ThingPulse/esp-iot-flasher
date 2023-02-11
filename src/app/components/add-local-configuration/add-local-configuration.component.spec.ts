import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddLocalConfigurationComponent } from './add-local-configuration.component';

describe('AddLocalConfigurationComponent', () => {
  let component: AddLocalConfigurationComponent;
  let fixture: ComponentFixture<AddLocalConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AddLocalConfigurationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddLocalConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

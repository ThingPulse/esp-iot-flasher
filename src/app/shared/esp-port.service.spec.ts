import { TestBed } from '@angular/core/testing';

import { EspPortService } from './esp-port.service';

describe('EspPortService', () => {
  let service: EspPortService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EspPortService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

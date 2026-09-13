import { buildInfo } from '../build-info';
import { Component } from '@angular/core';
import { DeviceConfiguration } from './model/device-configuration';
import { Partition } from './shared/utils.service';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent  {

  readonly buildInfo = buildInfo;

  getCurrentYear(): number {
    return new Date().getFullYear();
  }

}



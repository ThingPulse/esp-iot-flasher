import { Component, OnInit } from '@angular/core';
import { DeviceConfiguration } from '../model/device-configuration';
import { DeviceConfigurationService } from '../shared/device-configuration.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  deviceConfigurations: DeviceConfiguration[];

  constructor(public deviceConfigurationService: DeviceConfigurationService) {

  }
  ngOnInit(): void {
    this.deviceConfigurations = this.deviceConfigurationService.getDeviceConfigurations();
    this.deviceConfigurationService.deviceConfigurationStream.subscribe((id) => {
      this.deviceConfigurations = this.deviceConfigurationService.getDeviceConfigurations();
    });
  }

  deleteDevice(id: string) {
    this.deviceConfigurationService.deleteLocalDeviceById(id);
  }

  isLocalConfiguration(id: string): boolean {
    return this.deviceConfigurationService.isLocalConfiguration(id);
  }
    

}

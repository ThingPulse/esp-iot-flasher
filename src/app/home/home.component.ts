import { Component, OnInit } from '@angular/core';
import { DeviceConfiguration } from '../model/device-configuration';
import { DeviceConfigurationService } from '../shared/device-configuration.service';
import { TestResultService } from '../shared/test-result.service';
import { TestResult } from '../model/test-result';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  deviceConfigurations: DeviceConfiguration[];

  constructor(public deviceConfigurationService: DeviceConfigurationService, private testResultService: TestResultService) {

  }

  ngOnInit(): void {
    this.loadConfiguration();
    this.deviceConfigurationService.deviceConfigurationStream.subscribe((id) => {
      this.loadConfiguration();
    });
  }

  loadConfiguration() {
    this.deviceConfigurationService.getDeviceConfigurations().then((configuration) => {
      this.deviceConfigurations = configuration;
    })
  }

  deleteDevice(id: string) {
    this.deviceConfigurationService.deleteLocalDeviceById(id);
  }

  isLocalConfiguration(id: string): boolean {
    return this.deviceConfigurationService.isLocalConfiguration(id);
  }

  sendResult() {
    const testResult = {
      mac_address: '00:1A:2B:3C:4D:5E',
      overall_result: <const> 'OK',
      device_type: 'DeviceTypeA',
      additional_info: {
        test1: 'pass',
        test2: 'fail'
      }
    };

    this.testResultService.sendTestResult(testResult).subscribe(response => {
      console.log('Test result sent successfully:', response);
    });
  }
    

}

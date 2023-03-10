import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { DeviceConfiguration } from '../model/device-configuration';

@Injectable({
  providedIn: 'root'
})
export class DeviceConfigurationService {

    // Publishes state changes of the selected serial port
  private deviceConfigurationListSource = new Subject<string>();
  deviceConfigurationStream = this.deviceConfigurationListSource.asObservable();

  localDeviceConfigurations: DeviceConfiguration[];

  deviceConfigurations: DeviceConfiguration[] = []; 


  constructor(public httpClient: HttpClient) { 

  }


  loadDefaultDeviceConfiguration(): Observable<DeviceConfiguration[]> {
    return this.httpClient.get<DeviceConfiguration[]>("/assets/defaultDeviceConfiguration.json");
  }

  async getDeviceConfigurations(): Promise<DeviceConfiguration[]> {
    this.deviceConfigurations = await firstValueFrom(this.loadDefaultDeviceConfiguration());
    this.loadLocalDeviceConfigurations();
    var combinedDeviceConfigurations = this.deviceConfigurations.concat(this.localDeviceConfigurations);
    return combinedDeviceConfigurations;
  }

  async getDeviceConfigurationById(id: string) {
    const combinedConfiguration = await this.getDeviceConfigurations();
    return combinedConfiguration.find(x => x.id == id);
  }

  addOrUpdateLocalStorageConfiguration(deviceConfiguration: DeviceConfiguration) {
    this.loadLocalDeviceConfigurations();
    var foundIndex = this.localDeviceConfigurations.findIndex(x => x.id == deviceConfiguration.id);
    if (foundIndex > -1) {
      this.localDeviceConfigurations[foundIndex] = deviceConfiguration;
    } else {
      this.localDeviceConfigurations.push(deviceConfiguration);
    }
    this.saveLocalDeviceConfigurations();
    this.deviceConfigurationListSource.next(deviceConfiguration.id);
  }

  loadLocalDeviceConfigurations() {
    let configuration = localStorage.getItem('localConfigurations');
    if (configuration == null) {
      configuration = "[]";
    }
    this.localDeviceConfigurations = JSON.parse(configuration);
  }
  saveLocalDeviceConfigurations() {
    localStorage.setItem('localConfigurations', JSON.stringify(this.localDeviceConfigurations));
  }

  isLocalConfiguration(id: string): boolean {
    this.loadLocalDeviceConfigurations()
    return this.localDeviceConfigurations.findIndex(x => x.id == id) > -1;
  }

  deleteLocalDeviceById(id: string) {
    this.loadLocalDeviceConfigurations();
    this.localDeviceConfigurations = this.localDeviceConfigurations.filter(obj => obj.id !== id);
    this.saveLocalDeviceConfigurations();
    this.deviceConfigurationListSource.next(id);
  }
}

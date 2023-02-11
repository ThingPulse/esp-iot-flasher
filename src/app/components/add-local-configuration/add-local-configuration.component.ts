import { Component, OnInit } from '@angular/core';
import { DeviceConfiguration } from 'src/app/model/device-configuration';
import { DeviceConfigurationService } from 'src/app/shared/device-configuration.service';

@Component({
  selector: 'app-add-local-configuration',
  templateUrl: './add-local-configuration.component.html',
  styleUrls: ['./add-local-configuration.component.scss']
})
export class AddLocalConfigurationComponent implements OnInit {

  fileName = "";
  deviceConfiguration: DeviceConfiguration;

  constructor(private deviceConfigurationService: DeviceConfigurationService) {

  }
  ngOnInit(): void {
    this.initializeConfiguration();
  }

  initializeConfiguration() {
    this.fileName = "";
    this.deviceConfiguration = {
      id: this.generateId(),
      name: "",
      imageSource: "",
      partitions: [{
        name: "Firmware",
        data: new Uint8Array(),
        url: "",
        offset: 0x00
      }]
    };
  }

  onFileSelected(event: any) {

    const file:File = event.target.files[0];

    if (file) {

        //this.deviceConfiguration.id = file.name;

        const formData = new FormData();
        console.log(file);
        console.log(formData);
        var reader = new FileReader();
        this.fileName = file.name;
        reader.onloadend = (e) => {
          this.deviceConfiguration.partitions[0].url = reader.result?.toString()!;
        };
        reader.readAsDataURL(file);
 
    }
  }

  addConfiguration() {
    this.deviceConfigurationService.addOrUpdateLocalStorageConfiguration(this.deviceConfiguration);
    this.initializeConfiguration();
  }

  private generateId(): string {
    return "device" + (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  }

}

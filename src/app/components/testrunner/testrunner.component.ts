
import { ChangeDetectorRef, Component, Input, OnInit, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { ActivatedRoute } from '@angular/router';
import { FirmwareMessage } from 'src/app//model/firmware-message';
import { DeviceConfiguration } from 'src/app/model/device-configuration';
import { DeviceConfigurationService } from 'src/app/shared/device-configuration.service';
import { EspPortService } from 'src/app/shared/esp-port.service';
import { Partition, PartitionProgress, sleep, TestState } from 'src/app/shared/utils.service';

@Component({
  selector: 'app-testrunner',
  templateUrl: './testrunner.component.html',
  styleUrls: ['./testrunner.component.scss']
})
export class TestrunnerComponent  implements OnInit {

  deviceId: string;
  title = 'ThingPulse Hardware Test Tool';
  firmwareMessages: any = [];
  displayedColumns: string[] = ['heapSize', 'freeHeap', 'psramSize', 'freePsram'];
  @ViewChild('stepper') stepper: MatStepper;


  private connected = false;
  private monitoring = false;
  messageArea: string = "";
  messageCount = 0;
  testState: TestState = TestState.Initial;
  flasherConsole: string;


  progresses: PartitionProgress[] = new Array();
  deviceConfiguration: DeviceConfiguration;

  constructor(private espPortService: EspPortService, 
    private route: ActivatedRoute, 
    private deviceConfigurationService: DeviceConfigurationService) {

  }

  ngOnInit(): void {
    this.deviceId = this.route.snapshot.paramMap.get("deviceId")!;
    console.log("deviceId: ", this.deviceId);
    this.deviceConfiguration = this.deviceConfigurationService.getDeviceConfigurationById(this.deviceId)!;
    this.espPortService.portStateStream.subscribe(isConnected => {
      console.log("isConnected: ", isConnected);
      this.connected = isConnected;
    })
    this.espPortService.monitorStateStream.subscribe(isMonitoring => {
      console.log("isMonitoring: ", isMonitoring);
      this.monitoring = isMonitoring;
    })
    this.espPortService.flashProgressStream.subscribe(progress => {
      
      this.progresses[progress.index] = progress;
    })
    this.espPortService.monitorMessageStream.subscribe(message => {
      try { 
        this.firmwareMessages = JSON.parse(message);
        this.espPortService.stopMonitor();
      } catch(e) {
        this.messageArea = this.messageArea + '\n' + message;
        this.messageCount++;
      }
      
    })
    this.espPortService.subjectLogger.logStatementStream.subscribe(message => {
      this.messageArea = this.messageArea + '\n' + message;
      this.messageCount++;
      this.flasherConsole = message;
    });
    this.espPortService.testStateStream.subscribe(state => {
      console.log("Test State: ", state);
      switch(state) {
        case TestState.Restarting:
          console.log("Restarting");
          this.stepper.selectedIndex = 1;
          break;
        case TestState.Restarted:
          console.log("Restarted");
          this.stepper.selectedIndex = 2;
      }
    });
  }


  resetState() {
    this.messageArea = ""
    this.messageCount = 0;
    this.flasherConsole = "Ready";
    this.firmwareMessages = [];
    this.testState = TestState.Initial;
    this.stepper.selectedIndex = 0;
    this.progresses = new Array(this.deviceConfiguration.partitions.length);
  }

  connect() {
   try {
    this.espPortService.connect();
   } catch (e) {
    this.flasherConsole = "Could not open port. Please close all open monitoring sessions or refresh this browser.";
   }
  }

  close() {
    this.espPortService.close();
  }

  isConnected() {
    return this.connected;
  }

  isMonitoring() {
    return this.monitoring;
  }

  startMonitor() {
    this.espPortService.startMonitor();
  }

  stopMonitor() {
    this.espPortService.stopMonitor();
  }

  reset() {
    this.espPortService.resetDevice();
  }

  flash() {
    this.espPortService.flash(this.deviceConfiguration.partitions);
  }

  async flashAndTest() {
    this.resetState();
    try {
    await this.espPortService.connect();
    } catch (e) {
      console.log(e);
      this.flasherConsole = "Could not open port. Please close all open monitoring sessions or refresh this browser.";
      return;
    }
    await this.espPortService.flash(this.deviceConfiguration.partitions);
    await this.espPortService.resetDevice();
    await this.espPortService.reconnect();
    await this.espPortService.startMonitor();
  }

  getResultColor(result: string) {
    if (result === "OK") {
      return "primary";
    }
    return "warn";
  }

}



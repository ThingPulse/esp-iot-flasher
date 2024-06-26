
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { ActivatedRoute } from '@angular/router';
import { FirmwareMessage } from 'src/app//model/firmware-message';
import { DeviceConfiguration } from 'src/app/model/device-configuration';
import { DeviceConfigurationService } from 'src/app/shared/device-configuration.service';
import { EspPortService } from 'src/app/shared/esp-port.service';
import { Partition, PartitionProgress, sleep, TestState } from 'src/app/shared/utils.service';
import { TestResultService } from 'src/app/shared/test-result.service';
import { TestResult } from 'src/app/model/test-result';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-testrunner',
  templateUrl: './testrunner.component.html',
  styleUrls: ['./testrunner.component.scss']
})
export class TestrunnerComponent  implements OnInit, OnDestroy {

  deviceId: string;
  title = 'ThingPulse Hardware Test Tool';
  firmwareMessages: FirmwareMessage[] = [];
  
  @ViewChild('stepper') stepper: MatStepper;

  private connected = false;
  private monitoring = false;
  messageArea: string = "";
  messageCount = 0;
  testState: TestState = TestState.Initial;
  flasherConsole: string;


  progresses: PartitionProgress[] = new Array();
  deviceConfiguration: DeviceConfiguration;
  private subscriptions: Subscription = new Subscription();

  constructor(private espPortService: EspPortService, 
    private route: ActivatedRoute, 
    private deviceConfigurationService: DeviceConfigurationService,
    private testResultService: TestResultService) {

  }

  ngOnInit(): void {
    console.log("init TestrunnerComponent");
    this.deviceId = this.route.snapshot.paramMap.get("deviceId")!;
    console.log("deviceId: ", this.deviceId);
    this.deviceConfigurationService.getDeviceConfigurationById(this.deviceId).then(configuration => {
      this.deviceConfiguration = configuration!;
    })
    const portStateStreamSubscription = this.espPortService.portStateStream.subscribe(isConnected => {
      console.log("isConnected: ", isConnected);
      this.connected = isConnected;
    });
    this.subscriptions.add(portStateStreamSubscription);
    const monitorStateSubscription = this.espPortService.monitorStateStream.subscribe(isMonitoring => {
      console.log("isMonitoring: ", isMonitoring);
      this.monitoring = isMonitoring;
    });
    this.subscriptions.add(monitorStateSubscription);

    const flashProgressStreamSubscription = this.espPortService.flashProgressStream.subscribe(progress => {
      this.progresses[progress.index] = progress;
    });
    this.subscriptions.add(flashProgressStreamSubscription);

    const monitorStreamSubscription = this.espPortService.monitorMessageStream.subscribe(message => {
      try { 
        this.firmwareMessages = JSON.parse(message);
        this.espPortService.stopMonitor();
        if (this.firmwareMessages.length > 0) {
          console.log("We have a message");
        }
        this.sendTestResults(this.firmwareMessages);
      } catch(e) {
        this.messageArea = this.messageArea + '\n' + message;
        this.messageCount++;
      }
      
    })
    this.subscriptions.add(monitorStreamSubscription);
    const testStateStreamSubscription = this.espPortService.testStateStream.subscribe(state => {
      console.log("Test State: ", state);
      switch(state) {
        case TestState.Restarting:
          console.log("Restarting");
          this.stepper.selectedIndex = 1;
          break;
        case TestState.Restarted:
          console.log("Restarted");
          this.stepper.selectedIndex = 2;
          break;
        case TestState.Testing:
          console.log("Testing");
          this.espPortService.sendSelfTestCommand();
          break;

      }
    });
    this.subscriptions.add(testStateStreamSubscription);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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

  async test() {
    await this.espPortService.reconnect();
    await this.espPortService.startMonitor();
  }

  getResultColor(result: string) {
    if (result === "OK") {
      return "primary";
    }
    return "warn";
  }

  sendTestResults(firmwareMessages: FirmwareMessage[]) {
    /*
    [
      {"name":"Mac Address","value":"DC:54:75:F0:3F:D0","result":"OK"},
      {"name":"Chip Model","value":"ESP32-S3","result":"OK"},
      {"name":"Chip Revision","value":"0","result":"OK"},
      {"name":"Available Cores","value":"2","result":"OK"},
      {"name":"Heap Size","value":"384kb","result":"OK"},
      {"name":"Free Heap","value":"333kb","result":"OK"},
      {"name":"PSRAM Size","value":"0kb","result":"OK"},
      {"name":"Free PSRAM","value":"0kb","result":"OK"},
      {"name":"Flash Chip Size","value":"4096kb","result":"OK"},
      {"name":"External Flash Card Type","value":"SDSC","result":"OK"},
      {"name":"External Flash Card Size","value":"120MB","result":"OK"},
      {"name":"Build Date","value":"Jun 10 2024","result":"OK"},
      {"name":"Build Time","value":"21:27:56","result":"OK"}
    ]
    */

    let isOverallSuccess  = true;
    let macAddress : string = "";
    firmwareMessages.forEach((message: FirmwareMessage) => {
      if (message.result === "NOK") {
        isOverallSuccess = false;
      }
      switch(message.name) {
        case "Mac Address":
          macAddress = message.value;
          break;
      }
    });
  
    let testResult : TestResult = {
      mac_address: macAddress,
      device_type: this.deviceConfiguration.name,
      overall_result: isOverallSuccess ? 'OK' : 'NOK',
      additional_info: firmwareMessages
    };

    this.testResultService.sendTestResult(testResult).subscribe(response => {
      console.log('Test result sent successfully:', response);
    });
    
  }

}





import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { FirmwareMessage } from './model/firmware-message';
import { EspPortService } from './shared/esp-port.service';
import { Partition, PartitionProgress, sleep, TestState } from './shared/utils.service';

declare global {
  interface Navigator {
    readonly serial: Serial;
  }
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
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

  partitions: Partition[] = [{
    name: 'Bootloader',
    data: new Uint8Array,
    offset: 0x1000,
    url: './assets/feather/bootloader.bin'
  }, {
    name: 'Partitions',
    data: new Uint8Array,
    offset: 0x8000,
    url: './assets/feather/partitions.bin'
  }, {
    name: 'Firmware',
    data: new Uint8Array,
    offset: 0x10000,
    url: './assets/feather/firmware.bin'
  }];

  progresses: PartitionProgress[] = new Array(this.partitions.length);

  constructor(public espPortService: EspPortService) {

  }

  ngOnInit(): void {
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
    this.progresses = new Array(this.partitions.length);
  }

  connect() {
   this.espPortService.connect();
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
    this.espPortService.flash(this.partitions);
  }

  async flashAndTest() {
    this.resetState();
    await this.espPortService.connect();
    await this.espPortService.flash(this.partitions);
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




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
import { Capabilities, TestSet, isCapabilities, isReport, auditReport, startCommand, validCellularSettings } from '../../shared/test-protocol';


const DEFAULT_CONNECTIVITY_URL = 'http://cp.cloudflare.com/generate_204';

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

  selectedTestSet: TestSet = 'hardware';
  cellularApn = 'internet';
  cellularUrl = DEFAULT_CONNECTIVITY_URL;
  busy = false;
  testError = '';
  testStatus = '';
  private activeTestSet: TestSet = 'hardware';
  private negotiatedProtocol = 0;
  private capabilities: Capabilities | null = null;
  private negotiating = false;
  private awaitingResults = false;
  private pendingLegacyReport: FirmwareMessage[] | null = null;
  private legacyBanner = false;
  private finishProbe?: () => void;
  private resultTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
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
      this.cellularApn = configuration?.cellular?.apn || 'internet';
      this.cellularUrl = configuration?.cellular?.url || DEFAULT_CONNECTIVITY_URL;
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
      this.handleSerialMessage(message);
    });
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
          this.legacyBanner = true;
          if (this.awaitingResults && this.negotiatedProtocol === 0 && this.activeTestSet === 'hardware')
            void this.espPortService.sendSelfTestCommand().catch(error => this.failTest(String(error)));
          break;

      }
    });
    this.subscriptions.add(testStateStreamSubscription);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.busy = false;
    this.awaitingResults = false;
    this.finishProbe?.();
    clearTimeout(this.resultTimer);
    if (this.monitoring) void this.espPortService.stopMonitor();
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



  supportsCellular(): boolean {
    return this.deviceConfiguration?.testSets?.includes('cellular') || false;
  }

  async flashAndTest() { await this.runRequestedTest(true); }
  async test() { await this.runRequestedTest(false); }

  private async runRequestedTest(flash: boolean) {
    if (this.busy) return;
    this.testError = '';
    this.activeTestSet = this.selectedTestSet;
    const apn = this.cellularApn.trim(), url = this.cellularUrl.trim();
    if (this.activeTestSet === 'cellular' && (!this.supportsCellular() || !validCellularSettings(apn, url))) {
      this.testError = 'Enter the SIM APN and an HTTP(S) endpoint that returns HTTP 204 with an empty body.';
      return;
    }
    this.busy = true;
    this.resetState();
    this.capabilities = null;
    this.pendingLegacyReport = null;
    this.legacyBanner = false;
    this.awaitingResults = false;
    this.negotiatedProtocol = 0;
    try {
      if (this.monitoring) await this.espPortService.stopMonitor();
      if (flash) {
        this.testStatus = 'Connecting to bootloader…';
        await this.espPortService.connect();
        this.testStatus = 'Flashing firmware…';
        await this.espPortService.flash(this.deviceConfiguration.partitions);
      }
      this.testStatus = 'Opening test console…';
      await this.espPortService.reconnect();
      this.negotiating = true;
      this.espPortService.startMonitor();
      if (flash) {
        this.testStatus = 'Restarting device…';
        await this.espPortService.resetDevice();
      }
      await sleep(1000);
      if (this.destroyed) return;
      this.negotiating = true;
      const probe = new Promise<void>(resolve => {
        const timer = setTimeout(() => this.finishProbe?.(), 2500);
        this.finishProbe = () => { clearTimeout(timer); this.finishProbe = undefined; resolve(); };
      });
      this.testStatus = 'Checking supported test sets…';
      this.logSerial('Requesting firmware capabilities…');
      await this.espPortService.sendCommand('{"CAP":true}');
      await probe;
      if (this.destroyed) return;
      this.negotiating = false;
      this.negotiatedProtocol = this.capabilities ? 2 : 0;
      const command = startCommand(this.activeTestSet, this.capabilities, apn, url);
      this.awaitingResults = true;
      this.testStatus = 'Running ' + this.activeTestSet + ' tests…';
      this.stepper.selectedIndex = 2;
      this.resultTimer = setTimeout(() => this.failTest('Timed out waiting for a complete test report. Reconnect and retry.'),
        this.activeTestSet === 'cellular' ? 480000 : 120000);
      // Some legacy firmware emits reports automatically, without ST.
      if (!this.capabilities && this.pendingLegacyReport) {
        this.acceptReport(this.pendingLegacyReport);
        return;
      }
      this.logSerial('Starting ' + this.activeTestSet + ' test set (' + (this.capabilities ? 'protocol 2' : 'legacy') + ')…');
      await this.espPortService.sendCommand(command);
      if (!this.capabilities && this.legacyBanner && this.awaitingResults)
        await this.espPortService.sendSelfTestCommand();
    } catch (error) {
      await this.failTest(error instanceof Error ? error.message : String(error));
    }
  }

  private handleSerialMessage(message: string) {
    let parsed: any;
    try { parsed = JSON.parse(message); } catch { this.logSerial(message); return; }
    if (isCapabilities(parsed)) {
      if (this.negotiating) { this.capabilities = parsed; this.finishProbe?.(); }
      return;
    }
    if (parsed?.type === 'error') {
      if (this.awaitingResults) void this.failTest(typeof parsed.message === 'string' ? parsed.message : 'Firmware rejected the command.');
      else this.logSerial(message);
      return;
    }
    if (!isReport(parsed)) { this.logSerial(message); return; }
    if (this.negotiating) { this.pendingLegacyReport = parsed; return; }
    if (this.awaitingResults) this.acceptReport(parsed);
  }

  private acceptReport(rows: FirmwareMessage[]) {
    this.awaitingResults = false; // Ignore duplicate arrays and late serial data.
    clearTimeout(this.resultTimer);
    this.firmwareMessages = auditReport(rows, this.activeTestSet, this.negotiatedProtocol);
    this.sendTestResults(this.firmwareMessages);
    void this.espPortService.stopMonitor().finally(() => { this.busy = false; });
  }

  private logSerial(message: string) {
    this.messageArea += '\n' + message;
    this.messageCount++;
  }

  private async failTest(message: string) {
    this.testError = message;
    this.awaitingResults = false;
    this.negotiating = false;
    this.finishProbe?.();
    clearTimeout(this.resultTimer);
    try { if (this.monitoring) await this.espPortService.stopMonitor(); }
    catch (error) { this.logSerial('Serial cleanup failed: ' + String(error)); }
    finally { this.busy = false; }
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





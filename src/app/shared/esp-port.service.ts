import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EspLoader } from 'esptool.ts';
import { firstValueFrom, Subject } from 'rxjs';
import { SubjectLogger } from './subject-logger';
import { LineBreakTransformer, Partition, PartitionProgress, sleep, TestState } from './utils.service';

@Injectable({
  providedIn: 'root'
})
export class EspPortService {

  private connected = false;
  private monitorPort = true;
  port!: SerialPort;

  private controlCharacter: string = "\n";

  // Publishes state changes of the selected serial port
  private portStateSource = new Subject<boolean>();
  portStateStream = this.portStateSource.asObservable();

  // Publishes the state of the console monitor
  private monitorStateSource = new Subject<boolean>();
  monitorStateStream = this.monitorStateSource.asObservable();

  // Publishes the console messages
  private monitorMessageSource = new Subject<string>();
  monitorMessageStream = this.monitorMessageSource.asObservable();

  // Publishes the progress of the flashing process for each partition
  private flashProgressSource = new Subject<PartitionProgress>();
  flashProgressStream = this.flashProgressSource.asObservable();

  // Publishes the progress/state of the test
  private testStateSource = new Subject<TestState>();
  testStateStream = this.testStateSource.asObservable();

  // Characters contained in the first messages after reboot in an ESP32
  private resetMessageMatchers: string[] = ['rst:0x1', 'configsip', 'mode:DIO'];

  private reader!: ReadableStreamDefaultReader;
  private readableStreamClosed!: any;

  subjectLogger = new SubjectLogger();

  constructor(public httpClient: HttpClient) {
  }

  async connect() {
    try {
      // If port is still open close it first
      if (this.port && this.connected) {
        console.log("Port still seems to be connected. Closing");
        await this.close();
        this.setState(false);
      }
      const port = await navigator.serial.requestPort();
      await this.openPort(port);
    } catch (error) {
      console.error(error);
      this.setState(false);
    }
  }

  async openPort(port: SerialPort) {
    try {
      this.port = port;
      console.log('oppening port:', port)
      this.port.addEventListener('connect', (event) => {
        this.setState(true);
      });
      this.port.addEventListener('disconnect', (event) => {
        this.setState(false);
      });
      await this.port.open({ baudRate: 115200 });
      const portInfo = port.getInfo();
      console.log(portInfo);
      this.setState(true);
    } catch (e) {
      console.log(e);
      this.setState(false);
    }
  }

  checkForRestart(message: string) {
    // Check the given console message for some trigger characters
    // and publish a message if that is the case
    for (let matcher of this.resetMessageMatchers) {
      if (message.indexOf(matcher) > -1) {
        this.testStateSource.next(TestState.Restarted);
        break;
      }
    }

  }

  async reconnect() {
    try {
      await this.port.close();
      console.log("Port closed");
      this.setState(false);
      await this.openPort(this.port);
    }
    catch (e) {
      console.log('Error clossing port', this.port, e)
    }
  }

  setState(isConnected: boolean) {
    this.connected = isConnected;
    this.portStateSource.next(this.connected);
    this.testStateSource.next(isConnected ? TestState.Connected : TestState.Initial);
  }


  async resetDevice() {
    /*
      State table of the programming circuit
      DTR   RTS  -> EN   IO0
      1     1       1    1
      0     0       1    1
      1     0       0    1
      0     1       1    0
    */
    console.log("Resetting device");
    this.testStateSource.next(TestState.Restarting);
    await this.port.setSignals({ dataTerminalReady: false});
    await this.port.setSignals({ requestToSend: true});
    sleep(100);
    await this.port.setSignals({ dataTerminalReady: true});
    await this.port.setSignals({ requestToSend: false});
    sleep(50);
    await this.port.setSignals({ dataTerminalReady: false});
  }

  setMonitorState(isMonitoring: boolean) {
    this.monitorPort = isMonitoring;
    this.monitorStateSource.next(this.monitorPort);
  }

  startMonitor() {
    this.setMonitorState(true);
    this.readLoop();
  }

  async stopMonitor() {
    this.setMonitorState(false);
    await this.reader.cancel();
    await this.readableStreamClosed.catch(() => { });
  }

  async readLoop() {
    while (this.port.readable && this.monitorPort) {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable
        .pipeThrough(new TransformStream(new LineBreakTransformer(this.controlCharacter)))
        .getReader();

      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) {
            console.log("Done reading");
            this.reader.releaseLock();
            break;
          }
          if (value && value !== "") {
            console.log(value);
            this.checkForRestart(value);
            this.monitorMessageSource.next(value);
          }
        }
      } catch (error) {
        console.error("Read Loop error.", error);
      }
      console.log(".");
    }
    console.log("Leaving read loop...");
  }
  
  async flash(partitions: Partition[]) {
    this.loadData(partitions);
    try {
      const loader = new EspLoader(this.port, { debug: false, logger: this.subjectLogger });
      console.log("connecting...");
      await loader.connect();

      try {
        console.log("connected");
        console.log("writing device partitions");
        const chipName = await loader.chipName();
        const macAddr = await loader.macAddr();
        console.log("Device info. Chip: " + chipName + "mac: " + macAddr);
        this.testStateSource.next(TestState.Flashing);
        await loader.loadStub();
        await loader.setBaudRate(115200, 921600);
        let self = this;
        for (let i = 0; i < partitions.length; i++) {
          console.log("\nWriting partition: " + partitions[i].name);
          this.monitorMessageSource.next("Writing partition: " + partitions[i].name);
          await loader.flashData(partitions[i].data, partitions[i].offset, function (idx, cnt) {
            let progressPercent = Math.round((idx * 100 / cnt));
            console.log("Flashing: ", progressPercent);
            self.monitorMessageSource.next('Flashing ' + progressPercent + "%");
            self.flashProgressSource.next({index: i, progress: progressPercent});
          });
          this.monitorMessageSource.next("Partition " + partitions[i].name + ": Done");
          self.flashProgressSource.next({index: i, progress: 100});
          sleep(100);
        }
        console.log("successfully written device partitions");
        console.log("flashing succeeded");
        this.testStateSource.next(TestState.Flashed);
        await loader.flashFinish(true);
      } finally {
        await loader.disconnect();
      }
    } finally {
      console.log("Done flashing");
    }
  }

  async loadData(partitions: Partition[]) {
    this.testStateSource.next(TestState.LoadingFirmware);
    await Promise.all(partitions.map(async (partition) => {
      let buffer = await firstValueFrom<ArrayBuffer>(this.httpClient.get(partition.url, { responseType: 'arraybuffer' }));
      partition.data = new Uint8Array(buffer);
    }));
  }

  async close() {
    try {
      await this.port.close();
      console.log("Port closed");
      this.setState(false);
    } catch (e) {
      console.log('Error clossing port', this.port, e)
    }
  }
}

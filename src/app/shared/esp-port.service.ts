import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { ESPLoader, FlashOptions, IEspLoaderTerminal, LoaderOptions, Transport } from "esptool-js";
import { firstValueFrom, Subject } from 'rxjs';
import { LineBreakTransformer, Partition, PartitionProgress, sleep, TestState } from './utils.service';
import { MD5, enc  } from 'crypto-js'; 


@Injectable({
  providedIn: 'root'
})
export class EspPortService {

  private connected = false;
  private monitorPort = false;
  private monitorTask?: Promise<void>;
  port!: SerialPort;

  private controlCharacter: string = "\n";

  private transport: Transport;
  private esploader: ESPLoader;

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
  private resetMessageMatchers: string[] = ['rst:0x1', 'configsip', 'mode:DIO', 'entry 0x', 'READY_FOR_SELFTEST'];
  private selfTestMatchers: string[] = ['READY_FOR_SELFTEST'];

  private reader?: ReadableStreamDefaultReader;
  private readableStreamClosed!: any;

  private espLoaderTerminal = {
    clean: () => {
      this.monitorMessageSource.next("Clean");
    },
    writeLine: (data: any) => {
      this.monitorMessageSource.next(data);
    },
    write: (data: any) => {
      this.monitorMessageSource.next(data);
    },
  };


  constructor(public httpClient: HttpClient) {
  }

  async connect() {

    // If port is still open close it first
    if (this.port && (this.port.readable || this.port.writable)) {
      console.log("Port still seems to be connected. Closing");
      await this.close();
      this.setState(false);
    }

    const port = await navigator.serial.requestPort();
    this.port = port;
    this.transport = new Transport(port);
    try {
       
      const flashOptions = {
        transport: this.transport,
        // Initial ROM handshake stays at 115200; the loader switches for flashing.
        romBaudrate: 115200,
        baudrate: 460800,
        terminal: this.espLoaderTerminal

      } as LoaderOptions;
      this.esploader = new ESPLoader(flashOptions);
  
      const chip = await this.serialOperation('Connect to bootloader', () => this.esploader.main_fn(), 60000);
      console.log(this.esploader.chip);
    } catch (e) {
      console.error(e);
      this.setState(false);
      throw e;
    }
    await this.openPort(port);

  }

  async openPort(port: SerialPort) {
      this.port = port;
      console.log('oppening port:', port)
      this.port.addEventListener('connect', (event) => {
        this.setState(true);
      });
      this.port.addEventListener('disconnect', (event) => {
        this.setState(false);
      });
      if (!this.port.readable) {
        await this.port.open({ baudRate: 115200 });
      }
      const portInfo = port.getInfo();
      console.log(portInfo);
      this.setState(true);

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

  checkForTesting(message: string) {
    // Check the given console message for some trigger characters
    // and publish a message if that is the case
    for (let matcher of this.selfTestMatchers) {
      if (message.indexOf(matcher) > -1) {
        this.testStateSource.next(TestState.Testing);        
        break;
      }
    }

  }

  async reconnect() {
    await this.stopMonitor();
    if (!this.port) throw new Error('No serial port selected.');
    // A failed close must not leave the console on the 460800-baud loader port.
    this.setState(false);
    this.monitorMessageSource.next('Switching serial console to 115200 baud...');
    if (this.port.readable || this.port.writable) await this.serialOperation('Close flashing port', () => this.port.close());
    await this.serialOperation('Open test console', () => this.openPort(this.port)); // Always reopens the console at 115200.
  }

  setState(isConnected: boolean) {
    this.connected = isConnected;
    this.portStateSource.next(this.connected);
    this.testStateSource.next(isConnected ? TestState.Connected : TestState.Initial);
  }

  async sendSelfTestCommand() {
    await this.sendCommand('SELFTEST');
  }

  async sendCommand(command: string) {
    if (!this.port?.writable) throw new Error('Serial port is not writable. Reconnect and retry.');
    const writer = this.port.writable.getWriter();
    try {
      this.monitorMessageSource.next('Serial TX: ' + command);
      await this.serialOperation('Send serial command', () => writer.write(new TextEncoder().encode(command + '\n')));
    } finally {
      writer.releaseLock();
    }
  }

  async resetDevice() {
    this.testStateSource.next(TestState.Restarting);
    this.monitorMessageSource.next('Resetting into application (BOOT released)...');
    // Normal application reset: never assert DTR/BOOT while releasing EN.
    await this.serialOperation('Release BOOT', () => this.port.setSignals({ dataTerminalReady: false }));
    await this.serialOperation('Assert reset', () => this.port.setSignals({ requestToSend: true }));
    await sleep(100);
    await this.serialOperation('Release reset', () => this.port.setSignals({ requestToSend: false }));
    await sleep(100);
  }

  private async serialOperation<T>(label: string, operation: () => Promise<T>, timeoutMs = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(label + ' timed out. Disconnect and reconnect the USB cable, then retry.')), timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  setMonitorState(isMonitoring: boolean) {
    this.monitorPort = isMonitoring;
    this.monitorStateSource.next(this.monitorPort);
  }

  startMonitor() {
    if (this.monitorTask) return;
    if (!this.port?.readable) throw new Error('Serial port is not readable. Reconnect and retry.');
    this.setMonitorState(true);
    this.monitorTask = this.readLoop().finally(() => { this.monitorTask = undefined; });
  }

  async stopMonitor() {
    this.setMonitorState(false);
    if (this.reader) await this.serialOperation('Stop serial reader', () => this.reader!.cancel().catch(() => { }));
    if (this.monitorTask) await this.serialOperation('Release serial monitor', () => this.monitorTask!);
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    // Handle stream failure immediately, even before the line reader exits.
    this.readableStreamClosed = this.port.readable!.pipeTo(textDecoder.writable).catch(error => {
      if (this.monitorPort) this.monitorMessageSource.next('Serial read failed: ' + String(error));
    });
    const reader = textDecoder.readable
      .pipeThrough(new TransformStream(new LineBreakTransformer(this.controlCharacter)))
      .getReader();
    this.reader = reader;
    try {
      while (this.monitorPort) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value !== '') {
          this.checkForRestart(value);
          this.checkForTesting(value);
          this.monitorMessageSource.next(value);
        }
      }
    } catch (error) {
      if (this.monitorPort) this.monitorMessageSource.next('Serial read failed: ' + String(error));
    } finally {
      await reader.cancel().catch(() => { });
      reader.releaseLock();
      await this.readableStreamClosed;
      this.reader = undefined;
      this.setMonitorState(false);
    }
  }

  async flash(partitions: Partition[]) {
    await this.loadData(partitions);
    const flashOptions = {
      fileArray: partitions.map(partition => ({ data: partition.data, address: partition.offset })),
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (index: number, written: number, total: number) => {
        this.flashProgressSource.next({index, progress: Math.round((written / total) * 100)});
      },
      calculateMD5Hash: (image: string) => MD5(enc.Latin1.parse(image)).toString(),
    } as FlashOptions;
    this.testStateSource.next(TestState.Flashing);
    await this.serialOperation('Flash transfer/finalization', () => this.esploader.write_flash(flashOptions), 300000);
    // write_flash() already calls flash_defl_finish()/flash_finish().
    // Leave reset to the runner, after reopening and monitoring at console baud.
    this.monitorMessageSource.next('Flash transfer completed; preparing application console.');
    this.testStateSource.next(TestState.Flashed);
  }

  async loadData(partitions: Partition[]) {
    this.testStateSource.next(TestState.LoadingFirmware);
    await Promise.all(partitions.map(async (partition) => {
      let buffer = await firstValueFrom<ArrayBuffer>(this.httpClient.get(partition.url, {
        responseType: 'arraybuffer',
        params: { _cb: Date.now().toString() }
      }));
      console.log("Array Buffer Length: %d", buffer.byteLength);
      partition.data = "";
      var byteArray = new Uint8Array(buffer);
      var decoder = new TextDecoder();
      var value: number;
      for (var i = 0; i < byteArray.length; i++) {
        partition.data += String.fromCharCode((byteArray.at(i) || 0));
      }
      let calculatedMD5 = MD5(enc.Latin1.parse(partition.data)).toString();
      if (partition.md5 && calculatedMD5 != partition.md5) {
        this.monitorMessageSource.next("MD5 mismatch for partition: " + partition.name);
        this.monitorMessageSource.next("Calculated: " + calculatedMD5);
        this.monitorMessageSource.next("Expected: " + partition.md5);
        this.monitorMessageSource.next("Please refresh browser and try again.");
        throw new Error("MD5 mismatch for partition: " + partition.name);
        return;
      }
    }));
  }

  async close() {
    await this.stopMonitor();
    this.setState(false);
    if (this.port && (this.port.readable || this.port.writable)) await this.port.close();
  }
}

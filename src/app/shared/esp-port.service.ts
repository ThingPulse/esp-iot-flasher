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
  private monitorPort = true;
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

  private reader!: ReadableStreamDefaultReader;
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
    if (this.port && this.connected) {
      console.log("Port still seems to be connected. Closing");
      await this.close();
      this.setState(false);
    }

    const port = await navigator.serial.requestPort();
    this.transport = new Transport(port);
    try {
       
      const flashOptions = {
        transport: this.transport,
        baudrate: 115200,
        terminal: this.espLoaderTerminal

      } as LoaderOptions;
      this.esploader = new ESPLoader(flashOptions);
  
      const chip = await this.esploader.main_fn();
      console.log(this.esploader.chip);
    } catch (e) {
      console.error(e);
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
    try {
      await this.port.close();
      console.log("Port closed");
    }
    catch (e) {
      console.log('Error clossing port', this.port, e)
    }
    this.setState(false);
    await this.openPort(this.port);
  }

  setState(isConnected: boolean) {
    this.connected = isConnected;
    this.portStateSource.next(this.connected);
    this.testStateSource.next(isConnected ? TestState.Connected : TestState.Initial);
  }

  async sendSelfTestCommand() {
        console.log("Sending self test command");
        const encoder = new TextEncoder();
        const writer = this.port.writable?.getWriter();
        if (writer) {
          await writer.write(encoder.encode("SELFTEST\n"));
          writer.releaseLock();
        }
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
    console.log("Is port readable: " + this.port.readable);

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
              this.checkForTesting(value);
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
    await this.loadData(partitions);
    try {
      console.log("connecting...");


      try {
        const fileArray = [];
        //const progressBars = [];
        for (let i = 0; i < partitions.length; i++) {
          fileArray.push({ data: partitions[i].data, address: partitions[i].offset });
        }
        try {
          const flashOptions: FlashOptions = {
            fileArray: fileArray,
            flashSize: "keep",
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
              this.flashProgressSource.next({index: fileIndex, progress: Math.round((written / total) * 100)});
            },
            calculateMD5Hash: (image) => {
              MD5(enc.Latin1.parse(image)).toString()
            },
          } as FlashOptions;
          this.testStateSource.next(TestState.Flashing);
          await this.esploader.write_flash(flashOptions);
        } catch (e) {
          console.error(e);
          await this.reconnect();

        } 
        console.log("successfully written device partitions");
        console.log("flashing succeeded");
        this.testStateSource.next(TestState.Flashed);
        await this.esploader.flash_finish(false);
      } finally {
        await this.esploader.hard_reset();
      }
    } finally {
      console.log("Done flashing");
    }
  }

  async loadData(partitions: Partition[]) {
    this.testStateSource.next(TestState.LoadingFirmware);
    await Promise.all(partitions.map(async (partition) => {
      let buffer = await firstValueFrom<ArrayBuffer>(this.httpClient.get(partition.url, { responseType: 'arraybuffer' }));
      console.log("Array Buffer Length: %d", buffer.byteLength);
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
    try {
      await this.port.close();
      console.log("Port closed");
      this.setState(false);
    } catch (e) {
      console.log('Error clossing port', this.port, e)
    }
  }
}

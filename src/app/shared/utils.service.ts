import { Injectable } from '@angular/core';


export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Partition = {
  name: string;
  data: string;
  md5: string;
  offset: number;
  url: string;
};

export type PartitionProgress = {
  index: number;
  progress: number;
};


export enum TestState {
  Initial = "Initial",
  Connected = "Connected",
  LoadingFirmware = "Loading Firmware",
  Flashing = "Flashing",
  Flashed = "Flashed",
  Restarting = "Restarting",
  Restarted = "Restarted",
  Testing = "Testing",
  Tested = "Tested",
}

export class LineBreakTransformer {
  container: any = "";
  private controlCharacter: string;

  constructor(controlCharacter: string) {
     this.container = '';
     this.controlCharacter = controlCharacter
  }

  transform(chunk: any, controller: any) {
     this.container += chunk;
     const lines = this.container.split(this.controlCharacter);
     this.container = lines.pop();
     lines.forEach((line: any) => controller.enqueue(line));
  }

  flush(controller: any) {
     controller.enqueue(this.container);
  }
}

export class JsonTransformer {

  container: any = "";
  transform(chunk: any, controller: any) { 
      try {
        controller.enqueue(JSON.parse(chunk));
      } catch(e) {
        console.log("Not a valid JSON. Chunk: ", chunk, e);
      }
  }

  flush(controller: any) {
    controller.enqueue(this.container);
 }
}

@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  constructor() { }
}

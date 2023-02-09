export interface FirmwareMessage {
    heapSize: number;
    freeHeap: number;
    psramSize: number;
    freePsram: number;
    buildTime: string;
    buildDate: string;
}

import { Partition } from "../shared/utils.service";

export interface DeviceConfiguration {
    id: string;
    name: string;
    imageSource: string;
    partitions: Partition[];
    testSets?: ('hardware' | 'cellular')[];
    cellular?: { apn: string; url: string };
}

import { Partition } from "../shared/utils.service";

export interface DeviceConfiguration {
    id: string;
    name: string;
    imageSource: string;
    partitions: Partition[];
}

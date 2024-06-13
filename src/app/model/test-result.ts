export interface TestResult {
    mac_address: string;
    overall_result: 'OK' | 'NOK';
    device_type: string;
    [key: string]: any;
  }
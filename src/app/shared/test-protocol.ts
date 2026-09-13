import { FirmwareMessage } from '../model/firmware-message';

export type TestSet = 'hardware' | 'cellular';
export interface Capabilities { type: 'capabilities'; protocol: 2; testSets: TestSet[]; }
export function isCapabilities(value: any): value is Capabilities {
  return value?.type === 'capabilities' && value.protocol === 2 &&
    Array.isArray(value.testSets) && value.testSets.length > 0 &&
    value.testSets.every((set: any) => set === 'hardware' || set === 'cellular');
}
export function isReport(value: any): value is FirmwareMessage[] {
  return Array.isArray(value) && value.length > 0 && value.every(row =>
    row && typeof row.name === 'string' && typeof row.value === 'string' &&
    ['OK', 'NOK', 'INFO'].includes(row.result));
}
export function validCellularSettings(apn: string, url: string): boolean {
  if (!apn || apn.length > 63 || url.length > 200 || /[\s"\\\x00-\x1f\x7f-\uffff]/.test(apn + url)) return false;
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password; }
  catch { return false; }
}
export function startCommand(set: TestSet, capabilities: Capabilities | null, apn: string, url: string): string {
  if (!capabilities) {
    if (set !== 'hardware') throw new Error('This firmware does not support cellular testing. Flash updated firmware.');
    return '{"ST":true}';
  }
  if (!capabilities.testSets.includes(set)) throw new Error('This firmware does not support the selected test set.');
  if (set === 'cellular') {
    if (!validCellularSettings(apn, url)) throw new Error('Enter a valid APN and an HTTP(S) test URL (maximum 200 characters).');
    return JSON.stringify({ ST: true, testSet: set, apn, url });
  }
  return JSON.stringify({ ST: true, testSet: set });
}
export function auditReport(rows: FirmwareMessage[], requested: TestSet, protocol: number): FirmwareMessage[] {
  const setRows = rows.filter(row => row.name === 'Test Set');
  const versions = rows.filter(row => row.name === 'Protocol Version');
  const matched = setRows.length === 1 && setRows[0].value === requested && setRows[0].result === 'OK';
  const versionMatched = versions.length === 1 && versions[0].value === '2' && versions[0].result === 'OK';
  const errors: FirmwareMessage[] = [];
  if ((protocol === 2 || requested === 'cellular') && (!matched || !versionMatched)) {
    errors.push({ name: 'Test Set Verification', value: 'Firmware did not confirm the requested test set and protocol.', result: 'NOK' });
  } else if (setRows.length && !matched) {
    errors.push({ name: 'Test Set Verification', value: 'Reported test set does not match the requested test set.', result: 'NOK' });
  }
  const cellularRows = rows.filter(row => row.name === 'Cellular Connectivity');
  if (requested === 'cellular' && (cellularRows.length !== 1 || !['OK', 'NOK'].includes(cellularRows[0].result))) {
    errors.push({ name: 'Cellular Result Verification', value: 'Required cellular summary is missing, duplicated or not a pass/fail result.', result: 'NOK' });
  }
  return [...rows, ...errors,
    { name: 'Requested Test Set', value: requested, result: 'OK' },
    { name: 'Reported Test Set', value: setRows.length === 1 ? setRows[0].value : 'Not reported (legacy or invalid)', result: 'OK' },
    { name: 'Negotiated Protocol Version', value: protocol === 2 ? '2' : 'legacy', result: 'OK' }];
}

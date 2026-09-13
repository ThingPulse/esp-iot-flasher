import { auditReport, isCapabilities, isReport, startCommand, validCellularSettings } from './test-protocol';

describe('Test-set protocol', () => {
  const capabilities = { type: 'capabilities' as const, protocol: 2 as const, testSets: ['hardware' as const, 'cellular' as const] };
  it('retains the exact legacy start command and blocks legacy cellular', () => {
    expect(startCommand('hardware', null, '', '')).toBe('{"ST":true}');
    expect(() => startCommand('cellular', null, 'internet', 'http://fixture.example/204')).toThrow();
  });
  it('sends the selected set and validated fixture settings', () => {
    expect(JSON.parse(startCommand('cellular', capabilities, 'internet', 'http://fixture.example/204'))).toEqual({ST: true, testSet: 'cellular', apn: 'internet', url: 'http://fixture.example/204'});
    expect(validCellularSettings('x\rAT', 'http://fixture.example')).toBeFalse();
    expect(validCellularSettings('internet', 'file:///tmp/x')).toBeFalse();
    expect(validCellularSettings('internet', '')).toBeFalse();
  });
  it('distinguishes control messages from result arrays', () => {
    expect(isCapabilities(capabilities)).toBeTrue();
    expect(isCapabilities({...capabilities, protocol: 3})).toBeFalse();
    expect(isReport(capabilities)).toBeFalse();
    expect(isReport([])).toBeFalse();
    expect(isReport([{name:'x',value:'x',result:'something'}])).toBeFalse();
  });
  it('cannot record a hardware-only or unidentified result as a cellular pass', () => {
    const legacy = [{name:'Mac Address',value:'aa',result:'OK'}];
    expect(auditReport(legacy, 'hardware', 0).some(x => x.result === 'NOK')).toBeFalse();
    expect(auditReport(legacy, 'cellular', 0).some(x => x.result === 'NOK')).toBeTrue();
    expect(auditReport(legacy, 'hardware', 2).some(x => x.result === 'NOK')).toBeTrue();
    const cellular = [...legacy, {name:'Test Set',value:'cellular',result:'OK'}, {name:'Protocol Version',value:'2',result:'OK'}, {name:'Cellular Connectivity',value:'Verified',result:'OK'}];
    expect(auditReport(cellular, 'cellular', 2).some(x => x.result === 'NOK')).toBeFalse();
    expect(auditReport(cellular.map(row => row.name === 'Cellular Connectivity' ? {...row, result: 'INFO'} : row), 'cellular', 2).some(x => x.result === 'NOK')).toBeTrue();
    expect(auditReport(cellular, 'hardware', 2).some(x => x.result === 'NOK')).toBeTrue();
    expect(auditReport([...cellular, cellular[1]], 'cellular', 2).some(x => x.result === 'NOK')).toBeTrue();
  });
});

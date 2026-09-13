import { fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { TestrunnerComponent } from './testrunner.component';

describe('Test runner serial negotiation', () => {
  let component: TestrunnerComponent;
  let runner: any;
  let sent: string[];
  let stored: any[];
  let port: any;
  beforeEach(() => {
    sent = []; stored = [];
    port = {
      stopMonitor: () => Promise.resolve(), reconnect: () => Promise.resolve(),
      startMonitor: () => undefined, sendCommand: (value: string) => { sent.push(value); return Promise.resolve(); },
      sendSelfTestCommand: () => Promise.resolve(),
    };
    component = new TestrunnerComponent(port, {} as any, {} as any, {sendTestResult: (value: any) => { stored.push(value); return {subscribe: () => undefined}; }} as any);
    runner = component;
    component.deviceConfiguration = {id:'lte',name:'LTE',imageSource:'',partitions:[],testSets:['hardware','cellular']};
    component.stepper = {selectedIndex: 0} as any;
  });
  it('waits for capabilities and accepts only one confirmed cellular report', fakeAsync(() => {
    component.selectedTestSet = 'cellular'; component.cellularUrl = 'http://fixture.example/204';
    void component.test(); tick(1000);
    expect(sent).toEqual(['{"CAP":true}']);
    runner.handleSerialMessage('{"type":"capabilities","protocol":2,"testSets":["hardware","cellular"]}');
    flushMicrotasks();
    expect(JSON.parse(sent[1]).testSet).toBe('cellular');
    const report = JSON.stringify([{name:'Mac Address',value:'aa',result:'OK'}, {name:'Test Set',value:'cellular',result:'OK'}, {name:'Protocol Version',value:'2',result:'OK'}, {name:'Cellular Connectivity',value:'verified',result:'OK'}]);
    runner.handleSerialMessage(report); runner.handleSerialMessage(report); flushMicrotasks();
    expect(stored.length).toBe(1); expect(stored[0].overall_result).toBe('OK');
    expect(stored[0].additional_info.find((row: any) => row.name === 'Requested Test Set').value).toBe('cellular'); expect(component.busy).toBeFalse();
  }));
  it('blocks cellular on a legacy device even if it emits a successful array', fakeAsync(() => {
    component.selectedTestSet='cellular'; component.cellularUrl='http://fixture.example/204';
    void component.test(); tick(1000);
    runner.handleSerialMessage('[{"name":"Mac Address","value":"aa","result":"OK"}]');
    tick(2500); flushMicrotasks();
    expect(sent.length).toBe(1); expect(stored.length).toBe(0);
    expect(component.testError).toContain('does not support cellular'); expect(component.busy).toBeFalse();
  }));
  it('supports legacy automatic reports and legacy ST firmware', fakeAsync(() => {
    void component.test(); tick(3500);
    expect(sent).toEqual(['{"CAP":true}', '{"ST":true}']);
    runner.handleSerialMessage('[{"name":"Mac Address","value":"aa","result":"OK"}]'); flushMicrotasks();
    expect(stored[0].overall_result).toBe('OK');
    sent.length=0;
    void component.test(); tick(1000);
    runner.handleSerialMessage('[{"name":"Mac Address","value":"aa","result":"OK"}]');
    tick(2500); flushMicrotasks();
    expect(sent).toEqual(['{"CAP":true}']); expect(stored.length).toBe(2);
  }));
  it('fails missing profile confirmation and times out without a result', fakeAsync(() => {
    void component.test(); tick(1000);
    runner.handleSerialMessage('{"type":"capabilities","protocol":2,"testSets":["hardware"]}'); flushMicrotasks();
    runner.handleSerialMessage('[{"name":"Mac Address","value":"aa","result":"OK"}]'); flushMicrotasks();
    expect(stored[0].overall_result).toBe('NOK');
    void component.test(); tick(3500); tick(120000); flushMicrotasks();
    expect(component.testError).toContain('Timed out'); expect(stored.length).toBe(1);
  }));
  it('opens the console and starts reading before resetting after a flash', fakeAsync(() => {
    const order: string[] = [];
    port.connect = () => { order.push('connect'); return Promise.resolve(); };
    port.flash = () => { order.push('flash'); return Promise.resolve(); };
    port.reconnect = () => { order.push('console'); return Promise.resolve(); };
    port.startMonitor = () => { order.push('monitor'); };
    port.resetDevice = () => { order.push('reset'); return Promise.resolve(); };
    void component.flashAndTest(); tick(1000);
    expect(order).toEqual(['connect', 'flash', 'console', 'monitor', 'reset']);
    expect(sent).toEqual(['{"CAP":true}']);
    runner.handleSerialMessage('{"type":"capabilities","protocol":2,"testSets":["hardware"]}'); flushMicrotasks();
    runner.handleSerialMessage('[{"name":"Test Set","value":"hardware","result":"OK"},{"name":"Protocol Version","value":"2","result":"OK"}]'); flushMicrotasks();
    expect(component.busy).toBeFalse();
  }));

});

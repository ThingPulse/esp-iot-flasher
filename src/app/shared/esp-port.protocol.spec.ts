import { fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { EspPortService } from './esp-port.service';
import { TestState } from './utils.service';

describe('Serial monitor and flash handoff', () => {
  let service: EspPortService;
  let input: ReadableStreamDefaultController<Uint8Array>;
  let port: any;
  beforeEach(() => {
    service = new EspPortService({} as any);
    port = {
      readable: new ReadableStream<Uint8Array>({ start(controller) { input = controller; } }),
      writable: new WritableStream(),
      addEventListener: () => undefined, getInfo: () => ({}),
      open: jasmine.createSpy('open').and.callFake(async () => {
        port.readable = new ReadableStream<Uint8Array>({ start(controller) { input = controller; } });
        port.writable = new WritableStream();
      }),
      close: jasmine.createSpy('close').and.callFake(async () => {
        if (port.readable.locked || port.writable.locked) throw new Error('locked');
        port.readable = null; port.writable = null;
      }),
    };
    service.port = port;
  });
  afterEach(async () => { await service.stopMonitor(); });
  it('starts a real reader on the first call, reads split replies, and can restart', async () => {
    let resolveLine!: (value: string) => void;
    const first = new Promise<string>(resolve => resolveLine = resolve);
    const received: string[] = [];
    service.monitorMessageStream.subscribe(value => { received.push(value); resolveLine(value); });
    service.startMonitor(); service.startMonitor();
    input.enqueue(new TextEncoder().encode('{"type":"capabili'));
    input.enqueue(new TextEncoder().encode('ties"}\r\n'));
    expect(await first).toContain('capabilities');
    expect(received.length).toBe(1);
    await service.reconnect();
    expect(port.close).toHaveBeenCalledTimes(1);
    expect(port.open).toHaveBeenCalledWith({baudRate: 115200});
    const second = new Promise<string>(resolve => resolveLine = resolve);
    service.startMonitor();
    input.enqueue(new TextEncoder().encode('[{"name":"Test Set"}]\n'));
    expect(await second).toContain('Test Set');
  });
  it('does not continue at the old flashing baud rate if closing fails', async () => {
    port.close.and.rejectWith(new Error('close failed'));
    await expectAsync(service.reconnect()).toBeRejectedWithError('close failed');
    expect(port.open).not.toHaveBeenCalled();
  });
  it('releases the writer lock even when sending a command fails', async () => {
    port.writable = new WritableStream({write() { throw new Error('write failed'); }});
    await expectAsync(service.sendCommand('{"ST":true}')).toBeRejectedWithError('write failed');
    expect(port.writable.locked).toBeFalse();
  });
  it('reports flash failures instead of emitting Flashed and proceeding to tests', async () => {
    const states: TestState[] = [];
    service.testStateStream.subscribe(state => states.push(state));
    spyOn(service, 'loadData').and.resolveTo();
    (service as any).esploader = {write_flash: () => Promise.reject(new Error('flash failed'))};
    await expectAsync(service.flash([])).toBeRejectedWithError('flash failed');
    expect(states).toEqual([TestState.Flashing]);
  });
  it('finishes flashing exactly once through write_flash and defers reset to the console handoff', async () => {
    spyOn(service, 'loadData').and.resolveTo();
    const loader = {write_flash: jasmine.createSpy().and.resolveTo(), flash_finish: jasmine.createSpy(), hard_reset: jasmine.createSpy()};
    (service as any).esploader = loader;
    await service.flash([]);
    expect(loader.write_flash).toHaveBeenCalledTimes(1);
    expect(loader.flash_finish).not.toHaveBeenCalled();
    expect(loader.hard_reset).not.toHaveBeenCalled();
  });
  it('releases BOOT and holds reset for 100 ms before running the application', fakeAsync(() => {
    const signals: any[] = [];
    port.setSignals = (value: any) => { signals.push(value); return Promise.resolve(); };
    let done = false;
    void service.resetDevice().then(() => done = true);
    flushMicrotasks();
    expect(signals).toEqual([{dataTerminalReady: false}, {requestToSend: true}]);
    tick(99); expect(signals.length).toBe(2);
    tick(1); expect(signals[2]).toEqual({requestToSend: false});
    tick(100); expect(done).toBeTrue();
  }));
  it('bounds a stuck close instead of leaving the tester spinning', fakeAsync(() => {
    port.close.and.returnValue(new Promise(() => {}));
    let error = '';
    void service.reconnect().catch(value => error = value.message);
    flushMicrotasks(); tick(10000); flushMicrotasks();
    expect(error).toContain('Close flashing port timed out');
    expect(port.open).not.toHaveBeenCalled();
  }));

});

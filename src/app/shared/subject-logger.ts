import { Logger } from "esptool.ts";
import { Subject } from "rxjs";

// Implements logger interface and emmits
// log messages to subscribers
export class SubjectLogger implements Logger {

    private logStatementSource = new Subject<string>();
    logStatementStream = this.logStatementSource.asObservable();

    debug(message: string, ...optionalParams: unknown[]): void {
        console.debug(message, optionalParams);
        this.logStatementSource.next(message);
    }
    log(message: string, ...optionalParams: unknown[]): void {
        console.log(message, optionalParams);
        this.logStatementSource.next(message);
    }
    error(message: string, ...optionalParams: unknown[]): void {
        console.error(message, optionalParams);
        this.logStatementSource.next(message);
    }

}

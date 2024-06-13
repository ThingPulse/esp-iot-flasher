import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TestResult } from '../model/test-result';

@Injectable({
  providedIn: 'root'
})
export class TestResultService {

  private apiUrl = '/api/rest.php'; // Update with your actual API endpoint
  private apiKey = 'yourkey'; // Replace with your generated API key

  constructor(private http: HttpClient) { }

  sendTestResult(result: TestResult): Observable<any> {
    const headers = new HttpHeaders({ 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    });
    return this.http.post<any>(this.apiUrl, result, { headers: headers })
      .pipe(
        catchError(this.handleError<any>('sendTestResult'))
      );
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(error); // Log the error for debugging purposes
      // Let the app continue by returning an empty result.
      return of(result as T);
    };
  }
}

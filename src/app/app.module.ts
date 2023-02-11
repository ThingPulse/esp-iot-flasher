import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { TestrunnerComponent } from './components/testrunner/testrunner.component';
import { MaterialModule } from './material/material.module';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AddLocalConfigurationComponent } from './components/add-local-configuration/add-local-configuration.component'

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'device/:deviceId', component: TestrunnerComponent },
  { path: '**', redirectTo: '/', pathMatch: 'full' }
];

@NgModule({
  declarations: [
    AppComponent,
    TestrunnerComponent,
    HomeComponent,
    AddLocalConfigurationComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    BrowserAnimationsModule,
    MaterialModule,
    FormsModule,
    RouterModule.forRoot(routes)
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

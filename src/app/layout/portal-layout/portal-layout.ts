import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar';
import { FooterComponent } from '../../shared/footer/footer';

@Component({
  selector: 'app-portal-layout',
  imports: [RouterOutlet, NavbarComponent, FooterComponent],
  template: `
    <app-navbar />
    <router-outlet />
    <app-footer />
  `,
  styles: [':host { display: flex; flex-direction: column; min-height: 100vh; }']
})
export class PortalLayoutComponent {}

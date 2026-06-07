import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

declare const bootstrap: any;

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html'
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  private document = inject(DOCUMENT);

  cerrarMenu(): void {
    const menu = this.document.getElementById('menuPortal');
    if (menu?.classList.contains('show')) {
      bootstrap.Collapse.getInstance(menu)?.hide();
    }
  }

  logout() {
    this.auth.logout();
  }
}

import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificacionService } from '../../core/services/notificacion.service';

declare const bootstrap: any;

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html'
})
export class NavbarComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly notifService = inject(NotificacionService);

  readonly badgeCount = signal(0);

  ngOnInit() {
    this.notifService.contarNoLeidas().subscribe({
      next: count => this.badgeCount.set(count),
      error: () => {}
    });
  }
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

import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-portal-inicio',
  templateUrl: './portal-inicio.html'
})
export class PortalInicioComponent {
  readonly auth = inject(AuthService);
}

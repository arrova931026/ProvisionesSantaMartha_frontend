import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { DOCUMENT } from '@angular/common';

declare const bootstrap: any;

@Component({
  selector: 'app-portal-inicio',
  templateUrl: './portal-inicio.html'
})
export class PortalInicioComponent {
  readonly auth = inject(AuthService);
  private document = inject(DOCUMENT);

  abrirModalAsistencia(): void {
    const el = this.document.getElementById('modalAsistenciaPortal');
    if (el) new bootstrap.Modal(el).show();
  }

  contactarWhatsApp(): void {
    window.open(
      'https://api.whatsapp.com/send?phone=5217821574801&text=Necesito%20servicios%20funerarios',
      '_blank',
      'noopener,noreferrer'
    );
  }

  contactarLlamada(): void {
    const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      this.document.defaultView?.navigator.userAgent ?? ''
    );

    if (isMobile) {
      this.document.defaultView!.location.href = 'tel:+5217821574801';
    } else {
      const modalAsistencia = bootstrap.Modal.getInstance(
        this.document.getElementById('modalAsistenciaPortal')
      );
      modalAsistencia?.hide();

      const elNum = this.document.getElementById('modalNumeroPortal');
      if (elNum) new bootstrap.Modal(elNum).show();
    }
  }
}

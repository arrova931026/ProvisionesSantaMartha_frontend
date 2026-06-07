import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';

declare const bootstrap: any;

@Component({
  selector: 'app-inicio-publico',
  imports: [RouterLink],
  templateUrl: './inicio-publico.html'
})
export class InicioPublicoComponent {
  private document = inject(DOCUMENT);

  cerrarMenu(): void {
    const menu = this.document.getElementById('menuPublico');
    if (menu?.classList.contains('show')) {
      bootstrap.Collapse.getInstance(menu)?.hide();
    }
  }

  abrirModalAsistencia(): void {
    const el = this.document.getElementById('modalAsistencia');
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
        this.document.getElementById('modalAsistencia')
      );
      modalAsistencia?.hide();

      const elNum = this.document.getElementById('modalNumero');
      if (elNum) new bootstrap.Modal(elNum).show();
    }
  }
}

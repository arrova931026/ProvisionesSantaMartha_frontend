import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';

declare const bootstrap: any;

@Component({
  selector: 'app-informacion',
  imports: [RouterLink],
  templateUrl: './informacion.html'
})
export class InformacionComponent {
  private router = inject(Router);
  private document = inject(DOCUMENT);

  get isPublic(): boolean {
    return !this.router.url.startsWith('/portal');
  }

  cerrarMenu(): void {
    const menu = this.document.getElementById('menuPublicoInfo');
    if (menu?.classList.contains('show')) {
      bootstrap.Collapse.getInstance(menu)?.hide();
    }
  }

  readonly faqs = [
    {
      q: '¿Cómo puedo actualizar mis datos de contacto?',
      a: 'Ingrese a la sección "Mis Datos" desde el menú principal y haga clic en "Editar" para modificar su teléfono, correo o dirección.'
    },
    {
      q: '¿Qué pasa si no realizo mi pago mensual a tiempo?',
      a: 'Después de 30 días de atraso, su plan puede ser suspendido temporalmente. Realice su pago para reactivarlo sin perder antigüedad.'
    },
    {
      q: '¿Cuántos beneficiarios puedo registrar?',
      a: 'Puede registrar hasta 5 beneficiarios, sujeto a los términos de su plan contratado.'
    },
    {
      q: '¿Cómo reporto el fallecimiento de un titular?',
      a: 'Comuníquese de inmediato a nuestro número de asistencia 24/7: 782 157 4801 o vía WhatsApp.'
    },
    {
      q: '¿Puedo cambiar mi plan funerario?',
      a: 'Sí, puede solicitar un cambio de plan contactando a su agente asignado.'
    }
  ];
}

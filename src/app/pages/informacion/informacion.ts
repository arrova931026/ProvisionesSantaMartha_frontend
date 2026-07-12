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
      a: 'La cantidad de beneficiarios depende del plan contratado. Revise su contrato o contacte a su agente para más detalles.'
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

  // ── Helpers de PDF ────────────────────────────────────────────────────────

  private _abrirPdf(titulo: string, html: string) {
    const win = window.open('', '_blank', 'width=860,height=760');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  private _encabezadoPdf(titulo: string, subtitulo = ''): string {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${titulo} — Sociedad Humanista Santa Martha</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Open+Sans:wght@300;400;600&display=swap');
  :root { --navy:#1a2e4a; --gold:#c9a84c; --gold-light:#e8d5a3; --gray:#6b7280; --light:#f8f7f4; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Open Sans',sans-serif;background:#fff;color:#333;font-size:12px;line-height:1.7}
  .cover{background:linear-gradient(160deg,var(--navy) 0%,#243b55 100%);color:#fff;padding:52px 60px 44px;text-align:center;position:relative}
  .cover::before{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='30' cy='30' r='1' fill='rgba(201,168,76,0.15)'/%3E%3C/svg%3E")}
  .ornamento{font-size:1.6rem;color:var(--gold-light);letter-spacing:8px;margin-bottom:18px;display:block}
  .cover-logo{font-family:'Playfair Display',serif;font-size:1.55rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#fff;margin-bottom:4px}
  .cover-sub{font-size:.78rem;color:var(--gold-light);letter-spacing:4px;text-transform:uppercase;margin-bottom:28px}
  .linea-dorada{width:80px;height:2px;background:var(--gold);margin:18px auto}
  .cover-titulo{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.3}
  .cover-subtitulo{font-size:.85rem;color:var(--gold-light);font-style:italic}
  .cover-fecha{font-size:.72rem;color:rgba(255,255,255,.5);margin-top:28px;letter-spacing:2px}
  .contenido{padding:44px 60px}
  .seccion{margin-bottom:32px}
  .seccion-titulo{font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--navy);border-bottom:1.5px solid var(--gold);padding-bottom:6px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .seccion-titulo::before{content:'✦';color:var(--gold);font-size:.8rem}
  p{font-size:.87rem;color:#444;line-height:1.8;margin-bottom:10px}
  ul,ol{padding-left:20px;margin-bottom:10px}
  li{font-size:.87rem;color:#444;line-height:1.7;margin-bottom:4px}
  .art{background:var(--light);border-left:3px solid var(--gold);padding:10px 16px;margin-bottom:12px;border-radius:0 6px 6px 0}
  .art strong{font-family:'Playfair Display',serif;color:var(--navy);display:block;margin-bottom:4px;font-size:.88rem}
  .nota{background:#fffbf0;border:1px solid var(--gold-light);border-radius:6px;padding:12px 16px;font-size:.82rem;color:#7a5c00;margin-top:18px}
  .footer-doc{background:var(--navy);color:rgba(255,255,255,.65);text-align:center;padding:18px;font-size:.72rem;letter-spacing:1px;position:fixed;bottom:0;width:100%}
  .paso{display:flex;gap:14px;margin-bottom:14px;align-items:flex-start}
  .paso-num{width:28px;height:28px;background:var(--navy);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;flex-shrink:0;margin-top:2px}
  .paso-txt strong{color:var(--navy);font-size:.88rem;display:block;margin-bottom:2px}
  .paso-txt span{font-size:.82rem;color:var(--gray)}
  .req-item{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eee}
  .req-item:last-child{border-bottom:none}
  .req-icon{color:var(--gold);font-size:1rem;flex-shrink:0;margin-top:2px}
  .req-txt strong{display:block;color:var(--navy);font-size:.87rem;margin-bottom:2px}
  .req-txt span{font-size:.8rem;color:var(--gray)}
  .badge-obligatorio{background:var(--navy);color:#fff;font-size:.65rem;padding:2px 8px;border-radius:50px;margin-left:6px}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.footer-doc{position:static;margin-top:32px}}
</style></head><body>
<div class="cover">
  <span class="ornamento">✦ ❧ ✦</span>
  <div class="cover-logo">Sociedad Humanista Santa Martha</div>
  <div class="cover-sub">S.A. de C.V. &nbsp;·&nbsp; Poza Rica, Veracruz</div>
  <div class="linea-dorada"></div>
  <div class="cover-titulo">${titulo}</div>
  ${subtitulo ? `<div class="cover-subtitulo">${subtitulo}</div>` : ''}
  <div class="cover-fecha">${new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}</div>
</div>
<div class="contenido">`;
  }

  private _piePdf(): string {
    return `</div>
<div class="footer-doc">
  ✦ &nbsp; Sociedad Humanista Santa Martha S.A. de C.V. &nbsp;·&nbsp; Poza Rica, Ver. &nbsp;·&nbsp; Tel. 782 157 4801 &nbsp; ✦
</div>
<script>setTimeout(()=>window.print(),600)</script>
</body></html>`;
  }

  descargarReglamento() {
    const html = this._encabezadoPdf('Reglamento del Plan Funerario Mutualista', 'Derechos, obligaciones y condiciones generales del plan contratado') + `
  <div class="seccion">
    <div class="seccion-titulo">Capítulo I — Disposiciones Generales</div>
    <div class="art"><strong>Artículo 1. Objeto</strong>El presente Reglamento regula los derechos y obligaciones de los socios y de Sociedad Humanista Santa Martha S.A. de C.V. en el marco del plan funerario mutualista.</div>
    <div class="art"><strong>Artículo 2. Vigencia</strong>El plan entra en vigor a partir de la fecha de firma del contrato y la liquidación de la primera mensualidad, permaneciendo activo mientras el socio se encuentre al corriente en sus pagos.</div>
    <div class="art"><strong>Artículo 3. Cobertura</strong>El plan cubre los servicios funerarios básicos y complementarios descritos en el contrato individual del socio, incluyendo traslado, velación, inhumación o cremación según el plan contratado.</div>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Capítulo II — Derechos del Socio</div>
    <ul>
      <li>Recibir los servicios contratados en el momento del fallecimiento del titular o beneficiarios registrados.</li>
      <li>Acceder al portal en línea para consultar el estado de su contrato, mensualidades y cobertura.</li>
      <li>Solicitar la modificación de datos personales o de beneficiarios mediante su agente asignado.</li>
      <li>Recibir atención personalizada las 24 horas del día, los 365 días del año.</li>
      <li>Conservar la antigüedad del plan en caso de reactivación dentro del período permitido.</li>
    </ul>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Capítulo III — Obligaciones del Socio</div>
    <ul>
      <li>Realizar el pago puntual de la mensualidad pactada en su contrato.</li>
      <li>Notificar cualquier cambio en sus datos de contacto o domicilio.</li>
      <li>Mantener actualizada la información de sus beneficiarios.</li>
      <li>Presentar documentación oficial al momento de solicitar el uso del servicio.</li>
    </ul>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Capítulo IV — Suspensión y Reactivación</div>
    <div class="art"><strong>Artículo 8. Suspensión</strong>El plan será suspendido temporalmente cuando el socio acumule 30 días de atraso en su mensualidad. Durante este período no se prestará el servicio funerario.</div>
    <div class="art"><strong>Artículo 9. Reactivación</strong>El socio podrá reactivar su plan liquidando los pagos vencidos más el correspondiente al mes en curso, sin perder antigüedad ni beneficios acumulados.</div>
  </div>
  <div class="nota">⚠ Este reglamento complementa y no sustituye el contrato individual firmado por el socio. En caso de discrepancia prevalece el contrato.</div>
` + this._piePdf();
    this._abrirPdf('Reglamento', html);
  }

  descargarGuia() {
    const html = this._encabezadoPdf('Guía de Uso del Portal', 'Instrucciones para el uso del sistema en línea de Sociedad Humanista Santa Martha') + `
  <div class="seccion">
    <div class="seccion-titulo">Introducción</div>
    <p>El portal en línea de Sociedad Humanista Santa Martha le permite consultar y gestionar su plan funerario desde cualquier dispositivo con acceso a internet. Esta guía describe paso a paso cómo utilizar cada módulo.</p>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Acceso al Portal</div>
    <div class="paso"><div class="paso-num">1</div><div class="paso-txt"><strong>Ingrese a la dirección del portal</strong><span>Abra su navegador y acceda a la URL proporcionada por su agente o en la documentación de su contrato.</span></div></div>
    <div class="paso"><div class="paso-num">2</div><div class="paso-txt"><strong>Inicie sesión</strong><span>Ingrese su correo electrónico registrado y la contraseña asignada. Si es su primer acceso, use la contraseña temporal enviada a su correo.</span></div></div>
    <div class="paso"><div class="paso-num">3</div><div class="paso-txt"><strong>Cambie su contraseña</strong><span>En el primer acceso, el sistema le solicitará establecer una contraseña personal segura (mínimo 8 caracteres).</span></div></div>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Módulos Disponibles</div>
    <ul>
      <li><strong>Mis Datos</strong> — Consulte y actualice su información personal, domicilio y datos de contacto.</li>
      <li><strong>Cobros y Pagos</strong> — Revise el historial de mensualidades, próximos vencimientos y realice sus pagos.</li>
      <li><strong>Mi Plan Funerario</strong> — Conozca los detalles y coberturas incluidas en su plan contratado.</li>
      <li><strong>Beneficiarios</strong> — Consulte los beneficiarios registrados en su contrato.</li>
      <li><strong>Notificaciones</strong> — Reciba avisos sobre pagos próximos, vencimientos y comunicados de la empresa.</li>
      <li><strong>Información</strong> — Acceda a preguntas frecuentes, documentos y línea de asistencia.</li>
    </ul>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Envío de Comprobantes de Pago</div>
    <div class="paso"><div class="paso-num">1</div><div class="paso-txt"><strong>Realice su pago</strong><span>Efectúe el pago por transferencia bancaria o depósito OXXO a la cuenta indicada en la sección Cobros.</span></div></div>
    <div class="paso"><div class="paso-num">2</div><div class="paso-txt"><strong>Adjunte su comprobante</strong><span>En la sección "Cobros y Pagos", presione "Enviar comprobante por WhatsApp". Podrá tomar una foto o seleccionar un archivo.</span></div></div>
    <div class="paso"><div class="paso-num">3</div><div class="paso-txt"><strong>Recorte y envíe</strong><span>Ajuste la imagen con la herramienta de recorte y presione "Aceptar y enviar". Su comprobante se enviará directamente a nuestro equipo.</span></div></div>
  </div>
  <div class="nota">Para soporte técnico comuníquese al 782 157 4801 o por WhatsApp. Nuestro equipo le atenderá en horario de oficina.</div>
` + this._piePdf();
    this._abrirPdf('Guia', html);
  }

  descargarRequisitos() {
    const html = this._encabezadoPdf('Requisitos para el Usuario de los Servicios Mutualistas', 'Documentación y condiciones necesarias para la activación y uso del servicio funerario') + `
  <div class="seccion">
    <div class="seccion-titulo">Documentos para Contratación</div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Identificación oficial vigente <span class="badge-obligatorio">Obligatorio</span></strong><span>INE/IFE, pasaporte mexicano o cédula profesional del titular del plan.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>CURP del titular <span class="badge-obligatorio">Obligatorio</span></strong><span>Clave Única de Registro de Población en formato oficial impreso o descargado del RENAPO.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>RFC del titular <span class="badge-obligatorio">Obligatorio</span></strong><span>Registro Federal de Contribuyentes para la emisión de la documentación fiscal correspondiente.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Comprobante de domicilio reciente <span class="badge-obligatorio">Obligatorio</span></strong><span>No mayor a 3 meses. Recibo de luz, agua, teléfono o estado de cuenta bancario.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Fotografía reciente del titular</strong><span>Formato digital (JPG/PNG) o impresa, fondo blanco, tamaño credencial.</span></div></div>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Requisitos para Uso del Servicio Funerario</div>
    <p>Al momento de solicitar la prestación del servicio, el representante o familiar del titular deberá presentar:</p>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Acta de defunción <span class="badge-obligatorio">Obligatorio</span></strong><span>Expedida por el Registro Civil correspondiente al lugar de fallecimiento.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Identificación del solicitante <span class="badge-obligatorio">Obligatorio</span></strong><span>INE/IFE vigente de quien solicita el servicio (beneficiario registrado o familiar directo).</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Número de contrato del titular <span class="badge-obligatorio">Obligatorio</span></strong><span>Disponible en la documentación entregada al momento de la firma o en el portal en línea.</span></div></div>
    <div class="req-item"><span class="req-icon">✦</span><div class="req-txt"><strong>Certificado médico de defunción</strong><span>En caso de fallecimiento en domicilio; no requerido si ocurrió en hospital.</span></div></div>
  </div>
  <div class="seccion">
    <div class="seccion-titulo">Condiciones de Elegibilidad</div>
    <ul>
      <li>El titular no debe exceder 64 años con 11 meses al momento de la contratación.</li>
      <li>El contrato debe estar vigente y sin adeudos al momento de solicitar el servicio.</li>
      <li>Los beneficiarios cubiertos son únicamente los registrados en el contrato (cónyuge e hijos menores de 21 años).</li>
      <li>El servicio se activa dentro de las primeras 4 horas de recibir la documentación completa.</li>
    </ul>
  </div>
  <div class="nota">Para mayor información o aclaraciones, comuníquese con su agente asignado o llame al 782 157 4801. Atención disponible las 24 horas.</div>
` + this._piePdf();
    this._abrirPdf('Requisitos', html);
  }
}
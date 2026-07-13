import { Component, inject, signal, OnInit, computed, AfterViewChecked, AfterViewInit } from '@angular/core';
import JsBarcode from 'jsbarcode';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CobroService } from '../../core/services/cobro.service';
import { ContratoService } from '../../core/services/contrato.service';
import { AuthService } from '../../core/services/auth.service';
import { CobroProgramado } from '../../core/models/cobro.model';
import { ContratoResponse } from '../../core/models/contrato.model';
import { CurrencyPipe, DatePipe } from '@angular/common';

@Component({
  selector: 'app-cobros',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './cobros.html'
})
export class CobrosComponent implements OnInit, AfterViewInit, AfterViewChecked {
  private readonly cobroService = inject(CobroService);
  private readonly contratoService = inject(ContratoService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly cobros = signal<CobroProgramado[]>([]);
  readonly contratoActivo = signal<ContratoResponse | null>(null);
  readonly loading = signal(true);
  readonly errorMsg = signal('');
  readonly mostrarTodasMensualidades = signal(false);
  readonly mostrarHistorialCompleto = signal(false);
  readonly tabActiva = signal<'mp' | 'transferencia' | 'oxxo'>('mp');
  readonly toastVisible = signal(false);
  readonly loadingMP = signal(false);
  readonly pagoExitoso  = signal(false);
  readonly pagoConfirmado = signal(false);
  private _hideBannerOnNextLoad = false;

  // ── Getters de urgencia de cobro ──────────────────────────────────────────
  /** Días hasta el vencimiento del próximo cobro (negativo = vencido) */
  get diasHastaProximoPago(): number | null {
    const p = this.proximoPago;
    if (!p) return null;
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const venc = new Date(p.fechaVencimiento + 'T00:00:00');
    return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  }
  /** true si hay un cobro vencido o que vence en los próximos 7 días */
  get tieneAdeudoUrgente(): boolean {
    const p = this.proximoPago;
    if (!p) return false;
    if (p.estadoCobro === 'VENCIDO') return true;
    const dias = this.diasHastaProximoPago;
    return dias !== null && dias <= 7;
  }

  // ── Modal Comprobante ──────────────────────────────────────────────────────
  readonly modalComprobanteAbierto = signal(false);
  readonly modoModalComp = signal<'opciones' | 'camara' | 'editar' | 'preview'>('opciones');
  readonly compImgData = signal<string | null>(null);
  readonly compPreviewUrl = signal<string | null>(null);
  readonly compRotacion = signal(0);
  readonly compCropCursor = signal<string>('default');
  readonly compEsPDF = signal(false);
  readonly enviandoComp = signal(false);
  readonly errorComp = signal('');

  private _compStream: MediaStream | null = null;
  private _compImgEl: HTMLImageElement | null = null;
  private _compFinalBlob: Blob | null = null;
  _compNeedCanvasRefresh = false;
  private _barcodeRendered = false;
  private _compCropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
  private _compCropDragHandle: string | null = null;
  private _compCropDragStart = { x: 0, y: 0 };
  private _compCropNormStart = { x: 0, y: 0, w: 1, h: 1 };

  readonly isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // ── Resumen calculado ──
  get mensualidadActual(): number {
    return this.contratoActivo()?.mensualidadPactada ?? 0;
  }
  get pagosRealizados(): number {
    return this.cobros().filter(c => c.estadoCobro === 'PAGADO').length;
  }
  /** Mensualidades vencidas (todas) + 1 si hay un próximo pago pendiente */
  get pagosPendientes(): number {
    const vencidos = this.cobros().filter(c => c.estadoCobro === 'VENCIDO').length;
    const tieneProximo = this.cobros().some(c => c.estadoCobro === 'PENDIENTE');
    return vencidos + (tieneProximo ? 1 : 0);
  }
  /** Suma de cobros cuya fecha límite ya pasó y no han sido pagados */
  get saldoVencido(): number {
    const hoy = new Date();
    return this.cobros()
      .filter(c => c.estadoCobro !== 'PAGADO' && new Date(c.fechaVencimiento) < hoy)
      .reduce((s, c) => s + c.monto, 0);
  }
  get cobrosAtrasados(): CobroProgramado[] {
    const hoy = new Date();
    return this.cobros().filter(c => c.estadoCobro !== 'PAGADO' && new Date(c.fechaVencimiento) < hoy);
  }
  get proximoPago(): CobroProgramado | null {
    return this.cobros().find(c => c.estadoCobro === 'PENDIENTE' || c.estadoCobro === 'VENCIDO') ?? null;
  }

  // ── Referencia de pago dinámica ──
  get referenciaParaTransferencia(): string {
    const contrato = this.contratoActivo();
    if (!contrato) return '';
    const ahora = new Date();
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mm = String(ahora.getMinutes()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    const anio = ahora.getFullYear();
    return `${contrato.numeroContrato}-${hh}:${mm}-${mes}/${dia}/${anio}`;
  }

  // ── Mensualidades visibles ──
  // Muestra pendientes/vencidas primero (ascendente = próximas primero),
  // luego las pagadas más recientes al final.
  get mensualidadesVisibles(): CobroProgramado[] {
    const pendientes = this.cobros()
      .filter(c => c.estadoCobro !== 'PAGADO')
      .sort((a, b) => a.numeroMensualidad - b.numeroMensualidad);
    const pagados = this.cobros()
      .filter(c => c.estadoCobro === 'PAGADO')
      .sort((a, b) => b.numeroMensualidad - a.numeroMensualidad); // más reciente primero
    const lista = [...pendientes, ...pagados];
    return this.mostrarTodasMensualidades() ? lista : lista.slice(0, 6);
  }

  /** Historial: pendientes + últimas PAGADOS. "Ver más" muestra todos */
  get historialVisible(): CobroProgramado[] {
    if (this.mostrarHistorialCompleto()) {
      return this.cobros();
    }
    const pending = this.cobros()
      .filter(c => c.estadoCobro !== 'PAGADO')
      .sort((a, b) => a.numeroMensualidad - b.numeroMensualidad);
    const paid = this.cobros()
      .filter(c => c.estadoCobro === 'PAGADO')
      .sort((a, b) => b.numeroMensualidad - a.numeroMensualidad)
      .slice(0, Math.max(1, 5 - pending.length));
    return [...pending, ...paid];
  }

  ngOnInit() {
    const personaId = this.authService.currentUser()?.personaId;
    if (!personaId) { this.loading.set(false); return; }

    // Detectar retorno desde MercadoPago con pago exitoso
    const qpago      = this.route.snapshot.queryParamMap.get('pago');
    const cobroIdStr = this.route.snapshot.queryParamMap.get('cobro');
    const paymentId  = this.route.snapshot.queryParamMap.get('collection_id');
    if (qpago === 'exitoso') this.pagoExitoso.set(true);

    this.contratoService.listarPorPersona(personaId).subscribe({
      next: contratos => {
        const activo = contratos.find(c => c.activo) ?? contratos[0] ?? null;
        this.contratoActivo.set(activo);
        if (activo) {
          this.cargarCobros(activo.id);
          if (qpago === 'exitoso' && cobroIdStr && paymentId) {
            // Confirmar directamente con el payment ID de MP (más confiable que esperar el webhook)
            this.cobroService.confirmarPagoMP(+cobroIdStr, paymentId).subscribe({
              next: () => {
                this._hideBannerOnNextLoad = true;
                this.cargarCobros(activo.id);
              },
              error: () => {
                setTimeout(() => this.cargarCobros(activo.id), 5000);
              }
            });
          }
        } else {
          this.loading.set(false);
        }
      },
      error: () => { this.loading.set(false); }
    });
  }

  cargarCobros(contratoId: number) {
    this.loading.set(true);
    this.cobroService.listarPorContrato(contratoId).subscribe({
      next: data => {
        this.cobros.set(data);
        this.loading.set(false);
        if (this._hideBannerOnNextLoad) {
          this._hideBannerOnNextLoad = false;
          this.pagoExitoso.set(false);
        }
        this._scrollAlFragmento();
      },
      error: () => { this.errorMsg.set('Error al cargar cobros.'); this.loading.set(false); }
    });
  }

  private _scrollAlFragmento() {
    const fragment = this.route.snapshot.fragment;
    if (!fragment) return;
    setTimeout(() => {
      const el = document.getElementById(fragment);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  cambiarTab(tab: 'mp' | 'transferencia' | 'oxxo') {
    this.tabActiva.set(tab);
  }

  pagarConMP() {
    const cobro = this.proximoPago;
    if (!cobro) return;
    this.loadingMP.set(true);
    this.cobroService.crearPreferenciaMP(cobro.id).subscribe({
      next: ({ initPoint, sandboxInitPoint }) => {
        // En desarrollo se usa sandboxInitPoint para poder pagar con usuarios de prueba de MP.
        // En producción se usa initPoint (checkout real).
        window.location.href = environment.production ? initPoint : sandboxInitPoint;
      },
      error: () => {
        this.loadingMP.set(false);
        this.errorMsg.set('No se pudo conectar con Mercado Pago. Intente de nuevo.');
      }
    });
  }

  toggleTodasMensualidades() {
    const expanding = !this.mostrarTodasMensualidades();
    this.mostrarTodasMensualidades.set(expanding);
    if (expanding) this._blinkScroll('mensualidades-scrollable');
  }

  toggleHistorial() {
    const expanding = !this.mostrarHistorialCompleto();
    this.mostrarHistorialCompleto.set(expanding);
    if (expanding) this._blinkScroll('historial-scrollable');
  }

  private _blinkScroll(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el || el.scrollHeight <= el.clientHeight) return;
      el.scrollTo({ top: 80, behavior: 'smooth' });
      setTimeout(() => el.scrollTo({ top: 0, behavior: 'smooth' }), 700);
    }, 200);
  }

  descargarReportePDF() {
    const contrato = this.contratoActivo();
    if (!contrato) return;
    const cobros = this.cobros();
    const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

    const fmtFecha = (iso: string | null | undefined): string => {
      if (!iso) return '—';
      const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    };
    const filas = [...cobros]
      .sort((a, b) => a.numeroMensualidad - b.numeroMensualidad)
      .map(c => {
        const estadoVis = this.estadoVisual(c);
        const fecha = fmtFecha(c.estadoCobro === 'PAGADO' ? (c.fechaPago ?? c.fechaVencimiento) : c.fechaVencimiento);
        const colorMap: Record<string, string> = {
          'PAGADO': '#27ae60', 'VENCIDO': '#e74c3c', 'PENDIENTE': '#f39c12', 'PROGRAMADA': '#2a6099'
        };
        const color = colorMap[estadoVis] ?? '#888';
        return `<tr>
          <td style="text-align:center">#${c.numeroMensualidad}</td>
          <td>${fecha}</td>
          <td>Mensualidad #${c.numeroMensualidad}</td>
          <td style="text-align:right">$${Number(c.monto).toFixed(2)} MXN</td>
          <td style="text-align:center">${c.metodoPago ?? '\u2014'}</td>
          <td style="text-align:center;color:${color};font-weight:700">${estadoVis}</td>
        </tr>`;
      }).join('');
    const pagados = cobros.filter(c => c.estadoCobro === 'PAGADO').length;
    const pendientes = cobros.filter(c => c.estadoCobro !== 'PAGADO').length;
    const totalPagado = cobros.filter(c => c.estadoCobro === 'PAGADO').reduce((s, c) => s + Number(c.monto), 0);
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Reporte Cobros — ${contrato.numeroContrato}</title>
<style>
  body{font-family:Arial,sans-serif;margin:32px;color:#333;font-size:13px}
  h1{color:#3A8FC4;font-size:18px;margin:0}
  h2{color:#555;font-size:13px;margin:4px 0 0}
  .header{border-bottom:2px solid #3A8FC4;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
  .info{display:flex;gap:28px;margin-bottom:18px;flex-wrap:wrap}
  .info div{font-size:12px}.info label{color:#888;display:block}
  .info strong{color:#333}
  .summary{display:flex;gap:20px;margin-bottom:20px}
  .summary div{background:#f5f7fa;border-radius:8px;padding:10px 18px;flex:1;text-align:center}
  .summary .val{font-size:18px;font-weight:700;color:#3A8FC4}
  .summary .lbl{font-size:11px;color:#888}
  table{width:100%;border-collapse:collapse}
  th{background:#3A8FC4;color:white;padding:8px 10px;text-align:left;font-size:12px}
  td{padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}
  tr:nth-child(even) td{background:#f9f9f9}
  .footer{margin-top:28px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:12px}
  @media print{body{margin:16px}}
</style></head><body>
<div class="header">
  <div><h1>Sociedad Humanista Santa Martha S.A. de C.V.</h1>
    <h2>Reporte de Cobros — ${contrato.numeroContrato}</h2></div>
  <div style="font-size:12px;color:#888">Generado: ${hoy}</div>
</div>
<div class="info">
  <div><label>Titular</label><strong>${contrato.titularNombre ?? ''}</strong></div>
  <div><label>Plan contratado</label><strong>${contrato.planNombre ?? ''}</strong></div>
  <div><label>Mensualidad</label><strong>$${Number(contrato.mensualidadPactada ?? 0).toFixed(2)} MXN</strong></div>
</div>
<div class="summary">
  <div><div class="val">${cobros.length}</div><div class="lbl">Total cobros</div></div>
  <div><div class="val" style="color:#27ae60">${pagados}</div><div class="lbl">Pagados</div></div>
  <div><div class="val" style="color:#f39c12">${pendientes}</div><div class="lbl">Pendientes</div></div>
  <div><div class="val">$${totalPagado.toFixed(2)}</div><div class="lbl">Total pagado MXN</div></div>
</div>
<table><thead><tr><th>Folio</th><th>Fecha</th><th>Concepto</th><th style="text-align:right">Monto</th><th style="text-align:center">Método</th><th style="text-align:center">Estado</th></tr></thead>
<tbody>${filas}</tbody></table>
<div class="footer">Sociedad Humanista Santa Martha S.A. de C.V. — ${hoy}</div>
<script>setTimeout(()=>window.print(),400)</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=800,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }

  copiar(texto: string) {
    navigator.clipboard.writeText(texto).then(() => {
      this.toastVisible.set(true);
      setTimeout(() => this.toastVisible.set(false), 2000);
    });
  }

  /** ID del primer cobro PENDIENTE (el próximo a vencer) */
  private get _proximoPendienteId(): number | null {
    const primero = this.cobros()
      .filter(c => c.estadoCobro === 'PENDIENTE')
      .sort((a, b) => a.numeroMensualidad - b.numeroMensualidad)[0];
    return primero?.id ?? null;
  }

  /**
   * Estado visual para mostrar en el badge:
   * - VENCIDO  → VENCIDO  (rojo)
   * - PAGADO   → PAGADO   (verde)
   * - PENDIENTE próximo → PENDIENTE (amarillo)
   * - PENDIENTE posteriores → PROGRAMADA (azul)
   */
  estadoVisual(cobro: CobroProgramado): string {
    if (cobro.estadoCobro !== 'PENDIENTE') return cobro.estadoCobro;
    return cobro.id === this._proximoPendienteId ? 'PENDIENTE' : 'PROGRAMADA';
  }

  estadoBadgeClass(estado: string): string {
    const map: Record<string, string> = {
      'PAGADO':     'mes-badge mes-pagado',
      'PENDIENTE':  'mes-badge mes-pendiente',
      'VENCIDO':    'mes-badge mes-vencido',
      'CANCELADO':  'mes-badge mes-vencido',
      'PROGRAMADA': 'mes-badge mes-programada'
    };
    return map[estado] ?? 'mes-badge';
  }

  estadoIcon(estado: string): string {
    const map: Record<string, string> = {
      'PAGADO':     'bi-check',
      'PENDIENTE':  'bi-clock',
      'VENCIDO':    'bi-exclamation-circle-fill',
      'CANCELADO':  'bi-x-circle',
      'PROGRAMADA': 'bi-calendar2'
    };
    return map[estado] ?? 'bi-circle';
  }

  contratoEstadoBadge(estado?: string): string {
    if (estado === 'ACTIVO' || estado === 'VIGENTE') return 'badge-estado badge-activo';
    if (estado === 'PENDIENTE') return 'badge-estado badge-pendiente';
    return 'badge-estado badge-vencido';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngAfterViewInit() {
    this._renderizarCodigoBarra();
  }

  ngAfterViewChecked() {
    if (this._compNeedCanvasRefresh && this.modoModalComp() === 'editar') {
      this._compNeedCanvasRefresh = false;
      this._actualizarCanvasComp();
    }
    if (!this._barcodeRendered) {
      this._renderizarCodigoBarra();
    }
  }

  // ── Ficha OXXO ────────────────────────────────────────────────────────────

  private _renderizarCodigoBarra() {
    const canvas = document.getElementById('oxxoBarcodeCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    this._barcodeRendered = true;
    try {
      JsBarcode(canvas, '5256784379967994', {
        format: 'CODE128',
        lineColor: '#111111',
        width: 2.2,
        height: 68,
        displayValue: false,
        margin: 14,
        background: '#ffffff'
      });
    } catch { /* canvas no visible aún */ }
  }

  descargarFichaOxxo() {
    const srcCanvas = document.getElementById('oxxoBarcodeCanvas') as HTMLCanvasElement | null;
    if (!srcCanvas || srcCanvas.width === 0) return;

    const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
      .format(this.mensualidadActual);

    const W = Math.max(srcCanvas.width, 480);
    const H = srcCanvas.height + 200;
    const out = document.createElement('canvas');
    out.width  = W;
    out.height = H;
    const ctx = out.getContext('2d')!;

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Header OXXO
    ctx.fillStyle = '#DA291C';
    ctx.fillRect(0, 0, W, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('OXXO', 18, 34);
    ctx.font = '13px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Depósito a tarjeta BANAMEX', W - 16, 34);

    // Código de barras centrado
    const bx = Math.floor((W - srcCanvas.width) / 2);
    ctx.drawImage(srcCanvas, bx, 60);

    // Número de tarjeta
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('5256  7843  7996  7994', W / 2, 60 + srcCanvas.height + 32);

    // Beneficiario
    ctx.fillStyle = '#555555';
    ctx.font = '12px Arial';
    ctx.fillText('BANAMEX (Citibanamex)  ·  Armando Rojas Valdez', W / 2, 60 + srcCanvas.height + 54);

    // Monto
    ctx.fillStyle = '#DA291C';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(`Monto a depositar: ${mxn} MXN`, W / 2, 60 + srcCanvas.height + 80);

    // Concepto
    ctx.fillStyle = '#333333';
    ctx.font = '12px Arial';
    ctx.fillText(`Concepto: ${this.referenciaParaTransferencia}`, W / 2, 60 + srcCanvas.height + 102);

    // Nota
    ctx.fillStyle = '#888888';
    ctx.font = '11px Arial';
    ctx.fillText('Solicite al cajero "depósito a tarjeta BANAMEX" y escanee el código', W / 2, 60 + srcCanvas.height + 126);

    // Borde
    ctx.strokeStyle = '#DA291C';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    const link = document.createElement('a');
    link.download = 'ficha-oxxo-banamex.png';
    link.href = out.toDataURL('image/png');
    link.click();
  }

  // ── Modal Comprobante ──────────────────────────────────────────────────────

  abrirModalComprobante() {
    this.modoModalComp.set('opciones');
    this.compImgData.set(null);
    this.compPreviewUrl.set(null);
    this.compRotacion.set(0);
    this.compEsPDF.set(false);
    this.errorComp.set('');
    this._compImgEl = null;
    this._compFinalBlob = null;
    this._compCropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
    this.modalComprobanteAbierto.set(true);
  }

  cerrarModalComprobante() {
    this._detenerCamaraComp();
    this.modalComprobanteAbierto.set(false);
  }

  seleccionarArchivoComp(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    // PDF: skip crop, go directly to preview
    if (file.type === 'application/pdf') {
      this._compFinalBlob = file;
      this.compEsPDF.set(true);
      this.compPreviewUrl.set(null);
      this.modoModalComp.set('preview');
      return;
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.errorComp.set('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF.');
      return;
    }
    this.compEsPDF.set(false);
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      this.compImgData.set(dataUrl);
      const img = new Image();
      img.onload = () => {
        this._compImgEl = img;
        this.compRotacion.set(0);
        this._compCropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
        this.modoModalComp.set('editar');
        this._compNeedCanvasRefresh = true;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async iniciarCamaraComp() {
    this.modoModalComp.set('camara');
    try {
      this._compStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setTimeout(() => {
        const video = document.getElementById('compVideo') as HTMLVideoElement;
        if (video) { video.srcObject = this._compStream; video.play(); }
      }, 80);
    } catch {
      this.errorComp.set('No se pudo acceder a la cámara.');
      this.modoModalComp.set('opciones');
    }
  }

  capturarFotoComp() {
    const video = document.getElementById('compVideo') as HTMLVideoElement;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    this._detenerCamaraComp();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    this.compImgData.set(dataUrl);
    const img = new Image();
    img.onload = () => {
      this._compImgEl = img;
      this.compRotacion.set(0);
      this._compCropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
      this.modoModalComp.set('editar');
      this._compNeedCanvasRefresh = true;
    };
    img.src = dataUrl;
  }

  _detenerCamaraComp() {
    this._compStream?.getTracks().forEach(t => t.stop());
    this._compStream = null;
  }

  rotarComprobante() {
    this.compRotacion.set((this.compRotacion() + 90) % 360);
    this._compCropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
    setTimeout(() => this._actualizarCanvasComp(), 0);
  }

  // ── Crop pointer events ────────────────────────────────────────────────────

  private _detectCompHandle(px: number, py: number, cx: number, cy: number, cw: number, ch: number, H: number): string | null {
    const near = (ax: number, ay: number) => Math.abs(px - ax) <= H && Math.abs(py - ay) <= H;
    if (near(cx, cy))            return 'tl';
    if (near(cx + cw, cy))       return 'tr';
    if (near(cx, cy + ch))       return 'bl';
    if (near(cx + cw, cy + ch))  return 'br';
    if (Math.abs(py - cy) <= H && px >= cx - H && px <= cx + cw + H)        return 't';
    if (Math.abs(py - (cy + ch)) <= H && px >= cx - H && px <= cx + cw + H) return 'b';
    if (Math.abs(px - cx) <= H && py >= cy - H && py <= cy + ch + H)        return 'l';
    if (Math.abs(px - (cx + cw)) <= H && py >= cy - H && py <= cy + ch + H) return 'r';
    if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch)              return 'move';
    return null;
  }

  private readonly _cursorMap: Record<string, string> = {
    tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize',
    t: 'n-resize', b: 's-resize', l: 'w-resize', r: 'e-resize', move: 'grab'
  };

  compCropPointerDown(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const H  = Math.max(canvas.width * 0.055, 14);
    const cx = this._compCropNorm.x * canvas.width,  cy = this._compCropNorm.y * canvas.height;
    const cw = this._compCropNorm.w * canvas.width,  ch = this._compCropNorm.h * canvas.height;
    const handle = this._detectCompHandle(px, py, cx, cy, cw, ch, H);
    if (!handle) return;
    this._compCropDragHandle = handle;
    this._compCropDragStart  = { x: px, y: py };
    this._compCropNormStart  = { ...this._compCropNorm };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  compCropPointerMove(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
    if (this._compCropDragHandle) {
      const dx = (px - this._compCropDragStart.x) / canvas.width;
      const dy = (py - this._compCropDragStart.y) / canvas.height;
      const s = this._compCropNormStart;
      const MIN = 0.06;
      let { x, y, w, h } = s;
      switch (this._compCropDragHandle) {
        case 'tl': x = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx)); y = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy)); w = s.w - (x - s.x); h = s.h - (y - s.y); break;
        case 'tr': w = Math.max(MIN, Math.min(1 - s.x, s.w + dx)); y = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy)); h = s.h - (y - s.y); break;
        case 'bl': x = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx)); w = s.w - (x - s.x); h = Math.max(MIN, Math.min(1 - s.y, s.h + dy)); break;
        case 'br': w = Math.max(MIN, Math.min(1 - s.x, s.w + dx)); h = Math.max(MIN, Math.min(1 - s.y, s.h + dy)); break;
        case 't':  y = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy)); h = s.h - (y - s.y); break;
        case 'b':  h = Math.max(MIN, Math.min(1 - s.y, s.h + dy)); break;
        case 'l':  x = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx)); w = s.w - (x - s.x); break;
        case 'r':  w = Math.max(MIN, Math.min(1 - s.x, s.w + dx)); break;
        case 'move': x = Math.max(0, Math.min(1 - s.w, s.x + dx)); y = Math.max(0, Math.min(1 - s.h, s.y + dy)); break;
      }
      this._compCropNorm = { x, y, w, h };
      this._actualizarCanvasComp();
      const base = this._cursorMap[this._compCropDragHandle] ?? 'default';
      this.compCropCursor.set(base === 'grab' ? 'grabbing' : base);
    } else {
      const H  = Math.max(canvas.width * 0.055, 14);
      const cx = this._compCropNorm.x * canvas.width,  cy = this._compCropNorm.y * canvas.height;
      const cw = this._compCropNorm.w * canvas.width,  ch = this._compCropNorm.h * canvas.height;
      const handle = this._detectCompHandle(px, py, cx, cy, cw, ch, H);
      this.compCropCursor.set(handle ? (this._cursorMap[handle] ?? 'default') : 'default');
    }
  }

  compCropPointerUp(e: PointerEvent) {
    this._compCropDragHandle = null;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const H  = Math.max(canvas.width * 0.055, 14);
    const cx = this._compCropNorm.x * canvas.width,  cy = this._compCropNorm.y * canvas.height;
    const cw = this._compCropNorm.w * canvas.width,  ch = this._compCropNorm.h * canvas.height;
    const handle = this._detectCompHandle(px, py, cx, cy, cw, ch, H);
    this.compCropCursor.set(handle ? (this._cursorMap[handle] ?? 'default') : 'default');
  }

  private _actualizarCanvasComp() {
    const canvas = document.getElementById('compEditCanvas') as HTMLCanvasElement;
    const img = this._compImgEl;
    if (!canvas || !img) return;
    const rot = this.compRotacion();
    const swapped = rot === 90 || rot === 270;
    const rotW = swapped ? img.naturalHeight : img.naturalWidth;
    const rotH = swapped ? img.naturalWidth  : img.naturalHeight;
    const maxW = Math.max((canvas.parentElement?.clientWidth ?? 320) - 2, 120);
    const scale = maxW / rotW;
    const dispW = Math.max(Math.round(rotW * scale), 1);
    const dispH = Math.max(Math.round(rotH * scale), 1);
    canvas.width = dispW; canvas.height = dispH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.save();
    ctx.translate(dispW / 2, dispH / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(img, -(img.naturalWidth * scale) / 2, -(img.naturalHeight * scale) / 2,
                  img.naturalWidth * scale, img.naturalHeight * scale);
    ctx.restore();
    const cropX = Math.round(this._compCropNorm.x * dispW);
    const cropY = Math.round(this._compCropNorm.y * dispH);
    const cropW = Math.max(Math.round(this._compCropNorm.w * dispW), 10);
    const cropH = Math.max(Math.round(this._compCropNorm.h * dispH), 10);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, dispW, cropY);
    ctx.fillRect(0, cropY + cropH, dispW, dispH - cropY - cropH);
    ctx.fillRect(0, cropY, cropX, cropH);
    ctx.fillRect(cropX + cropW, cropY, dispW - cropX - cropW, cropH);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cropX + cropW * i / 3, cropY); ctx.lineTo(cropX + cropW * i / 3, cropY + cropH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cropX, cropY + cropH * i / 3); ctx.lineTo(cropX + cropW, cropY + cropH * i / 3); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 5.5;
    ctx.strokeRect(cropX + 0.5, cropY + 0.5, cropW - 1, cropH - 1);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeRect(cropX + 0.5, cropY + 0.5, cropW - 1, cropH - 1);
    const CL = Math.max(Math.min(cropW, cropH) * 0.14, 12);
    ctx.lineCap = 'square';
    const corners: [number,number,number,number,number,number][] = [
      [cropX,        cropY,        cropX + CL,         cropY,        cropX,        cropY + CL],
      [cropX + cropW,cropY,        cropX + cropW - CL, cropY,        cropX + cropW,cropY + CL],
      [cropX,        cropY + cropH,cropX + CL,         cropY + cropH,cropX,        cropY + cropH - CL],
      [cropX + cropW,cropY + cropH,cropX + cropW - CL, cropY + cropH,cropX + cropW,cropY + cropH - CL],
    ];
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 6;
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.lineTo(x3, y3); ctx.stroke();
    }
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.lineTo(x3, y3); ctx.stroke();
    }
    if (cropW > 60 && cropH > 60) {
      const mids: [number,number][] = [
        [cropX + cropW / 2, cropY], [cropX + cropW / 2, cropY + cropH],
        [cropX, cropY + cropH / 2], [cropX + cropW, cropY + cropH / 2],
      ];
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      for (const [mx, my] of mids) {
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    const cssRatio = maxW / dispW;
    const topTrimCss = Math.round(cropY * 0.5 * cssRatio);
    const showHCss   = Math.round((cropH + dispH) * 0.5 * cssRatio);
    canvas.style.marginTop = `-${topTrimCss}px`;
    const wrap = canvas.parentElement as HTMLElement;
    if (wrap) wrap.style.height = `${showHCss}px`;
  }

  aplicarEdicionComp() {
    const img = this._compImgEl;
    if (!img) return;
    const rot = this.compRotacion();
    const swapped = rot === 90 || rot === 270;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width  = swapped ? img.naturalHeight : img.naturalWidth;
    rotCanvas.height = swapped ? img.naturalWidth  : img.naturalHeight;
    const rotCtx = rotCanvas.getContext('2d')!;
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate(rot * Math.PI / 180);
    rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const rw = rotCanvas.width, rh = rotCanvas.height;
    const cropX = Math.round(rw * this._compCropNorm.x);
    const cropY = Math.round(rh * this._compCropNorm.y);
    const cropW = Math.max(Math.round(rw * this._compCropNorm.w), 1);
    const cropH = Math.max(Math.round(rh * this._compCropNorm.h), 1);
    const TARGET_W = Math.max(cropW, 1280);
    const upScale  = TARGET_W / cropW;
    const TARGET_H = Math.round(cropH * upScale);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = TARGET_W; outCanvas.height = TARGET_H;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.filter = 'contrast(1.04) brightness(1.01)';
    outCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, TARGET_W, TARGET_H);
    outCtx.filter = 'none';
    outCanvas.toBlob(blob => {
      if (!blob) return;
      this._compFinalBlob = blob;
      this.compPreviewUrl.set(outCanvas.toDataURL('image/jpeg', 0.92));
      this.modoModalComp.set('preview');
    }, 'image/jpeg', 0.92);
  }

  async enviarComprobanteWhatsApp() {
    if (!this._compFinalBlob) return;
    this.enviandoComp.set(true);
    const isPdf = this._compFinalBlob.type === 'application/pdf';
    const fileName = isPdf ? 'comprobante.pdf' : 'comprobante.jpg';
    const file = new File([this._compFinalBlob], fileName, { type: this._compFinalBlob.type });
    const texto = `Te comparto el comprobante de pago del socio ${this.contratoActivo()?.titularNombre ?? ''}`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Comprobante de pago', text: texto });
      } else {
        // Desktop fallback: download + open WhatsApp Web
        const objUrl = URL.createObjectURL(this._compFinalBlob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = 'comprobante.jpg'; a.click();
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
        const waUrl = `https://api.whatsapp.com/send?phone=527821574801&text=${encodeURIComponent(texto)}`;
        window.open(waUrl, '_blank');
      }
    } catch { /* user cancelled share */ }
    this.enviandoComp.set(false);
    this.cerrarModalComprobante();
  }
}

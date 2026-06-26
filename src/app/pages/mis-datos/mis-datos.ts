import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PersonaService } from '../../core/services/persona.service';
import { ContratoService } from '../../core/services/contrato.service';
import { BeneficiarioService } from '../../core/services/beneficiario.service';
import { PersonaResponse, PersonaRequest } from '../../core/models/persona.model';
import { ContratoResponse } from '../../core/models/contrato.model';
import { Beneficiario } from '../../core/models/beneficiario.model';
import { AuthService } from '../../core/services/auth.service';
import { forkJoin, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

type OcrStep =
  'intro' | 'ine-frente' | 'ine-frente-camara' | 'ine-frente-preview' |
  'ine-reverso' | 'ine-reverso-camara' | 'ine-reverso-preview' |
  'acta' | 'acta-camara' | 'acta-preview' | 'procesando' | 'resultado';

@Component({
  selector: 'app-mis-datos',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe],
  templateUrl: './mis-datos.html'
})
export class MisDatosComponent implements OnInit, OnDestroy {
  private readonly personaService = inject(PersonaService);
  private readonly contratoService = inject(ContratoService);
  private readonly beneficiarioService = inject(BeneficiarioService);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ocrVideoEl') ocrVideoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('ocrCanvasEl') ocrCanvasEl?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ocrOverlayEl') ocrOverlayEl?: ElementRef<HTMLCanvasElement>;

  readonly persona = signal<PersonaResponse | null>(null);
  readonly contrato = signal<ContratoResponse | null>(null);
  readonly beneficiarios = signal<Beneficiario[]>([]);
  readonly loading = signal(true);
  readonly campoEditando = signal<string | null>(null);
  readonly saving = signal(false);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');

  // ── Foto de perfil ──
  readonly fotoUrl = signal<string | null>(null);
  readonly mostrarModalFoto = signal(false);
  readonly modoModal = signal<'opciones' | 'camara' | 'preview'>('opciones');
  readonly fotoPreviewUrl = signal<string | null>(null);
  readonly subiendoFoto = signal(false);
  readonly errorFoto = signal('');
  readonly isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  private stream: MediaStream | null = null;
  private archivoSeleccionado: File | null = null;
  // environment.apiUrl = 'http://host:8081/api' → las fotos se sirven en /api/profile_pictures/**
  readonly apiBase = environment.apiUrl;
  readonly ocrEnabled = environment.ocrAutocompletarEnabled;

  // ── OCR AUTOCOMPLETAR ──
  private readonly ngZone = inject(NgZone);
  readonly mostrarModalOcr = signal(false);
  readonly ocrPaso = signal<OcrStep>('intro');
  readonly ocrIneFrenteUrl = signal<string | null>(null);
  readonly ocrIneReversoUrl = signal<string | null>(null);
  readonly ocrActaUrl = signal<string | null>(null);
  readonly ocrActaEsPdf = signal(false);
  readonly ocrProgreso = signal(0);
  readonly ocrProgresoMsg = signal('');
  readonly ocrDatos = signal<Record<string, string>>({});
  readonly ocrErrorMsg = signal('');
  readonly ocrEncuadreEstado = signal<'ajustando' | 'listo' | 'borroso'>('ajustando');
  private ocrStream: MediaStream | null = null;
  private ocrIneFrente: File | null = null;
  private ocrIneReverso: File | null = null;
  private ocrActaFile: File | null = null;
  private ocrSharpnessTimer: ReturnType<typeof setInterval> | null = null;
  private ocrRefocusTimer:   ReturnType<typeof setInterval> | null = null;
  // ── Detección de contorno ──
  private ocrDetectionTimer: ReturnType<typeof setInterval> | null = null;
  private ocrRectActual: { x: number; y: number; w: number; h: number } | null = null;
  private ocrRectEstable = 0;
  readonly ocrContornoDetectado = signal(false);

  readonly form = this.fb.group({
    nombre: ['', Validators.required],
    apPaterno: ['', Validators.required],
    apMaterno: [''],
    curp: [''],
    rfc: [''],
    fechaNacimiento: [''],
    sexo: [''],
    telefono: ['', Validators.pattern(/^\d{10}$/)],
    telefonoAlt: [''],
    correo: ['', Validators.email],
    calle: [''],
    numeroExt: [''],
    numeroInt: [''],
    colonia: [''],
    municipio: [''],
    estado: [''],
    codigoPostal: ['']
  });

  ngOnInit() {
    const user = this.auth.currentUser();
    if (!user?.personaId) {
      this.loading.set(false);
      return;
    }
    const pid = user.personaId;
    forkJoin({
      persona: this.personaService.obtener(pid),
      contratos: this.contratoService.listarPorPersona(pid).pipe(catchError(() => of([])))
    }).pipe(
      switchMap(({ persona, contratos }) => {
        this.persona.set(persona);
        const activo = (contratos as ContratoResponse[]).find(c => c.estadoClave === 'VIGENTE' || c.activo) ?? null;
        this.contrato.set(activo);
        if (activo) {
          return this.beneficiarioService.listarPorContrato(activo.id).pipe(catchError(() => of([])));
        }
        return of([]);
      }),
      catchError(() => of([]))
    ).subscribe({
      next: (benefs) => {
        this.beneficiarios.set(benefs as Beneficiario[]);
        this.loading.set(false);
        this.cargarFoto();
      },
      error: () => this.loading.set(false)
    });
  }

  ngOnDestroy() {
    this.detenerCamara();
    this.ocrDetenerCamara();
  }

  private cargarFoto() {
    this.personaService.obtenerUrlFoto().subscribe({
      next: ({ url }) => {
        if (url) this.fotoUrl.set(this.apiBase + url + '?t=' + Date.now());
      },
      error: () => {}
    });
  }

  // ── MODAL FOTO ──

  abrirModalFoto() {
    this.modoModal.set('opciones');
    this.fotoPreviewUrl.set(null);
    this.archivoSeleccionado = null;
    this.errorFoto.set('');
    this.mostrarModalFoto.set(true);
  }

  cerrarModalFoto() {
    this.detenerCamara();
    this.mostrarModalFoto.set(false);
    this.fotoPreviewUrl.set(null);
    this.archivoSeleccionado = null;
    this.errorFoto.set('');
  }

  iniciarCamara() {
    this.modoModal.set('camara');
    this.errorFoto.set('');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => {
        this.stream = stream;
        // Esperar a que el elemento de video esté en el DOM
        setTimeout(() => {
          if (this.videoEl?.nativeElement) {
            this.videoEl.nativeElement.srcObject = stream;
          }
        }, 150);
      })
      .catch(() => {
        this.errorFoto.set('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
        this.modoModal.set('opciones');
      });
  }

  detenerCamara() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  capturarFoto() {
    const video = this.videoEl?.nativeElement;
    const canvas = this.canvasEl?.nativeElement;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      this.archivoSeleccionado = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      this.fotoPreviewUrl.set(URL.createObjectURL(blob));
      this.detenerCamara();
      this.modoModal.set('preview');
    }, 'image/jpeg', 0.9);
  }

  seleccionarArchivo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const nombre = file.name.toLowerCase();
    if (!nombre.endsWith('.jpg') && !nombre.endsWith('.jpeg') && !nombre.endsWith('.png')) {
      this.errorFoto.set('Solo se permiten archivos JPG, JPEG y PNG.');
      return;
    }
    this.archivoSeleccionado = file;
    this.fotoPreviewUrl.set(URL.createObjectURL(file));
    this.modoModal.set('preview');
    this.errorFoto.set('');
  }

  subirFoto() {
    if (!this.archivoSeleccionado) return;
    this.subiendoFoto.set(true);
    this.errorFoto.set('');
    this.personaService.subirFoto(this.archivoSeleccionado).subscribe({
      next: ({ url }) => {
        this.fotoUrl.set(this.apiBase + url + '?t=' + Date.now());
        this.subiendoFoto.set(false);
        this.cerrarModalFoto();
        this.successMsg.set('Foto de perfil actualizada correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.subiendoFoto.set(false);
        const msg = err?.error?.error ?? err?.error?.message ?? 'Error al subir la foto. Inténtalo de nuevo.';
        this.errorFoto.set(msg);
      }
    });
  }

  // ── OCR AUTOCOMPLETAR ──

  abrirModalOcr(): void {
    this.ocrPaso.set('intro');
    this.ocrIneFrenteUrl.set(null);
    this.ocrIneReversoUrl.set(null);
    this.ocrActaUrl.set(null);
    this.ocrActaEsPdf.set(false);
    this.ocrProgreso.set(0);
    this.ocrProgresoMsg.set('');
    this.ocrDatos.set({});
    this.ocrErrorMsg.set('');
    this.ocrIneFrente = null;
    this.ocrIneReverso = null;
    this.ocrActaFile = null;
    this.mostrarModalOcr.set(true);
  }

  cerrarModalOcr(): void {
    this.ocrDetenerCamara();
    this.mostrarModalOcr.set(false);
  }

  ocrIniciarCamara(destino: 'ine-frente' | 'ine-reverso' | 'acta'): void {
    this.ocrPaso.set((destino + '-camara') as OcrStep);
    this.ocrErrorMsg.set('');
    this.ocrEncuadreEstado.set('ajustando');

    // focusMode NO es un constraint válido de getUserMedia en Chrome Android —
    // ponerlo a nivel raíz provoca OverconstrainedError y cae al fallback sin
    // ningún control de foco. El autofoco se aplica vía applyConstraints() con
    // el array `advanced` una vez que el stream ya está activo.
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
    };

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }))
      .then(stream => {
        this.ocrStream = stream;
        setTimeout(() => {
          const video = this.ocrVideoEl?.nativeElement;
          if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => this._iniciarChequeoNitidez();
            // onplaying = frames reales llegando: momento seguro para aplicar foco y detección
            video.onplaying = () => { this._activarAutofoco(stream); this._iniciarLoopDeteccion(); };
          }
        }, 150);
      })
      .catch(() => {
        this.ocrErrorMsg.set('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
        this.ocrPaso.set(destino as OcrStep);
      });
  }

  /**
   * Activa autofoco continuo usando el formato `advanced` que requiere
   * Chrome Android para negociar con el driver Camera2.
   * - Consulta getCapabilities() para no aplicar modos no soportados.
   * - Intento inmediato (300 ms) + reintento (800 ms) para dar tiempo al sensor.
   * - Para dispositivos sin `continuous`: single-shot periodico cada 2 s.
   */
  private _activarAutofoco(stream: MediaStream): void {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = track as any;
    const caps: { focusMode?: string[] } = t.getCapabilities?.() ?? {};
    const modos: string[] = caps.focusMode ?? [];

    const aplicarContinuo = (): Promise<void> => {
      if (modos.includes('continuous')) {
        return (t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }) as Promise<void>)
          .catch(() => {});
      }
      if (modos.includes('auto')) {
        return (t.applyConstraints({ advanced: [{ focusMode: 'auto' }] }) as Promise<void>)
          .catch(() => {});
      }
      return Promise.resolve();
    };

    // Primer intento: 300 ms (el sensor ya recibe frames).
    // En algunos drivers Android hay que hacer un single-shot primero
    // para 'despertar' el AF y luego pasar a continuous.
    setTimeout(() => {
      if (this.ocrStream !== stream) return;
      const despertar: Promise<void> = modos.includes('single-shot')
        ? (t.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] }) as Promise<void>).catch(() => {})
        : Promise.resolve();
      despertar.finally(() => {
        if (this.ocrStream !== stream) return;
        aplicarContinuo();
      });
    }, 300);

    // Reintento a 800 ms por si el primer intento fue demasiado pronto
    setTimeout(() => {
      if (this.ocrStream !== stream) return;
      aplicarContinuo();
    }, 800);

    // Para dispositivos sin modo continuous: reenfoque periodico cada 2 s
    if (!modos.includes('continuous')) {
      const modoPerio = modos.includes('single-shot') ? 'single-shot'
                      : modos.includes('auto')        ? 'auto'
                      : null;
      if (modoPerio) {
        this.ocrRefocusTimer = setInterval(() => {
          if (this.ocrStream !== stream || this.ocrEncuadreEstado() === 'listo') return;
          (t.applyConstraints({ advanced: [{ focusMode: modoPerio }] }) as Promise<void>).catch(() => {});
        }, 2000);
      }
    }
  }
  ocrDetenerCamara(): void {
    this._detenerChequeoNitidez();
    this._pararLoopDeteccion();
    if (this.ocrStream) {
      this.ocrStream.getTracks().forEach(t => t.stop());
      this.ocrStream = null;
    }
  }

  /** Tap‑para‑enfocar: dispara single-shot AF y vuelve a modo continuo. */
  ocrTapEnfocar(): void {
    if (!this.ocrStream) return;
    const track = this.ocrStream.getVideoTracks()[0];
    if (!track) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = track as any;
    const caps: { focusMode?: string[] } = t.getCapabilities?.() ?? {};
    const modos: string[] = caps.focusMode ?? [];
    const modoShot = modos.includes('single-shot') ? 'single-shot'
                   : modos.includes('auto')         ? 'auto'
                   : null;
    const shot: Promise<void> = modoShot
      ? (t.applyConstraints({ advanced: [{ focusMode: modoShot }] }) as Promise<void>).catch(() => {})
      : Promise.resolve();
    shot.finally?.(() => setTimeout(() => {
      if (!this.ocrStream) return;
      if (modos.includes('continuous')) {
        (t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }) as Promise<void>).catch(() => {});
      }
    }, 800));
  }

  ocrCapturar(destino: 'ine-frente' | 'ine-reverso' | 'acta'): void {
    const video = this.ocrVideoEl?.nativeElement;
    const canvas = this.ocrCanvasEl?.nativeElement;
    if (!video || !canvas) return;
    this._detenerChequeoNitidez();
    this._pararLoopDeteccion();

    const streamW = video.videoWidth;
    const streamH = video.videoHeight;
    if (!streamW || !streamH) return;

    const RATIO = 85.6 / 54; // tarjeta ID-1 (INE)
    let srcX: number, srcY: number, srcW: number, srcH: number;

    if (this.ocrRectActual) {
      // ── Usar el rectángulo detectado por visión ─────────────────────────
      ({ x: srcX, y: srcY, w: srcW, h: srcH } = this.ocrRectActual);
    } else {
      // ── Fallback: recortar la región de la guía CSS ─────────────────────
      const displayW = video.clientWidth  || video.offsetWidth;
      const displayH = video.clientHeight || video.offsetHeight;
      let gW = displayW * 0.92;
      let gH = gW / RATIO;
      if (gH > displayH * 0.92) { gH = displayH * 0.92; gW = gH * RATIO; }
      const gLeft = (displayW - gW) / 2;
      const gTop  = (displayH - gH) / 2;
      const s     = Math.max(displayW / streamW, displayH / streamH);
      const offX  = (streamW - displayW / s) / 2;
      const offY  = (streamH - displayH / s) / 2;
      srcX = offX + gLeft / s;  srcY = offY + gTop  / s;
      srcW = gW / s;             srcH = gH / s;
    }

    // Salida a 960 px de ancho (suficiente para OCR, sin exceso de memoria)
    const outW = 960;
    const outH = Math.round(outW / (srcW / srcH));
    canvas.width  = outW;
    canvas.height = outH;
    canvas.getContext('2d')!.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `${destino}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      this.ocrDetenerCamara();
      this._ocrSetFile(destino, file, url, false);
      this.ocrPaso.set((destino + '-preview') as OcrStep);
    }, 'image/jpeg', 0.92);
  }

  ocrSeleccionarImagen(event: Event, destino: 'ine-frente' | 'ine-reverso'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';  // permite re-seleccionar el mismo archivo
    if (!file) return;
    this._normalizarImagen(file).then(norm => {
      this._ocrSetFile(destino, norm, URL.createObjectURL(norm), false);
      this.ocrPaso.set((destino + '-preview') as OcrStep);
    });
  }

  ocrSeleccionarActa(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';  // permite re-seleccionar el mismo archivo
    if (!file) return;
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (esPdf) {
      this.ocrActaFile = file;
      this.ocrActaEsPdf.set(true);
      this.ocrActaUrl.set(null);
      this.ocrPaso.set('acta-preview');
    } else {
      this._normalizarImagen(file).then(norm => {
        this.ocrActaFile = norm;
        this.ocrActaEsPdf.set(false);
        this.ocrActaUrl.set(URL.createObjectURL(norm));
        this.ocrPaso.set('acta-preview');
      });
    }
  }

  private _ocrSetFile(destino: 'ine-frente' | 'ine-reverso' | 'acta', file: File, url: string, esPdf: boolean): void {
    if (destino === 'ine-frente')    { this.ocrIneFrente = file; this.ocrIneFrenteUrl.set(url); }
    else if (destino === 'ine-reverso') { this.ocrIneReverso = file; this.ocrIneReversoUrl.set(url); }
    else { this.ocrActaFile = file; this.ocrActaUrl.set(url); this.ocrActaEsPdf.set(esPdf); }
  }

  /**
   * Normaliza la imagen antes de pasarla a Tesseract:
   * 1. Dibuja en canvas — el navegador aplica la rotación EXIF automáticamente.
   * 2. Redimensiona a máx. 1920 px — fotos nativas son 12‑MP y saturan el worker.
   */
  private _normalizarImagen(file: File): Promise<File> {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1920;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        cvs.getContext('2d')!.drawImage(img, 0, 0, w, h);
        cvs.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  private _iniciarChequeoNitidez(): void {
    this.ocrEncuadreEstado.set('ajustando');
    setTimeout(() => {
      this._evaluarNitidez();
      this.ocrSharpnessTimer = setInterval(() => this._evaluarNitidez(), 600);
    }, 800);
  }

  private _detenerChequeoNitidez(): void {
    if (this.ocrSharpnessTimer !== null) {
      clearInterval(this.ocrSharpnessTimer);
      this.ocrSharpnessTimer = null;
    }
    if (this.ocrRefocusTimer !== null) {
      clearInterval(this.ocrRefocusTimer);
      this.ocrRefocusTimer = null;
    }
  }

  // ── Detección de contorno del documento ──────────────────────────────────

  /** Inicia el loop de detección de contorno cada 200 ms. */
  private _iniciarLoopDeteccion(): void {
    if (this.ocrDetectionTimer !== null) return;
    this.ocrRectActual = null;
    this.ocrRectEstable = 0;
    this.ocrContornoDetectado.set(false);
    this.ocrDetectionTimer = setInterval(() => this._procesarFrameDeteccion(), 200);
  }

  /** Para el loop de detección y limpia el overlay. */
  private _pararLoopDeteccion(): void {
    if (this.ocrDetectionTimer !== null) {
      clearInterval(this.ocrDetectionTimer);
      this.ocrDetectionTimer = null;
    }
    this.ocrRectActual = null;
    this.ocrRectEstable = 0;
    this.ngZone.run(() => this.ocrContornoDetectado.set(false));
    const overlay = this.ocrOverlayEl?.nativeElement;
    if (overlay) { const ctx = overlay.getContext('2d'); ctx?.clearRect(0, 0, overlay.width, overlay.height); }
  }

  /**
   * Procesa un frame del video:
   * 1. Detecta un rectángulo con proporciones de tarjeta (ratio ~1.1‑2.2).
   * 2. Requiere ≥3 frames estables antes de marcar como "detectado".
   * 3. Dibuja el contorno en el canvas overlay.
   */
  private _procesarFrameDeteccion(): void {
    const video = this.ocrVideoEl?.nativeElement;
    const overlay = this.ocrOverlayEl?.nativeElement;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    const rect = this._encontrarDocumentoRect(video);

    if (rect) {
      this.ocrRectEstable = Math.min(this.ocrRectEstable + 1, 5);
      this.ocrRectActual  = rect;
    } else {
      this.ocrRectEstable = Math.max(this.ocrRectEstable - 1, 0);
      if (this.ocrRectEstable === 0) this.ocrRectActual = null;
    }

    const detectado = this.ocrRectEstable >= 3;
    this.ngZone.run(() => {
      this.ocrContornoDetectado.set(detectado);
      // Cuando hay contorno estable, actualiza el estado del encuadre
      if (detectado) this.ocrEncuadreEstado.set('listo');
    });

    if (overlay) this._dibujarOverlay(overlay, video, this.ocrRectActual, detectado);
  }

  /**
   * Detecta el rectángulo del documento usando proyecciones de gradiente Sobel.
   * Trabaja a 1/4 de resolución para rendimiento en móvil.
   */
  private _encontrarDocumentoRect(video: HTMLVideoElement): { x: number; y: number; w: number; h: number } | null {
    const W = 320;
    const H = Math.round(W * video.videoHeight / video.videoWidth);
    if (H <= 0) return null;

    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    cvs.getContext('2d')!.drawImage(video, 0, 0, W, H);
    const data = cvs.getContext('2d')!.getImageData(0, 0, W, H).data;

    // Escala de grises
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++)
      g[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;

    // Gradiente Sobel → mapa de bordes binario
    const e = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx = -g[(y-1)*W+(x-1)] + g[(y-1)*W+(x+1)]
                   - 2*g[y*W+(x-1)] + 2*g[y*W+(x+1)]
                   - g[(y+1)*W+(x-1)] + g[(y+1)*W+(x+1)];
        const gy = -g[(y-1)*W+(x-1)] - 2*g[(y-1)*W+x] - g[(y-1)*W+(x+1)]
                   + g[(y+1)*W+(x-1)] + 2*g[(y+1)*W+x] + g[(y+1)*W+(x+1)];
        e[y*W+x] = (gx*gx + gy*gy) > 900 ? 1 : 0; // umbral 30²
      }
    }

    // Proyección horizontal y vertical
    const hProj = new Int32Array(H);
    const vProj = new Int32Array(W);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (e[y*W+x]) { hProj[y]++; vProj[x]++; }

    // Busca bordes dominantes en los cuatro lados (umbral = 20% del lado)
    const hThr = W * 0.20, vThr = H * 0.20;
    let top = -1, bottom = -1, left = -1, right = -1;
    for (let y = 2;   y < H * 0.45; y++)   if (hProj[y] > hThr) { top    = y; break; }
    for (let y = H-2; y > H * 0.55; y--)   if (hProj[y] > hThr) { bottom = y; break; }
    for (let x = 2;   x < W * 0.45; x++)   if (vProj[x] > vThr) { left   = x; break; }
    for (let x = W-2; x > W * 0.55; x--)   if (vProj[x] > vThr) { right  = x; break; }

    if (top < 0 || bottom < 0 || left < 0 || right < 0) return null;

    const rw = right - left, rh = bottom - top;
    if (rw <= 0 || rh <= 0) return null;

    // Ratio tarjeta ID-1: ~1.58; admitimos 1.05–2.20 para rotaciones leves
    const ratio = rw / rh;
    if (ratio < 1.05 || ratio > 2.20) return null;

    // El documento debe ocupar ≥18% del área del frame
    if (rw * rh < W * H * 0.18) return null;

    // Devuelve en coordenadas del video original
    const sx = video.videoWidth / W, sy = video.videoHeight / H;
    return { x: left * sx, y: top * sy, w: rw * sx, h: rh * sy };
  }

  /** Dibuja el contorno detectado en el canvas overlay. */
  private _dibujarOverlay(
    overlay: HTMLCanvasElement,
    video: HTMLVideoElement,
    rect: { x: number; y: number; w: number; h: number } | null,
    detectado: boolean
  ): void {
    const dw = overlay.clientWidth, dh = overlay.clientHeight;
    if (!dw || !dh) return;
    overlay.width = dw; overlay.height = dh;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, dw, dh);
    if (!rect) return;

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;

    // Transforma coordenadas de video → coordenadas de display (object-fit:cover)
    const scale = Math.max(dw / vw, dh / vh);
    const offX  = (dw - vw * scale) / 2;
    const offY  = (dh - vh * scale) / 2;

    const dx = rect.x * scale + offX;
    const dy = rect.y * scale + offY;
    const dW = rect.w * scale;
    const dH = rect.h * scale;

    const color = detectado ? 'rgba(39,174,96,0.95)' : 'rgba(241,196,15,0.90)';
    const cs = 20; // tamaño de la L de esquina

    // Rectángulo completo (semitransparente)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(detectado ? [] : [7, 5]);
    ctx.strokeRect(dx, dy, dW, dH);

    // Marcadores de esquina (líneas L sólidas)
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    const corners: [number, number, number, number, number, number][] = [
      [dx,      dy,      dx + cs, dy,      dx,      dy + cs     ],
      [dx + dW, dy,      dx+dW-cs,dy,      dx + dW, dy + cs     ],
      [dx,      dy + dH, dx + cs, dy + dH, dx,      dy + dH - cs],
      [dx + dW, dy + dH, dx+dW-cs,dy + dH, dx + dW, dy + dH - cs],
    ];
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.lineTo(x3, y3); ctx.stroke();
    }
  }

  private _evaluarNitidez(): void {
    const { nitidez, contenido } = this._analizarEncuadre();
    const estado: 'ajustando' | 'listo' | 'borroso' =
      nitidez < 7              ? 'borroso'  :  // imagen desenfocada
      nitidez >= 22 && contenido >= 0.30 ? 'listo' :  // enfocado + documento detectado
      'ajustando';                               // enfocado pero sin documento
    this.ngZone.run(() => this.ocrEncuadreEstado.set(estado));
  }

  /**
   * Muestrea la región central al ratio ID-1 (85.6×54 mm).
   * nitidez  = varianza del Laplaciano (>22 = enfocado).
   * contenido = fracción de bloques con varianza local >60
   *             (≥0.30 = probable documento con texto/foto/patrones).
   */
  private _analizarEncuadre(): { nitidez: number; contenido: number } {
    const video = this.ocrVideoEl?.nativeElement;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return { nitidez: 0, contenido: 0 };

    const W = 86, H = 54; // ratio exacto ID-1 en píxeles de muestra
    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d')!;
    const m = 0.07; // margen 7% en cada lado → muestrea el área de la guía
    const vw = video.videoWidth, vh = video.videoHeight;
    ctx.drawImage(video, vw*m, vh*m, vw*(1-2*m), vh*(1-2*m), 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;

    // Escala de grises
    const g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114;

    // Nitidez: varianza del Laplaciano
    let ls = 0, ls2 = 0, ln = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const lap = g[(y-1)*W+x] + g[(y+1)*W+x] + g[y*W+x-1] + g[y*W+x+1] - 4*g[y*W+x];
        ls += lap; ls2 += lap*lap; ln++;
      }
    }
    const nitidez = ls2/ln - (ls/ln)**2;

    // Contenido: % de bloques 8×5 con varianza local > 60
    // Documento (texto, foto, patrones) → muchos bloques activos.
    // Superficie lisa o fondo vacío → casi ningún bloque activo.
    const COLS = 8, ROWS = 5;
    const bw = Math.floor(W / COLS), bh = Math.floor(H / ROWS);
    let active = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let s = 0, s2 = 0, n = 0;
        for (let y = r*bh; y < (r+1)*bh && y < H; y++) {
          for (let x = c*bw; x < (c+1)*bw && x < W; x++) {
            const v = g[y*W+x]; s += v; s2 += v*v; n++;
          }
        }
        if (n > 0 && s2/n - (s/n)**2 > 60) active++;
      }
    }
    return { nitidez, contenido: active / (COLS * ROWS) };
  }

  async ocrProcesar(): Promise<void> {
    this.ocrPaso.set('procesando');
    this.ocrErrorMsg.set('');
    this.ocrProgreso.set(15);
    this.ocrProgresoMsg.set('Enviando documentos al servidor...');

    try {
      const formData = new FormData();

      // Si el acta es PDF, conviértela a imagen antes de enviar
      if (this.ocrActaFile && this.ocrActaEsPdf()) {
        const img = await this._pdfToImage(this.ocrActaFile);
        formData.append('acta', img, 'acta.jpg');
      } else if (this.ocrActaFile) {
        formData.append('acta', this.ocrActaFile);
      }
      if (this.ocrIneFrente)  formData.append('ineFrente',  this.ocrIneFrente);
      if (this.ocrIneReverso) formData.append('ineReverso', this.ocrIneReverso);

      this.ngZone.run(() => { this.ocrProgreso.set(40); this.ocrProgresoMsg.set('Analizando con IA...'); });

      this.http.post<Record<string, string>>(`${this.apiBase}/ocr/ine`, formData).subscribe({
        next: (datos) => {
          this.ngZone.run(() => {
            this.ocrProgreso.set(100);
            this.ocrProgresoMsg.set('');
            this.ocrDatos.set(datos);
            this.ocrPaso.set('resultado');
          });
        },
        error: (err) => {
          const msg = err?.error?.error ?? err?.error?.message ?? 'Error al procesar. Intenta de nuevo.';
          this.ngZone.run(() => {
            this.ocrErrorMsg.set(msg);
            this.ocrPaso.set(this.ocrIneFrente ? 'ine-frente-preview' : this.ocrActaFile ? 'acta-preview' : 'intro');
          });
        }
      });
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      this.ngZone.run(() => {
        this.ocrErrorMsg.set(`Error al preparar los archivos: ${detalle}`);
        this.ocrPaso.set(this.ocrIneFrente ? 'ine-frente-preview' : this.ocrActaFile ? 'acta-preview' : 'intro');
      });
    }
  }

  ocrAplicarDatos(): void {
    const d = this.ocrDatos();
    const p = this.persona();
    if (!p) { this.cerrarModalOcr(); return; }
    this.saving.set(true);
    const req: PersonaRequest = {
      nombre:          d['nombre']          || p.nombre,
      apPaterno:       d['apPaterno']       || p.apPaterno,
      apMaterno:       d['apMaterno']       ?? p.apMaterno,
      curp:            d['curp']            || p.curp,
      rfc:             d['rfc']             || p.rfc,
      fechaNacimiento: d['fechaNacimiento'] || p.fechaNacimiento,
      sexo:            d['sexo']            || p.sexo,
      telefono:        p.telefono,
      telefonoAlt:     p.telefonoAlt,
      correo:          p.correo,
      calle:           d['calle']           || p.calle,
      numeroExt:       d['numeroExt']       || p.numeroExt,
      numeroInt:       p.numeroInt,
      colonia:         d['colonia']         || p.colonia,
      municipio:       d['municipio']       || p.municipio,
      estado:          d['estado']          || p.estado,
      codigoPostal:    d['codigoPostal']    || p.codigoPostal,
    };
    this.personaService.actualizarMiPerfil(req).subscribe({
      next: updated => {
        this.persona.set(updated);
        this.saving.set(false);
        this.cerrarModalOcr();
        this.successMsg.set('¡Datos personales actualizados automáticamente con tus documentos!');
        setTimeout(() => this.successMsg.set(''), 6000);
      },
      error: (err) => {
        this.saving.set(false);
        const details = err?.error?.details as string[] | undefined;
        const msg = details?.join(', ') ?? err?.error?.message ?? 'Error al guardar los datos extraídos.';
        this.ocrErrorMsg.set(msg);
      }
    });
  }

  private _parseIne(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);

    // CURP — 18 caracteres
    const curpM = text.match(/\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/i);
    if (curpM) {
      result['curp'] = curpM[1].toUpperCase();
      const sc = result['curp'][10];
      if (sc === 'H') result['sexo'] = 'M';
      else if (sc === 'M') result['sexo'] = 'F';
    }

    // Fecha de nacimiento
    const MESES: Record<string, string> = {
      ENE:'01',FEB:'02',MAR:'03',ABR:'04',MAY:'05',JUN:'06',
      JUL:'07',AGO:'08',SEP:'09',OCT:'10',NOV:'11',DIC:'12'
    };
    const fechaM = text.match(/(\d{2})[\/ \-]([A-Z]{3}|\d{2})[\/ \-](\d{4})/i);
    if (fechaM) {
      const mes = MESES[fechaM[2].toUpperCase()] ?? fechaM[2].padStart(2, '0');
      result['fechaNacimiento'] = `${fechaM[3]}-${mes}-${fechaM[1]}`;
    }

    // Campos etiquetados
    for (let i = 0; i < lines.length - 1; i++) {
      const u = lines[i].toUpperCase();
      if (/^APELLIDO\s*PATERNO/.test(u))  result['apPaterno']  ??= lines[i + 1].trim();
      if (/^APELLIDO\s*MATERNO/.test(u))  result['apMaterno']  ??= lines[i + 1].trim();
      if (/^NOMBRE\(?S?\)?$/.test(u))     result['nombre']     ??= lines[i + 1].trim();
      if (/^DOMICILIO$/.test(u)) {
        const ln = lines[i + 1];
        const numM = ln?.match(/^(.+?)\s+(?:NO\.?|NÚM\.?|NUM\.?|#)\s*(\S+)/i);
        if (numM) { result['calle'] ??= numM[1].trim(); result['numeroExt'] ??= numM[2].trim(); }
        else result['calle'] ??= ln?.trim();
      }
    }
    for (const line of lines) {
      if (/^COL\.?\s|^COLONIA\s/i.test(line)) result['colonia'] ??= line.replace(/^COL\.?\s+|^COLONIA\s+/gi, '').trim();
      const cpM = line.match(/\b(\d{5})\b/);
      if (cpM) result['codigoPostal'] ??= cpM[1];
    }
    return result;
  }

  private _parseActaFiscal(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    const rfcM = text.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/i);
    if (rfcM) result['rfc'] = rfcM[1].toUpperCase();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    for (let i = 0; i < lines.length - 1; i++) {
      const u = lines[i].toUpperCase();
      if (u.includes('NOMBRE') || u.includes('DENOMINACI')) {
        const pts = lines[i + 1].trim().split(/\s+/);
        if (pts.length >= 3) {
          result['apPaterno'] ??= pts[0];
          result['apMaterno'] ??= pts[1];
          result['nombre']    ??= pts.slice(2).join(' ');
        } else if (pts.length === 2) {
          result['apPaterno'] ??= pts[0];
          result['nombre']    ??= pts[1];
        }
      }
    }
    for (const line of lines) {
      const cpM = line.match(/\b(\d{5})\b/);
      if (cpM) result['codigoPostal'] ??= cpM[1];
    }
    return result;
  }

  private async _pdfToImage(file: File): Promise<Blob> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await import('pdfjs-dist') as any;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'));
  }

  // ── DATOS PERSONALES ──

  iniciales(): string {
    const p = this.persona();
    if (p) {
      return ((p.nombre?.[0] ?? '') + (p.apPaterno?.[0] ?? '')).toUpperCase();
    }
    const user = this.auth.currentUser();
    return user ? user.username.slice(0, 2).toUpperCase() : '?';
  }

  domicilioCompleto(): string {
    const p = this.persona();
    if (!p) return '';
    const partes = [
      p.calle, p.numeroExt ? `#${p.numeroExt}` : null,
      p.numeroInt ? `Int. ${p.numeroInt}` : null,
      p.colonia ? `Col. ${p.colonia}` : null,
      p.municipio, p.estado, p.codigoPostal
    ].filter(Boolean);
    return partes.join(', ');
  }

  abrirEditar(campo: string) {
    const p = this.persona();
    if (!p) return;
    this.campoEditando.set(campo);
    switch (campo) {
      case 'nombre':
        this.form.patchValue({ nombre: p.nombre, apPaterno: p.apPaterno, apMaterno: p.apMaterno ?? '' });
        break;
      case 'domicilio':
        this.form.patchValue({
          calle: p.calle ?? '', numeroExt: p.numeroExt ?? '', numeroInt: p.numeroInt ?? '',
          colonia: p.colonia ?? '', municipio: p.municipio ?? '',
          estado: p.estado ?? '', codigoPostal: p.codigoPostal ?? ''
        });
        break;
      default:
        this.form.patchValue({ [campo]: (p as unknown as Record<string, unknown>)[campo] ?? '' });
    }
    // Seleccionar el texto del input tras el renderizado de Angular
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.df-edit-input, .form-control-sh');
      input?.focus();
      input?.select();
    }, 0);
  }

  cerrarEditar() {
    this.campoEditando.set(null);
  }

  guardarCampo(campo: string) {
    const p = this.persona();
    if (!p) return;
    this.saving.set(true);
    const v = this.form.getRawValue();

    const req: PersonaRequest = {
      nombre:       campo === 'nombre' ? (v.nombre ?? p.nombre)       : p.nombre,
      apPaterno:    campo === 'nombre' ? (v.apPaterno ?? p.apPaterno)  : p.apPaterno,
      apMaterno:    campo === 'nombre' ? (v.apMaterno ?? undefined)    : p.apMaterno,
      curp:         campo === 'curp'   ? (v.curp?.toUpperCase() || undefined)  : p.curp,
      rfc:          campo === 'rfc'    ? (v.rfc?.toUpperCase() || undefined)   : p.rfc,
      fechaNacimiento: campo === 'fechaNacimiento' ? (v.fechaNacimiento || undefined) : p.fechaNacimiento,
      sexo:         campo === 'sexo'   ? (v.sexo || undefined)         : p.sexo,
      telefono:     campo === 'telefono'    ? (v.telefono || undefined)    : p.telefono,
      telefonoAlt:  campo === 'telefonoAlt' ? (v.telefonoAlt || undefined) : p.telefonoAlt,
      correo:       campo === 'correo'      ? (v.correo || undefined)      : p.correo,
      calle:        campo === 'domicilio' ? (v.calle || undefined)      : p.calle,
      numeroExt:    campo === 'domicilio' ? (v.numeroExt || undefined)  : p.numeroExt,
      numeroInt:    campo === 'domicilio' ? (v.numeroInt || undefined)  : p.numeroInt,
      colonia:      campo === 'domicilio' ? (v.colonia || undefined)    : p.colonia,
      municipio:    campo === 'domicilio' ? (v.municipio || undefined)  : p.municipio,
      estado:       campo === 'domicilio' ? (v.estado || undefined)     : p.estado,
      codigoPostal: campo === 'domicilio' ? (v.codigoPostal || undefined): p.codigoPostal,
    };

    this.personaService.actualizarMiPerfil(req).subscribe({
      next: updated => {
        this.persona.set(updated);
        this.saving.set(false);
        this.campoEditando.set(null);
        this.successMsg.set('Dato actualizado correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        const details = err?.error?.details as string[] | undefined;
        const msg = details?.join(', ') ?? err?.error?.message ?? 'Error al guardar los cambios.';
        this.errorMsg.set(msg);
        setTimeout(() => this.errorMsg.set(''), 6000);
      }
    });
  }

  formatFecha(fecha?: string | null): string {
    if (!fecha) return '';
    try {
      return new Date(fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return fecha;
    }
  }

  avatarColor(index: number): { bg: string; color: string } {
    const palettes = [
      { bg: 'var(--azul-suave)', color: 'var(--azul-principal)' },
      { bg: 'var(--verde-suave)', color: 'var(--verde)' },
      { bg: 'var(--morado-suave)', color: 'var(--morado)' },
      { bg: 'var(--amarillo-suave)', color: 'var(--amarillo)' },
      { bg: 'var(--rojo-suave)', color: 'var(--rojo)' }
    ];
    return palettes[index % palettes.length];
  }

  inicialesBenef(nombre: string): string {
    const parts = nombre.split(' ');
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
}

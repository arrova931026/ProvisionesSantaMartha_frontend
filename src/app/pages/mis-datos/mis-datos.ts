import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
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
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ocrVideoEl') ocrVideoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('ocrCanvasEl') ocrCanvasEl?: ElementRef<HTMLCanvasElement>;

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

    // NO se incluye 'focusMode' en constraints.
    // En Android Chrome, cualquier llamada a applyConstraints({ focusMode })
    // BLOQUEA el autofoco en la distancia actual en vez de activar el modo
    // continuo — igual que congelar el foco de la app nativa.
    // Sin la constraint, el OS usa su autofoco continuo nativo (el mismo
    // comportamiento que la cámara predeterminada de Android).
    const videoConstraints: MediaTrackConstraints = {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    };

    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }))
      .then(stream => {
        this.ocrStream = stream;
        setTimeout(() => {
          const video = this.ocrVideoEl?.nativeElement;
          if (video) {
            video.srcObject = stream;
            video.onloadedmetadata = () => this._iniciarChequeoNitidez();
          }
        }, 150);
      })
      .catch(() => {
        this.ocrErrorMsg.set('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
        this.ocrPaso.set(destino as OcrStep);
      });
  }

  /** Aplica focusMode: continuous de dos formas distintas para máxima compatibilidad. */
  private _aplicarFocoContinuo(track: MediaStreamTrack): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = track as any;
    // Método directo (Chrome 70 + Android): sin wrapper 'advanced'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t.applyConstraints({ focusMode: 'continuous' } as any).catch(() => {
      // Fallback: wrapper advanced (Firefox / versiones antiguas de Chrome)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any).catch(() => {});
    });
  }

  ocrDetenerCamara(): void {
    this._detenerChequeoNitidez();
    if (this.ocrStream) {
      this.ocrStream.getTracks().forEach(t => t.stop());
      this.ocrStream = null;
    }
  }

  /** Fuerza un ciclo de re-enfoque: single-shot → continuous. */
  private _nudgeFocus(): void {
    if (!this.ocrStream) return;
    const track = this.ocrStream.getVideoTracks()[0];
    if (!track) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = track as any;
    // Cambiar a single-shot fuerza al driver a re-medir la distancia
    t.applyConstraints({ focusMode: 'single-shot' } as any)
      .catch(() => {})
      .finally(() => {
        setTimeout(() => this._aplicarFocoContinuo(track), 400);
      });
  }

  ocrCapturar(destino: 'ine-frente' | 'ine-reverso' | 'acta'): void {
    const video = this.ocrVideoEl?.nativeElement;
    const canvas = this.ocrCanvasEl?.nativeElement;
    if (!video || !canvas) return;
    this._detenerChequeoNitidez();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this._ocrSetFile(destino, file, URL.createObjectURL(file), false);
    this.ocrPaso.set((destino + '-preview') as OcrStep);
  }

  ocrSeleccionarActa(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    this.ocrActaFile = file;
    this.ocrActaEsPdf.set(esPdf);
    this.ocrActaUrl.set(esPdf ? null : URL.createObjectURL(file));
    this.ocrPaso.set('acta-preview');
  }

  private _ocrSetFile(destino: 'ine-frente' | 'ine-reverso' | 'acta', file: File, url: string, esPdf: boolean): void {
    if (destino === 'ine-frente')    { this.ocrIneFrente = file; this.ocrIneFrenteUrl.set(url); }
    else if (destino === 'ine-reverso') { this.ocrIneReverso = file; this.ocrIneReversoUrl.set(url); }
    else { this.ocrActaFile = file; this.ocrActaUrl.set(url); this.ocrActaEsPdf.set(esPdf); }
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
    this.ocrProgreso.set(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const datos: Record<string, string> = {};
      const worker = await createWorker('spa', 1, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => {
          const pct = m.status === 'recognizing text' ? Math.round(m.progress * 100) : 0;
          this.ngZone.run(() => {
            if (m.status === 'loading tesseract core')    this.ocrProgresoMsg.set('Cargando motor OCR...');
            else if (m.status === 'initializing tesseract') this.ocrProgresoMsg.set('Inicializando OCR...');
            else if (m.status === 'loading language traineddata') this.ocrProgresoMsg.set('Cargando diccionario de idioma...');
            else if (m.status === 'recognizing text') {
              this.ocrProgresoMsg.set('Reconociendo texto...');
              this.ocrProgreso.set(pct);
            }
          });
        }
      });

      if (this.ocrIneFrente) {
        this.ngZone.run(() => { this.ocrProgresoMsg.set('Leyendo INE (frente)...'); this.ocrProgreso.set(0); });
        const { data: { text } } = await worker.recognize(this.ocrIneFrente);
        Object.assign(datos, this._parseIne(text));
      }
      if (this.ocrIneReverso) {
        this.ngZone.run(() => { this.ocrProgresoMsg.set('Leyendo INE (reverso)...'); this.ocrProgreso.set(0); });
        const { data: { text } } = await worker.recognize(this.ocrIneReverso);
        const parsed = this._parseIne(text);
        Object.entries(parsed).forEach(([k, v]) => { if (!datos[k]) datos[k] = v; });
      }
      if (this.ocrActaFile) {
        this.ngZone.run(() => { this.ocrProgresoMsg.set('Leyendo Acta de Situación Fiscal...'); this.ocrProgreso.set(0); });
        let src: File | Blob = this.ocrActaFile;
        if (this.ocrActaEsPdf()) src = await this._pdfToImage(this.ocrActaFile);
        const { data: { text } } = await worker.recognize(src as File);
        const parsed = this._parseActaFiscal(text);
        Object.entries(parsed).forEach(([k, v]) => { if (!datos[k]) datos[k] = v; });
      }

      await worker.terminate();
      this.ngZone.run(() => { this.ocrProgresoMsg.set(''); this.ocrDatos.set(datos); this.ocrPaso.set('resultado'); });
    } catch {
      this.ngZone.run(() => {
        this.ocrErrorMsg.set('Error al procesar los documentos. Verifica que las imágenes sean legibles e inténtalo de nuevo.');
        this.ocrPaso.set('acta-preview');
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

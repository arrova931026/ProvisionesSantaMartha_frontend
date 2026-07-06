import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { PersonaService } from '../../core/services/persona.service';
import { ContratoService } from '../../core/services/contrato.service';
import { DocumentoService } from '../../core/services/documento.service';
import { PersonaResponse } from '../../core/models/persona.model';
import { DocumentosPendientesResponse } from '../../core/models/documento.model';
import { environment } from '../../../environments/environment';

interface Plan {
  id: number;
  nombre: string;
  descripcion?: string;
  precioTotal: number;
  mensualidad: number;
  duracionMeses: number;
  numeroBeneficiarios: number;
}

interface Parentesco {
  id: number;
  clave: string;
  nombre: string;
}

interface DocTipo {
  clave: string;
  etiqueta: string;
  subido: boolean;
  mime?: string;
  archivo?: File;
}

@Component({
  selector: 'app-crear-contrato',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './crear-contrato.html'
})
export class CrearContratoComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly personaService = inject(PersonaService);
  private readonly contratoService = inject(ContratoService);
  private readonly documentoService = inject(DocumentoService);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);

  readonly paso = signal<1 | 2 | 3 | 4>(1);
  readonly loading = signal(true);
  readonly guardando = signal(false);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');
  readonly persona = signal<PersonaResponse | null>(null);
  readonly errorElegibilidad = signal('');

  // ── Paso 1: documentos ──
  readonly docs = signal<DocTipo[]>([
    { clave: 'INE',             etiqueta: 'Credencial INE / IFE',              subido: false },
    { clave: 'CURP',            etiqueta: 'CURP',                               subido: false },
    { clave: 'COMPROBANTE_DOM', etiqueta: 'Comprobante de domicilio',           subido: false },
    { clave: 'ACTA_NAC',        etiqueta: 'Acta de nacimiento',                 subido: false },
    { clave: 'RFC',             etiqueta: 'RFC / Constancia fiscal',            subido: false },
  ]);

  // modal de carga de documento
  readonly modalDocAbierto = signal(false);
  readonly modalDocClave = signal('');
  readonly modalDocEtiqueta = signal('');
  readonly subiendoDoc = signal(false);
  readonly errorDoc = signal('');

  // modal de confirmación de eliminación
  readonly modalEliminarAbierto = signal(false);
  readonly modalEliminarClave = signal('');
  readonly modalEliminarEtiqueta = signal('');
  readonly eliminandoDoc = signal(false);
  readonly errorEliminar = signal('');
  private streamDoc: MediaStream | null = null;
  readonly isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  readonly modoModalDoc = signal<'opciones' | 'camara' | 'preview' | 'editar'>('opciones');
  readonly docPreviewUrl = signal<string | null>(null);
  readonly docImgData = signal<string | null>(null);
  readonly docRotacion = signal(0);
  readonly cropCursor = signal<string>('default');
  readonly ineStep = signal<1 | 2>(1);
  readonly ineFrentePreviewUrl = signal<string | null>(null);
  private _ineFrenteFile: File | null = null;
  private _cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
  private _cropDragHandle: string | null = null;
  private _cropDragStart = { x: 0, y: 0 };
  private _cropNormStart = { x: 0, y: 0, w: 1, h: 1 };
  private docArchivoSeleccionado: File | null = null;
  private _docImgEl: HTMLImageElement | null = null;

  readonly todosDocsSubidos = computed(() => this.docs().every(d => d.subido));

  // ── Paso 2: planes ──
  readonly planes = signal<Plan[]>([]);
  readonly planSeleccionado = signal<Plan | null>(null);

  // ── Paso 3: beneficiarios ──
  readonly parentescos = signal<Parentesco[]>([]);
  readonly benefForm = this.fb.group({ beneficiarios: this.fb.array([]) });
  get benefArray(): FormArray { return this.benefForm.get('beneficiarios') as FormArray; }

  readonly maxBeneficiarios = computed(() => this.planSeleccionado()?.numeroBeneficiarios ?? 0);

  // ── Paso 2: Video de consentimiento ───────────────────────────────────────
  readonly videoEstado = signal<'listo' | 'grabando' | 'detenido'>('listo');
  readonly videoUrl = signal<string | null>(null);
  readonly videoBlob = signal<Blob | null>(null);
  readonly videoSubido = signal(false);
  readonly subiendoVideo = signal(false);
  readonly errorVideo = signal('');
  readonly segundosRestantes = signal(30);
  private videoStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private videoCountdownTimer: ReturnType<typeof setInterval> | null = null;

  readonly leyendaConsentimiento = computed(() => {
    const p = this.persona();
    if (!p) return '';
    const nombre = [p.nombre, p.apPaterno, p.apMaterno].filter(Boolean).join(' ');
    const curp = p.curp ?? '(sin CURP registrado)';
    return `Yo ${nombre} con CURP ${curp} estoy de acuerdo con la contratación de los servicios mutualistas de Sociedad Humanista Santa Martha SA de CV y que todos los datos que proporciono son veraderos`;
  });

  ngOnInit() {
    const user = this.auth.currentUser();
    if (!user?.personaId) { this.router.navigate(['/portal/mis-datos']); return; }

    const pid = user.personaId;

    forkJoin({
      persona: this.personaService.obtener(pid),
      pendientes: this.documentoService.obtenerPendientes(pid).pipe(catchError(() => of<DocumentosPendientesResponse>({ completo: false, faltantes: [] }))),
      planes: this.http.get<Plan[]>(`${environment.apiUrl}/planes`).pipe(catchError(() => of<Plan[]>([]))),
      parentescos: this.http.get<Parentesco[]>(`${environment.apiUrl}/catalogos/parentescos`).pipe(catchError(() => of<Parentesco[]>([])))
    }).subscribe({
      next: ({ persona, pendientes, planes, parentescos }) => {
        this.persona.set(persona);
        this.planes.set(planes);
        this.parentescos.set(parentescos);

        // Verificar elegibilidad de edad
        if (persona.fechaNacimiento) {
          const born = new Date(persona.fechaNacimiento);
          const now = new Date();
          let age = now.getFullYear() - born.getFullYear();
          const m = now.getMonth() - born.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
          if (age >= 65) {
            this.errorElegibilidad.set(
              'No es posible crear el contrato: ha superado la edad máxima permitida de 64 años 11 meses.'
            );
          }
        } else {
          this.errorElegibilidad.set('Su fecha de nacimiento no está registrada. Complétela en Mis Datos antes de continuar.');
        }

        // Marcar documentos ya subidos
        const faltantes = new Set(pendientes.faltantes ?? []);
        this.docs.update(list =>
          list.map(d => ({ ...d, subido: !faltantes.has(d.clave) }))
        );

        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  // ─── Paso 1 helpers ───────────────────────────────────────────────────────

  abrirModalDoc(clave: string, etiqueta: string) {
    this.modalDocClave.set(clave);
    this.modalDocEtiqueta.set(etiqueta);
    this.modoModalDoc.set('opciones');
    this.docPreviewUrl.set(null);
    this.docImgData.set(null);
    this._docImgEl = null;
    this.docArchivoSeleccionado = null;
    this.docRotacion.set(0);
    this._cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
    if (clave === 'INE') {
      this.ineStep.set(1);
      this._ineFrenteFile = null;
      this.ineFrentePreviewUrl.set(null);
    }
    this.errorDoc.set('');
    this.modalDocAbierto.set(true);
  }

  cerrarModalDoc() {
    this.modalDocAbierto.set(false);
    this.detenerCamaraDoc();
  }

  seleccionarArchivoDoc(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.errorDoc.set('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF.');
      return;
    }
    if (file.type === 'application/pdf') {
      this.docArchivoSeleccionado = file;
      this.docPreviewUrl.set(null);
      this.modoModalDoc.set('preview');
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        this.docImgData.set(dataUrl);
        const img = new Image();
        img.onload = () => {
          this._docImgEl = img;
          this.docRotacion.set(0);
          this._cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
          this.modoModalDoc.set('editar');
          setTimeout(() => this._actualizarCanvasEdicion(), 60);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  }

  async iniciarCamaraDoc() {
    this.modoModalDoc.set('camara');
    try {
      this.streamDoc = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      // assigned via viewchild if needed; for simplicity use a named video elem in template
      const video = document.getElementById('docVideo') as HTMLVideoElement;
      if (video) { video.srcObject = this.streamDoc; video.play(); }
    } catch {
      this.errorDoc.set('No se pudo acceder a la cámara.');
      this.modoModalDoc.set('opciones');
    }
  }

  capturarFotoDoc() {
    const video = document.getElementById('docVideo') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    this.detenerCamaraDoc();
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `${this.modalDocClave()}.jpg`, { type: 'image/jpeg' });
      this.docArchivoSeleccionado = file;
      this.docPreviewUrl.set(URL.createObjectURL(blob));
      this.modoModalDoc.set('preview');
    }, 'image/jpeg', 0.92);
  }

  private detenerCamaraDoc() {
    this.streamDoc?.getTracks().forEach(t => t.stop());
    this.streamDoc = null;
  }

  // ── Edición de imagen del documento ──────────────────────────────────────────────

  rotarDocumento() {
    this.docRotacion.set((this.docRotacion() + 90) % 360);
    this._cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
    setTimeout(() => this._actualizarCanvasEdicion(), 0);
  }

  // ── Canvas drag-crop ─────────────────────────────────────────────────────

  private _detectCropHandle(px: number, py: number, cx: number, cy: number, cw: number, ch: number, H: number): string | null {
    const near = (ax: number, ay: number) => Math.abs(px - ax) <= H && Math.abs(py - ay) <= H;
    if (near(cx, cy))           return 'tl';
    if (near(cx + cw, cy))      return 'tr';
    if (near(cx, cy + ch))      return 'bl';
    if (near(cx + cw, cy + ch)) return 'br';
    if (Math.abs(py - cy)       <= H && px >= cx - H && px <= cx + cw + H) return 't';
    if (Math.abs(py - (cy + ch)) <= H && px >= cx - H && px <= cx + cw + H) return 'b';
    if (Math.abs(px - cx)       <= H && py >= cy - H && py <= cy + ch + H) return 'l';
    if (Math.abs(px - (cx + cw)) <= H && py >= cy - H && py <= cy + ch + H) return 'r';
    if (px >= cx && px <= cx + cw && py >= cy && py <= cy + ch) return 'move';
    return null;
  }

  private readonly _cursorMap: Record<string, string> = {
    tl: 'nw-resize', tr: 'ne-resize', bl: 'sw-resize', br: 'se-resize',
    t: 'n-resize', b: 's-resize', l: 'w-resize', r: 'e-resize', move: 'grab'
  };

  cropPointerDown(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const H  = Math.max(canvas.width * 0.055, 14);
    const cx = this._cropNorm.x * canvas.width,  cy = this._cropNorm.y * canvas.height;
    const cw = this._cropNorm.w * canvas.width,  ch = this._cropNorm.h * canvas.height;
    const handle = this._detectCropHandle(px, py, cx, cy, cw, ch, H);
    if (!handle) return;
    this._cropDragHandle = handle;
    this._cropDragStart  = { x: px, y: py };
    this._cropNormStart  = { ...this._cropNorm };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  cropPointerMove(e: PointerEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);

    if (this._cropDragHandle) {
      const dx = (px - this._cropDragStart.x) / canvas.width;
      const dy = (py - this._cropDragStart.y) / canvas.height;
      const s = this._cropNormStart;
      const MIN = 0.06;
      let { x, y, w, h } = s;
      switch (this._cropDragHandle) {
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
      this._cropNorm = { x, y, w, h };
      this._actualizarCanvasEdicion();
      const base = this._cursorMap[this._cropDragHandle] ?? 'default';
      this.cropCursor.set(base === 'grab' ? 'grabbing' : base);
    } else {
      const H  = Math.max(canvas.width * 0.055, 14);
      const cx = this._cropNorm.x * canvas.width,  cy = this._cropNorm.y * canvas.height;
      const cw = this._cropNorm.w * canvas.width,  ch = this._cropNorm.h * canvas.height;
      const handle = this._detectCropHandle(px, py, cx, cy, cw, ch, H);
      this.cropCursor.set(handle ? (this._cursorMap[handle] ?? 'default') : 'default');
    }
  }

  cropPointerUp(e: PointerEvent) {
    this._cropDragHandle = null;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const H  = Math.max(canvas.width * 0.055, 14);
    const cx = this._cropNorm.x * canvas.width,  cy = this._cropNorm.y * canvas.height;
    const cw = this._cropNorm.w * canvas.width,  ch = this._cropNorm.h * canvas.height;
    const handle = this._detectCropHandle(px, py, cx, cy, cw, ch, H);
    this.cropCursor.set(handle ? (this._cursorMap[handle] ?? 'default') : 'default');
  }

  private _actualizarCanvasEdicion() {
    const canvas = document.getElementById('docEditCanvas') as HTMLCanvasElement;
    const img = this._docImgEl;
    if (!canvas || !img) return;

    const rot = this.docRotacion();
    const swapped = rot === 90 || rot === 270;
    const rotW = swapped ? img.naturalHeight : img.naturalWidth;
    const rotH = swapped ? img.naturalWidth  : img.naturalHeight;

    const maxW = Math.max((canvas.parentElement?.clientWidth ?? 320) - 2, 120);
    const scale = maxW / rotW;
    const dispW = Math.max(Math.round(rotW * scale), 1);
    const dispH = Math.max(Math.round(rotH * scale), 1);
    canvas.width = dispW;
    canvas.height = dispH;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, dispW, dispH);

    // Draw rotated image
    ctx.save();
    ctx.translate(dispW / 2, dispH / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(img, -(img.naturalWidth * scale) / 2, -(img.naturalHeight * scale) / 2,
                  img.naturalWidth * scale, img.naturalHeight * scale);
    ctx.restore();

    // Crop rect in canvas px
    const cropX = Math.round(this._cropNorm.x * dispW);
    const cropY = Math.round(this._cropNorm.y * dispH);
    const cropW = Math.max(Math.round(this._cropNorm.w * dispW), 10);
    const cropH = Math.max(Math.round(this._cropNorm.h * dispH), 10);

    // Dark overlay OUTSIDE the crop (what gets removed)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, dispW, cropY);
    ctx.fillRect(0, cropY + cropH, dispW, dispH - cropY - cropH);
    ctx.fillRect(0, cropY, cropX, cropH);
    ctx.fillRect(cropX + cropW, cropY, dispW - cropX - cropW, cropH);

    // Rule-of-thirds grid (inside the crop, what gets kept)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cropX + cropW * i / 3, cropY); ctx.lineTo(cropX + cropW * i / 3, cropY + cropH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cropX, cropY + cropH * i / 3); ctx.lineTo(cropX + cropW, cropY + cropH * i / 3); ctx.stroke();
    }

    // Thick black border (white halo + black on top for contrast on any background)
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 5.5;
    ctx.strokeRect(cropX + 0.5, cropY + 0.5, cropW - 1, cropH - 1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(cropX + 0.5, cropY + 0.5, cropW - 1, cropH - 1);

    // Corner L-handles
    const CL = Math.max(Math.min(cropW, cropH) * 0.14, 12);
    ctx.lineCap = 'square';
    const corners: [number,number,number,number,number,number][] = [
      [cropX,        cropY,        cropX + CL,         cropY,        cropX,        cropY + CL],
      [cropX + cropW,cropY,        cropX + cropW - CL, cropY,        cropX + cropW,cropY + CL],
      [cropX,        cropY + cropH,cropX + CL,         cropY + cropH,cropX,        cropY + cropH - CL],
      [cropX + cropW,cropY + cropH,cropX + cropW - CL, cropY + cropH,cropX + cropW,cropY + cropH - CL],
    ];
    // White halo behind corners
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 6;
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.lineTo(x3, y3); ctx.stroke();
    }
    // Black corners on top
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.lineTo(x3, y3); ctx.stroke();
    }

    // Edge midpoint handles
    if (cropW > 60 && cropH > 60) {
      const mids: [number,number][] = [
        [cropX + cropW / 2, cropY], [cropX + cropW / 2, cropY + cropH],
        [cropX, cropY + cropH / 2], [cropX + cropW, cropY + cropH / 2],
      ];
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      for (const [mx, my] of mids) {
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
  }

  aplicarEdicionDoc() {
    const img = this._docImgEl;
    if (!img) return;

    const rot = this.docRotacion();

    // Step 1: rotate onto intermediate canvas
    const swapped = rot === 90 || rot === 270;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width  = swapped ? img.naturalHeight : img.naturalWidth;
    rotCanvas.height = swapped ? img.naturalWidth  : img.naturalHeight;
    const rotCtx = rotCanvas.getContext('2d')!;
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate(rot * Math.PI / 180);
    rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    // Step 2: crop from _cropNorm
    const rw = rotCanvas.width, rh = rotCanvas.height;
    const cropX = Math.round(rw * this._cropNorm.x);
    const cropY = Math.round(rh * this._cropNorm.y);
    const cropW = Math.max(Math.round(rw * this._cropNorm.w), 1);
    const cropH = Math.max(Math.round(rh * this._cropNorm.h), 1);

    // Step 3: HD output (min 1280 px wide)
    const TARGET_W = Math.max(cropW, 1280);
    const upScale  = TARGET_W / cropW;
    const TARGET_H = Math.round(cropH * upScale);

    const outCanvas = document.createElement('canvas');
    outCanvas.width  = TARGET_W;
    outCanvas.height = TARGET_H;
    const outCtx = outCanvas.getContext('2d')!;
    outCtx.filter = 'contrast(1.04) brightness(1.01)';
    outCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, TARGET_W, TARGET_H);
    outCtx.filter = 'none';

    outCanvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `${this.modalDocClave()}.jpg`, { type: 'image/jpeg' });
      // INE paso 1: guardar frente y pasar a captura de reverso
      if (this.modalDocClave() === 'INE' && this.ineStep() === 1) {
        this._ineFrenteFile = file;
        this.ineFrentePreviewUrl.set(outCanvas.toDataURL('image/jpeg', 0.92));
        this.docImgData.set(null);
        this._docImgEl = null;
        this.docRotacion.set(0);
        this._cropNorm = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
        this.ineStep.set(2);
        this.modoModalDoc.set('opciones');
      } else {
        this.docArchivoSeleccionado = file;
        this.docPreviewUrl.set(outCanvas.toDataURL('image/jpeg', 0.92));
        this.modoModalDoc.set('preview');
      }
    }, 'image/jpeg', 0.92);
  }

  confirmarSubidaDoc() {
    const pid = this.auth.currentUser()?.personaId;
    if (!pid || !this.docArchivoSeleccionado) return;
    this.subiendoDoc.set(true);
    this.errorDoc.set('');
    const clave = this.modalDocClave();

    // INE: combinar frente y reverso en una sola imagen y subir como 'INE'
    if (clave === 'INE' && this._ineFrenteFile) {
      this._combinarINE(this._ineFrenteFile, this.docArchivoSeleccionado!).then(combined => {
        this.documentoService.subirDocumento(pid, 'INE', combined).subscribe({
          next: () => {
            this.docs.update(list => list.map(d => d.clave === 'INE' ? { ...d, subido: true } : d));
            this.subiendoDoc.set(false);
            this.cerrarModalDoc();
          },
          error: (err) => {
            this.errorDoc.set(err?.error?.mensaje ?? 'Error al subir la credencial.');
            this.subiendoDoc.set(false);
          }
        });
      });
      return;
    }

    this.documentoService.subirDocumento(pid, clave, this.docArchivoSeleccionado).subscribe({
      next: () => {
        this.docs.update(list =>
          list.map(d => d.clave === clave ? { ...d, subido: true } : d)
        );
        this.subiendoDoc.set(false);
        this.cerrarModalDoc();
      },
      error: (err) => {
        this.errorDoc.set(err?.error?.mensaje ?? 'Error al subir el documento.');
        this.subiendoDoc.set(false);
      }
    });
  }

  private _combinarINE(frente: File, reverso: File): Promise<File> {
    const cargar = (f: File) => new Promise<HTMLImageElement>(res => {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.src = url;
    });
    return Promise.all([cargar(frente), cargar(reverso)]).then(([imgF, imgR]) => {
      const GAP = 12;
      const w = Math.max(imgF.naturalWidth, imgR.naturalWidth);
      const h = imgF.naturalHeight + GAP + imgR.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(imgF, Math.round((w - imgF.naturalWidth) / 2), 0);
      ctx.drawImage(imgR, Math.round((w - imgR.naturalWidth) / 2), imgF.naturalHeight + GAP);
      return new Promise<File>(res =>
        canvas.toBlob(b => res(new File([b!], 'INE.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92)
      );
    });
  }

  pedirConfirmacionEliminar(clave: string, etiqueta: string) {
    this.modalEliminarClave.set(clave);
    this.modalEliminarEtiqueta.set(etiqueta);
    this.errorEliminar.set('');
    this.modalEliminarAbierto.set(true);
  }

  cerrarModalEliminar() {
    this.modalEliminarAbierto.set(false);
  }

  confirmarEliminarDoc() {
    const pid = this.auth.currentUser()?.personaId;
    if (!pid) return;
    const clave = this.modalEliminarClave();
    this.eliminandoDoc.set(true);
    this.errorEliminar.set('');
    this.documentoService.eliminarDocumento(pid, clave).subscribe({
      next: () => {
        this.docs.update(list =>
          list.map(d => d.clave === clave ? { ...d, subido: false } : d)
        );
        this.eliminandoDoc.set(false);
        this.cerrarModalEliminar();
      },
      error: (err) => {
        this.errorEliminar.set(err?.error?.mensaje ?? 'Error al eliminar el documento.');
        this.eliminandoDoc.set(false);
      }
    });
  }

  // ─── Paso 2 helpers ───────────────────────────────────────────────────────

  seleccionarPlan(plan: Plan) {
    this.planSeleccionado.set(plan);
  }

  // ─── Paso 3 helpers ───────────────────────────────────────────────────────

  agregarBeneficiarioForm() {
    if (this.benefArray.length >= this.maxBeneficiarios()) return;
    this.benefArray.push(this.fb.group({
      nombre:              ['', Validators.required],
      apPaterno:           ['', Validators.required],
      apMaterno:           ['', Validators.required],
      fechaNacimiento:     ['', Validators.required],
      telefono:            ['', Validators.pattern(/^\d{10}$/)],
      parentescoId:        [null, Validators.required],
      porcentajeCobertura: [100, [Validators.required, Validators.min(1), Validators.max(100)]]
    }));
  }

  eliminarBeneficiario(i: number) {
    this.benefArray.removeAt(i);
  }

  ngOnDestroy() {
    this._detenerCamaraVideo();
  }

  // ─── Navegación ───────────────────────────────────────────────────────────

  irPaso2() {
    this.errorMsg.set('');
    if (!this.todosDocsSubidos()) {
      this.errorMsg.set('Por favor, cargue todos los documentos requeridos antes de continuar.');
      return;
    }
    this.paso.set(2);
    this._iniciarCamaraVideo();
    if (this.isMobile) {
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 80);
    }
  }

  irPaso3() {
    this.errorMsg.set('');
    if (!this.videoSubido()) {
      this.errorMsg.set('Por favor, grabe y suba su video de consentimiento antes de continuar.');
      return;
    }
    this._detenerCamaraVideo();
    this.paso.set(3);
  }

  irPaso4() {
    this.errorMsg.set('');
    if (!this.planSeleccionado()) {
      this.errorMsg.set('Seleccione un plan funerario antes de continuar.');
      return;
    }
    while (this.benefArray.length < this.maxBeneficiarios()) {
      this.agregarBeneficiarioForm();
    }
    this.paso.set(4);
  }

  volverDesdeVideo() {
    this._detenerCamaraVideo();
    this.videoEstado.set('listo');
    if (this.videoUrl()) { URL.revokeObjectURL(this.videoUrl()!); }
    this.videoUrl.set(null);
    this.videoBlob.set(null);
    this.videoSubido.set(false);
    this.segundosRestantes.set(30);
    this.paso.set(1);
  }

  // ─── Video de consentimiento ──────────────────────────────────────────────

  async _iniciarCamaraVideo() {
    this.errorVideo.set('');
    this.videoEstado.set('listo');
    this.videoUrl.set(null);
    this.videoBlob.set(null);
    this.videoSubido.set(false);
    this.videoChunks = [];
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setTimeout(() => {
        const v = document.getElementById('videoConsentimiento') as HTMLVideoElement;
        if (v) { v.srcObject = this.videoStream; v.muted = true; v.play(); }
      }, 200);
    } catch {
      this.errorVideo.set('No se pudo acceder a la cámara o micrófono. Verifique los permisos del navegador.');
    }
  }

  _detenerCamaraVideo() {
    if (this.videoCountdownTimer) { clearInterval(this.videoCountdownTimer); this.videoCountdownTimer = null; }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    if (this.videoStream) { this.videoStream.getTracks().forEach(t => t.stop()); this.videoStream = null; }
  }

  iniciarGrabacion() {
    if (!this.videoStream) return;
    this.videoChunks = [];
    this.segundosRestantes.set(30);
    this.errorVideo.set('');
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';
    this.mediaRecorder = new MediaRecorder(this.videoStream, mimeType ? { mimeType } : {});
    this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.videoChunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      const type = this.mediaRecorder?.mimeType || 'video/webm';
      const blob = new Blob(this.videoChunks, { type });
      this.videoBlob.set(blob);
      const url = URL.createObjectURL(blob);
      this.videoUrl.set(url);
      this.videoEstado.set('detenido');
      const v = document.getElementById('videoConsentimiento') as HTMLVideoElement;
      if (v) { v.srcObject = null; v.src = url; v.muted = false; v.load(); }
    };
    this.mediaRecorder.start(500);
    this.videoEstado.set('grabando');
    this.videoCountdownTimer = setInterval(() => {
      const s = this.segundosRestantes() - 1;
      if (s <= 0) { this.detenerGrabacion(); }
      else { this.segundosRestantes.set(s); }
    }, 1000);
  }

  detenerGrabacion() {
    if (this.videoCountdownTimer) { clearInterval(this.videoCountdownTimer); this.videoCountdownTimer = null; }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
  }

  regrabarVideo() {
    if (this.videoUrl()) { URL.revokeObjectURL(this.videoUrl()!); }
    this.videoUrl.set(null);
    this.videoBlob.set(null);
    this.videoSubido.set(false);
    this.segundosRestantes.set(30);
    this.videoChunks = [];
    this.videoEstado.set('listo');
    setTimeout(() => {
      const v = document.getElementById('videoConsentimiento') as HTMLVideoElement;
      if (v && this.videoStream && this.videoStream.getTracks().every(t => t.readyState === 'live')) {
        v.srcObject = this.videoStream; v.src = ''; v.muted = true; v.play();
      } else {
        this._iniciarCamaraVideo();
      }
    }, 100);
  }

  subirVideoConsentimiento() {
    const blob = this.videoBlob();
    const pid = this.persona()?.id;
    if (!blob || !pid) return;
    this.subiendoVideo.set(true);
    this.errorVideo.set('');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `video_consent.${ext}`, { type: blob.type || 'video/webm' });
    const form = new FormData();
    form.append('video', file, file.name);
    this.http.post<{ url: string }>(
      `${environment.apiUrl}/documentos/persona/${pid}/video-consentimiento`, form
    ).subscribe({
      next: () => { this.videoSubido.set(true); this.subiendoVideo.set(false); },
      error: err => {
        this.errorVideo.set(err?.error?.error ?? 'Error al subir el video. Intente de nuevo.');
        this.subiendoVideo.set(false);
      }
    });
  }

  // ─── Terminar contrato ────────────────────────────────────────────────────

  terminarContrato() {
    this.errorMsg.set('');
    const errBenef = this._validarBeneficiarios();
    if (errBenef) {
      this.errorMsg.set(errBenef);
      setTimeout(() => {
        const el = document.querySelector('.wizard-alert.danger') as HTMLElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return;
    }
    const plan = this.planSeleccionado()!;
    const pid = this.persona()!.id;
    const hoy = new Date().toISOString().slice(0, 10);

    this.guardando.set(true);
    this.contratoService.crear({
      personaId: pid,
      planId: plan.id,
      fechaInicio: hoy,
      precioContratado: plan.precioTotal,
      mensualidadPactada: plan.mensualidad
    }).pipe(
      switchMap(contrato => {
        const validos = this.benefArray.controls
          .filter((g: any) => g.get('nombre')?.value?.trim())
          .map((g: any) => g.value);

        if (validos.length === 0) return of({ contrato, benefs: [] });

        const reqs = validos.map(b =>
          this.contratoService.agregarBeneficiario(contrato.id, {
            nombre:              b.nombre,
            apPaterno:           b.apPaterno,
            apMaterno:           b.apMaterno || undefined,
            fechaNacimiento:     b.fechaNacimiento || undefined,
            telefono:            b.telefono || undefined,
            parentescoId:        +b.parentescoId,
            porcentajeCobertura: +b.porcentajeCobertura
          }).pipe(catchError(() => of(null)))
        );
        return forkJoin(reqs).pipe(
          switchMap(benefs => of({ contrato, benefs }))
        );
      }),
      switchMap(({ contrato }) =>
        this.contratoService.enviarPdf(contrato.id).pipe(
          catchError(() => of(null)),
          switchMap(() => of(contrato))
        )
      )
    ).subscribe({
      next: (contrato) => {
        this.guardando.set(false);
        this.successMsg.set(`¡Contrato ${contrato.numeroContrato} creado exitosamente! Se ha enviado una copia al correo registrado.`);
        setTimeout(() => this.router.navigate(['/portal/plan-funerario']), 3500);
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorMsg.set(err?.error?.mensaje ?? 'Ocurrió un error al crear el contrato. Intente de nuevo.');
      }
    });
  }

  private _validarBeneficiarios(): string | null {
    for (let i = 0; i < this.benefArray.length; i++) {
      const g = this.benefArray.at(i) as FormGroup;
      const n = (idx: string) => g.get(idx)?.value;

      if (!n('nombre')?.trim())     return `Beneficiario ${i + 1}: el nombre es requerido.`;
      if (!n('apPaterno')?.trim())  return `Beneficiario ${i + 1}: el apellido paterno es requerido.`;
      if (!n('apMaterno')?.trim())  return `Beneficiario ${i + 1}: el apellido materno es requerido.`;
      const fechaNac = n('fechaNacimiento') as string | null;
      if (!fechaNac)                return `Beneficiario ${i + 1}: la fecha de nacimiento es requerida.`;
      if (!n('parentescoId'))       return `Beneficiario ${i + 1}: el parentesco es requerido.`;

      // Validación de edad para Hijo(a)
      const parentescoId = +n('parentescoId');
      const parentesco = this.parentescos().find(p => p.id === parentescoId);
      if (parentesco?.clave === 'HIJO') {
        const born = new Date(fechaNac + 'T00:00:00');
        const now  = new Date();
        let age = now.getFullYear() - born.getFullYear();
        const dm = now.getMonth() - born.getMonth();
        if (dm < 0 || (dm === 0 && now.getDate() < born.getDate())) age--;
        if (age > 21) {
          return `Beneficiario ${i + 1}: el Hijo(a) tiene ${age} años. Solo se permiten hijos de hasta 21 años.`;
        }
      }
    }
    return null;
  }

  formatMoney(n: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
  }

  get benefControls(): FormGroup[] {
    return this.benefArray.controls as FormGroup[];
  }
}

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
  readonly modoModalDoc = signal<'opciones' | 'camara' | 'preview'>('opciones');
  readonly docPreviewUrl = signal<string | null>(null);
  private docArchivoSeleccionado: File | null = null;

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
  readonly segundosRestantes = signal(20);
  private videoStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private videoChunks: Blob[] = [];
  private videoCountdownTimer: ReturnType<typeof setInterval> | null = null;

  readonly leyendaConsentimiento = computed(() => {
    const p = this.persona();
    if (!p) return '';
    const nombre = [p.nombre, p.apPaterno, p.apMaterno].filter(Boolean).join(' ');
    const curp = p.curp ?? '(sin CURP registrado)';
    return `Yo ${nombre} con CURP ${curp} estoy de acuerdo con la contratación de los servicios mutualistas de Sociedad Humanista Santa Martha SA de CV`;
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
    this.docArchivoSeleccionado = null;
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
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this.errorDoc.set('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF.');
      return;
    }
    this.docArchivoSeleccionado = file;
    if (file.type === 'application/pdf') {
      this.docPreviewUrl.set(null);
    } else {
      const reader = new FileReader();
      reader.onload = e => this.docPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    this.modoModalDoc.set('preview');
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

  confirmarSubidaDoc() {
    const pid = this.auth.currentUser()?.personaId;
    if (!pid || !this.docArchivoSeleccionado) return;
    this.subiendoDoc.set(true);
    this.errorDoc.set('');
    const clave = this.modalDocClave();
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
      apMaterno:           [''],
      fechaNacimiento:     [''],
      telefono:            ['', Validators.pattern(/^\d{10}$/)],
      correo:              ['', Validators.email],
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
    this.segundosRestantes.set(20);
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
    this.segundosRestantes.set(20);
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
    this.segundosRestantes.set(20);
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
            correo:              b.correo || undefined,
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

  formatMoney(n: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
  }

  get benefControls(): FormGroup[] {
    return this.benefArray.controls as FormGroup[];
  }
}

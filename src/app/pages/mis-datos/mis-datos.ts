import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
      curp:         campo === 'curp'   ? (v.curp || undefined)         : p.curp,
      rfc:          campo === 'rfc'    ? (v.rfc || undefined)          : p.rfc,
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
      error: () => {
        this.saving.set(false);
        this.errorMsg.set('Error al guardar los cambios.');
        setTimeout(() => this.errorMsg.set(''), 4000);
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

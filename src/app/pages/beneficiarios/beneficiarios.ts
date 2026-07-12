import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Beneficiario } from '../../core/models/beneficiario.model';
import { BeneficiarioRequest, ContratoResponse } from '../../core/models/contrato.model';
import { ContratoService } from '../../core/services/contrato.service';
import { BeneficiarioService } from '../../core/services/beneficiario.service';
import { AuthService } from '../../core/services/auth.service';

interface Parentesco {
  id: number;
  clave: string;
  nombre: string;
}

@Component({
  selector: 'app-beneficiarios',
  imports: [ReactiveFormsModule],
  templateUrl: './beneficiarios.html'
})
export class BeneficiariosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly contratoService = inject(ContratoService);
  private readonly beneficiarioService = inject(BeneficiarioService);
  private readonly fb = inject(FormBuilder);

  private readonly AVATAR_COLORS = ['av-azul', 'av-verde', 'av-morado', 'av-amarillo'];

  readonly beneficiarios = signal<Beneficiario[]>([]);
  readonly parentescos   = signal<Parentesco[]>([]);
  readonly contrato      = signal<ContratoResponse | null>(null);
  readonly loading       = signal(true);
  readonly errorMsg      = signal('');
  readonly successMsg    = signal('');
  readonly mostrarModal        = signal(false);
  readonly mostrarModalEditar  = signal(false);
  readonly mostrarConfEliminar = signal(false);
  readonly guardando           = signal(false);
  readonly guardandoEdicion    = signal(false);
  readonly eliminando          = signal(false);
  readonly maxBeneficiarios = signal<number>(0);
  readonly limitAlcanzado   = computed(() =>
    this.maxBeneficiarios() > 0 && this.beneficiarios().length >= this.maxBeneficiarios()
  );
  private contratoId: number | null = null;
  private beneficiarioEditandoId: number | null = null;
  private beneficiarioAEliminarId: number | null = null;
  readonly beneficiarioAEliminarNombre = signal('');

  readonly form = this.fb.group({
    nombre:              ['', Validators.required],
    apPaterno:           ['', Validators.required],
    apMaterno:           [''],
    parentescoId:        [null as number | null, Validators.required],
    fechaNacimiento:     [''],
    telefono:            ['', Validators.pattern(/^\d{10}$/)],
    correo:              ['', Validators.email],
    porcentajeCobertura: [100 as number | null, [Validators.required, Validators.min(1), Validators.max(100)]]
  });

  readonly formEditar = this.fb.group({
    nombre:              ['', Validators.required],
    apPaterno:           ['', Validators.required],
    apMaterno:           [''],
    parentescoId:        [null as number | null, Validators.required],
    fechaNacimiento:     [''],
    telefono:            ['', Validators.pattern(/^\d{10}$/)],
    correo:              ['', Validators.email],
    porcentajeCobertura: [null as number | null, [Validators.required, Validators.min(1), Validators.max(100)]]
  });

  ngOnInit() {
    const pid = this.auth.currentUser()?.personaId;
    if (!pid) { this.loading.set(false); return; }

    forkJoin({
      contratos:   this.contratoService.listarPorPersona(pid).pipe(catchError(() => of([]))),
      parentescos: this.http.get<Parentesco[]>(`${environment.apiUrl}/catalogos/parentescos`).pipe(catchError(() => of([])))
    }).pipe(
      switchMap(({ contratos, parentescos }) => {
        this.parentescos.set(parentescos as Parentesco[]);
        const activo = (contratos as ContratoResponse[]).find(c => c.estadoClave === 'VIGENTE' || c.activo) ?? null;
        if (activo) {
          this.contrato.set(activo);
          this.contratoId = activo.id;
          this.maxBeneficiarios.set(activo.planNumeroBeneficiarios ?? 0);
          return this.beneficiarioService.listarPorContrato(activo.id).pipe(catchError(() => of([])));
        }
        return of([]);
      })
    ).subscribe({
      next:  (benefs) => { this.beneficiarios.set(benefs as Beneficiario[]); this.loading.set(false); },
      error: ()       => this.loading.set(false)
    });
  }

  abrirEditar(b: Beneficiario) {
    this.beneficiarioEditandoId = b.id;
    this.errorMsg.set('');
    this.formEditar.reset({
      nombre:              b.nombre              ?? '',
      apPaterno:           b.apPaterno           ?? '',
      apMaterno:           b.apMaterno           ?? '',
      parentescoId:        b.parentescoId        ?? null,
      fechaNacimiento:     '',
      telefono:            b.telefono            ?? '',
      correo:              b.correo              ?? '',
      porcentajeCobertura: b.porcentajeCobertura ?? 100
    });
    this.mostrarModalEditar.set(true);
  }

  cerrarEditar() {
    this.mostrarModalEditar.set(false);
    this.formEditar.reset();
    this.beneficiarioEditandoId = null;
  }

  guardarEdicion() {
    if (this.formEditar.invalid) { this.formEditar.markAllAsTouched(); return; }
    if (!this.contratoId || !this.beneficiarioEditandoId) return;
    this.guardandoEdicion.set(true);
    this.errorMsg.set('');
    const v = this.formEditar.getRawValue();
    const req: BeneficiarioRequest = {
      nombre:              v.nombre!,
      apPaterno:           v.apPaterno!,
      apMaterno:           v.apMaterno        || undefined,
      fechaNacimiento:     v.fechaNacimiento  || undefined,
      telefono:            v.telefono         || undefined,
      correo:              v.correo           || undefined,
      parentescoId:        +v.parentescoId!,
      porcentajeCobertura: +(v.porcentajeCobertura ?? 100)
    };
    this.beneficiarioService.actualizar(this.contratoId, this.beneficiarioEditandoId, req).subscribe({
      next: (actualizado) => {
        this.beneficiarios.update(list => list.map(b => b.id === actualizado.id ? actualizado : b));
        this.guardandoEdicion.set(false);
        this.cerrarEditar();
        this.successMsg.set('Beneficiario actualizado correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.guardandoEdicion.set(false);
        const details = err?.error?.details as string[] | undefined;
        this.errorMsg.set(details?.join(', ') ?? err?.error?.message ?? err?.error?.mensaje ?? 'Error al actualizar.');
      }
    });
  }

  abrirConfEliminar(b: Beneficiario) {
    this.beneficiarioAEliminarId = b.id;
    this.beneficiarioAEliminarNombre.set(b.nombreCompleto);
    this.mostrarConfEliminar.set(true);
  }

  cerrarConfEliminar() {
    this.mostrarConfEliminar.set(false);
    this.beneficiarioAEliminarId = null;
    this.beneficiarioAEliminarNombre.set('');
  }

  confirmarEliminar() {
    if (!this.contratoId || !this.beneficiarioAEliminarId) return;
    this.eliminando.set(true);
    this.beneficiarioService.eliminar(this.contratoId, this.beneficiarioAEliminarId).subscribe({
      next: () => {
        const id = this.beneficiarioAEliminarId!;
        this.beneficiarios.update(list => list.filter(b => b.id !== id));
        this.eliminando.set(false);
        this.cerrarConfEliminar();
        this.successMsg.set('Beneficiario eliminado correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.eliminando.set(false);
        this.errorMsg.set(err?.error?.message ?? err?.error?.mensaje ?? 'Error al eliminar.');
        this.cerrarConfEliminar();
      }
    });
  }

  abrirModal() {
    if (this.limitAlcanzado()) {
      this.errorMsg.set(`El plan solo permite ${this.maxBeneficiarios()} beneficiario(s). Ha alcanzado el límite permitido.`);
      return;
    }
    this.form.reset({ porcentajeCobertura: 100 });
    this.errorMsg.set('');
    this.mostrarModal.set(true);
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    this.form.reset();
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c?.touched || c?.dirty));
  }

  isInvalidEdit(field: string): boolean {
    const c = this.formEditar.get(field);
    return !!(c?.invalid && (c?.touched || c?.dirty));
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.contratoId) {
      this.errorMsg.set('No hay un contrato activo al que agregar beneficiarios.');
      return;
    }
    this.guardando.set(true);
    this.errorMsg.set('');
    const v = this.form.getRawValue();
    const req: BeneficiarioRequest = {
      nombre:              v.nombre!,
      apPaterno:           v.apPaterno!,
      apMaterno:           v.apMaterno        || undefined,
      fechaNacimiento:     v.fechaNacimiento  || undefined,
      telefono:            v.telefono         || undefined,
      correo:              v.correo           || undefined,
      parentescoId:        +v.parentescoId!,
      porcentajeCobertura: +(v.porcentajeCobertura ?? 100)
    };
    this.contratoService.agregarBeneficiario(this.contratoId, req).subscribe({
      next: (nuevo) => {
        this.beneficiarios.update(list => [...list, nuevo]);
        this.guardando.set(false);
        this.cerrarModal();
        this.successMsg.set('Beneficiario agregado correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.guardando.set(false);
        const details = err?.error?.details as string[] | undefined;
        const msg = details?.join(', ') ?? err?.error?.message ?? err?.error?.mensaje ?? 'Error al guardar el beneficiario.';
        this.errorMsg.set(msg);
      }
    });
  }

  parentescoLabel(parentesco: string | undefined): string {
    if (!parentesco) return '—';
    const found = this.parentescos().find(p => p.clave === parentesco);
    return found?.nombre ?? parentesco;
  }

  avatarColor(index: number): string {
    return this.AVATAR_COLORS[index % this.AVATAR_COLORS.length];
  }

  inicialesDeNombre(nombre: string): string {
    const partes = (nombre ?? '').trim().split(/\s+/);
    return partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : (partes[0]?.[0] ?? '?').toUpperCase();
  }


}


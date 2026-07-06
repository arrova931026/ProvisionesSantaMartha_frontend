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

  readonly beneficiarios = signal<Beneficiario[]>([]);
  readonly parentescos = signal<Parentesco[]>([]);
  readonly loading = signal(true);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');
  readonly mostrarModal = signal(false);
  readonly guardando = signal(false);
  readonly maxBeneficiarios = signal<number>(0);
  readonly limitAlcanzado = computed(() =>
    this.maxBeneficiarios() > 0 && this.beneficiarios().length >= this.maxBeneficiarios()
  );
  private contratoId: number | null = null;

  readonly form = this.fb.group({
    nombre:              ['', Validators.required],
    apPaterno:           ['', Validators.required],
    apMaterno:           [''],
    parentescoId:        [null as number | null, Validators.required],
    telefono:            ['', Validators.pattern(/^\d{10}$/)],
    correo:              ['', Validators.email],
    porcentajeCobertura: [100 as number | null, [Validators.required, Validators.min(1), Validators.max(100)]]
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

  abrirModal() {
    if (this.limitAlcanzado()) {
      this.errorMsg.set(
        `El plan solo permite ${this.maxBeneficiarios()} beneficiario(s). Ha alcanzado el límite permitido.`
      );
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
      apMaterno:           v.apMaterno  || undefined,
      telefono:            v.telefono   || undefined,
      correo:              v.correo     || undefined,
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
}


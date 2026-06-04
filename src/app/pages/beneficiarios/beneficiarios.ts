import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Beneficiario } from '../../core/models/beneficiario.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-beneficiarios',
  imports: [ReactiveFormsModule],
  templateUrl: './beneficiarios.html'
})
export class BeneficiariosComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly beneficiarios = signal<Beneficiario[]>([]);
  readonly loading = signal(true);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');
  readonly mostrarModal = signal(false);
  readonly editandoId = signal<number | null>(null);

  readonly form = this.fb.group({
    nombre: ['', Validators.required],
    apPaterno: ['', Validators.required],
    apMaterno: [''],
    parentesco: ['', Validators.required],
    telefono: [''],
    correo: ['', Validators.email],
    porcentajeCobertura: [null as number | null, [Validators.min(1), Validators.max(100)]]
  });

  ngOnInit() {
    this.loading.set(false);
    // Load beneficiaries from active contract
  }

  abrirModal(b?: Beneficiario) {
    if (b) {
      this.editandoId.set(b.id);
      this.form.patchValue({
        nombre: b.nombre,
        apPaterno: b.apPaterno,
        apMaterno: b.apMaterno ?? '',
        parentesco: b.parentesco ?? '',
        telefono: b.telefono ?? '',
        correo: b.correo ?? '',
        porcentajeCobertura: b.porcentajeCobertura ?? null
      });
    } else {
      this.editandoId.set(null);
      this.form.reset();
    }
    this.mostrarModal.set(true);
  }

  cerrarModal() {
    this.mostrarModal.set(false);
    this.form.reset();
  }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    // Save logic would go here with the active contratoId
    this.cerrarModal();
  }

  parentescoLabel(p: string | undefined): string {
    const map: Record<string, string> = {
      'CONYUGE': 'Cónyuge', 'HIJO': 'Hijo/a', 'PADRE': 'Padre',
      'MADRE': 'Madre', 'HERMANO': 'Hermano/a', 'OTRO': 'Otro'
    };
    return p ? (map[p] ?? p) : '—';
  }
}

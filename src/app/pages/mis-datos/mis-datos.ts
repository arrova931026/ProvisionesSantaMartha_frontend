import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { PersonaService } from '../../core/services/persona.service';
import { ContratoService } from '../../core/services/contrato.service';
import { PersonaResponse } from '../../core/models/persona.model';
import { ContratoResponse } from '../../core/models/contrato.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mis-datos',
  imports: [ReactiveFormsModule],
  templateUrl: './mis-datos.html'
})
export class MisDatosComponent implements OnInit {
  private readonly personaService = inject(PersonaService);
  private readonly contratoService = inject(ContratoService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly persona = signal<PersonaResponse | null>(null);
  readonly contratos = signal<ContratoResponse[]>([]);
  readonly loading = signal(true);
  readonly editando = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');

  readonly form = this.fb.group({
    telefono: ['', Validators.pattern(/^\d{10}$/)],
    telefonoAlt: [''],
    correo: ['', Validators.email],
    calle: [''], numeroExt: [''], numeroInt: [''],
    colonia: [''], municipio: [''], estado: [''], codigoPostal: ['']
  });

  ngOnInit() {
    // In a real scenario, obtain personaId from the user's session/profile endpoint
    // For now show basic user info from token
    this.loading.set(false);
  }

  iniciales(): string {
    const user = this.auth.currentUser();
    if (!user) return '?';
    return user.username.slice(0, 2).toUpperCase();
  }

  toggleEditar() {
    if (this.persona()) {
      const p = this.persona()!;
      this.form.patchValue({
        telefono: p.telefono ?? '',
        telefonoAlt: p.telefonoAlt ?? '',
        correo: p.correo ?? '',
        calle: p.calle ?? '',
        numeroExt: p.numeroExt ?? '',
        numeroInt: p.numeroInt ?? '',
        colonia: p.colonia ?? '',
        municipio: p.municipio ?? '',
        estado: p.estado ?? '',
        codigoPostal: p.codigoPostal ?? ''
      });
    }
    this.editando.update(v => !v);
  }

  guardar() {
    if (this.form.invalid || !this.persona()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    const p = this.persona()!;
    this.personaService.actualizar(p.id, {
      nombre: p.nombre, apPaterno: p.apPaterno, apMaterno: p.apMaterno,
      telefono: v.telefono ?? undefined, telefonoAlt: v.telefonoAlt ?? undefined,
      correo: v.correo ?? undefined, calle: v.calle ?? undefined,
      numeroExt: v.numeroExt ?? undefined, numeroInt: v.numeroInt ?? undefined,
      colonia: v.colonia ?? undefined, municipio: v.municipio ?? undefined,
      estado: v.estado ?? undefined, codigoPostal: v.codigoPostal ?? undefined
    }).subscribe({
      next: updated => {
        this.persona.set(updated);
        this.saving.set(false);
        this.editando.set(false);
        this.successMsg.set('Datos actualizados correctamente.');
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: () => {
        this.saving.set(false);
        this.errorMsg.set('Error al guardar los cambios.');
        setTimeout(() => this.errorMsg.set(''), 4000);
      }
    });
  }
}

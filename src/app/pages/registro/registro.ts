import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './registro.html'
})
export class RegistroComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    apPaterno: ['', [Validators.required, Validators.minLength(2)]],
    apMaterno: [''],
    fechaNacimiento: ['', Validators.required],
    sexo: ['', Validators.required],
    curp: ['', [Validators.required, Validators.pattern(/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/)]],
    telefono: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    correo: ['', [Validators.required, Validators.email]],
    username: ['', [Validators.required, Validators.minLength(4)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmarPassword: ['', Validators.required]
  }, { validators: this.passwordsMatch });

  private passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const p = group.get('password')?.value;
    const c = group.get('confirmarPassword')?.value;
    return p && c && p !== c ? { noMatch: true } : null;
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMsg.set('');

    const v = this.form.getRawValue();
    const payload = {
      nombre: v.nombre,
      apPaterno: v.apPaterno,
      apMaterno: v.apMaterno || undefined,
      fechaNacimiento: v.fechaNacimiento,
      sexo: v.sexo,
      curp: v.curp?.toUpperCase(),
      telefono: v.telefono,
      correo: v.correo,
      username: v.username,
      password: v.password
    };

    this.http.post(`${environment.apiUrl}/auth/registro`, payload).subscribe({
      next: () => {
        this.router.navigate(['/login'], { queryParams: { registered: '1', username: v.username } });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message ?? 'Error al registrar. Intente más tarde.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }
}

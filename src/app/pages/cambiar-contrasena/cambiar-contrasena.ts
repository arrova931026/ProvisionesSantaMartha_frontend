import { Component, signal, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const nueva = control.get('nuevaPassword')?.value;
  const confirmar = control.get('confirmarPassword')?.value;
  return nueva && confirmar && nueva !== confirmar ? { mismatch: true } : null;
}

@Component({
  selector: 'app-cambiar-contrasena',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './cambiar-contrasena.html',
})
export class CambiarContrasenaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  saving = signal(false);
  errorMsg = signal('');
  successMsg = signal('');
  mostrarActual = signal(false);
  mostrarNueva = signal(false);
  mostrarConfirmar = signal(false);

  form = this.fb.group({
    passwordActual: ['', [Validators.required]],
    nuevaPassword:  ['', [Validators.required, Validators.minLength(8)]],
    confirmarPassword: ['', [Validators.required]],
  }, { validators: passwordsMatch });

  get mismatch() {
    return this.form.hasError('mismatch') && this.form.get('confirmarPassword')?.dirty;
  }

  submit() {
    if (this.form.invalid || this.saving()) return;
    this.errorMsg.set('');
    this.successMsg.set('');
    this.saving.set(true);

    const { passwordActual, nuevaPassword } = this.form.getRawValue();
    this.auth.changePassword(passwordActual!, nuevaPassword!).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMsg.set('¡Contraseña actualizada correctamente!');
        this.form.reset();
        setTimeout(() => this.router.navigate(['/portal/mis-datos']), 2500);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err?.error?.error ?? err?.error?.message ?? 'Error al cambiar la contraseña.');
      }
    });
  }
}

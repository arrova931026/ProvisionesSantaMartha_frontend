import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-olvide-contrasena',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './olvide-contrasena.html'
})
export class OlvideContrasenaComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly enviado = signal(false);
  readonly errorMsg = signal('');

  readonly form = this.fb.group({
    correo: ['', [Validators.required, Validators.email]]
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMsg.set('');

    this.auth.forgotPassword(this.form.getRawValue().correo!).subscribe({
      next: () => {
        this.loading.set(false);
        this.enviado.set(true);
      },
      error: () => {
        this.loading.set(false);
        // Mostramos éxito de todas formas para no revelar si el correo existe
        this.enviado.set(true);
      }
    });
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }
}

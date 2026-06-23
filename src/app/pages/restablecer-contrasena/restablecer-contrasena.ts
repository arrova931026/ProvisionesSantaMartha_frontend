import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw = control.get('nuevaPassword')?.value;
  const confirm = control.get('confirmarPassword')?.value;
  return pw && confirm && pw !== confirm ? { noCoinciden: true } : null;
}

@Component({
  selector: 'app-restablecer-contrasena',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './restablecer-contrasena.html'
})
export class RestablecerContrasenaComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly exitoso = signal(false);
  readonly errorMsg = signal('');
  readonly showPassword = signal(false);
  token = '';

  readonly form = this.fb.group({
    nuevaPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmarPassword: ['', [Validators.required]]
  }, { validators: passwordsMatch });

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.errorMsg.set('El enlace de recuperación no es válido o ha expirado.');
    }
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  submit() {
    if (this.form.invalid || !this.token) return;
    this.loading.set(true);
    this.errorMsg.set('');

    const { nuevaPassword } = this.form.getRawValue();
    this.auth.resetPassword(this.token, nuevaPassword!).subscribe({
      next: () => {
        this.loading.set(false);
        this.exitoso.set(true);
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message ?? 'El enlace no es válido o ha expirado.');
      }
    });
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }

  get noCoinciden() {
    return this.form.hasError('noCoinciden') && this.form.get('confirmarPassword')?.touched;
  }
}

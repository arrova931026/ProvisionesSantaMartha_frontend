import { Component, inject, signal, OnInit, AfterViewInit, ElementRef, NgZone, ViewChild } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html'
})
export class LoginComponent implements OnInit, AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);

  @ViewChild('googleBtn') googleBtn!: ElementRef<HTMLDivElement>;

  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly googleLoading = signal(false);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');

  readonly form = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]]
  });

  ngOnInit() {
    const snap = this.route.snapshot.queryParamMap;
    if (snap.get('registered') === '1') {
      this.successMsg.set('Usuario creado exitosamente');
      const username = snap.get('username');
      if (username) {
        this.form.patchValue({ username });
      }
    }
  }

  ngAfterViewInit() {
    if (typeof google === 'undefined') return;
    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => this.handleGoogleCredential(response.credential)
    });
    google.accounts.id.renderButton(this.googleBtn.nativeElement, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 280,
      locale: 'es'
    });
  }

  private handleGoogleCredential(credential: string) {
    this.ngZone.run(() => {
      this.googleLoading.set(true);
      this.errorMsg.set('');
      this.auth.loginWithGoogle(credential).subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/portal/inicio';
          this.router.navigateByUrl(returnUrl);
        },
        error: (err) => {
          this.googleLoading.set(false);
          const msg = err?.error?.message;
          this.errorMsg.set(msg ?? 'Error al iniciar sesión con Google. Intente más tarde.');
        }
      });
    });
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMsg.set('');

    const { username, password } = this.form.getRawValue();
    this.auth.login({ username: username!, password: password! }).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/portal/inicio';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401) {
          this.errorMsg.set('Credenciales incorrectas. Verifique su usuario y contraseña.');
        } else {
          this.errorMsg.set('Error al conectar con el servidor. Intente más tarde.');
        }
      }
    });
  }

  isInvalid(field: string) {
    const ctrl = this.form.get(field);
    return ctrl?.invalid && ctrl?.touched;
  }
}

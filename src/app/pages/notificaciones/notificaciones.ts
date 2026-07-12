import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificacionService } from '../../core/services/notificacion.service';
import { AuthService } from '../../core/services/auth.service';
import { Notificacion } from '../../core/models/notificacion.model';
import { DatePipe } from '@angular/common';

type Filtro = 'TODOS' | 'PAGO' | 'SISTEMA' | 'COBERTURA' | 'PROMOCION';

@Component({
  selector: 'app-notificaciones',
  imports: [DatePipe, RouterLink],
  templateUrl: './notificaciones.html'
})
export class NotificacionesComponent implements OnInit {
  private readonly notificacionService = inject(NotificacionService);
  private readonly auth = inject(AuthService);

  readonly notificaciones = signal<Notificacion[]>([]);
  readonly loading = signal(true);
  readonly filtroActivo = signal<Filtro>('TODOS');
  readonly errorMsg = signal('');
  readonly currentUser = this.auth.currentUser;

  readonly noLeidas = computed(() => this.notificaciones().filter(n => !n.leida).length);

  readonly filtradas = computed(() => {
    const f = this.filtroActivo();
    if (f === 'TODOS') return this.notificaciones();
    return this.notificaciones().filter(n => n.tipo === f);
  });

  readonly conteoPorTipo = computed((): Partial<Record<string, number>> => {
    const ns = this.notificaciones();
    const map: Record<string, number> = { TODOS: ns.length };
    for (const n of ns) map[n.tipo] = (map[n.tipo] ?? 0) + 1;
    return map;
  });

  readonly filtros: { key: Filtro; label: string; icon: string }[] = [
    { key: 'TODOS',    label: 'Todas',        icon: 'bi-grid-3x3-gap' },
    { key: 'PAGO',     label: 'Pagos',        icon: 'bi-credit-card' },
    { key: 'PROMOCION',label: 'Promociones',  icon: 'bi-tag' },
    { key: 'COBERTURA',label: 'Cobertura',    icon: 'bi-shield-check' },
    { key: 'SISTEMA',  label: 'Sistema',      icon: 'bi-gear' }
  ];

  ngOnInit() {
    this.notificacionService.listar().subscribe({
      next: data => { this.notificaciones.set(Array.isArray(data) ? data : (data as any).content ?? []); this.loading.set(false); },
      error: () => { this.errorMsg.set('Error al cargar notificaciones.'); this.loading.set(false); }
    });
  }

  marcarLeida(id: number) {
    this.notificacionService.marcarLeida(id).subscribe({
      next: () => this.notificaciones.update(ns => ns.map(n => n.id === id ? { ...n, leida: true } : n))
    });
  }

  marcarTodasLeidas() {
    this.notificacionService.marcarTodasLeidas().subscribe({
      next: () => this.notificaciones.update(ns => ns.map(n => ({ ...n, leida: true })))
    });
  }

  iconoTipo(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO':     'bi-credit-card-fill',
      'SISTEMA':  'bi-gear-fill',
      'COBERTURA':'bi-shield-check',
      'PROMOCION':'bi-tag-fill'
    };
    return map[tipo] ?? 'bi-bell-fill';
  }

  iconoClase(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO':     'ni-verde',
      'SISTEMA':  'ni-azul',
      'COBERTURA':'ni-azul',
      'PROMOCION':'ni-morado'
    };
    return map[tipo] ?? 'ni-azul';
  }

  tagClase(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO':     'tag-pago-proximo',
      'SISTEMA':  'tag-sistema',
      'COBERTURA':'tag-cobertura',
      'PROMOCION':'tag-promo'
    };
    return map[tipo] ?? 'tag-sistema';
  }

  tagLabel(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO':     'Pago',
      'SISTEMA':  'Sistema',
      'COBERTURA':'Cobertura',
      'PROMOCION':'Promoción'
    };
    return map[tipo] ?? tipo;
  }

  accionTipo(tipo: string): { label: string; ruta: string } | null {
    const map: Record<string, { label: string; ruta: string }> = {
      'PAGO':     { label: 'Ir a Cobros',  ruta: '/portal/cobros' },
      'COBERTURA':{ label: 'Ver mi plan',  ruta: '/portal/plan-funerario' }
    };
    return map[tipo] ?? null;
  }

  colorTipo(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO':     'var(--verde)',
      'SISTEMA':  'var(--azul-principal)',
      'COBERTURA':'var(--azul-principal)',
      'PROMOCION':'var(--morado)'
    };
    return map[tipo] ?? 'var(--azul-principal)';
  }
}

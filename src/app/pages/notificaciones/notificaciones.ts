import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { NotificacionService } from '../../core/services/notificacion.service';
import { Notificacion } from '../../core/models/notificacion.model';
import { DatePipe } from '@angular/common';

type Filtro = 'TODOS' | 'PAGO' | 'SISTEMA' | 'COBERTURA' | 'PROMOCION';

@Component({
  selector: 'app-notificaciones',
  imports: [DatePipe],
  templateUrl: './notificaciones.html'
})
export class NotificacionesComponent implements OnInit {
  private readonly notificacionService = inject(NotificacionService);

  readonly notificaciones = signal<Notificacion[]>([]);
  readonly loading = signal(true);
  readonly filtroActivo = signal<Filtro>('TODOS');
  readonly errorMsg = signal('');

  readonly noLeidas = computed(() => this.notificaciones().filter(n => !n.leida).length);

  readonly filtradas = computed(() => {
    const f = this.filtroActivo();
    if (f === 'TODOS') return this.notificaciones();
    return this.notificaciones().filter(n => n.tipo === f);
  });

  readonly filtros: { key: Filtro; label: string; icon: string }[] = [
    { key: 'TODOS', label: 'Todos', icon: 'bi-bell' },
    { key: 'PAGO', label: 'Pagos', icon: 'bi-credit-card' },
    { key: 'PROMOCION', label: 'Promociones', icon: 'bi-star' },
    { key: 'COBERTURA', label: 'Cobertura', icon: 'bi-shield-check' },
    { key: 'SISTEMA', label: 'Sistema', icon: 'bi-gear' }
  ];

  ngOnInit() {
    this.notificacionService.listar().subscribe({
      next: data => { this.notificaciones.set(Array.isArray(data) ? data : (data as any).content ?? []); this.loading.set(false); },
      error: () => { this.errorMsg.set('Error al cargar notificaciones.'); this.loading.set(false); }
    });
  }

  marcarLeida(id: number) {
    this.notificacionService.marcarLeida(id).subscribe({
      next: () => {
        this.notificaciones.update(ns => ns.map(n => n.id === id ? { ...n, leida: true } : n));
      }
    });
  }

  marcarTodasLeidas() {
    this.notificacionService.marcarTodasLeidas().subscribe({
      next: () => {
        this.notificaciones.update(ns => ns.map(n => ({ ...n, leida: true })));
      }
    });
  }

  iconoTipo(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO': 'bi-credit-card-fill',
      'SISTEMA': 'bi-gear-fill',
      'COBERTURA': 'bi-shield-check',
      'PROMOCION': 'bi-star-fill'
    };
    return map[tipo] ?? 'bi-bell-fill';
  }

  colorTipo(tipo: string): string {
    const map: Record<string, string> = {
      'PAGO': 'var(--verde)',
      'SISTEMA': 'var(--azul-principal)',
      'COBERTURA': 'var(--morado)',
      'PROMOCION': 'var(--naranja)'
    };
    return map[tipo] ?? 'var(--azul-principal)';
  }
}

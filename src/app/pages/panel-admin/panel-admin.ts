import { Component, inject, signal, OnInit } from '@angular/core';
import { PersonaService } from '../../core/services/persona.service';
import { ContratoService } from '../../core/services/contrato.service';
import { UsuarioService } from '../../core/services/usuario.service';
import { UsuarioSocio } from '../../core/models/usuario.model';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';

type Tab = 'alta' | 'cobros' | 'morosos' | 'servicios' | 'reportes' | 'baja';

@Component({
  selector: 'app-panel-admin',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './panel-admin.html'
})
export class PanelAdminComponent implements OnInit {
  private readonly personaService = inject(PersonaService);
  private readonly contratoService = inject(ContratoService);
  private readonly usuarioService = inject(UsuarioService);

  readonly tabActivo = signal<Tab>('alta');
  readonly loading = signal(false);

  // Baja de socios
  readonly socios = signal<UsuarioSocio[]>([]);
  readonly loadingBaja = signal(false);
  readonly bajaMsg = signal('');
  readonly bajaMsgTipo = signal<'success' | 'danger'>('success');
  readonly bajaBuscando = signal(false);
  filtroNombre = '';
  readonly confirmandoId = signal<number | null>(null);
  private readonly busqueda$ = new Subject<string>();

  // KPI estáticos de ejemplo (se conectarían a endpoints de reportes)
  readonly kpis = {
    ingresosMensuales: 87850,
    contratosActivos: 251,
    pagosPendientes: 34,
    sociosMorosos: 18,
    renovacionesPendientes: 9,
    serviciosEnProceso: 4
  };

  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'alta', label: 'Alta de Socio', icon: 'bi-person-plus' },
    { key: 'cobros', label: 'Cobros', icon: 'bi-credit-card' },
    { key: 'morosos', label: 'Cartera Vencida', icon: 'bi-exclamation-triangle' },
    { key: 'servicios', label: 'Servicios', icon: 'bi-tools' },
    { key: 'reportes', label: 'Reportes', icon: 'bi-file-earmark-bar-graph' },
    { key: 'baja', label: 'Baja de Socios', icon: 'bi-person-dash' }
  ];

  ngOnInit() {
    // Búsqueda reactiva con debounce
    this.busqueda$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        this.bajaBuscando.set(true);
        return this.usuarioService.listar(q || undefined);
      })
    ).subscribe({
      next: page => {
        this.socios.set(page.content);
        this.bajaBuscando.set(false);
      },
      error: () => this.bajaBuscando.set(false)
    });
  }

  onTabChange(tab: Tab) {
    this.tabActivo.set(tab);
    if (tab === 'baja' && this.socios().length === 0) {
      this.cargarSocios();
    }
  }

  cargarSocios() {
    this.busqueda$.next(this.filtroNombre);
  }

  onFiltroChange() {
    this.busqueda$.next(this.filtroNombre);
  }

  solicitarBaja(id: number) {
    this.confirmandoId.set(id);
  }

  cancelarBaja() {
    this.confirmandoId.set(null);
  }

  confirmarBaja(id: number) {
    this.loadingBaja.set(true);
    this.bajaMsg.set('');
    this.confirmandoId.set(null);
    this.usuarioService.darDeBaja(id).subscribe({
      next: () => {
        this.loadingBaja.set(false);
        this.bajaMsg.set('Socio dado de baja exitosamente.');
        this.bajaMsgTipo.set('success');
        this.socios.update(lista => lista.filter(s => s.id !== id));
      },
      error: (err) => {
        this.loadingBaja.set(false);
        this.bajaMsg.set(err.error?.message ?? 'Error al dar de baja. Intente de nuevo.');
        this.bajaMsgTipo.set('danger');
      }
    });
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  }
}

import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificacionService } from '../../core/services/notificacion.service';
import { CobroService } from '../../core/services/cobro.service';
import { ContratoService } from '../../core/services/contrato.service';
import { AuthService } from '../../core/services/auth.service';
import { Notificacion } from '../../core/models/notificacion.model';
import { CobroProgramado } from '../../core/models/cobro.model';
import { DatePipe, DecimalPipe } from '@angular/common';

type Filtro = 'TODOS' | 'PAGO' | 'SISTEMA' | 'COBERTURA' | 'PROMOCION';

@Component({
  selector: 'app-notificaciones',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './notificaciones.html'
})
export class NotificacionesComponent implements OnInit {
  private readonly notificacionService = inject(NotificacionService);
  private readonly cobroService = inject(CobroService);
  private readonly contratoService = inject(ContratoService);
  private readonly auth = inject(AuthService);

  readonly notificaciones = signal<Notificacion[]>([]);
  readonly loading = signal(true);
  readonly filtroActivo = signal<Filtro>('TODOS');
  readonly errorMsg = signal('');
  readonly whatsappHabilitada = signal(false);
  readonly guardandoPreferenciaWhatsApp = signal(false);
  readonly mensajePreferenciaWhatsApp = signal('');
  readonly currentUser = this.auth.currentUser;

  // ── Cobros-derived alerts ──────────────────────────────────────────────────
  readonly cobrosVencidos = signal<CobroProgramado[]>([]);
  /** Un próximo pago por cada contrato vigente sin cobros vencidos. */
  readonly proximosPagos  = signal<CobroProgramado[]>([]);
  readonly montoMensual  = signal<number>(0);
  /** Mapa contratoId → numeroContrato, para etiquetar alertas de cada contrato. */
  readonly contratoNumeros = signal<Record<number, string>>({});
  readonly hayMultiplesContratos = computed(() => Object.keys(this.contratoNumeros()).length > 1);
  readonly tieneVencidos = computed(() => this.cobrosVencidos().length > 0);
  readonly tieneProximosAVencer = computed(() => {
    const hoy = new Date();
    return this.proximosPagos().some(p => {
      const venc = new Date(p.fechaVencimiento + 'T00:00:00');
      const diff = (venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    });
  });
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
    this.notificacionService.obtenerPreferenciaWhatsApp().subscribe({
      next: preferencia => this.whatsappHabilitada.set(preferencia.habilitada),
      error: () => this.mensajePreferenciaWhatsApp.set('No se pudo consultar la preferencia de WhatsApp.')
    });

    // ── Notificaciones del backend ────────────────────────────────────────────
    this.notificacionService.listar().subscribe({
      next: data => { this.notificaciones.set(Array.isArray(data) ? data : (data as any).content ?? []); this.loading.set(false); },
      error: () => { this.errorMsg.set('Error al cargar notificaciones.'); this.loading.set(false); }
    });

    // ── Alertas de cobros de TODOS los contratos vigentes del cliente ────────
    const personaId = this.auth.currentUser()?.personaId;
    if (!personaId) return;

    this.contratoService.listarPorPersona(personaId).subscribe({
      next: contratos => {
        const vigentes = contratos.filter(c => c.activo || c.estadoClave === 'VIGENTE');
        if (vigentes.length === 0) return;
        this.montoMensual.set(vigentes[0].mensualidadPactada ?? 0);
        const numeros: Record<number, string> = {};
        for (const c of vigentes) numeros[c.id] = c.numeroContrato ?? `#${c.id}`;
        this.contratoNumeros.set(numeros);

        forkJoin(
          vigentes.map(c =>
            this.cobroService.listarPorContrato(c.id).pipe(catchError(() => of([] as CobroProgramado[])))
          )
        ).subscribe(listas => {
          const hoy = new Date();
          const vencidos: CobroProgramado[] = [];
          const proximos: CobroProgramado[] = [];

          listas.forEach((cobros, i) => {
            const contratoId = vigentes[i].id;
            const propios = cobros.map(c => ({ ...c, contratoId: c.contratoId ?? contratoId }));

            const vencidosDelContrato = propios.filter(c =>
              c.estadoCobro !== 'PAGADO' && new Date(c.fechaVencimiento) < hoy
            );
            vencidos.push(...vencidosDelContrato);

            // Próximo pago del contrato solo si ese contrato no tiene vencidos
            if (vencidosDelContrato.length === 0) {
              const prox = propios
                .filter(c => c.estadoCobro === 'PENDIENTE' && new Date(c.fechaVencimiento) >= hoy)
                .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))[0];
              if (prox) proximos.push(prox);
            }
          });

          vencidos.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
          proximos.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
          this.cobrosVencidos.set(vencidos);
          this.proximosPagos.set(proximos);
        });
      }
    });
  }

  cambiarPreferenciaWhatsApp(event: Event) {
    const habilitada = (event.target as HTMLInputElement).checked;
    this.guardandoPreferenciaWhatsApp.set(true);
    this.mensajePreferenciaWhatsApp.set('');
    this.notificacionService.actualizarPreferenciaWhatsApp(habilitada).subscribe({
      next: respuesta => {
        this.whatsappHabilitada.set(respuesta.habilitada);
        this.guardandoPreferenciaWhatsApp.set(false);
      },
      error: () => {
        this.guardandoPreferenciaWhatsApp.set(false);
        this.mensajePreferenciaWhatsApp.set('No se pudo guardar el consentimiento. Inténtelo nuevamente.');
      }
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

  iconoClase(tipo: string, titulo = ''): string {
    if (tipo === 'PAGO') {
      return titulo.toLowerCase().includes('vencid') ? 'ni-rojo' : 'ni-naranja';
    }
    const map: Record<string, string> = {
      'SISTEMA':  'ni-azul',
      'COBERTURA':'ni-azul',
      'PROMOCION':'ni-morado'
    };
    return map[tipo] ?? 'ni-azul';
  }

  tagClase(tipo: string, titulo = ''): string {
    if (tipo === 'PAGO') {
      return titulo.toLowerCase().includes('vencid') ? 'tag-pago-vencido' : 'tag-pago-proximo';
    }
    const map: Record<string, string> = {
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

import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { PanelService } from '../../core/services/panel.service';
import { UsuarioService } from '../../core/services/usuario.service';
import { TarifaService } from '../../core/services/tarifa.service';
import { UsuarioSocio } from '../../core/models/usuario.model';
import { PanelDashboard, PanelFinanzas, ClienteResumen } from '../../core/models/panel.model';
import { CatalogoArticulo, PlanTarifaRequest, TarifaPlan } from '../../core/models/tarifa.model';
import { ContratoResponse } from '../../core/models/contrato.model';

type Tab = 'operaciones' | 'finanzas' | 'dashboard' | 'tarifas';
type TipoTarifa = 'MUTUALISTA' | 'HUMANOS' | 'MASCOTAS';

@Component({
  selector: 'app-panel-admin',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './panel-admin.html'
})
export class PanelAdminComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly panelService = inject(PanelService);
  private readonly usuarioService = inject(UsuarioService);
  private readonly tarifaService = inject(TarifaService);
  private readonly router = inject(Router);

  readonly tabActivo = signal<Tab>('dashboard');
  readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'operaciones', label: 'Operaciones',  icon: 'bi-gear' },
    { key: 'finanzas',    label: 'Finanzas',     icon: 'bi-cash-stack' },
    { key: 'dashboard',   label: 'Dashboard',    icon: 'bi-speedometer2' },
    { key: 'tarifas',     label: 'Tarifas',      icon: 'bi-tag' }
  ];

  // ── Dashboard (datos reales de la BD) ────────────────────────────────────
  readonly dashboard = signal<PanelDashboard | null>(null);
  readonly loadingDashboard = signal(false);
  readonly errorDashboard = signal('');

  // ── Finanzas (datos reales de la BD) ─────────────────────────────────────
  readonly finanzas = signal<PanelFinanzas | null>(null);
  readonly loadingFinanzas = signal(false);
  readonly errorFinanzas = signal('');

  // ── Operaciones: baja de socios ──────────────────────────────────────────
  readonly socios = signal<UsuarioSocio[]>([]);
  readonly loadingBaja = signal(false);
  readonly bajaMsg = signal('');
  readonly bajaMsgTipo = signal<'success' | 'danger'>('success');
  readonly bajaBuscando = signal(false);
  filtroNombre = '';
  readonly confirmandoId = signal<number | null>(null);
  private readonly busqueda$ = new Subject<string>();

  // ── Operaciones: sub-vistas ──────────────────────────────────────────────
  readonly vistaOperaciones = signal<'contrato' | 'cobros' | 'beneficiarios' | 'eliminar'>('contrato');

  // Clientes (tabla compartida por crear contrato / cobros / beneficiarios / eliminar)
  readonly clientes = signal<ClienteResumen[]>([]);
  readonly loadingClientes = signal(false);
  readonly errorClientes = signal('');
  filtroCliente = '';
  pageSizeClientes = 10;
  paginaClientes = 0;

  // Modal eliminar contratos
  readonly modalEliminarAbierto = signal(false);
  readonly clienteEliminar = signal<ClienteResumen | null>(null);
  readonly contratosCliente = signal<ContratoResponse[]>([]);
  readonly loadingContratosCliente = signal(false);
  readonly eliminandoContrato = signal<number | null>(null);
  readonly confirmandoContratoId = signal<number | null>(null);
  readonly eliminarMsg = signal('');
  readonly eliminarMsgTipo = signal<'success' | 'danger'>('success');

  // ── Tarifas ──────────────────────────────────────────────────────────────
  readonly tipoTarifa = signal<TipoTarifa>('MUTUALISTA');
  readonly tiposTarifa: { clave: TipoTarifa; nombre: string; icono: string }[] = [
    { clave: 'MUTUALISTA', nombre: 'Mutualista',            icono: 'bi-shield-heart' },
    { clave: 'HUMANOS',    nombre: 'Previsión de Humanos',  icono: 'bi-person-heart' },
    { clave: 'MASCOTAS',   nombre: 'Previsión de Mascotas', icono: 'bi-heart' }
  ];
  readonly planesTarifa = signal<TarifaPlan[]>([]);
  readonly articulosCatalogo = signal<CatalogoArticulo[]>([]);
  readonly loadingTarifas = signal(false);
  readonly errorTarifas = signal('');
  readonly tarifaMsg = signal('');
  readonly tarifaMsgTipo = signal<'success' | 'danger'>('success');

  // Mutualista
  aportacionAnualInput: number | null = null;
  readonly guardandoMutualista = signal(false);

  // Formulario plan (humanos / mascotas)
  readonly planEditando = signal<TarifaPlan | null>(null);
  readonly planFormVisible = signal(false);
  planForm: PlanTarifaRequest = this.nuevoPlanForm();
  articulosSeleccionados = new Set<number>();
  readonly guardandoPlan = signal(false);

  // Mascotas: N cantidad + % extra por mascota adicional
  cantidadMascotasInput = 1;
  porcentajeExtraInput = 0;

  /** Precio final calculado en tiempo real: base × (1 + %×(N-1)/100) × N... */
  precioMascotasFinal(): number {
    const base = this.planForm.precioTotal || 0;
    const n = Math.max(1, this.cantidadMascotasInput || 1);
    const pct = Math.max(0, this.porcentajeExtraInput || 0);
    // 1ra mascota a precio base; cada adicional suma base × (1 + pct/100)
    return base + base * (1 + pct / 100) * (n - 1);
  }

  /** Mensualidad de humanos calculada en vivo: precioTotal ÷ duración. */
  mensualidadHumano(): number {
    const total = this.planForm.precioTotal || 0;
    const meses = Math.max(1, this.planForm.duracionMeses || 1);
    return total / meses;
  }

  /** Cuota mensual de mascotas: precio final total ÷ duración en meses. */
  cuotaMensualMascota(): number {
    const total = this.precioMascotasFinal();
    const meses = Math.max(1, this.planForm.duracionMeses || 1);
    return total / meses;
  }

  // ── Detección de móvil (≤768px) para mostrar la barra inferior ──────────
  readonly esMovil = signal(typeof window !== 'undefined' && window.innerWidth <= 768);

  @HostListener('window:resize')
  onResize() {
    this.esMovil.set(window.innerWidth <= 768);
  }

  ngOnInit() {
    this.cargarDashboard();
    this.cargarArticulos();

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
    if (tab === 'dashboard') this.cargarDashboard();
    if (tab === 'finanzas') this.cargarFinanzas();
    if (tab === 'operaciones') this.cargarClientes();
    if (tab === 'tarifas') this.cargarTarifas();
  }

  /** Regresa al inicio del portal (página padre). */
  volverAtras() {
    this.router.navigate(['/portal/inicio']);
  }

  // ═══════════════════════ Operaciones: clientes ══════════════════════════

  cargarClientes() {
    this.loadingClientes.set(true);
    this.errorClientes.set('');
    this.panelService.clientes(this.filtroCliente || undefined).subscribe({
      next: data => {
        this.clientes.set(data);
        this.paginaClientes = 0;
        this.loadingClientes.set(false);
      },
      error: () => {
        this.errorClientes.set('No se pudieron cargar los clientes.');
        this.loadingClientes.set(false);
      }
    });
  }

  clientesPaginados(): ClienteResumen[] {
    const inicio = this.paginaClientes * this.pageSizeClientes;
    return this.clientes().slice(inicio, inicio + this.pageSizeClientes);
  }

  totalPaginasClientes(): number {
    return Math.max(1, Math.ceil(this.clientes().length / this.pageSizeClientes));
  }

  cambiarPaginaClientes(delta: number) {
    const nueva = this.paginaClientes + delta;
    if (nueva >= 0 && nueva < this.totalPaginasClientes()) this.paginaClientes = nueva;
  }

  cambiarPageSizeClientes(size: number) {
    this.pageSizeClientes = size;
    this.paginaClientes = 0;
  }

  irACrearContrato(cliente: ClienteResumen) {
    this.router.navigate(['/portal/crear-contrato'], { queryParams: { personaId: cliente.personaId } });
  }

  irACobros(cliente: ClienteResumen) {
    this.router.navigate(['/portal/cobros'], { queryParams: { personaId: cliente.personaId } });
  }

  irABeneficiarios(cliente: ClienteResumen) {
    this.router.navigate(['/portal/beneficiarios'], { queryParams: { personaId: cliente.personaId } });
  }

  // ═══════════════════════ Operaciones: eliminar contratos ════════════════

  abrirModalEliminar(cliente: ClienteResumen) {
    this.clienteEliminar.set(cliente);
    this.modalEliminarAbierto.set(true);
    this.eliminarMsg.set('');
    this.loadingContratosCliente.set(true);
    this.contratosCliente.set([]);
    this.panelService.contratosDeCliente(cliente.personaId).subscribe({
      next: c => {
        this.contratosCliente.set(c.filter(x => x.activo));
        this.loadingContratosCliente.set(false);
      },
      error: () => this.loadingContratosCliente.set(false)
    });
  }

  cerrarModalEliminar() {
    this.modalEliminarAbierto.set(false);
    this.clienteEliminar.set(null);
    this.confirmandoContratoId.set(null);
  }

  /** Primer clic en Eliminar: pide confirmación. */
  pedirConfirmacionContrato(contratoId: number) {
    this.confirmandoContratoId.set(contratoId);
  }

  cancelarConfirmacionContrato() {
    this.confirmandoContratoId.set(null);
  }

  confirmarEliminarContrato(contratoId: number) {
    this.confirmandoContratoId.set(null);
    this.eliminandoContrato.set(contratoId);
    this.eliminarMsg.set('');
    this.panelService.eliminarContrato(contratoId).subscribe({
      next: () => {
        this.eliminandoContrato.set(null);
        this.eliminarMsg.set('Contrato eliminado.');
        this.eliminarMsgTipo.set('success');
        this.contratosCliente.update(lista => lista.filter(c => c.id !== contratoId));
        this.cargarClientes();
      },
      error: () => {
        this.eliminandoContrato.set(null);
        this.eliminarMsg.set('No se pudo eliminar el contrato.');
        this.eliminarMsgTipo.set('danger');
      }
    });
  }

  // ── Tarifas ──────────────────────────────────────────────────────────────

  onTipoTarifaChange(tipo: TipoTarifa) {
    this.tipoTarifa.set(tipo);
    this.planFormVisible.set(false);
    this.planEditando.set(null);
    this.cargarTarifas();
  }

  cargarTarifas() {
    this.loadingTarifas.set(true);
    this.errorTarifas.set('');
    this.tarifaService.listarPlanes(this.tipoTarifa()).subscribe({
      next: planes => {
        this.planesTarifa.set(planes);
        const mutualista = planes.find(p => p.tipoPlan === 'MUTUALISTA');
        if (mutualista) this.aportacionAnualInput = mutualista.precioTotal;
        this.loadingTarifas.set(false);
      },
      error: () => {
        this.errorTarifas.set('No se pudieron cargar las tarifas.');
        this.loadingTarifas.set(false);
      }
    });
  }

  cargarArticulos() {
    this.tarifaService.listarArticulos().subscribe({
      next: arts => this.articulosCatalogo.set(arts),
      error: () => {}
    });
  }

  guardarMutualista() {
    if (!this.aportacionAnualInput || this.aportacionAnualInput <= 0) return;
    this.guardandoMutualista.set(true);
    this.tarifaMsg.set('');
    this.tarifaService.actualizarMutualista(this.aportacionAnualInput).subscribe({
      next: () => {
        this.guardandoMutualista.set(false);
        this.mostrarMsgTarifa('Aportación anual actualizada.', 'success');
        this.cargarTarifas();
      },
      error: () => {
        this.guardandoMutualista.set(false);
        this.mostrarMsgTarifa('Error al actualizar la aportación.', 'danger');
      }
    });
  }

  abrirFormPlan(plan?: TarifaPlan) {
    if (plan) {
      this.planEditando.set(plan);
      this.planForm = {
        nombre: plan.nombre,
        descripcion: plan.descripcion,
        precioTotal: plan.precioTotal,
        mensualidad: plan.mensualidad,
        duracionMeses: plan.duracionMeses,
        numeroBeneficiarios: plan.numeroBeneficiarios,
        articuloIds: []
      };
      this.cantidadMascotasInput = plan.numeroBeneficiarios || 1;
      this.porcentajeExtraInput = plan.porcentajeExtraMascota ?? 0;
      // Precargar los servicios que ya tiene el plan
      this.articulosSeleccionados = new Set(
        plan.articulosIncluidos
          .map(a => this.articulosCatalogo().find(cat => cat.nombre === a.nombre)?.id)
          .filter((id): id is number => id !== undefined)
      );
    } else {
      this.planEditando.set(null);
      this.planForm = this.nuevoPlanForm();
      this.cantidadMascotasInput = 1;
      this.porcentajeExtraInput = 0;
      this.articulosSeleccionados.clear();
    }
    this.planFormVisible.set(true);
  }

  cerrarFormPlan() {
    this.planFormVisible.set(false);
    this.planEditando.set(null);
  }

  toggleArticulo(id: number) {
    if (this.articulosSeleccionados.has(id)) this.articulosSeleccionados.delete(id);
    else this.articulosSeleccionados.add(id);
  }

  guardarPlan() {
    const tipo = this.tipoTarifa();
    if (tipo === 'MUTUALISTA') return;

    this.planForm.articuloIds = Array.from(this.articulosSeleccionados);
    if (tipo === 'MASCOTAS') {
      this.planForm.numeroBeneficiarios = this.cantidadMascotasInput;
      this.planForm.porcentajeExtraMascota = this.porcentajeExtraInput;
      // En mascotas: precioTotal = precio por mascota; mensualidad = cuota mensual del total
      this.planForm.mensualidad = this.cuotaMensualMascota();
      // duracionMeses ya la eligió el admin en el formulario
    } else if (tipo === 'HUMANOS') {
      // Mensualidad derivada: precio total ÷ duración
      this.planForm.mensualidad = this.mensualidadHumano();
    }

    this.guardandoPlan.set(true);
    this.tarifaMsg.set('');

    const editando = this.planEditando();
    const req$ = editando
      ? this.tarifaService.actualizarPlan(editando.id, this.planForm)
      : this.tarifaService.crearPlan(tipo, this.planForm);

    req$.subscribe({
      next: () => {
        this.guardandoPlan.set(false);
        this.mostrarMsgTarifa(editando ? 'Plan actualizado.' : 'Plan creado.', 'success');
        this.cerrarFormPlan();
        this.cargarTarifas();
      },
      error: () => {
        this.guardandoPlan.set(false);
        this.mostrarMsgTarifa('Error al guardar el plan.', 'danger');
      }
    });
  }

  desactivarPlan(id: number) {
    this.tarifaService.desactivarPlan(id).subscribe({
      next: () => { this.mostrarMsgTarifa('Plan desactivado.', 'success'); this.cargarTarifas(); },
      error: () => this.mostrarMsgTarifa('Error al desactivar el plan.', 'danger')
    });
  }

  activarPlan(id: number) {
    this.tarifaService.activarPlan(id).subscribe({
      next: () => { this.mostrarMsgTarifa('Plan activado.', 'success'); this.cargarTarifas(); },
      error: () => this.mostrarMsgTarifa('Error al activar el plan.', 'danger')
    });
  }

  private nuevoPlanForm(): PlanTarifaRequest {
    return { nombre: '', descripcion: '', precioTotal: 0, mensualidad: 0, duracionMeses: 12, numeroBeneficiarios: 1, articuloIds: [] };
  }

  private mostrarMsgTarifa(msg: string, tipo: 'success' | 'danger') {
    this.tarifaMsg.set(msg);
    this.tarifaMsgTipo.set(tipo);
  }

  cargarDashboard() {
    this.loadingDashboard.set(true);
    this.errorDashboard.set('');
    this.panelService.dashboard().subscribe({
      next: data => {
        this.dashboard.set(data);
        this.loadingDashboard.set(false);
      },
      error: () => {
        this.errorDashboard.set('No se pudieron cargar los indicadores. Intente de nuevo.');
        this.loadingDashboard.set(false);
      }
    });
  }

  cargarFinanzas() {
    this.loadingFinanzas.set(true);
    this.errorFinanzas.set('');
    this.panelService.finanzas().subscribe({
      next: data => {
        this.finanzas.set(data);
        this.loadingFinanzas.set(false);
      },
      error: () => {
        this.errorFinanzas.set('No se pudieron cargar los indicadores. Intente de nuevo.');
        this.loadingFinanzas.set(false);
      }
    });
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

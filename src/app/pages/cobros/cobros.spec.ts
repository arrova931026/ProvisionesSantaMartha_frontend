import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { CobrosComponent } from './cobros';
import { AuthService } from '../../core/services/auth.service';
import { CobroService } from '../../core/services/cobro.service';
import { ContratoService } from '../../core/services/contrato.service';

describe('Cobros: consulta de clientes desde admin', () => {
  const listarPorPersona = vi.fn();
  const listarPorContrato = vi.fn();
  const crearPreferenciaMP = vi.fn();
  const confirmarPagoMP = vi.fn();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function crear(role: string, query: Record<string, string> = {}) {
    params = new BehaviorSubject(convertToParamMap(query));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: {
        currentUser: () => ({ personaId: 1, role }),
        isAdminOrAgente: () => role === 'ADMIN' || role === 'AGENTE'
      } },
      { provide: ContratoService, useValue: { listarPorPersona } },
      { provide: CobroService, useValue: { listarPorContrato, crearPreferenciaMP, confirmarPagoMP } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { fragment: null } } }
    ] });
    const component = TestBed.runInInjectionContext(() => new CobrosComponent());
    component.ngOnInit();
    return component;
  }

  beforeEach(() => {
    listarPorPersona.mockReset().mockImplementation((id: number) =>
      of([{ id: id * 10, activo: true, numeroContrato: 'C-' + id, titularNombre: 'Cliente ' + id }]));
    listarPorContrato.mockReset().mockReturnValue(of([
      { id: 1, numeroMensualidad: 1, estadoCobro: 'VENCIDO', fechaVencimiento: '2020-01-01', monto: 100 }
    ]));
    crearPreferenciaMP.mockReset();
    confirmarPagoMP.mockReset();
  });

  it('admin ve los cobros del cliente indicado en modo solo lectura', () => {
    const c = crear('ADMIN', { personaId: '5' });
    expect(listarPorPersona).toHaveBeenCalledWith(5);
    expect(listarPorContrato).toHaveBeenCalledWith(50);
    expect(c.soloLectura()).toBe(true);
    expect(c.clienteConsultado()).toBe('Cliente 5');
  });

  it('en solo lectura no permite pagar ni abrir comprobante', () => {
    const c = crear('ADMIN', { personaId: '5' });
    c.pagarConMP();
    c.abrirModalComprobante();
    expect(crearPreferenciaMP).not.toHaveBeenCalled();
    expect(c.modalComprobanteAbierto()).toBe(false);
  });

  it('recarga al cambiar de cliente sin recrear el componente', () => {
    const c = crear('ADMIN', { personaId: '5' });
    params.next(convertToParamMap({ personaId: '7' }));
    expect(listarPorPersona).toHaveBeenLastCalledWith(7);
    expect(c.contratoActivo()?.id).toBe(70);
    params.next(convertToParamMap({}));
    expect(listarPorPersona).toHaveBeenLastCalledWith(1);
    expect(c.soloLectura()).toBe(false);
  });

  it('un cliente no puede consultar cobros ajenos con ?personaId=', () => {
    const c = crear('CLIENTE', { personaId: '5' });
    expect(listarPorPersona).toHaveBeenCalledWith(1);
    expect(c.soloLectura()).toBe(false);
  });
});

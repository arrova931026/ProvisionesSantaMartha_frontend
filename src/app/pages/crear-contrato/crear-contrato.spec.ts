import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CrearContratoComponent } from './crear-contrato';
import { AuthService } from '../../core/services/auth.service';
import { PersonaService } from '../../core/services/persona.service';
import { DocumentoService } from '../../core/services/documento.service';
import { ContratoService } from '../../core/services/contrato.service';
import { PersonaResponse } from '../../core/models/persona.model';
import { MUTUALISTA_MASCOTAS_DEFAULTS } from '../../core/models/tarifa.model';

describe('Contrato mutualista de mascotas', () => {
  let component: CrearContratoComponent;
  const crear = vi.fn();
  const agregarBeneficiario = vi.fn();
  const mascota = { nombre: 'Luna', especie: 'Perro', raza: 'Mestiza', peso: 12.5, colorCaracteristicas: 'Blanca con manchas' };

  beforeEach(() => {
    vi.useFakeTimers();
    crear.mockReset().mockReturnValue(of({ id: 8, numeroContrato: 'PRUEBA' }));
    agregarBeneficiario.mockReset();
    TestBed.configureTestingModule({ providers: [
      FormBuilder,
      { provide: AuthService, useValue: {} },
      { provide: PersonaService, useValue: {} },
      { provide: DocumentoService, useValue: {} },
      { provide: HttpClient, useValue: {} },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: {} },
      { provide: ContratoService, useValue: { crear, agregarBeneficiario, enviarPdf: () => of({}) } }
    ] });
    component = TestBed.runInInjectionContext(() => new CrearContratoComponent());
    component.persona.set({ id: 1, fechaNacimiento: '1940-01-01' } as PersonaResponse);
    component.seleccionarPlan({ id: 4, nombre: 'Mascotas anual', tipoPlan: 'MUTUALISTA_MASCOTAS', articulosIncluidos: [], ...MUTUALISTA_MASCOTAS_DEFAULTS });
  });

  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('ordena la categoria antes de prevision de mascotas', () => {
    expect(component.tiposPlan.map(tipo => tipo.clave)).toEqual(['MUTUALISTA', 'HUMANOS', 'MUTUALISTA_MASCOTAS', 'MASCOTAS']);
  });

  it('exige los cinco datos en paso 3 sin exigir documentos humanos', () => {
    component.paso.set(3);
    component.irPaso4();
    expect(component.paso()).toBe(3);
    component.mascotaForm.setValue(mascota);
    component.irPaso4();
    expect(component.paso()).toBe(4);
    expect(component.maxBeneficiarios()).toBe(0);
  });

  it.each([0, -1, NaN, Infinity])('rechaza peso no positivo o no finito: %s', peso => {
    component.mascotaForm.setValue({ ...mascota, peso });
    component.terminarContrato();
    expect(crear).not.toHaveBeenCalled();
  });

  it('rechaza campos que solo contienen espacios', () => {
    component.mascotaForm.setValue({ ...mascota, raza: '   ' });
    component.terminarContrato();
    expect(crear).not.toHaveBeenCalled();
  });

  it('envia mascota y mensualidad fija sin limitar edad ni enviar beneficiarios anteriores', () => {
    component.mascotaForm.setValue(mascota);
    component.benefArray.push(new FormBuilder().group({ nombre: 'Anterior' }));
    component.terminarContrato();
    expect(crear).toHaveBeenCalledWith({
      personaId: 1, planId: 4, fechaInicio: component.fechaInicio(),
      precioContratado: 365, mensualidadPactada: 30.42, frecuenciaPago: 'MENSUAL', mascota
    });
    expect(agregarBeneficiario).not.toHaveBeenCalled();
  });

  it('usa el precio y plazo personalizados del plan mutualista de mascotas', () => {
    component.seleccionarPlan({
      id: 5, nombre: 'Mutualista personalizado', tipoPlan: 'MUTUALISTA_MASCOTAS',
      articulosIncluidos: [], ...MUTUALISTA_MASCOTAS_DEFAULTS,
      precioTotal: 900, mensualidad: 150, duracionMeses: 6
    });
    component.fechaInicio.set('2028-08-31');
    component.mascotaForm.setValue(mascota);

    expect(component.fechaFinEstimada()).toBe('2029-02-28');
    component.terminarContrato();

    expect(crear).toHaveBeenCalledWith({
      personaId: 1, planId: 5, fechaInicio: '2028-08-31',
      precioContratado: 900, mensualidadPactada: 150, frecuenciaPago: 'MENSUAL', mascota
    });
  });

  it('calcula fin estimado a doce meses incluso para el 29 de febrero', () => {
    component.fechaInicio.set('2028-02-29');
    expect(component.fechaFinEstimada()).toBe('2029-02-28');
  });
});
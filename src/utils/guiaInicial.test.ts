import { describe, expect, it } from 'vitest';
import { pasosGuia, resumenGuia, type DatosGuia } from './guiaInicial';

const VACIO: DatosGuia = {
  razonSocial: '', nif: '', direccionFiscal: '', tieneLogo: false, nTecnicos: 0, nClientes: 0, nVehiculos: 0, nOrdenes: 0, recordatoriosActivos: false,
};
const TODO: DatosGuia = {
  razonSocial: 'Talleres Ruiz S.L.', nif: 'B12345678', direccionFiscal: 'C/ Mayor 1', tieneLogo: true, nTecnicos: 2, nClientes: 10, nVehiculos: 12, nOrdenes: 3, recordatoriosActivos: true,
};

describe('guía de primeros pasos', () => {
  it('un taller recién creado tiene los 7 pasos por hacer y se resalta el primero', () => {
    const r = resumenGuia(VACIO);
    expect(r.total).toBe(7);
    expect(r.hechos).toBe(0);
    expect(r.completa).toBe(false);
    expect(r.siguiente?.id).toBe('datos');
  });

  it('los pasos se tachan solos con los datos del taller', () => {
    const r = resumenGuia({ ...VACIO, razonSocial: 'X', nif: 'B1', direccionFiscal: 'C/ A', nClientes: 1, nVehiculos: 1 });
    expect(r.pasos.filter((p) => p.hecho).map((p) => p.id)).toEqual(['datos', 'clientes', 'vehiculos']);
    expect(r.hechos).toBe(3);
  });

  it('los datos fiscales exigen los tres campos, y un espacio en blanco no cuenta', () => {
    const base = { ...VACIO, razonSocial: 'X', nif: 'B1', direccionFiscal: 'C/ A' };
    expect(pasosGuia(base)[0].hecho).toBe(true);
    expect(pasosGuia({ ...base, nif: '   ' })[0].hecho).toBe(false);
    expect(pasosGuia({ ...base, direccionFiscal: '' })[0].hecho).toBe(false);
  });

  it('el siguiente paso es el primero pendiente, aunque haya posteriores hechos', () => {
    const r = resumenGuia({ ...TODO, nTecnicos: 0 });
    expect(r.siguiente?.id).toBe('tecnicos');
    expect(r.hechos).toBe(6);
  });

  it('todo hecho: guía completa y sin siguiente', () => {
    const r = resumenGuia(TODO);
    expect(r.completa).toBe(true);
    expect(r.siguiente).toBeNull();
  });

  it('logo y avisos son opcionales; el resto necesarios', () => {
    expect(pasosGuia(VACIO).filter((p) => p.opcional).map((p) => p.id)).toEqual(['logo', 'avisos']);
  });

  it('cada paso lleva a un sitio: Empresa (con su pestaña) o un módulo', () => {
    for (const p of pasosGuia(VACIO)) {
      expect(p.etiquetaAccion.length).toBeGreaterThan(0);
      if (p.accion.tipo === 'empresa') expect(['identidad', 'fiscal', 'marca', 'recordatorios', 'tecnicos']).toContain(p.accion.pestana);
      else expect(['clientes', 'vehiculos', 'taller']).toContain(p.accion.modulo);
    }
  });
});

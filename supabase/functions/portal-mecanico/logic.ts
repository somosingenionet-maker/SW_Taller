// Lógica pura del Portal del Mecánico, separada de index.ts para poder
// testearla con `deno test` sin arrancar el servidor HTTP (Deno.serve se
// ejecuta al importar index.ts).

export type Tecnico = { id: string; empresa_id: string; nombre: string };
export type OtParaAutorizar = { empresa_id: string; tecnico_asignado: string | null };

// El control de acceso real del Portal: no hay JWT de usuario, así que esto
// es lo único que evita que un técnico de un taller marque tareas de OTs de
// OTRO taller, o de un compañero. Un fallo aquí es una fuga de datos entre
// tenants.
export function puedeMarcarTarea(tecnico: Tecnico, ot: OtParaAutorizar): boolean {
  return ot.empresa_id === tecnico.empresa_id && ot.tecnico_asignado === tecnico.nombre;
}

// El técnico marcando la primera tarea es la señal de que el trabajo
// empezó de verdad — solo debe disparar el auto-avance a "en_reparacion"
// cuando la tarea se marca como hecha Y la OT seguía en "recibido" (si ya
// la habían avanzado a mano, o está en otro estado, no se toca).
export function debeIniciarReparacion(estadoActual: string, completado: boolean): boolean {
  return completado && estadoActual === 'recibido';
}

export type OtRow = {
  id: string; numero: string; vehiculo_id: string; estado: string; descripcion_problema: string;
};
export type VehiculoRow = { id: string; marca: string; modelo: string; matricula: string };
export type LineaRow = { id: string; ot_id: string; descripcion: string; completado: boolean };

// Arma la respuesta del portal cruzando OTs + vehículos + tareas en memoria
// (las tres consultas ya vienen filtradas por empresa/técnico desde SQL;
// aquí solo se combinan). Un fallo aquí mostraría al técnico las tareas de
// otra OT, o un vehículo equivocado.
export function formatearOrdenesPortal(ordenes: OtRow[], vehiculos: VehiculoRow[], lineas: LineaRow[]) {
  return ordenes.map((o) => {
    const v = vehiculos.find((x) => x.id === o.vehiculo_id);
    return {
      id: o.id,
      numero: o.numero,
      estado: o.estado,
      descripcionProblema: o.descripcion_problema,
      vehiculo: v ? { marca: v.marca, modelo: v.modelo, matricula: v.matricula } : null,
      tareas: lineas
        .filter((l) => l.ot_id === o.id)
        .map((l) => ({ id: l.id, descripcion: l.descripcion, completado: l.completado })),
    };
  });
}

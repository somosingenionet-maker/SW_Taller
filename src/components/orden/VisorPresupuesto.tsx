import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Printer, X } from 'lucide-react';
import type { Cliente, Empresa, OrdenTrabajo, Vehiculo } from '../../types';
import { getFirmas, type FirmasOrden as Firmas } from '../../lib/data/firmas';
import { fmt2, formatKm } from '../../utils/moneda';
import { resumenFiltros } from '../../utils/aceite';
import { formatDate as fechaLarga } from '../../utils/dateFormat';
import { fechaHoraFirma } from '../../utils/firma';
import { FirmaImpresa } from '../FirmasOrden';
import { TIPO_META } from './constantes';

/** Presupuesto (o resumen de reparación, con el coche listo o entregado) a pantalla completa, listo para imprimir o guardar como PDF. */
export default function VisorPresupuesto({ ot, empresa, clientes, vehiculos, onClose }: {
  ot: OrdenTrabajo; empresa: Empresa; clientes: Cliente[]; vehiculos: Vehiculo[]; onClose: () => void;
}) {
  // Firmas dibujadas en pantalla (si las hay): se piden aparte porque el dibujo no viaja con la orden.
  const [firmasPDF, setFirmasPDF] = useState<Firmas>({});
  useEffect(() => {
    if (!ot.firmaPresupuesto && !ot.firmaEntrega) { setFirmasPDF({}); return; }
    let vivo = true;
    getFirmas(ot.id).then((f) => { if (vivo) setFirmasPDF(f); }).catch(() => { if (vivo) setFirmasPDF({}); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ot.id, ot.firmaPresupuesto?.en, ot.firmaEntrega?.en]);

  const cli = clientes.find(c => c.id === ot.clienteId);
  const veh = vehiculos.find(v => v.id === ot.vehiculoId);
  const esListo = ot.estado === 'listo' || ot.estado === 'entregado';
  const titulo = esListo ? 'Resumen de Reparación' : 'Presupuesto';
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 print:hidden" onClick={() => onClose()} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        className="fixed inset-4 sm:inset-8 z-50 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden print:inset-0 print:rounded-none print:shadow-none">

        {/* Toolbar — hidden on print */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-800 text-white print:hidden shrink-0">
          <span className="font-semibold text-sm">{titulo} — {ot.numero}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-xl text-xs font-semibold transition"
            >
              <Printer size={13} /> Imprimir / Guardar PDF
            </button>
            <button onClick={() => onClose()} className="p-1.5 rounded-xl hover:bg-slate-700 transition">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div className="flex-1 overflow-y-auto bg-slate-100 print:bg-white print:overflow-visible">
          <div className="max-w-3xl mx-auto my-8 bg-white shadow-xl rounded-2xl print:shadow-none print:rounded-none print:my-0 print:max-w-none">
            {/* box-decoration-break:clone repite el padding en cada
                página cuando el contenido no cabe en una hoja — si
                no, solo la primera lo tiene y las siguientes quedan
                pegadas arriba. */}
            <div className="p-10 space-y-6 text-slate-800 font-sans print:[box-decoration-break:clone] print:[-webkit-box-decoration-break:clone]">

            {/* Header empresa — misma línea gráfica que facturas */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
              <div className="flex items-center gap-4">
                {empresa.logoBase64 && <img src={empresa.logoBase64} alt="Logo" className="h-14 object-contain" />}
                <div>
                  <h1 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">{empresa.nombre}</h1>
                  {empresa.ciudad && <p className="text-xs text-slate-500">{empresa.ciudad}</p>}
                  {empresa.correo && <p className="text-xs text-slate-500">{empresa.correo}</p>}
                  {empresa.telefono && <p className="text-xs text-slate-500">{empresa.telefono}</p>}
                  {empresa.web && <p className="text-xs text-slate-500">{empresa.web}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{titulo}</p>
                <p className="text-2xl font-black font-mono text-blue-600">{ot.numero}</p>
                <p className="text-xs text-slate-500 mt-1">Fecha: {ot.fechaRecepcion}</p>
                {ot.fechaEstimadaEntrega && !esListo && (
                  <p className="text-xs text-slate-500">Entrega est.: {ot.fechaEstimadaEntrega}</p>
                )}
                {ot.fechaEntrega && (
                  <p className="text-xs text-slate-500">Entregado: {ot.fechaEntrega}</p>
                )}
              </div>
            </div>

            {/* Cliente + Vehículo */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Cliente</p>
                <p className="font-semibold text-slate-800">{cli ? `${cli.nombre} ${cli.apellidos}` : '—'}</p>
                {cli?.nifNiePasaporte && <p className="text-xs text-slate-500">DNI/NIE: {cli.nifNiePasaporte}</p>}
                {cli?.telefono && <p className="text-xs text-slate-500">{cli.telefono}</p>}
                {cli?.correo && <p className="text-xs text-slate-500">{cli.correo}</p>}
                {cli?.direccion && <p className="text-xs text-slate-500">{cli.direccion}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Vehículo</p>
                {veh ? (
                  <>
                    <p className="font-semibold text-slate-800">{veh.marca} {veh.modelo}</p>
                    <p className="text-xs text-slate-500">Matrícula: {veh.matricula}</p>
                    {veh.bastidor && <p className="text-xs text-slate-500">Bastidor: {veh.bastidor}</p>}
                    <p className="text-xs text-slate-500">Km entrada: {formatKm(ot.kilometrajeEntrada)} km</p>
                    {ot.kilometrajeSalida && <p className="text-xs text-slate-500">Km salida: {formatKm(ot.kilometrajeSalida)} km</p>}
                  </>
                ) : <p className="text-xs text-slate-400">—</p>}
                {ot.tecnicoAsignado && <p className="text-xs text-slate-500 mt-1">Técnico: {ot.tecnicoAsignado}</p>}
              </div>
            </div>

            {/* Avería / Diagnóstico */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Descripción del problema</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">{ot.descripcionProblema}</p>
              </div>
              {ot.diagnostico && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Diagnóstico técnico</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">{ot.diagnostico}</p>
                </div>
              )}
            </div>

            {/* Líneas */}
            {ot.lineas.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Detalle de trabajos y materiales</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="py-2 text-left text-xs font-bold text-slate-500">Descripción</th>
                      <th className="py-2 text-center text-xs font-bold text-slate-500">Tipo</th>
                      <th className="py-2 text-right text-xs font-bold text-slate-500">Cant.</th>
                      <th className="py-2 text-right text-xs font-bold text-slate-500">Precio u.</th>
                      <th className="py-2 text-right text-xs font-bold text-slate-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ot.lineas.map((l, i) => (
                      <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="py-2 text-slate-800">{l.descripcion}</td>
                        <td className="py-2 text-center text-xs text-slate-500">{TIPO_META[l.tipo].label}</td>
                        <td className="py-2 text-right font-mono text-slate-600">{l.cantidad}</td>
                        <td className="py-2 text-right font-mono text-slate-600">{fmt2(l.precioUnitario)} €</td>
                        <td className="py-2 text-right font-mono font-semibold text-slate-800">{fmt2(l.subtotal)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totales */}
            <div className="border-t-2 border-slate-200 pt-4 space-y-1.5">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Base imponible</span>
                <span className="font-mono">{fmt2(ot.subtotal)} €</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>IVA ({ot.ivaPct}%)</span>
                <span className="font-mono">{fmt2(ot.totalIva)} €</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL</span>
                <span className="font-mono text-lg">{fmt2(ot.total)} €</span>
              </div>
            </div>

            {ot.notas && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observaciones</p>
                <p className="text-xs text-slate-600">{ot.notas}</p>
              </div>
            )}

            {/* Cambio de aceite: lo que se llevó el coche y cuándo le toca volver (solo en el resumen de reparación). */}
            {esListo && ot.esCambioAceite && (resumenFiltros(ot.filtros) || (ot.aceiteAnotadoEn && veh?.aceiteProximaFecha)) && (
              <div className="border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cambio de aceite</p>
                {resumenFiltros(ot.filtros) && <p className="text-xs text-slate-600">{resumenFiltros(ot.filtros)}</p>}
                {ot.aceiteAnotadoEn && veh?.aceiteProximaFecha && (
                  <p className="text-xs text-slate-800 font-semibold mt-1">
                    Próximo cambio: {fechaLarga(veh.aceiteProximaFecha)}
                    {veh.aceiteProximoKm ? ` o a los ${formatKm(veh.aceiteProximoKm)} km, lo que ocurra antes` : ''}
                  </p>
                )}
              </div>
            )}

            {/* Firmas del cliente en pantalla: aceptación del presupuesto y, en el resumen de reparación, la entrega. */}
            {ot.aceptacionPresupuesto && !firmasPDF.presupuesto && (
              <p className="text-xs text-slate-600 pt-2">
                <span className="font-semibold">Aceptación del presupuesto:</span> aceptado por {ot.aceptacionPresupuesto.nombre} desde el portal del cliente
                el {fechaHoraFirma(ot.aceptacionPresupuesto.en)} (importe {fmt2(ot.aceptacionPresupuesto.total)} €).
              </p>
            )}
            {(firmasPDF.presupuesto || (esListo && firmasPDF.entrega)) && (
              <div className="grid grid-cols-2 gap-8 pt-2">
                {firmasPDF.presupuesto && (
                  <FirmaImpresa titulo="Aceptación del presupuesto" firma={firmasPDF.presupuesto}
                    nota={firmasPDF.presupuesto.total != null ? `importe ${fmt2(firmasPDF.presupuesto.total)} €` : undefined} />
                )}
                {esListo && firmasPDF.entrega && <FirmaImpresa titulo="Conformidad en la entrega" firma={firmasPDF.entrega} />}
              </div>
            )}

            {/* Pie */}
            <div className="border-t border-slate-100 pt-6 text-center text-[10px] text-slate-300">
              {empresa.nombre} · {empresa.direccionFiscal} · {empresa.telefono} · {empresa.web}
            </div>
          </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

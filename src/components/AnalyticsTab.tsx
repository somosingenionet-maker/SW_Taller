import { useState, useMemo } from 'react';
import { OrdenTrabajo, Cliente, OTEstado } from '../types';
import {
  TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Users, Wrench, BarChart2, Target, Download
} from 'lucide-react';
import { downloadCsv } from '../utils/csvExport';

interface AnalyticsTabProps {
  ordenesTrabajo: OrdenTrabajo[];
  clientes: Cliente[];
}

type Periodo = 'mes' | 'trimestre' | 'año';

const ESTADO_LABEL: Record<OTEstado, string> = {
  presupuesto: 'Presupuesto',
  recibido: 'Recibido',
  en_reparacion: 'En reparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const ESTADO_COLOR: Record<OTEstado, string> = {
  presupuesto: 'bg-violet-100 text-violet-700',
  recibido: 'bg-slate-100 text-slate-600',
  en_reparacion: 'bg-orange-100 text-orange-700',
  listo: 'bg-cyan-100 text-cyan-700',
  entregado: 'bg-teal-100 text-teal-700',
  cancelado: 'bg-rose-100 text-rose-600',
};

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function fmtDec(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function periodoRange(periodo: Periodo): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (periodo === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  } else if (periodo === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
    prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    prevEnd = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
  }
  return { start, end, prevStart, prevEnd };
}

function inRange(fechaStr: string, start: Date, end: Date) {
  const d = new Date(fechaStr);
  return d >= start && d <= end;
}

function diffDias(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: React.ReactNode;
  accent?: string;
}

function KpiCard({ label, value, sub, delta, icon, accent = 'blue' }: KpiCardProps) {
  const accentMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    teal: 'bg-teal-50 text-teal-600',
    violet: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
    rose: 'bg-rose-50 text-rose-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={`p-2 rounded-xl ${accentMap[accent] ?? accentMap.blue}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800 font-display">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {delta != null && (
        <div className={`flex items-center gap-1 text-xs font-semibold ${delta >= 0 ? 'text-teal-600' : 'text-rose-500'}`}>
          {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs período anterior
        </div>
      )}
    </div>
  );
}

export default function AnalyticsTab({ ordenesTrabajo, clientes }: AnalyticsTabProps) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');

  const { start, end, prevStart, prevEnd } = useMemo(() => periodoRange(periodo), [periodo]);

  // OTs del período actual y anterior
  const otsActual = useMemo(() =>
    ordenesTrabajo.filter(ot => inRange(ot.fechaRecepcion, start, end)),
    [ordenesTrabajo, start, end]
  );
  const otsAnterior = useMemo(() =>
    ordenesTrabajo.filter(ot => inRange(ot.fechaRecepcion, prevStart, prevEnd)),
    [ordenesTrabajo, prevStart, prevEnd]
  );

  // 1. Facturación del período (OTs entregadas)
  const facturacionActual = useMemo(() =>
    otsActual.filter(ot => ot.estado === 'entregado').reduce((s, ot) => s + ot.total, 0),
    [otsActual]
  );
  const facturacionAnterior = useMemo(() =>
    otsAnterior.filter(ot => ot.estado === 'entregado').reduce((s, ot) => s + ot.total, 0),
    [otsAnterior]
  );
  const deltaFacturacion = facturacionAnterior > 0
    ? ((facturacionActual - facturacionAnterior) / facturacionAnterior) * 100
    : null;

  // 2. Ticket medio
  const entregadasActual = otsActual.filter(ot => ot.estado === 'entregado');
  const ticketMedio = entregadasActual.length > 0
    ? facturacionActual / entregadasActual.length
    : 0;
  const entregadasAnterior = otsAnterior.filter(ot => ot.estado === 'entregado');
  const ticketMedioAnterior = entregadasAnterior.length > 0
    ? facturacionAnterior / entregadasAnterior.length
    : 0;
  const deltaTicket = ticketMedioAnterior > 0
    ? ((ticketMedio - ticketMedioAnterior) / ticketMedioAnterior) * 100
    : null;

  // 3. OTs por estado (todas activas, sin filtro de período)
  const otsPorEstado = useMemo(() => {
    const counts: Partial<Record<OTEstado, number>> = {};
    ordenesTrabajo.forEach(ot => {
      counts[ot.estado] = (counts[ot.estado] ?? 0) + 1;
    });
    return counts;
  }, [ordenesTrabajo]);

  // 4. Tiempo medio de resolución (recibido → entregado)
  const tiempoMedio = useMemo(() => {
    const entregadas = ordenesTrabajo.filter(ot =>
      ot.estado === 'entregado' && ot.fechaEntrega && inRange(ot.fechaRecepcion, start, end)
    );
    if (entregadas.length === 0) return null;
    const total = entregadas.reduce((s, ot) => s + diffDias(ot.fechaRecepcion, ot.fechaEntrega!), 0);
    return total / entregadas.length;
  }, [ordenesTrabajo, start, end]);

  // 5. Ingreso, costo y margen por tipo de línea
  const margenTipo = useMemo(() => {
    const totals = { mano_de_obra: 0, producto: 0 };
    const costos = { mano_de_obra: 0, producto: 0 };
    otsActual.filter(ot => ot.estado === 'entregado').forEach(ot => {
      ot.lineas.forEach(l => {
        if (l.tipo in totals) {
          totals[l.tipo as keyof typeof totals] += l.subtotal;
          costos[l.tipo as keyof typeof costos] += (l.costoUnitario ?? 0) * l.cantidad;
        }
      });
    });
    const total = totals.mano_de_obra + totals.producto;
    const totalCosto = costos.mano_de_obra + costos.producto;
    const margen = total - totalCosto;
    const margenPct = total > 0 ? (margen / total) * 100 : 0;
    return { totals, costos, total, totalCosto, margen, margenPct };
  }, [otsActual]);

  // 6. Técnicos más productivos
  const tecnicoStats = useMemo(() => {
    const map: Record<string, { ots: number; facturado: number }> = {};
    otsActual.filter(ot => ot.estado === 'entregado' && ot.tecnicoAsignado).forEach(ot => {
      const t = ot.tecnicoAsignado!;
      if (!map[t]) map[t] = { ots: 0, facturado: 0 };
      map[t].ots++;
      map[t].facturado += ot.total;
    });
    return Object.entries(map)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .sort((a, b) => b.facturado - a.facturado);
  }, [otsActual]);

  // 7. Clientes frecuentes (acumulado total)
  const clienteStats = useMemo(() => {
    const map: Record<string, { visitas: number; facturado: number }> = {};
    ordenesTrabajo.filter(ot => ot.estado === 'entregado').forEach(ot => {
      if (!map[ot.clienteId]) map[ot.clienteId] = { visitas: 0, facturado: 0 };
      map[ot.clienteId].visitas++;
      map[ot.clienteId].facturado += ot.total;
    });
    return Object.entries(map)
      .map(([clienteId, data]) => {
        const cliente = clientes.find(c => c.id === clienteId);
        return { nombre: cliente ? `${cliente.nombre} ${cliente.apellidos}` : clienteId, ...data };
      })
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 5);
  }, [ordenesTrabajo, clientes]);

  // 8. Tasa de cancelación
  const canceladas = otsActual.filter(ot => ot.estado === 'cancelado').length;
  const tasaCancelacion = otsActual.length > 0 ? (canceladas / otsActual.length) * 100 : 0;

  // 9. Conversión de presupuestos
  const presupuestosTotal = otsActual.filter(ot => ot.estado !== 'cancelado' &&
    (ot.estado === 'presupuesto' || ot.presupuestoAprobado || ot.presupuestoEstado === 'enviado')).length;
  const presupuestosConvertidos = otsActual.filter(ot => ot.presupuestoAprobado).length;
  const tasaConversion = presupuestosTotal > 0 ? (presupuestosConvertidos / presupuestosTotal) * 100 : 0;

  const ESTADOS_ACTIVOS: OTEstado[] = ['presupuesto', 'recibido', 'en_reparacion', 'listo'];

  const handleExport = () => {
    downloadCsv(
      `rentabilidad_${periodo}`,
      [
        ['Período', 'Facturación', 'OTs entregadas', 'Ticket medio', 'Tiempo medio (días)', 'Cancelaciones', 'Conversión presupuestos'],
        [
          periodo,
          facturacionActual.toFixed(2),
          String(entregadasActual.length),
          ticketMedio.toFixed(2),
          tiempoMedio != null ? tiempoMedio.toFixed(1) : 'N/D',
          String(canceladas),
          `${tasaConversion.toFixed(1)}%`,
        ],
      ]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800">Rentabilidad del Taller</h2>
          <p className="text-xs text-slate-400 mt-0.5">Indicadores clave de negocio</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {(['mes', 'trimestre', 'año'] as Periodo[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize ${periodo === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {p === 'mes' ? 'Este mes' : p === 'trimestre' ? 'Trimestre' : 'Este año'}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Facturación"
          value={fmt(facturacionActual)}
          sub={`${entregadasActual.length} OTs entregadas`}
          delta={deltaFacturacion}
          icon={<TrendingUp className="w-4 h-4" />}
          accent="blue"
        />
        <KpiCard
          label="Ticket medio"
          value={fmtDec(ticketMedio)}
          sub="por orden entregada"
          delta={deltaTicket}
          icon={<BarChart2 className="w-4 h-4" />}
          accent="teal"
        />
        <KpiCard
          label="Tiempo medio resolución"
          value={tiempoMedio != null ? `${Math.round(tiempoMedio)} días` : 'N/D'}
          sub="desde recepción hasta entrega"
          icon={<Clock className="w-4 h-4" />}
          accent="violet"
        />
        <KpiCard
          label="Conversión presupuestos"
          value={`${tasaConversion.toFixed(0)}%`}
          sub={`${presupuestosConvertidos} de ${presupuestosTotal} aprobados`}
          icon={<Target className="w-4 h-4" />}
          accent="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 3. Pipeline de OTs */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-500" /> Estado actual del taller
          </h3>
          <div className="space-y-2">
            {(['presupuesto', 'recibido', 'en_reparacion', 'listo', 'entregado', 'cancelado'] as OTEstado[]).map(estado => {
              const count = otsPorEstado[estado] ?? 0;
              const max = Math.max(...Object.values(otsPorEstado) as number[], 1);
              return (
                <div key={estado} className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-24 text-center shrink-0 ${ESTADO_COLOR[estado]}`}>
                    {ESTADO_LABEL[estado]}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ESTADOS_ACTIVOS.includes(estado) ? 'bg-blue-400' : estado === 'entregado' ? 'bg-teal-400' : 'bg-rose-300'}`}
                      style={{ width: count > 0 ? `${(count / max) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600 w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Ingreso, costo y margen por tipo */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-500" /> Facturación y margen por tipo
          </h3>
          {margenTipo.total === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Sin datos en el período</p>
          ) : (
            <div className="space-y-4">
              {([
                { key: 'mano_de_obra', label: 'Mano de obra', color: 'bg-blue-500' },
                { key: 'producto', label: 'Productos', color: 'bg-violet-500' },
              ] as const).map(({ key, label, color }) => {
                const val = margenTipo.totals[key];
                const pct = margenTipo.total > 0 ? (val / margenTipo.total) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-600">{label}</span>
                      <span className="font-bold text-slate-700">{fmtDec(val)} <span className="text-slate-400 font-normal">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Total facturado</span>
                  <span className="font-semibold text-slate-700">{fmt(margenTipo.total)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Costo (mano de obra + productos)</span>
                  <span className="font-semibold text-slate-700">{fmt(margenTipo.totalCosto)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-500 font-semibold">Margen bruto</span>
                  <span className="font-black text-slate-800">{fmt(margenTipo.margen)} <span className="text-slate-400 font-normal">({margenTipo.margenPct.toFixed(0)}%)</span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 8+9. Cancelaciones y conversión */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-500" /> Calidad operativa
          </h3>
          <div className="flex-1 space-y-4">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Tasa de cancelación
                </span>
                <span className="text-lg font-black text-rose-700">{tasaCancelacion.toFixed(1)}%</span>
              </div>
              <p className="text-[10px] text-rose-400">{canceladas} canceladas de {otsActual.length} OTs en el período</p>
            </div>

            <div className="p-3 rounded-xl bg-teal-50 border border-teal-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-teal-600 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" /> Conversión presupuestos
                </span>
                <span className="text-lg font-black text-teal-700">{tasaConversion.toFixed(1)}%</span>
              </div>
              <div className="bg-teal-100 rounded-full h-2 overflow-hidden mt-2">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${tasaConversion}%` }} />
              </div>
              <p className="text-[10px] text-teal-400 mt-1">{presupuestosConvertidos} aprobados de {presupuestosTotal} enviados</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 6. Técnicos */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-violet-500" /> Productividad por técnico
          </h3>
          {tecnicoStats.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Sin datos en el período</p>
          ) : (
            <div className="space-y-3">
              {tecnicoStats.map((t, idx) => (
                <div key={t.nombre} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{t.nombre}</p>
                    <p className="text-[10px] text-slate-400">{t.ots} OTs · {fmtDec(t.facturado)}</p>
                  </div>
                  <div className="text-xs font-bold text-slate-600 shrink-0">{fmt(t.facturado)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 7. Clientes frecuentes */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-500" /> Top clientes (valor acumulado)
          </h3>
          {clienteStats.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {clienteStats.map((c, idx) => (
                <div key={c.nombre} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{c.nombre}</p>
                    <p className="text-[10px] text-slate-400">{c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}</p>
                  </div>
                  <div className="text-xs font-bold text-slate-600 shrink-0">{fmt(c.facturado)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

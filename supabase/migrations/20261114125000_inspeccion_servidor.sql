-- El Portal del Mecánico abre inspecciones con la service role: `crear_inspeccion` hay que concederla
-- explícitamente (desde la migración de seguridad, las funciones nuevas no se conceden a nadie por defecto).
grant execute on function public.crear_inspeccion(text) to service_role;

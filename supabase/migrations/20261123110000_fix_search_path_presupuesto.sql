-- El asesor de seguridad de Supabase avisó de que el disparador de «presupuesto enviado» (migración 20261122100000) no fijaba su search_path.
alter function public.ot_marcar_presupuesto_enviado() set search_path = public;

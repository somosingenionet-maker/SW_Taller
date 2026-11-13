export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          created_at: string
          descripcion: string
          empresa_id: string
          estado: string
          fecha_limite: string | null
          id: string
          kilometraje_limite: number | null
          recordatorio_enviado_en: string | null
          tipo: string
          ultimo_aviso_enviado_en: string | null
          updated_at: string
          vehiculo_id: string
        }
        Insert: {
          created_at?: string
          descripcion?: string
          empresa_id: string
          estado: string
          fecha_limite?: string | null
          id?: string
          kilometraje_limite?: number | null
          recordatorio_enviado_en?: string | null
          tipo: string
          ultimo_aviso_enviado_en?: string | null
          updated_at?: string
          vehiculo_id: string
        }
        Update: {
          created_at?: string
          descripcion?: string
          empresa_id?: string
          estado?: string
          fecha_limite?: string | null
          id?: string
          kilometraje_limite?: number | null
          recordatorio_enviado_en?: string | null
          tipo?: string
          ultimo_aviso_enviado_en?: string | null
          updated_at?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          cliente_id: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          duracion_minutos: number
          empresa_id: string
          estado: string
          fecha_hora: string
          id: string
          motivo: string
          notas: string | null
          ot_id: string | null
          tecnico_id: string | null
          updated_at: string
          vehiculo_descripcion: string | null
          vehiculo_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          duracion_minutos?: number
          empresa_id: string
          estado?: string
          fecha_hora: string
          id?: string
          motivo?: string
          notas?: string | null
          ot_id?: string | null
          tecnico_id?: string | null
          updated_at?: string
          vehiculo_descripcion?: string | null
          vehiculo_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          duracion_minutos?: number
          empresa_id?: string
          estado?: string
          fecha_hora?: string
          id?: string
          motivo?: string
          notas?: string | null
          ot_id?: string | null
          tecnico_id?: string | null
          updated_at?: string
          vehiculo_descripcion?: string | null
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_vehiculo: {
        Row: {
          cliente_id: string
          vehiculo_id: string
        }
        Insert: {
          cliente_id: string
          vehiculo_id: string
        }
        Update: {
          cliente_id?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_vehiculo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_vehiculo_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: true
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          apellidos: string
          ciudad: string | null
          correo: string | null
          created_at: string
          direccion: string | null
          empresa_id: string
          fecha_registro: string
          id: string
          nif_nie_pasaporte: string
          no_avisar: boolean
          nombre: string
          pais: string | null
          portal_token: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          apellidos: string
          ciudad?: string | null
          correo?: string | null
          created_at?: string
          direccion?: string | null
          empresa_id: string
          fecha_registro?: string
          id?: string
          nif_nie_pasaporte: string
          no_avisar?: boolean
          nombre: string
          pais?: string | null
          portal_token?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          apellidos?: string
          ciudad?: string | null
          correo?: string | null
          created_at?: string
          direccion?: string | null
          empresa_id?: string
          fecha_registro?: string
          id?: string
          nif_nie_pasaporte?: string
          no_avisar?: boolean
          nombre?: string
          pais?: string | null
          portal_token?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_certificados_verifactu: {
        Row: {
          clave_cifrada: string
          empresa_id: string
          p12_cifrado: string
          subido_en: string
          titular_nif: string | null
          titular_nombre: string | null
          valido_desde: string | null
          valido_hasta: string | null
        }
        Insert: {
          clave_cifrada: string
          empresa_id: string
          p12_cifrado: string
          subido_en?: string
          titular_nif?: string | null
          titular_nombre?: string | null
          valido_desde?: string | null
          valido_hasta?: string | null
        }
        Update: {
          clave_cifrada?: string
          empresa_id?: string
          p12_cifrado?: string
          subido_en?: string
          titular_nif?: string | null
          titular_nombre?: string | null
          valido_desde?: string | null
          valido_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_certificados_verifactu_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          acceso_hasta: string | null
          activo: boolean
          brand_color: string
          cancelar_al_final: boolean
          ciudad: string
          correo: string
          created_at: string
          direccion_fiscal: string
          estado_suscripcion: string
          factura_mostrar_qr: boolean
          factura_prefijo: string
          id: string
          logo_base64: string
          logo_url: string | null
          nif: string
          nombre: string
          periodo_fin: string | null
          plan_facturacion: string | null
          plantillas_recordatorios: Json
          prueba_hasta: string | null
          razon_social: string
          recordatorios_automaticos_activos: boolean
          siguiente_numero_factura: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tagline: string
          telefono: string
          terminos_aceptados_en: string | null
          terminos_version: string | null
          ultimo_hash_factura: string | null
          updated_at: string
          verifactu_entorno: string
          verifactu_envio_activo: boolean
          verifactu_numero_instalacion: string
          web: string
        }
        Insert: {
          acceso_hasta?: string | null
          activo?: boolean
          brand_color?: string
          cancelar_al_final?: boolean
          ciudad?: string
          correo?: string
          created_at?: string
          direccion_fiscal?: string
          estado_suscripcion?: string
          factura_mostrar_qr?: boolean
          factura_prefijo?: string
          id?: string
          logo_base64?: string
          logo_url?: string | null
          nif?: string
          nombre: string
          periodo_fin?: string | null
          plan_facturacion?: string | null
          plantillas_recordatorios?: Json
          prueba_hasta?: string | null
          razon_social?: string
          recordatorios_automaticos_activos?: boolean
          siguiente_numero_factura?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tagline?: string
          telefono?: string
          terminos_aceptados_en?: string | null
          terminos_version?: string | null
          ultimo_hash_factura?: string | null
          updated_at?: string
          verifactu_entorno?: string
          verifactu_envio_activo?: boolean
          verifactu_numero_instalacion?: string
          web?: string
        }
        Update: {
          acceso_hasta?: string | null
          activo?: boolean
          brand_color?: string
          cancelar_al_final?: boolean
          ciudad?: string
          correo?: string
          created_at?: string
          direccion_fiscal?: string
          estado_suscripcion?: string
          factura_mostrar_qr?: boolean
          factura_prefijo?: string
          id?: string
          logo_base64?: string
          logo_url?: string | null
          nif?: string
          nombre?: string
          periodo_fin?: string | null
          plan_facturacion?: string | null
          plantillas_recordatorios?: Json
          prueba_hasta?: string | null
          razon_social?: string
          recordatorios_automaticos_activos?: boolean
          siguiente_numero_factura?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tagline?: string
          telefono?: string
          terminos_aceptados_en?: string | null
          terminos_version?: string | null
          ultimo_hash_factura?: string | null
          updated_at?: string
          verifactu_entorno?: string
          verifactu_envio_activo?: boolean
          verifactu_numero_instalacion?: string
          web?: string
        }
        Relationships: []
      }
      eventos_ot: {
        Row: {
          descripcion: string
          fecha: string
          id: string
          ot_id: string
        }
        Insert: {
          descripcion: string
          fecha?: string
          id?: string
          ot_id: string
        }
        Update: {
          descripcion?: string
          fecha?: string
          id?: string
          ot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_ot_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordenes_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      factura_ot: {
        Row: {
          factura_id: string
          ot_id: string
        }
        Insert: {
          factura_id: string
          ot_id: string
        }
        Update: {
          factura_id?: string
          ot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factura_ot_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_ot_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordenes_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          cliente_apellidos_snapshot: string | null
          cliente_ciudad_snapshot: string | null
          cliente_correo_snapshot: string | null
          cliente_direccion_snapshot: string | null
          cliente_id: string
          cliente_nif_snapshot: string | null
          cliente_nombre_snapshot: string | null
          cliente_pais_snapshot: string | null
          cliente_telefono_snapshot: string | null
          created_at: string
          empresa_id: string
          estado: string
          fecha: string
          fecha_emision_hash: string | null
          fecha_vencimiento: string
          hash: string | null
          hash_anterior: string | null
          id: string
          iva_pct: number
          notas: string
          numero: string
          qr_url: string | null
          subtotal: number
          total: number
          total_iva: number
          updated_at: string
          vehiculo_id: string | null
        }
        Insert: {
          cliente_apellidos_snapshot?: string | null
          cliente_ciudad_snapshot?: string | null
          cliente_correo_snapshot?: string | null
          cliente_direccion_snapshot?: string | null
          cliente_id: string
          cliente_nif_snapshot?: string | null
          cliente_nombre_snapshot?: string | null
          cliente_pais_snapshot?: string | null
          cliente_telefono_snapshot?: string | null
          created_at?: string
          empresa_id: string
          estado: string
          fecha?: string
          fecha_emision_hash?: string | null
          fecha_vencimiento: string
          hash?: string | null
          hash_anterior?: string | null
          id?: string
          iva_pct?: number
          notas?: string
          numero: string
          qr_url?: string | null
          subtotal?: number
          total?: number
          total_iva?: number
          updated_at?: string
          vehiculo_id?: string | null
        }
        Update: {
          cliente_apellidos_snapshot?: string | null
          cliente_ciudad_snapshot?: string | null
          cliente_correo_snapshot?: string | null
          cliente_direccion_snapshot?: string | null
          cliente_id?: string
          cliente_nif_snapshot?: string | null
          cliente_nombre_snapshot?: string | null
          cliente_pais_snapshot?: string | null
          cliente_telefono_snapshot?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          fecha?: string
          fecha_emision_hash?: string | null
          fecha_vencimiento?: string
          hash?: string | null
          hash_anterior?: string | null
          id?: string
          iva_pct?: number
          notas?: string
          numero?: string
          qr_url?: string | null
          subtotal?: number
          total?: number
          total_iva?: number
          updated_at?: string
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      interacciones_cliente: {
        Row: {
          cliente_id: string
          created_at: string
          fecha: string
          id: string
          notas: string
          tipo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          fecha?: string
          id?: string
          notas?: string
          tipo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          fecha?: string
          id?: string
          notas?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "interacciones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lineas_factura: {
        Row: {
          cantidad: number
          descripcion: string
          factura_id: string
          id: string
          posicion: number
          precio_unitario: number
          subtotal: number
        }
        Insert: {
          cantidad?: number
          descripcion?: string
          factura_id: string
          id?: string
          posicion?: number
          precio_unitario?: number
          subtotal?: number
        }
        Update: {
          cantidad?: number
          descripcion?: string
          factura_id?: string
          id?: string
          posicion?: number
          precio_unitario?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineas_factura_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      lineas_ot: {
        Row: {
          cantidad: number
          completado: boolean
          costo_unitario: number | null
          descripcion: string
          duracion_min: number | null
          id: string
          notificado_cliente: boolean
          ot_id: string
          posicion: number
          precio_unitario: number
          producto_id: string | null
          subtotal: number
          tipo: string
        }
        Insert: {
          cantidad?: number
          completado?: boolean
          costo_unitario?: number | null
          descripcion?: string
          duracion_min?: number | null
          id?: string
          notificado_cliente?: boolean
          ot_id: string
          posicion?: number
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          tipo: string
        }
        Update: {
          cantidad?: number
          completado?: boolean
          costo_unitario?: number | null
          descripcion?: string
          duracion_min?: number | null
          id?: string
          notificado_cliente?: boolean
          ot_id?: string
          posicion?: number
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineas_ot_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineas_ot_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_stock: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          motivo: string | null
          ot_id: string | null
          producto_id: string
          tipo: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          motivo?: string | null
          ot_id?: string | null
          producto_id: string
          tipo: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          motivo?: string | null
          ot_id?: string | null
          producto_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_ot_id_fkey"
            columns: ["ot_id"]
            isOneToOne: false
            referencedRelation: "ordenes_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones_cliente: {
        Row: {
          asunto: string | null
          cliente_id: string
          created_at: string
          empresa_id: string
          fecha_envio: string
          id: string
          leido: boolean
          mensaje: string
          origen: string
          tipo_envio: string
          tipo_evento: string
          vehiculo_id: string | null
        }
        Insert: {
          asunto?: string | null
          cliente_id: string
          created_at?: string
          empresa_id: string
          fecha_envio?: string
          id?: string
          leido?: boolean
          mensaje: string
          origen?: string
          tipo_envio: string
          tipo_evento: string
          vehiculo_id?: string | null
        }
        Update: {
          asunto?: string | null
          cliente_id?: string
          created_at?: string
          empresa_id?: string
          fecha_envio?: string
          id?: string
          leido?: boolean
          mensaje?: string
          origen?: string
          tipo_envio?: string
          tipo_evento?: string
          vehiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_cliente_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_cliente_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_trabajo: {
        Row: {
          aceite_anotado_en: string | null
          aceite_resumen_enviado_en: string | null
          checklist_observaciones: string | null
          checklist_recepcion: Json | null
          cliente_id: string
          created_at: string
          descripcion_problema: string
          diagnostico: string | null
          empresa_id: string
          es_cambio_aceite: boolean
          estado: string
          fecha_entrega: string | null
          fecha_estimada_entrega: string | null
          fecha_recepcion: string
          filtro_aceite: string | null
          filtro_aire: string | null
          filtro_combustible: string | null
          filtro_habitaculo: string | null
          firma_entrega: string | null
          firma_entrega_en: string | null
          firma_entrega_nombre: string | null
          firma_presupuesto: string | null
          firma_presupuesto_en: string | null
          firma_presupuesto_nombre: string | null
          firma_presupuesto_total: number | null
          fotos_recepcion: string[]
          id: string
          iva_pct: number
          kilometraje_entrada: number
          kilometraje_salida: number | null
          mecanico_actualizado_en: string | null
          notas: string | null
          notificacion_enviada: boolean | null
          numero: string
          presupuesto_aprobado: boolean | null
          presupuesto_estado: string | null
          subtotal: number
          tecnico_asignado: string | null
          total: number
          total_iva: number
          updated_at: string
          vehiculo_id: string
        }
        Insert: {
          aceite_anotado_en?: string | null
          aceite_resumen_enviado_en?: string | null
          checklist_observaciones?: string | null
          checklist_recepcion?: Json | null
          cliente_id: string
          created_at?: string
          descripcion_problema?: string
          diagnostico?: string | null
          empresa_id: string
          es_cambio_aceite?: boolean
          estado: string
          fecha_entrega?: string | null
          fecha_estimada_entrega?: string | null
          fecha_recepcion?: string
          filtro_aceite?: string | null
          filtro_aire?: string | null
          filtro_combustible?: string | null
          filtro_habitaculo?: string | null
          firma_entrega?: string | null
          firma_entrega_en?: string | null
          firma_entrega_nombre?: string | null
          firma_presupuesto?: string | null
          firma_presupuesto_en?: string | null
          firma_presupuesto_nombre?: string | null
          firma_presupuesto_total?: number | null
          fotos_recepcion?: string[]
          id?: string
          iva_pct?: number
          kilometraje_entrada?: number
          kilometraje_salida?: number | null
          mecanico_actualizado_en?: string | null
          notas?: string | null
          notificacion_enviada?: boolean | null
          numero: string
          presupuesto_aprobado?: boolean | null
          presupuesto_estado?: string | null
          subtotal?: number
          tecnico_asignado?: string | null
          total?: number
          total_iva?: number
          updated_at?: string
          vehiculo_id: string
        }
        Update: {
          aceite_anotado_en?: string | null
          aceite_resumen_enviado_en?: string | null
          checklist_observaciones?: string | null
          checklist_recepcion?: Json | null
          cliente_id?: string
          created_at?: string
          descripcion_problema?: string
          diagnostico?: string | null
          empresa_id?: string
          es_cambio_aceite?: boolean
          estado?: string
          fecha_entrega?: string | null
          fecha_estimada_entrega?: string | null
          fecha_recepcion?: string
          filtro_aceite?: string | null
          filtro_aire?: string | null
          filtro_combustible?: string | null
          filtro_habitaculo?: string | null
          firma_entrega?: string | null
          firma_entrega_en?: string | null
          firma_entrega_nombre?: string | null
          firma_presupuesto?: string | null
          firma_presupuesto_en?: string | null
          firma_presupuesto_nombre?: string | null
          firma_presupuesto_total?: number | null
          fotos_recepcion?: string[]
          id?: string
          iva_pct?: number
          kilometraje_entrada?: number
          kilometraje_salida?: number | null
          mecanico_actualizado_en?: string | null
          notas?: string | null
          notificacion_enviada?: boolean | null
          numero?: string
          presupuesto_aprobado?: boolean | null
          presupuesto_estado?: string | null
          subtotal?: number
          tecnico_asignado?: string | null
          total?: number
          total_iva?: number
          updated_at?: string
          vehiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_trabajo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_trabajo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_trabajo_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          empresa_id: string | null
          id: string
          modulos: string[]
          nombre: string
          rol: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          empresa_id?: string | null
          id: string
          modulos?: string[]
          nombre: string
          rol?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          empresa_id?: string | null
          id?: string
          modulos?: string[]
          nombre?: string
          rol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma_config: {
        Row: {
          id: string
          logo_base64: string | null
        }
        Insert: {
          id?: string
          logo_base64?: string | null
        }
        Update: {
          id?: string
          logo_base64?: string | null
        }
        Relationships: []
      }
      productos: {
        Row: {
          activo: boolean
          costo: number
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          precio_venta: number
          sku: string | null
          stock_actual: number
          stock_minimo: number
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          costo?: number
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          precio_venta?: number
          sku?: string | null
          stock_actual?: number
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          costo?: number
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          precio_venta?: number
          sku?: string | null
          stock_actual?: number
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      registros_facturacion: {
        Row: {
          anterior_fecha_expedicion: string | null
          anterior_num_serie: string | null
          codigo_error: string | null
          creado_en: string
          csv_aeat: string | null
          cuota_total: number | null
          descripcion_error: string | null
          empresa_id: string
          enviado_en: string | null
          estado_envio: string
          factura_id: string
          fecha_expedicion: string
          fecha_hora_huso: string
          huella: string
          huella_anterior: string | null
          id: string
          importe_total: number | null
          intentos: number
          nif_emisor: string
          nombre_razon_emisor: string
          num_serie: string
          proximo_intento: string
          secuencia: number
          tipo: string
          tipo_factura: string | null
          ultimo_intento: string | null
        }
        Insert: {
          anterior_fecha_expedicion?: string | null
          anterior_num_serie?: string | null
          codigo_error?: string | null
          creado_en?: string
          csv_aeat?: string | null
          cuota_total?: number | null
          descripcion_error?: string | null
          empresa_id: string
          enviado_en?: string | null
          estado_envio?: string
          factura_id: string
          fecha_expedicion: string
          fecha_hora_huso: string
          huella: string
          huella_anterior?: string | null
          id?: string
          importe_total?: number | null
          intentos?: number
          nif_emisor: string
          nombre_razon_emisor: string
          num_serie: string
          proximo_intento?: string
          secuencia: number
          tipo: string
          tipo_factura?: string | null
          ultimo_intento?: string | null
        }
        Update: {
          anterior_fecha_expedicion?: string | null
          anterior_num_serie?: string | null
          codigo_error?: string | null
          creado_en?: string
          csv_aeat?: string | null
          cuota_total?: number | null
          descripcion_error?: string | null
          empresa_id?: string
          enviado_en?: string | null
          estado_envio?: string
          factura_id?: string
          fecha_expedicion?: string
          fecha_hora_huso?: string
          huella?: string
          huella_anterior?: string | null
          id?: string
          importe_total?: number | null
          intentos?: number
          nif_emisor?: string
          nombre_razon_emisor?: string
          num_serie?: string
          proximo_intento?: string
          secuencia?: number
          tipo?: string
          tipo_factura?: string | null
          ultimo_intento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registros_facturacion_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_facturacion_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_eventos: {
        Row: {
          id: string
          procesado_en: string
          tipo: string
        }
        Insert: {
          id: string
          procesado_en?: string
          tipo: string
        }
        Update: {
          id?: string
          procesado_en?: string
          tipo?: string
        }
        Relationships: []
      }
      tecnicos: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          especialidad: string | null
          id: string
          nombre: string
          portal_token: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          especialidad?: string | null
          id?: string
          nombre: string
          portal_token?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          especialidad?: string | null
          id?: string
          nombre?: string
          portal_token?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tecnicos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          aceite_proxima_fecha: string | null
          aceite_proximo_km: number | null
          aceite_ultima_fecha: string | null
          aceite_ultimo_km: number | null
          anio: number | null
          bastidor: string
          color: string | null
          combustible: string | null
          created_at: string
          empresa_id: string
          fecha_registro: string
          id: string
          impuesto_vencimiento: string | null
          itv_vencimiento: string | null
          kilometraje: number
          marca: string
          matricula: string
          modelo: string
          seguro_vencimiento: string | null
          updated_at: string
        }
        Insert: {
          aceite_proxima_fecha?: string | null
          aceite_proximo_km?: number | null
          aceite_ultima_fecha?: string | null
          aceite_ultimo_km?: number | null
          anio?: number | null
          bastidor: string
          color?: string | null
          combustible?: string | null
          created_at?: string
          empresa_id: string
          fecha_registro?: string
          id?: string
          impuesto_vencimiento?: string | null
          itv_vencimiento?: string | null
          kilometraje?: number
          marca: string
          matricula: string
          modelo: string
          seguro_vencimiento?: string | null
          updated_at?: string
        }
        Update: {
          aceite_proxima_fecha?: string | null
          aceite_proximo_km?: number | null
          aceite_ultima_fecha?: string | null
          aceite_ultimo_km?: number | null
          anio?: number | null
          bastidor?: string
          color?: string | null
          combustible?: string | null
          created_at?: string
          empresa_id?: string
          fecha_registro?: string
          id?: string
          impuesto_vencimiento?: string | null
          itv_vencimiento?: string | null
          kilometraje?: number
          marca?: string
          matricula?: string
          modelo?: string
          seguro_vencimiento?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aeat_encadenar_registro: {
        Args: {
          p_cuota_total: number
          p_empresa_id: string
          p_factura_id: string
          p_fecha: string
          p_importe_total: number
          p_nif: string
          p_nombre_emisor: string
          p_num_serie: string
          p_tipo: string
          p_tipo_factura: string
          p_ts: string
        }
        Returns: {
          huella: string
          huella_anterior: string
        }[]
      }
      aeat_fecha_hora_huso: { Args: { p: string }; Returns: string }
      aeat_nif_normalizado: { Args: { p: string }; Returns: string }
      aeat_url_encode: { Args: { p: string }; Returns: string }
      anotar_cambio_aceite: {
        Args: {
          p_autor?: string
          p_ot_id: string
          p_proxima_fecha: string
          p_proximo_km?: number
        }
        Returns: undefined
      }
      buscar_ordenes: {
        Args: {
          p_estado?: string
          p_limit?: number
          p_offset?: number
          p_termino?: string
        }
        Returns: {
          cliente_apellidos: string
          cliente_nombre: string
          estado: string
          fecha_recepcion: string
          id: string
          notificacion_enviada: boolean
          numero: string
          presupuesto_aprobado: boolean
          presupuesto_estado: string
          tareas_hechas: number
          tareas_total: number
          total: number
          total_count: number
          vehiculo_marca: string
          vehiculo_matricula: string
          vehiculo_modelo: string
        }[]
      }
      certificado_verifactu_estado: {
        Args: never
        Returns: {
          existe: boolean
          titular_nif: string
          titular_nombre: string
          valido_desde: string
          valido_hasta: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      contar_clientes_con_ot_abierta: { Args: never; Returns: number }
      es_super_admin: { Args: never; Returns: boolean }
      estado_de_ot: { Args: { p_ot_id: string }; Returns: string }
      extender_acceso: {
        Args: { p_empresa_id: string; p_hasta: string }
        Returns: undefined
      }
      facturas_por_periodo: {
        Args: { agrupacion: string }
        Returns: {
          cantidad: number
          clave: string
          total: number
        }[]
      }
      facturas_resumen: {
        Args: { mes_actual?: string }
        Returns: {
          facturas_mes_actual: number
          facturas_pagadas: number
          facturas_vencidas: number
          importe_cobrado: number
          importe_mes_actual: number
          importe_pendiente: number
          importe_vencido: number
          total_facturas: number
        }[]
      }
      firmar_orden: {
        Args: {
          p_nombre: string
          p_ot_id: string
          p_png: string
          p_tipo: string
        }
        Returns: undefined
      }
      mi_empresa_id: { Args: never; Returns: string }
      mi_suscripcion: { Args: never; Returns: Json }
      ordenes_por_rango_recepcion: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cliente_apellidos: string
          cliente_nombre: string
          estado: string
          fecha_recepcion: string
          id: string
          numero: string
          vehiculo_marca: string
          vehiculo_matricula: string
          vehiculo_modelo: string
        }[]
      }
      rentabilidad_estado_actual: {
        Args: never
        Returns: {
          cantidad: number
          estado: string
        }[]
      }
      rentabilidad_periodo: {
        Args: { p_end: string; p_start: string }
        Returns: {
          canceladas: number
          entregadas: number
          facturacion: number
          mano_obra_costo: number
          mano_obra_total: number
          ots_total: number
          presupuestos_convertidos: number
          presupuestos_total: number
          producto_costo: number
          producto_total: number
          tiempo_medio_dias: number
        }[]
      }
      rentabilidad_tecnicos: {
        Args: { p_end: string; p_start: string }
        Returns: {
          facturado: number
          nombre: string
          ots: number
        }[]
      }
      rentabilidad_top_clientes: {
        Args: { p_limit?: number }
        Returns: {
          cliente_id: string
          facturado: number
          visitas: number
        }[]
      }
      sesion_sin_segundo_factor: { Args: never; Returns: boolean }
      siguiente_numero_ot: { Args: never; Returns: string }
      suscripcion_activa: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

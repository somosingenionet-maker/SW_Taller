export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          nombre: string
          pais: string | null
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
          nombre: string
          pais?: string | null
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
          nombre?: string
          pais?: string | null
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
      empresas: {
        Row: {
          activo: boolean
          brand_color: string
          ciudad: string
          correo: string
          created_at: string
          direccion_fiscal: string
          factura_prefijo: string
          id: string
          logo_base64: string
          nif: string
          nombre: string
          plantillas_recordatorios: Json
          razon_social: string
          recordatorios_automaticos_activos: boolean
          siguiente_numero_factura: number
          tagline: string
          telefono: string
          ultimo_hash_factura: string | null
          updated_at: string
          web: string
        }
        Insert: {
          activo?: boolean
          brand_color?: string
          ciudad?: string
          correo?: string
          created_at?: string
          direccion_fiscal?: string
          factura_prefijo?: string
          id?: string
          logo_base64?: string
          nif?: string
          nombre: string
          plantillas_recordatorios?: Json
          razon_social?: string
          recordatorios_automaticos_activos?: boolean
          siguiente_numero_factura?: number
          tagline?: string
          telefono?: string
          ultimo_hash_factura?: string | null
          updated_at?: string
          web?: string
        }
        Update: {
          activo?: boolean
          brand_color?: string
          ciudad?: string
          correo?: string
          created_at?: string
          direccion_fiscal?: string
          factura_prefijo?: string
          id?: string
          logo_base64?: string
          nif?: string
          nombre?: string
          plantillas_recordatorios?: Json
          razon_social?: string
          recordatorios_automaticos_activos?: boolean
          siguiente_numero_factura?: number
          tagline?: string
          telefono?: string
          ultimo_hash_factura?: string | null
          updated_at?: string
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
          cliente_id: string
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
          cliente_id: string
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
          cliente_id?: string
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
          costo_unitario: number | null
          descripcion: string
          id: string
          ot_id: string
          posicion: number
          precio_unitario: number
          producto_id: string | null
          subtotal: number
          tipo: string
        }
        Insert: {
          cantidad?: number
          costo_unitario?: number | null
          descripcion?: string
          id?: string
          ot_id: string
          posicion?: number
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number
          tipo: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number | null
          descripcion?: string
          id?: string
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
          cliente_id: string
          created_at: string
          descripcion_problema: string
          diagnostico: string | null
          empresa_id: string
          estado: string
          fecha_entrega: string | null
          fecha_estimada_entrega: string | null
          fecha_recepcion: string
          id: string
          iva_pct: number
          kilometraje_entrada: number
          kilometraje_salida: number | null
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
          cliente_id: string
          created_at?: string
          descripcion_problema?: string
          diagnostico?: string | null
          empresa_id: string
          estado: string
          fecha_entrega?: string | null
          fecha_estimada_entrega?: string | null
          fecha_recepcion?: string
          id?: string
          iva_pct?: number
          kilometraje_entrada?: number
          kilometraje_salida?: number | null
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
          cliente_id?: string
          created_at?: string
          descripcion_problema?: string
          diagnostico?: string | null
          empresa_id?: string
          estado?: string
          fecha_entrega?: string | null
          fecha_estimada_entrega?: string | null
          fecha_recepcion?: string
          id?: string
          iva_pct?: number
          kilometraje_entrada?: number
          kilometraje_salida?: number | null
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
      tecnicos: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          especialidad: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          especialidad?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          especialidad?: string | null
          id?: string
          nombre?: string
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
      es_super_admin: { Args: never; Returns: boolean }
      estado_de_ot: { Args: { p_ot_id: string }; Returns: string }
      mi_empresa_id: { Args: never; Returns: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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


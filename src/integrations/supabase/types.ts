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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      formularios: {
        Row: {
          acelera_finalizado_em: string | null
          acelera_finalizado_por: string | null
          ano_referencia: number | null
          created_at: string
          diretor: string | null
          id: string
          mes_referencia: number | null
          nome: string | null
          responsavel: string | null
          semana_inicio: string | null
          status: string
          superintendente: string | null
          tipo: string
          usuario_id: string
          valor_agilitas: number
          valor_marketing: number
        }
        Insert: {
          acelera_finalizado_em?: string | null
          acelera_finalizado_por?: string | null
          ano_referencia?: number | null
          created_at?: string
          diretor?: string | null
          id?: string
          mes_referencia?: number | null
          nome?: string | null
          responsavel?: string | null
          semana_inicio?: string | null
          status?: string
          superintendente?: string | null
          tipo?: string
          usuario_id: string
          valor_agilitas?: number
          valor_marketing?: number
        }
        Update: {
          acelera_finalizado_em?: string | null
          acelera_finalizado_por?: string | null
          ano_referencia?: number | null
          created_at?: string
          diretor?: string | null
          id?: string
          mes_referencia?: number | null
          nome?: string | null
          responsavel?: string | null
          semana_inicio?: string | null
          status?: string
          superintendente?: string | null
          tipo?: string
          usuario_id?: string
          valor_agilitas?: number
          valor_marketing?: number
        }
        Relationships: []
      }
      gerentes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          inativo_ano: number | null
          inativo_mes: number | null
          nome: string
          superintendente_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          inativo_ano?: number | null
          inativo_mes?: number | null
          nome: string
          superintendente_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          inativo_ano?: number | null
          inativo_mes?: number | null
          nome?: string
          superintendente_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          acelera_finalizado_em: string | null
          acelera_finalizado_por: string | null
          ano_ref: number | null
          boleto_diretor_url: string | null
          boleto_url: string | null
          candidatos: number | null
          comp_corretor_url: string | null
          comp_gerente_url: string | null
          comp_sup_url: string | null
          comprovante_url: string | null
          contratados: number | null
          created_at: string
          data_hora: string
          descricao: string | null
          destinacao: string | null
          fonte: string | null
          formulario_id: string
          gerente: string | null
          id: string
          leads: number | null
          mes_ref: number | null
          meta_gerente: number | null
          meta_sup: number | null
          motivo_reprovacao: string | null
          nome_recebedor: string | null
          plantao: string | null
          produto: string | null
          quem_pagou: string | null
          reprovado: boolean
          secao: string | null
          semana_inicio: string | null
          superintendente: string | null
          tipo_gasto: string | null
          valor: number
          verba_cury: number | null
          verba_gerente: number | null
          verba_superintendente: number | null
        }
        Insert: {
          acelera_finalizado_em?: string | null
          acelera_finalizado_por?: string | null
          ano_ref?: number | null
          boleto_diretor_url?: string | null
          boleto_url?: string | null
          candidatos?: number | null
          comp_corretor_url?: string | null
          comp_gerente_url?: string | null
          comp_sup_url?: string | null
          comprovante_url?: string | null
          contratados?: number | null
          created_at?: string
          data_hora?: string
          descricao?: string | null
          destinacao?: string | null
          fonte?: string | null
          formulario_id: string
          gerente?: string | null
          id?: string
          leads?: number | null
          mes_ref?: number | null
          meta_gerente?: number | null
          meta_sup?: number | null
          motivo_reprovacao?: string | null
          nome_recebedor?: string | null
          plantao?: string | null
          produto?: string | null
          quem_pagou?: string | null
          reprovado?: boolean
          secao?: string | null
          semana_inicio?: string | null
          superintendente?: string | null
          tipo_gasto?: string | null
          valor?: number
          verba_cury?: number | null
          verba_gerente?: number | null
          verba_superintendente?: number | null
        }
        Update: {
          acelera_finalizado_em?: string | null
          acelera_finalizado_por?: string | null
          ano_ref?: number | null
          boleto_diretor_url?: string | null
          boleto_url?: string | null
          candidatos?: number | null
          comp_corretor_url?: string | null
          comp_gerente_url?: string | null
          comp_sup_url?: string | null
          comprovante_url?: string | null
          contratados?: number | null
          created_at?: string
          data_hora?: string
          descricao?: string | null
          destinacao?: string | null
          fonte?: string | null
          formulario_id?: string
          gerente?: string | null
          id?: string
          leads?: number | null
          mes_ref?: number | null
          meta_gerente?: number | null
          meta_sup?: number | null
          motivo_reprovacao?: string | null
          nome_recebedor?: string | null
          plantao?: string | null
          produto?: string | null
          quem_pagou?: string | null
          reprovado?: boolean
          secao?: string | null
          semana_inicio?: string | null
          superintendente?: string | null
          tipo_gasto?: string | null
          valor?: number
          verba_cury?: number | null
          verba_gerente?: number | null
          verba_superintendente?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_financeiros: {
        Row: {
          ano: number
          comprovantes: Json
          created_at: string
          created_by: string
          descricao: string | null
          destino_id: string | null
          destino_nome: string
          destino_tipo: string
          gerente_id: string | null
          gerente_nome: string | null
          id: string
          mes: number
          tipo_gasto: string
          valor: number
        }
        Insert: {
          ano: number
          comprovantes?: Json
          created_at?: string
          created_by?: string
          descricao?: string | null
          destino_id?: string | null
          destino_nome: string
          destino_tipo: string
          gerente_id?: string | null
          gerente_nome?: string | null
          id?: string
          mes: number
          tipo_gasto: string
          valor?: number
        }
        Update: {
          ano?: number
          comprovantes?: Json
          created_at?: string
          created_by?: string
          descricao?: string | null
          destino_id?: string | null
          destino_nome?: string
          destino_tipo?: string
          gerente_id?: string | null
          gerente_nome?: string | null
          id?: string
          mes?: number
          tipo_gasto?: string
          valor?: number
        }
        Relationships: []
      }
      leads_decisoes: {
        Row: {
          acao: string
          alias_id: string | null
          created_at: string
          id: string
          lead_id: string
          observacao: string | null
          origem: string
          produto_id: string | null
          score: number | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          alias_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          observacao?: string | null
          origem: string
          produto_id?: string | null
          score?: number | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          alias_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          observacao?: string | null
          origem?: string
          produto_id?: string | null
          score?: number | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_decisoes_alias_id_fkey"
            columns: ["alias_id"]
            isOneToOne: false
            referencedRelation: "produto_aliases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_decisoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_facebook"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_decisoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_oficiais"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_facebook: {
        Row: {
          campanha: string | null
          canal: string | null
          contagem: number
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          fonte: string | null
          formulario: string | null
          gerente: string | null
          id: string
          import_batch_id: string | null
          nome_normalizado: string
          nome_original: string
          origem_decisao: string | null
          payload: Json | null
          produto_id: string | null
          produto_sugerido_id: string | null
          responsavel: string | null
          score: number
          status: string
          superintendente: string | null
        }
        Insert: {
          campanha?: string | null
          canal?: string | null
          contagem?: number
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fonte?: string | null
          formulario?: string | null
          gerente?: string | null
          id?: string
          import_batch_id?: string | null
          nome_normalizado: string
          nome_original: string
          origem_decisao?: string | null
          payload?: Json | null
          produto_id?: string | null
          produto_sugerido_id?: string | null
          responsavel?: string | null
          score?: number
          status?: string
          superintendente?: string | null
        }
        Update: {
          campanha?: string | null
          canal?: string | null
          contagem?: number
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fonte?: string | null
          formulario?: string | null
          gerente?: string | null
          id?: string
          import_batch_id?: string | null
          nome_normalizado?: string
          nome_original?: string
          origem_decisao?: string | null
          payload?: Json | null
          produto_id?: string | null
          produto_sugerido_id?: string | null
          responsavel?: string | null
          score?: number
          status?: string
          superintendente?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_facebook_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "leads_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_facebook_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_oficiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_facebook_produto_sugerido_id_fkey"
            columns: ["produto_sugerido_id"]
            isOneToOne: false
            referencedRelation: "produtos_oficiais"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_hierarquia_aliases: {
        Row: {
          alias: string
          alias_normalizado: string
          created_at: string
          created_by: string | null
          gerente_id: string | null
          id: string
          profile_id: string | null
          tipo: Database["public"]["Enums"]["hierarquia_tipo"]
          updated_at: string
        }
        Insert: {
          alias: string
          alias_normalizado: string
          created_at?: string
          created_by?: string | null
          gerente_id?: string | null
          id?: string
          profile_id?: string | null
          tipo: Database["public"]["Enums"]["hierarquia_tipo"]
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_normalizado?: string
          created_at?: string
          created_by?: string | null
          gerente_id?: string | null
          id?: string
          profile_id?: string | null
          tipo?: Database["public"]["Enums"]["hierarquia_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_hierarquia_aliases_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "gerentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_hierarquia_aliases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_import_batches: {
        Row: {
          arquivo_nome: string | null
          auto: number
          created_at: string
          created_by: string | null
          erros: number
          id: string
          indefinido: number
          pendente: number
          total: number
        }
        Insert: {
          arquivo_nome?: string | null
          auto?: number
          created_at?: string
          created_by?: string | null
          erros?: number
          id?: string
          indefinido?: number
          pendente?: number
          total?: number
        }
        Update: {
          arquivo_nome?: string | null
          auto?: number
          created_at?: string
          created_by?: string | null
          erros?: number
          id?: string
          indefinido?: number
          pendente?: number
          total?: number
        }
        Relationships: []
      }
      pastas: {
        Row: {
          ab: string | null
          corretor: string | null
          created_at: string
          created_by: string
          data_criacao: string | null
          diretor: string | null
          diretor_id: string | null
          empreendimento: string | null
          gerente: string | null
          gerente_id: string | null
          id: string
          import_batch_id: string | null
          pv: string
          status: string | null
          superintendente: string | null
          superintendente_id: string | null
        }
        Insert: {
          ab?: string | null
          corretor?: string | null
          created_at?: string
          created_by?: string
          data_criacao?: string | null
          diretor?: string | null
          diretor_id?: string | null
          empreendimento?: string | null
          gerente?: string | null
          gerente_id?: string | null
          id?: string
          import_batch_id?: string | null
          pv: string
          status?: string | null
          superintendente?: string | null
          superintendente_id?: string | null
        }
        Update: {
          ab?: string | null
          corretor?: string | null
          created_at?: string
          created_by?: string
          data_criacao?: string | null
          diretor?: string | null
          diretor_id?: string | null
          empreendimento?: string | null
          gerente?: string | null
          gerente_id?: string | null
          id?: string
          import_batch_id?: string | null
          pv?: string
          status?: string | null
          superintendente?: string | null
          superintendente_id?: string | null
        }
        Relationships: []
      }
      plantoes_mes: {
        Row: {
          ano: number
          created_at: string
          id: string
          mes: number
          nome: string
          ordem: number
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          mes: number
          nome: string
          ordem?: number
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          mes?: number
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      previsao_produto_aliases: {
        Row: {
          alias: string
          alias_normalizado: string
          created_at: string
          created_by: string | null
          id: string
          produto_id: string
          vezes_usado: number
        }
        Insert: {
          alias: string
          alias_normalizado: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id: string
          vezes_usado?: number
        }
        Update: {
          alias?: string
          alias_normalizado?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id?: string
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "previsao_produto_aliases_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "previsao_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      previsao_produto_solicitacoes: {
        Row: {
          created_at: string
          id: string
          justificativa: string | null
          motivo_rejeicao: string | null
          nome_solicitado: string
          produto_id: string | null
          revisado_em: string | null
          revisado_por: string | null
          solicitado_por: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          nome_solicitado: string
          produto_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          solicitado_por: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          nome_solicitado?: string
          produto_id?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          solicitado_por?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      previsao_produtos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          nome_normalizado: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          nome_normalizado: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          nome_normalizado?: string
          updated_at?: string
        }
        Relationships: []
      }
      previsoes: {
        Row: {
          ano_referencia: number
          created_at: string
          gerente: string | null
          id: string
          mes_referencia: number
          observacao: string | null
          preciso_vendas: number
          produto_id: string | null
          realizado: number
          semana_fim: string
          semana_inicio: string
          superintendente: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          ano_referencia: number
          created_at?: string
          gerente?: string | null
          id?: string
          mes_referencia: number
          observacao?: string | null
          preciso_vendas?: number
          produto_id?: string | null
          realizado?: number
          semana_fim: string
          semana_inicio: string
          superintendente: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          ano_referencia?: number
          created_at?: string
          gerente?: string | null
          id?: string
          mes_referencia?: number
          observacao?: string | null
          preciso_vendas?: number
          produto_id?: string | null
          realizado?: number
          semana_fim?: string
          semana_inicio?: string
          superintendente?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "previsoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "previsao_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_aliases: {
        Row: {
          alias: string
          alias_normalizado: string
          created_at: string
          created_by: string | null
          id: string
          produto_id: string
          vezes_usado: number
        }
        Insert: {
          alias: string
          alias_normalizado: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id: string
          vezes_usado?: number
        }
        Update: {
          alias?: string
          alias_normalizado?: string
          created_at?: string
          created_by?: string | null
          id?: string
          produto_id?: string
          vezes_usado?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_aliases_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_oficiais"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_oficiais: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          nome_normalizado: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          nome_normalizado: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          nome_normalizado?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          diretor_id: string | null
          email: string | null
          id: string
          nome: string | null
          vinculado_id: string | null
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          diretor_id?: string | null
          email?: string | null
          id: string
          nome?: string | null
          vinculado_id?: string | null
        }
        Update: {
          cargo?: string | null
          created_at?: string
          diretor_id?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          vinculado_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_diretor_id_fkey"
            columns: ["diretor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas_realizadas: {
        Row: {
          corretor: string | null
          created_at: string
          created_by: string | null
          data_assinatura: string | null
          diretor: string | null
          empreendimento: string | null
          gerente: string | null
          id: string
          import_batch_id: string | null
          produto_id: string | null
          pv: string
          superintendente: string | null
          unidades: number
          vgv: number
        }
        Insert: {
          corretor?: string | null
          created_at?: string
          created_by?: string | null
          data_assinatura?: string | null
          diretor?: string | null
          empreendimento?: string | null
          gerente?: string | null
          id?: string
          import_batch_id?: string | null
          produto_id?: string | null
          pv: string
          superintendente?: string | null
          unidades?: number
          vgv?: number
        }
        Update: {
          corretor?: string | null
          created_at?: string
          created_by?: string | null
          data_assinatura?: string | null
          diretor?: string | null
          empreendimento?: string | null
          gerente?: string | null
          id?: string
          import_batch_id?: string | null
          produto_id?: string | null
          pv?: string
          superintendente?: string | null
          unidades?: number
          vgv?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_realizadas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "previsao_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_diretor: { Args: { _uid: string }; Returns: boolean }
      is_rh_for: { Args: { _owner: string; _uid: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_text: { Args: { input: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      hierarquia_tipo: "superintendente" | "gerente"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      hierarquia_tipo: ["superintendente", "gerente"],
    },
  },
} as const

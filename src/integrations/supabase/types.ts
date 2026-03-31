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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      actuals_matches: {
        Row: {
          cost_center_id: string
          created_at: string
          fiscal_year_id: string
          line_item_id: string
          match_source: string
          matched_at: string
          matched_by_role: string
          merchant_key: string | null
          txn_id: string
        }
        Insert: {
          cost_center_id: string
          created_at?: string
          fiscal_year_id: string
          line_item_id: string
          match_source?: string
          matched_at?: string
          matched_by_role: string
          merchant_key?: string | null
          txn_id: string
        }
        Update: {
          cost_center_id?: string
          created_at?: string
          fiscal_year_id?: string
          line_item_id?: string
          match_source?: string
          matched_at?: string
          matched_by_role?: string
          merchant_key?: string | null
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actuals_matches_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_matches_fiscal_year_id_txn_id_fkey"
            columns: ["fiscal_year_id", "txn_id"]
            isOneToOne: true
            referencedRelation: "actuals_transactions"
            referencedColumns: ["fiscal_year_id", "txn_id"]
          },
        ]
      }
      actuals_matching: {
        Row: {
          created_at: string
          fiscal_year_id: string
          matches_by_txn_id: Json
          rules_by_merchant_key: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          fiscal_year_id: string
          matches_by_txn_id?: Json
          rules_by_merchant_key?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          fiscal_year_id?: string
          matches_by_txn_id?: Json
          rules_by_merchant_key?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "actuals_matching_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: true
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      actuals_transactions: {
        Row: {
          amount: number
          canonical_vendor_id: string | null
          created_at: string
          fiscal_year_id: string
          merchant: string | null
          raw: Json
          source: string | null
          txn_date: string | null
          txn_id: string
        }
        Insert: {
          amount?: number
          canonical_vendor_id?: string | null
          created_at?: string
          fiscal_year_id: string
          merchant?: string | null
          raw: Json
          source?: string | null
          txn_date?: string | null
          txn_id: string
        }
        Update: {
          amount?: number
          canonical_vendor_id?: string | null
          created_at?: string
          fiscal_year_id?: string
          merchant?: string | null
          raw?: Json
          source?: string | null
          txn_date?: string | null
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actuals_transactions_canonical_vendor_id_fkey"
            columns: ["canonical_vendor_id"]
            isOneToOne: false
            referencedRelation: "canonical_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actuals_transactions_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_settings: {
        Row: {
          admin_override_enabled: boolean
          created_at: string
          id: string
          increase_approval_absolute_usd: number
          increase_approval_percent: number
          show_archived_fiscal_years: boolean
          time_zone: string
          updated_at: string
        }
        Insert: {
          admin_override_enabled?: boolean
          created_at?: string
          id?: string
          increase_approval_absolute_usd?: number
          increase_approval_percent?: number
          show_archived_fiscal_years?: boolean
          time_zone?: string
          updated_at?: string
        }
        Update: {
          admin_override_enabled?: boolean
          created_at?: string
          id?: string
          increase_approval_absolute_usd?: number
          increase_approval_percent?: number
          show_archived_fiscal_years?: boolean
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_audit_events: {
        Row: {
          action: string
          actor_role: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          meta: Json | null
          note: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          meta?: Json | null
          note?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          meta?: Json | null
          note?: string | null
        }
        Relationships: []
      }
      budget_approval_steps: {
        Row: {
          fiscal_year_id: string
          id: string
          level: string
          status: string
          step_order: number
          updated_at: string | null
        }
        Insert: {
          fiscal_year_id: string
          id?: string
          level: string
          status?: string
          step_order: number
          updated_at?: string | null
        }
        Update: {
          fiscal_year_id?: string
          id?: string
          level?: string
          status?: string
          step_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_approval_steps_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_vendors: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          annual_limit: number
          created_at: string
          fiscal_year_id: string
          id: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          annual_limit?: number
          created_at?: string
          fiscal_year_id: string
          id: string
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          annual_limit?: number
          created_at?: string
          fiscal_year_id?: string
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          approval_approved_at: string | null
          approval_rejected_at: string | null
          approval_status: string
          approval_submitted_at: string | null
          archived_at: string | null
          archived_by_role: string | null
          archived_by_user_id: string | null
          archived_justification: string | null
          created_at: string
          data: Json
          end_date: string | null
          id: string
          name: string
          previous_status_before_archive: string | null
          start_date: string | null
          status: string
          target_budget: number
          updated_at: string
          year: number | null
        }
        Insert: {
          approval_approved_at?: string | null
          approval_rejected_at?: string | null
          approval_status?: string
          approval_submitted_at?: string | null
          archived_at?: string | null
          archived_by_role?: string | null
          archived_by_user_id?: string | null
          archived_justification?: string | null
          created_at?: string
          data: Json
          end_date?: string | null
          id: string
          name: string
          previous_status_before_archive?: string | null
          start_date?: string | null
          status: string
          target_budget?: number
          updated_at?: string
          year?: number | null
        }
        Update: {
          approval_approved_at?: string | null
          approval_rejected_at?: string | null
          approval_status?: string
          approval_submitted_at?: string | null
          archived_at?: string | null
          archived_by_role?: string | null
          archived_by_user_id?: string | null
          archived_justification?: string | null
          created_at?: string
          data?: Json
          end_date?: string | null
          id?: string
          name?: string
          previous_status_before_archive?: string | null
          start_date?: string | null
          status?: string
          target_budget?: number
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      fy_forecasts: {
        Row: {
          created_at: string
          data: Json
          fiscal_year_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          fiscal_year_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          fiscal_year_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_forecasts_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: true
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          adjustment_before_values: Json | null
          adjustment_request_id: string | null
          adjustment_sheet: string | null
          adjustment_status: string | null
          approval_request_id: string | null
          approval_status: string | null
          auto_renew: boolean | null
          cancellation_notice_days: number | null
          cancellation_request_id: string | null
          cancellation_status: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          cost_center_id: string
          created_at: string
          deletion_request_id: string | null
          deletion_status: string | null
          fiscal_year_id: string
          id: string
          is_accrual: boolean
          is_contracted: boolean
          is_software_subscription: boolean
          name: string
          owner_id: string | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          adjustment_before_values?: Json | null
          adjustment_request_id?: string | null
          adjustment_sheet?: string | null
          adjustment_status?: string | null
          approval_request_id?: string | null
          approval_status?: string | null
          auto_renew?: boolean | null
          cancellation_notice_days?: number | null
          cancellation_request_id?: string | null
          cancellation_status?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          cost_center_id: string
          created_at?: string
          deletion_request_id?: string | null
          deletion_status?: string | null
          fiscal_year_id: string
          id: string
          is_accrual?: boolean
          is_contracted?: boolean
          is_software_subscription?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          adjustment_before_values?: Json | null
          adjustment_request_id?: string | null
          adjustment_sheet?: string | null
          adjustment_status?: string | null
          approval_request_id?: string | null
          approval_status?: string | null
          auto_renew?: boolean | null
          cancellation_notice_days?: number | null
          cancellation_request_id?: string | null
          cancellation_status?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          cost_center_id?: string
          created_at?: string
          deletion_request_id?: string | null
          deletion_status?: string | null
          fiscal_year_id?: string
          id?: string
          is_accrual?: boolean
          is_contracted?: boolean
          is_software_subscription?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "canonical_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_rules: {
        Row: {
          cost_center_id: string
          created_at: string
          created_by_role: string
          fiscal_year_id: string
          id: string
          line_item_id: string
          merchant_key: string
          updated_at: string
        }
        Insert: {
          cost_center_id: string
          created_at?: string
          created_by_role: string
          fiscal_year_id: string
          id?: string
          line_item_id: string
          merchant_key: string
          updated_at?: string
        }
        Update: {
          cost_center_id?: string
          created_at?: string
          created_by_role?: string
          fiscal_year_id?: string
          id?: string
          line_item_id?: string
          merchant_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_rules_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_values: {
        Row: {
          amount: number
          fiscal_year_id: string
          id: string
          line_item_id: string
          month: string
          value_type: string
        }
        Insert: {
          amount?: number
          fiscal_year_id: string
          id?: string
          line_item_id: string
          month: string
          value_type: string
        }
        Update: {
          amount?: number
          fiscal_year_id?: string
          id?: string
          line_item_id?: string
          month?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_values_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_values_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          last_login_at: string | null
          last_name: string | null
          must_change_password: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          last_name?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          last_name?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      request_approval_steps: {
        Row: {
          comment: string | null
          id: string
          level: string
          request_id: string
          status: string
          step_order: number
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          id?: string
          level: string
          request_id: string
          status?: string
          step_order: number
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          id?: string
          level?: string
          request_id?: string
          status?: string
          step_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_approval_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "spend_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      spend_requests: {
        Row: {
          amount: number | null
          cost_center_id: string | null
          cost_center_name: string | null
          created_at: string
          current_amount: number | null
          data: Json
          deleted_at: string | null
          end_month: string | null
          id: string
          is_contracted: boolean | null
          justification: string | null
          line_item_name: string | null
          origin_cost_center_id: string | null
          origin_fiscal_year_id: string | null
          origin_kind: string | null
          origin_line_item_id: string | null
          origin_sheet: string | null
          requester_id: string | null
          revised_amount: number | null
          start_month: string | null
          status: string
          target_request_id: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount?: number | null
          cost_center_id?: string | null
          cost_center_name?: string | null
          created_at?: string
          current_amount?: number | null
          data: Json
          deleted_at?: string | null
          end_month?: string | null
          id: string
          is_contracted?: boolean | null
          justification?: string | null
          line_item_name?: string | null
          origin_cost_center_id?: string | null
          origin_fiscal_year_id?: string | null
          origin_kind?: string | null
          origin_line_item_id?: string | null
          origin_sheet?: string | null
          requester_id?: string | null
          revised_amount?: number | null
          start_month?: string | null
          status: string
          target_request_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number | null
          cost_center_id?: string | null
          cost_center_name?: string | null
          created_at?: string
          current_amount?: number | null
          data?: Json
          deleted_at?: string | null
          end_month?: string | null
          id?: string
          is_contracted?: boolean | null
          justification?: string | null
          line_item_name?: string | null
          origin_cost_center_id?: string | null
          origin_fiscal_year_id?: string | null
          origin_kind?: string | null
          origin_line_item_id?: string | null
          origin_sheet?: string | null
          requester_id?: string | null
          revised_amount?: number | null
          start_month?: string | null
          status?: string
          target_request_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      vendor_aliases: {
        Row: {
          alias_display: string | null
          alias_key: string
          canonical_vendor_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          source: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alias_display?: string | null
          alias_key: string
          canonical_vendor_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alias_display?: string | null
          alias_key?: string
          canonical_vendor_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          source?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_aliases_canonical_vendor_id_fkey"
            columns: ["canonical_vendor_id"]
            isOneToOne: false
            referencedRelation: "canonical_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_self_signup: { Args: never; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_any_role: {
        Args: { required_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      user_role: "admin" | "manager" | "cmo" | "finance"
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
      user_role: ["admin", "manager", "cmo", "finance"],
    },
  },
} as const

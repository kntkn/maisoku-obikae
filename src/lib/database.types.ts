export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      company_profiles: {
        Row: {
          id: string
          user_id: string
          company_name: string
          address: string
          phone: string
          fax: string | null
          email: string
          contact_person: string | null
          license_number: string
          logo_url: string | null
          line_qr_url: string | null
          fee_ratio_landlord: number | null
          fee_ratio_tenant: number | null
          fee_distribution_motoduke: number | null
          fee_distribution_kyakuzuke: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          address: string
          phone: string
          fax?: string | null
          email: string
          contact_person?: string | null
          license_number: string
          logo_url?: string | null
          line_qr_url?: string | null
          fee_ratio_landlord?: number | null
          fee_ratio_tenant?: number | null
          fee_distribution_motoduke?: number | null
          fee_distribution_kyakuzuke?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          address?: string
          phone?: string
          fax?: string | null
          email?: string
          contact_person?: string | null
          license_number?: string
          logo_url?: string | null
          line_qr_url?: string | null
          fee_ratio_landlord?: number | null
          fee_ratio_tenant?: number | null
          fee_distribution_motoduke?: number | null
          fee_distribution_kyakuzuke?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      layout_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          blocks: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          blocks: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          blocks?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// 型ヘルパー
export type CompanyProfile = Database['public']['Tables']['company_profiles']['Row']
export type CompanyProfileInsert = Database['public']['Tables']['company_profiles']['Insert']
export type CompanyProfileUpdate = Database['public']['Tables']['company_profiles']['Update']

export type LayoutTemplate = Database['public']['Tables']['layout_templates']['Row']
export type LayoutTemplateInsert = Database['public']['Tables']['layout_templates']['Insert']
export type LayoutTemplateUpdate = Database['public']['Tables']['layout_templates']['Update']

// ブロックの型定義
export interface TextBlock {
  id: string
  type: 'text'
  field: 'company_name' | 'address' | 'phone' | 'fax' | 'email' | 'contact_person' | 'license_number' | 'fee_ratio_landlord' | 'fee_ratio_tenant' | 'fee_distribution_motoduke' | 'fee_distribution_kyakuzuke'
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight: 'normal' | 'bold'
  textAlign: 'left' | 'center' | 'right'
}

export interface ImageBlock {
  id: string
  type: 'image'
  field: 'logo' | 'line_qr'
  x: number
  y: number
  width: number
  height: number
}

export type Block = TextBlock | ImageBlock

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
          slug: string | null
          ga_measurement_id: string | null
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
          slug?: string | null
          ga_measurement_id?: string | null
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
          slug?: string | null
          ga_measurement_id?: string | null
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
      published_listings: {
        Row: {
          id: string
          user_id: string
          title: string
          slug: string
          page_count: number
          is_published: boolean
          ga_measurement_id: string | null
          highlight_tags: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          slug: string
          page_count: number
          is_published?: boolean
          ga_measurement_id?: string | null
          highlight_tags?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          slug?: string
          page_count?: number
          is_published?: boolean
          ga_measurement_id?: string | null
          highlight_tags?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      published_pages: {
        Row: {
          id: string
          listing_id: string
          page_number: number
          image_url: string
          width: number | null
          height: number | null
          created_at: string
        }
        Insert: {
          id?: string
          listing_id: string
          page_number: number
          image_url: string
          width?: number | null
          height?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          listing_id?: string
          page_number?: number
          image_url?: string
          width?: number | null
          height?: number | null
          created_at?: string
        }
      }
      proposal_sets: {
        Row: {
          id: string
          user_id: string
          customer_name: string
          slug: string
          listing_ids: string[]
          final_ranking: string[]
          ranking_comment: string | null
          completed_at: string | null
          share_token: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          customer_name: string
          slug: string
          listing_ids: string[]
          final_ranking?: string[]
          ranking_comment?: string | null
          completed_at?: string | null
          share_token?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          customer_name?: string
          slug?: string
          listing_ids?: string[]
          final_ranking?: string[]
          ranking_comment?: string | null
          completed_at?: string | null
          share_token?: string | null
          created_at?: string
        }
      }
      swipe_results: {
        Row: {
          id: string
          proposal_id: string
          listing_id: string
          liked: boolean
          viewed_seconds: number
          reaction: 'like' | 'pass' | null
          selected_tags: string[]
          dwell_ms: number
          zoom_count: number
          page_turn_count: number
          revisit_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          listing_id: string
          liked: boolean
          viewed_seconds?: number
          reaction?: 'like' | 'pass' | null
          selected_tags?: string[]
          dwell_ms?: number
          zoom_count?: number
          page_turn_count?: number
          revisit_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          proposal_id?: string
          listing_id?: string
          liked?: boolean
          viewed_seconds?: number
          reaction?: 'like' | 'pass' | null
          selected_tags?: string[]
          dwell_ms?: number
          zoom_count?: number
          page_turn_count?: number
          revisit_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      swipe_events: {
        Row: {
          id: string
          proposal_id: string | null
          session_id: string
          listing_id: string | null
          event_name: string
          params: Json
          ts: string
        }
        Insert: {
          id?: string
          proposal_id?: string | null
          session_id: string
          listing_id?: string | null
          event_name: string
          params?: Json
          ts?: string
        }
        Update: {
          id?: string
          proposal_id?: string | null
          session_id?: string
          listing_id?: string | null
          event_name?: string
          params?: Json
          ts?: string
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

export type PublishedListing = Database['public']['Tables']['published_listings']['Row']
export type PublishedListingInsert = Database['public']['Tables']['published_listings']['Insert']
export type PublishedPage = Database['public']['Tables']['published_pages']['Row']
export type PublishedPageInsert = Database['public']['Tables']['published_pages']['Insert']

export type ProposalSet = Database['public']['Tables']['proposal_sets']['Row']
export type ProposalSetInsert = Database['public']['Tables']['proposal_sets']['Insert']
export type SwipeResult = Database['public']['Tables']['swipe_results']['Row']
export type SwipeResultInsert = Database['public']['Tables']['swipe_results']['Insert']
export type SwipeEvent = Database['public']['Tables']['swipe_events']['Row']
export type SwipeEventInsert = Database['public']['Tables']['swipe_events']['Insert']

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_feedback: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          message_id: string;
          rating: number;
          reason: string | null;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          message_id: string;
          rating: number;
          reason?: string | null;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          message_id?: string;
          rating?: number;
          reason?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_feedback_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          created_at: string;
          end_time: string;
          household_id: string;
          id: string;
          meeting_url: string | null;
          notes: string | null;
          specialist_id: string | null;
          start_time: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          household_id: string;
          id?: string;
          meeting_url?: string | null;
          notes?: string | null;
          specialist_id?: string | null;
          start_time: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          household_id?: string;
          id?: string;
          meeting_url?: string | null;
          notes?: string | null;
          specialist_id?: string | null;
          start_time?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_specialist_id_fkey";
            columns: ["specialist_id"];
            isOneToOne: false;
            referencedRelation: "specialists";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          household_id: string | null;
          id: string;
          metadata: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          household_id?: string | null;
          id?: string;
          metadata?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          household_id?: string | null;
          id?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          accepted_at: string;
          consent_type: string;
          id: string;
          ip_hash: string | null;
          policy_version: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          consent_type: string;
          id?: string;
          ip_hash?: string | null;
          policy_version: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          consent_type?: string;
          id?: string;
          ip_hash?: string | null;
          policy_version?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          created_by: string;
          dependent_id: string | null;
          household_id: string;
          id: string;
          locale: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          dependent_id?: string | null;
          household_id: string;
          id?: string;
          locale?: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          dependent_id?: string | null;
          household_id?: string;
          id?: string;
          locale?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_dependent_id_fkey";
            columns: ["dependent_id"];
            isOneToOne: false;
            referencedRelation: "dependents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      dependents: {
        Row: {
          archived_at: string | null;
          birth_year: number | null;
          created_at: string;
          created_by: string;
          first_name: string;
          grade_level: string | null;
          household_id: string;
          id: string;
          last_name: string | null;
          notes: string | null;
          preferred_name: string | null;
          school_district: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          birth_year?: number | null;
          created_at?: string;
          created_by: string;
          first_name: string;
          grade_level?: string | null;
          household_id: string;
          id?: string;
          last_name?: string | null;
          notes?: string | null;
          preferred_name?: string | null;
          school_district?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          birth_year?: number | null;
          created_at?: string;
          created_by?: string;
          first_name?: string;
          grade_level?: string | null;
          household_id?: string;
          id?: string;
          last_name?: string | null;
          notes?: string | null;
          preferred_name?: string | null;
          school_district?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dependents_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      document_analyses: {
        Row: {
          analysis_type: string;
          created_at: string;
          document_id: string;
          id: string;
          language: string;
          model_name: string | null;
          prompt_version: string | null;
          status: Database["public"]["Enums"]["processing_status"];
          structured_result: Json | null;
          summary: string | null;
        };
        Insert: {
          analysis_type: string;
          created_at?: string;
          document_id: string;
          id?: string;
          language: string;
          model_name?: string | null;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["processing_status"];
          structured_result?: Json | null;
          summary?: string | null;
        };
        Update: {
          analysis_type?: string;
          created_at?: string;
          document_id?: string;
          id?: string;
          language?: string;
          model_name?: string | null;
          prompt_version?: string | null;
          status?: Database["public"]["Enums"]["processing_status"];
          structured_result?: Json | null;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_chunks: {
        Row: {
          chunk_index: number;
          character_count: number;
          content: string;
          created_at: string;
          document_id: string;
          embedding: string | null;
          id: string;
          metadata: Json;
          page_id: string | null;
          page_number: number;
          token_estimate: number | null;
        };
        Insert: {
          chunk_index: number;
          character_count: number;
          content: string;
          created_at?: string;
          document_id: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          page_id?: string | null;
          page_number: number;
          token_estimate?: number | null;
        };
        Update: {
          chunk_index?: number;
          character_count?: number;
          content?: string;
          created_at?: string;
          document_id?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json;
          page_id?: string | null;
          page_number?: number;
          token_estimate?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_chunks_page_document_fkey";
            columns: ["page_id", "document_id"];
            isOneToOne: false;
            referencedRelation: "document_pages";
            referencedColumns: ["id", "document_id"];
          },
        ];
      };
      document_pages: {
        Row: {
          character_count: number;
          created_at: string;
          document_id: string;
          extracted_text: string;
          extraction_confidence: number | null;
          id: string;
          page_number: number;
        };
        Insert: {
          character_count: number;
          created_at?: string;
          document_id: string;
          extracted_text: string;
          extraction_confidence?: number | null;
          id?: string;
          page_number: number;
        };
        Update: {
          character_count?: number;
          created_at?: string;
          document_id?: string;
          extracted_text?: string;
          extraction_confidence?: number | null;
          id?: string;
          page_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_processing_jobs: {
        Row: {
          attempt_count: number;
          available_at: string;
          completed_at: string | null;
          created_at: string;
          document_id: string;
          error_code: string | null;
          error_message: string | null;
          failed_at: string | null;
          id: string;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          started_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          completed_at?: string | null;
          created_at?: string;
          document_id: string;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          completed_at?: string | null;
          created_at?: string;
          document_id?: string;
          error_code?: string | null;
          error_message?: string | null;
          failed_at?: string | null;
          id?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          dependent_id: string | null;
          detected_language: string | null;
          document_type: string | null;
          file_size: number;
          household_id: string;
          id: string;
          mime_type: string;
          original_filename: string;
          processing_status: string;
          storage_bucket: string;
          storage_path: string;
          title: string;
          updated_at: string;
          upload_status: Database["public"]["Enums"]["document_upload_status"];
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          dependent_id?: string | null;
          detected_language?: string | null;
          document_type?: string | null;
          file_size: number;
          household_id: string;
          id?: string;
          mime_type: string;
          original_filename: string;
          processing_status?: string;
          storage_bucket?: string;
          storage_path: string;
          title: string;
          updated_at?: string;
          upload_status?: Database["public"]["Enums"]["document_upload_status"];
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          dependent_id?: string | null;
          detected_language?: string | null;
          document_type?: string | null;
          file_size?: number;
          household_id?: string;
          id?: string;
          mime_type?: string;
          original_filename?: string;
          processing_status?: string;
          storage_bucket?: string;
          storage_path?: string;
          title?: string;
          updated_at?: string;
          upload_status?: Database["public"]["Enums"]["document_upload_status"];
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_dependent_id_fkey";
            columns: ["dependent_id"];
            isOneToOne: false;
            referencedRelation: "dependents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          invited_by: string | null;
          joined_at: string | null;
          permission: Database["public"]["Enums"]["household_permission"];
          relationship: string | null;
          status: Database["public"]["Enums"]["membership_status"] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string | null;
          permission?: Database["public"]["Enums"]["household_permission"];
          relationship?: string | null;
          status?: Database["public"]["Enums"]["membership_status"] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string | null;
          permission?: Database["public"]["Enums"]["household_permission"];
          relationship?: string | null;
          status?: Database["public"]["Enums"]["membership_status"] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_specialists: {
        Row: {
          assigned_at: string;
          assigned_by: string | null;
          household_id: string;
          id: string;
          specialist_id: string;
          status: string;
        };
        Insert: {
          assigned_at?: string;
          assigned_by?: string | null;
          household_id: string;
          id?: string;
          specialist_id: string;
          status?: string;
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string | null;
          household_id?: string;
          id?: string;
          specialist_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_specialists_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_specialists_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_specialists_specialist_id_fkey";
            columns: ["specialist_id"];
            isOneToOne: false;
            referencedRelation: "specialists";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          id: string;
          name: string;
          primary_owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          primary_owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          primary_owner_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          citations: Json;
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          model_name: string | null;
          role: string;
        };
        Insert: {
          citations?: Json;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          model_name?: string | null;
          role: string;
        };
        Update: {
          citations?: Json;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          model_name?: string | null;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          first_name: string | null;
          id: string;
          last_name: string | null;
          preferred_locale: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          first_name?: string | null;
          id: string;
          last_name?: string | null;
          preferred_locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          preferred_locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          channel: string;
          created_at: string;
          id: string;
          remind_at: string;
          roadmap_item_id: string;
          sent_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          id?: string;
          remind_at: string;
          roadmap_item_id: string;
          sent_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          id?: string;
          remind_at?: string;
          roadmap_item_id?: string;
          sent_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_roadmap_item_id_fkey";
            columns: ["roadmap_item_id"];
            isOneToOne: false;
            referencedRelation: "roadmap_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reminders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_translations: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          locale: string;
          resource_id: string;
          review_status: string;
          reviewed_by: string | null;
          summary: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          locale: string;
          resource_id: string;
          review_status?: string;
          reviewed_by?: string | null;
          summary: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          locale?: string;
          resource_id?: string;
          review_status?: string;
          reviewed_by?: string | null;
          summary?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resource_translations_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_translations_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      resources: {
        Row: {
          author_id: string | null;
          category: string;
          created_at: string;
          id: string;
          published_at: string | null;
          reviewed_at: string | null;
          slug: string;
          status: Database["public"]["Enums"]["resource_status"];
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          category: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          reviewed_at?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["resource_status"];
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          reviewed_at?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["resource_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resources_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmap_items: {
        Row: {
          category: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          priority: string | null;
          roadmap_id: string;
          source_id: string | null;
          source_type: string | null;
          status: string;
          title: string;
        };
        Insert: {
          category?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string | null;
          roadmap_id: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title: string;
        };
        Update: {
          category?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          priority?: string | null;
          roadmap_id?: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmap_items_roadmap_id_fkey";
            columns: ["roadmap_id"];
            isOneToOne: false;
            referencedRelation: "roadmaps";
            referencedColumns: ["id"];
          },
        ];
      };
      roadmaps: {
        Row: {
          created_at: string;
          dependent_id: string | null;
          household_id: string;
          id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dependent_id?: string | null;
          household_id: string;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dependent_id?: string | null;
          household_id?: string;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roadmaps_dependent_id_fkey";
            columns: ["dependent_id"];
            isOneToOne: false;
            referencedRelation: "dependents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "roadmaps_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      specialists: {
        Row: {
          availability_status: string;
          bio: string | null;
          created_at: string;
          id: string;
          languages: string[];
          specialties: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          availability_status?: string;
          bio?: string | null;
          created_at?: string;
          id?: string;
          languages?: string[];
          specialties?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          availability_status?: string;
          bio?: string | null;
          created_at?: string;
          id?: string;
          languages?: string[];
          specialties?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "specialists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      support_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          sender_id: string;
          support_thread_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          support_thread_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          support_thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_messages_support_thread_id_fkey";
            columns: ["support_thread_id"];
            isOneToOne: false;
            referencedRelation: "support_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      support_threads: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          specialist_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          specialist_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          specialist_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_threads_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_threads_specialist_id_fkey";
            columns: ["specialist_id"];
            isOneToOne: false;
            referencedRelation: "specialists";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_access_household: {
        Args: { target_household: string };
        Returns: boolean;
      };
      complete_household_onboarding: {
        Args: { raw_name: string; raw_policy_version: string };
        Returns: string;
      };
      claim_next_document_processing_job: {
        Args: { worker_identity: string };
        Returns: {
          attempt_count: number;
          dependent_id: string | null;
          document_id: string;
          file_size: number;
          household_id: string;
          job_id: string;
          max_attempts: number;
          mime_type: string;
          original_filename: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      complete_document_processing_job: {
        Args: {
          chunk_rows: Json;
          expected_worker_identity: string;
          final_status: string;
          page_rows: Json;
          target_job_id: string;
        };
        Returns: boolean;
      };
      create_household: { Args: { raw_name: string }; Returns: string };
      fail_document_processing_job: {
        Args: { expected_worker_identity: string; safe_error_code: string; target_job_id: string };
        Returns: boolean;
      };
      get_document_processing_status: {
        Args: { target_document_id: string };
        Returns: {
          attempt_count: number;
          completed_at: string | null;
          failed_at: string | null;
          retryable: boolean;
          started_at: string | null;
          status: string;
        }[];
      };
      is_active_household_member: {
        Args: { target_household: string };
        Returns: boolean;
      };
      is_administrator: { Args: never; Returns: boolean };
      is_assigned_specialist: {
        Args: { target_household: string };
        Returns: boolean;
      };
      queue_document_processing: {
        Args: { target_document_id: string };
        Returns: {
          already_queued: boolean;
          attempt_count: number;
          job_id: string;
          processing_status: string;
        }[];
      };
    };
    Enums: {
      app_role: "member" | "specialist" | "content_editor" | "administrator";
      document_upload_status: "pending" | "uploaded" | "failed" | "archived";
      household_permission: "owner" | "administrator" | "member" | "viewer";
      member_status: "active" | "invited" | "removed";
      membership_status: "active" | "invited" | "removed";
      permission_level: "owner" | "editor" | "viewer";
      processing_status: "pending" | "processing" | "ready" | "failed" | "deleted";
      resource_status: "draft" | "in_review" | "published" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["member", "specialist", "content_editor", "administrator"],
      document_upload_status: ["pending", "uploaded", "failed", "archived"],
      household_permission: ["owner", "administrator", "member", "viewer"],
      member_status: ["active", "invited", "removed"],
      membership_status: ["active", "invited", "removed"],
      permission_level: ["owner", "editor", "viewer"],
      processing_status: ["pending", "processing", "ready", "failed", "deleted"],
      resource_status: ["draft", "in_review", "published", "archived"],
    },
  },
} as const;

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
      ai_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          message_id: string
          rating: number
          reason: string | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id: string
          rating: number
          reason?: string | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          message_id?: string
          rating?: number
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          end_time: string
          household_id: string
          id: string
          meeting_url: string | null
          notes: string | null
          specialist_id: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          household_id: string
          id?: string
          meeting_url?: string | null
          notes?: string | null
          specialist_id?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          household_id?: string
          id?: string
          meeting_url?: string | null
          notes?: string | null
          specialist_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          household_id: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          household_id?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          household_id?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          accepted_at: string
          consent_type: string
          id: string
          ip_hash: string | null
          policy_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type: string
          id?: string
          ip_hash?: string | null
          policy_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          id?: string
          ip_hash?: string | null
          policy_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          dependent_id: string | null
          household_id: string
          id: string
          locale: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dependent_id?: string | null
          household_id: string
          id?: string
          locale?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dependent_id?: string | null
          household_id?: string
          id?: string
          locale?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      dependents: {
        Row: {
          archived_at: string | null
          birth_year: number | null
          created_at: string
          created_by: string
          first_name: string
          grade_level: string | null
          household_id: string
          id: string
          last_name: string | null
          notes: string | null
          preferred_name: string | null
          school_district: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          birth_year?: number | null
          created_at?: string
          created_by: string
          first_name: string
          grade_level?: string | null
          household_id: string
          id?: string
          last_name?: string | null
          notes?: string | null
          preferred_name?: string | null
          school_district?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          birth_year?: number | null
          created_at?: string
          created_by?: string
          first_name?: string
          grade_level?: string | null
          household_id?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          preferred_name?: string | null
          school_district?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analyses: {
        Row: {
          analysis_type: string
          created_at: string
          document_id: string
          id: string
          language: string
          model_name: string | null
          prompt_version: string | null
          status: Database["public"]["Enums"]["processing_status"]
          structured_result: Json | null
          summary: string | null
        }
        Insert: {
          analysis_type: string
          created_at?: string
          document_id: string
          id?: string
          language: string
          model_name?: string | null
          prompt_version?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          structured_result?: Json | null
          summary?: string | null
        }
        Update: {
          analysis_type?: string
          created_at?: string
          document_id?: string
          id?: string
          language?: string
          model_name?: string | null
          prompt_version?: string | null
          status?: Database["public"]["Enums"]["processing_status"]
          structured_result?: Json | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chat_conversations: {
        Row: {
          created_at: string
          created_by: string
          creation_idempotency_key: string
          document_id: string
          household_id: string
          id: string
          language: string
          last_message_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          creation_idempotency_key: string
          document_id: string
          household_id: string
          id?: string
          language: string
          last_message_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          creation_idempotency_key?: string
          document_id?: string
          household_id?: string
          id?: string
          language?: string
          last_message_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chat_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_conversations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_conversations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chat_messages: {
        Row: {
          attempt_count: number
          available_at: string
          citations: Json
          completed_at: string | null
          content: string | null
          conversation_id: string
          created_at: string
          created_by: string | null
          document_id: string
          error_code: string | null
          failed_at: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          in_reply_to_message_id: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          model_identifier: string | null
          provider: string | null
          provider_call_count: number
          result_type: string | null
          role: string
          sequence_number: number
          source_character_count: number
          source_coverage: string
          source_item_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          citations?: Json
          completed_at?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          created_by?: string | null
          document_id: string
          error_code?: string | null
          failed_at?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          in_reply_to_message_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          provider?: string | null
          provider_call_count?: number
          result_type?: string | null
          role: string
          sequence_number: number
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          citations?: Json
          completed_at?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          error_code?: string | null
          failed_at?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          in_reply_to_message_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          provider?: string | null
          provider_call_count?: number
          result_type?: string | null
          role?: string
          sequence_number?: number
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "document_chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_messages_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chat_messages_in_reply_to_message_id_fkey"
            columns: ["in_reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "document_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          character_count: number
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json
          page_id: string | null
          page_number: number
          token_estimate: number | null
        }
        Insert: {
          character_count: number
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json
          page_id?: string | null
          page_number: number
          token_estimate?: number | null
        }
        Update: {
          character_count?: number
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          page_id?: string | null
          page_number?: number
          token_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_page_document_fkey"
            columns: ["page_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document_pages"
            referencedColumns: ["id", "document_id"]
          },
        ]
      }
      document_ocr_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          document_id: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          model_identifier: string | null
          provider: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          provider?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          provider?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_ocr_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          character_count: number
          created_at: string
          document_id: string
          extracted_text: string
          extraction_confidence: number | null
          id: string
          page_number: number
        }
        Insert: {
          character_count: number
          created_at?: string
          document_id: string
          extracted_text: string
          extraction_confidence?: number | null
          id?: string
          page_number: number
        }
        Update: {
          character_count?: number
          created_at?: string
          document_id?: string
          extracted_text?: string
          extraction_confidence?: number | null
          id?: string
          page_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          document_id: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_questions: {
        Row: {
          answer_text: string | null
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          document_id: string
          error_code: string | null
          failed_at: string | null
          household_id: string
          id: string
          language: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          model_identifier: string | null
          prompt_version: string
          provider: string | null
          provider_call_count: number
          question: string
          question_normalized: string
          requested_at: string
          requested_by: string
          source_character_count: number
          source_coverage: string
          source_item_count: number
          source_references: Json
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          answer_text?: string | null
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_code?: string | null
          failed_at?: string | null
          household_id: string
          id?: string
          language: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          prompt_version?: string
          provider?: string | null
          provider_call_count?: number
          question: string
          question_normalized: string
          requested_at?: string
          requested_by: string
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          source_references?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answer_text?: string | null
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          failed_at?: string | null
          household_id?: string
          id?: string
          language?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          prompt_version?: string
          provider?: string | null
          provider_call_count?: number
          question?: string
          question_normalized?: string
          requested_at?: string
          requested_by?: string
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          source_references?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_questions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_questions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_questions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_summaries: {
        Row: {
          attempt_count: number
          available_at: string
          completed_at: string | null
          created_at: string
          document_id: string
          error_code: string | null
          failed_at: string | null
          household_id: string
          id: string
          language: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          model_identifier: string | null
          prompt_version: string
          provider: string | null
          provider_call_count: number
          requested_at: string
          requested_by: string
          source_character_count: number
          source_coverage: string
          source_item_count: number
          source_references: Json
          started_at: string | null
          status: string
          structured_summary: Json | null
          summary_text: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_code?: string | null
          failed_at?: string | null
          household_id: string
          id?: string
          language: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          prompt_version?: string
          provider?: string | null
          provider_call_count?: number
          requested_at?: string
          requested_by: string
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          source_references?: Json
          started_at?: string | null
          status?: string
          structured_summary?: Json | null
          summary_text?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          failed_at?: string | null
          household_id?: string
          id?: string
          language?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          model_identifier?: string | null
          prompt_version?: string
          provider?: string | null
          provider_call_count?: number
          requested_at?: string
          requested_by?: string
          source_character_count?: number
          source_coverage?: string
          source_item_count?: number
          source_references?: Json
          started_at?: string | null
          status?: string
          structured_summary?: Json | null
          summary_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_summaries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summaries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summaries_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_summary_evaluations: {
        Row: {
          checks: Json
          citation_coverage_score: number | null
          completeness_score: number | null
          created_at: string
          document_id: string
          error_code: string | null
          evaluated_at: string | null
          evaluation_version: string
          grounding_score: number | null
          household_id: string
          id: string
          language_score: number | null
          overall_score: number | null
          safety_score: number | null
          status: string
          summary_id: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          checks?: Json
          citation_coverage_score?: number | null
          completeness_score?: number | null
          created_at?: string
          document_id: string
          error_code?: string | null
          evaluated_at?: string | null
          evaluation_version?: string
          grounding_score?: number | null
          household_id: string
          id?: string
          language_score?: number | null
          overall_score?: number | null
          safety_score?: number | null
          status?: string
          summary_id: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          checks?: Json
          citation_coverage_score?: number | null
          completeness_score?: number | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          evaluated_at?: string | null
          evaluation_version?: string
          grounding_score?: number | null
          household_id?: string
          id?: string
          language_score?: number | null
          overall_score?: number | null
          safety_score?: number | null
          status?: string
          summary_id?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_summary_evaluations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summary_evaluations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summary_evaluations_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: true
            referencedRelation: "document_summaries"
            referencedColumns: ["id"]
          },
        ]
      }
      document_summary_reviews: {
        Row: {
          accuracy_rating: number | null
          citation_rating: number | null
          completeness_rating: number | null
          created_at: string
          decision: string | null
          document_id: string
          feedback: string | null
          household_id: string
          id: string
          issue_categories: string[]
          language_rating: number | null
          overall_rating: number | null
          review_status: string
          reviewed_by: string
          submitted_at: string | null
          summary_id: string
          updated_at: string
        }
        Insert: {
          accuracy_rating?: number | null
          citation_rating?: number | null
          completeness_rating?: number | null
          created_at?: string
          decision?: string | null
          document_id: string
          feedback?: string | null
          household_id: string
          id?: string
          issue_categories?: string[]
          language_rating?: number | null
          overall_rating?: number | null
          review_status?: string
          reviewed_by: string
          submitted_at?: string | null
          summary_id: string
          updated_at?: string
        }
        Update: {
          accuracy_rating?: number | null
          citation_rating?: number | null
          completeness_rating?: number | null
          created_at?: string
          decision?: string | null
          document_id?: string
          feedback?: string | null
          household_id?: string
          id?: string
          issue_categories?: string[]
          language_rating?: number | null
          overall_rating?: number | null
          review_status?: string
          reviewed_by?: string
          submitted_at?: string | null
          summary_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_summary_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summary_reviews_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_summary_reviews_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "document_summaries"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          dependent_id: string | null
          detected_language: string | null
          document_type: string | null
          file_size: number
          household_id: string
          id: string
          mime_type: string
          original_filename: string
          processing_status: string
          storage_bucket: string
          storage_path: string
          title: string
          updated_at: string
          upload_status: Database["public"]["Enums"]["document_upload_status"]
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dependent_id?: string | null
          detected_language?: string | null
          document_type?: string | null
          file_size: number
          household_id: string
          id?: string
          mime_type: string
          original_filename: string
          processing_status?: string
          storage_bucket?: string
          storage_path: string
          title: string
          updated_at?: string
          upload_status?: Database["public"]["Enums"]["document_upload_status"]
          uploaded_by: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dependent_id?: string | null
          detected_language?: string | null
          document_type?: string | null
          file_size?: number
          household_id?: string
          id?: string
          mime_type?: string
          original_filename?: string
          processing_status?: string
          storage_bucket?: string
          storage_path?: string
          title?: string
          updated_at?: string
          upload_status?: Database["public"]["Enums"]["document_upload_status"]
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          invited_by: string | null
          joined_at: string | null
          permission: Database["public"]["Enums"]["household_permission"]
          relationship: string | null
          status: Database["public"]["Enums"]["membership_status"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          permission?: Database["public"]["Enums"]["household_permission"]
          relationship?: string | null
          status?: Database["public"]["Enums"]["membership_status"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          permission?: Database["public"]["Enums"]["household_permission"]
          relationship?: string | null
          status?: Database["public"]["Enums"]["membership_status"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_specialists: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          household_id: string
          id: string
          specialist_id: string
          status: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          household_id: string
          id?: string
          specialist_id: string
          status?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          household_id?: string
          id?: string
          specialist_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_specialists_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_specialists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_specialists_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          primary_owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          primary_owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          primary_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          model_name: string | null
          role: string
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model_name?: string | null
          role: string
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model_name?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          preferred_locale: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          preferred_locale?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: string
          created_at: string
          id: string
          remind_at: string
          roadmap_item_id: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          remind_at: string
          roadmap_item_id: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          remind_at?: string
          roadmap_item_id?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_roadmap_item_id_fkey"
            columns: ["roadmap_item_id"]
            isOneToOne: false
            referencedRelation: "roadmap_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_translations: {
        Row: {
          body: string
          created_at: string
          id: string
          locale: string
          resource_id: string
          review_status: string
          reviewed_by: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          locale: string
          resource_id: string
          review_status?: string
          reviewed_by?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          locale?: string
          resource_id?: string
          review_status?: string
          reviewed_by?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_translations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_translations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          author_id: string | null
          category: string
          created_at: string
          id: string
          published_at: string | null
          reviewed_at: string | null
          slug: string
          status: Database["public"]["Enums"]["resource_status"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category: string
          created_at?: string
          id?: string
          published_at?: string | null
          reviewed_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string
          created_at?: string
          id?: string
          published_at?: string | null
          reviewed_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["resource_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmap_items: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string
          dependent_id: string | null
          description: string | null
          due_date: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          priority: string
          roadmap_id: string
          sort_order: number
          source_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          dependent_id?: string | null
          description?: string | null
          due_date?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          priority?: string
          roadmap_id: string
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dependent_id?: string | null
          description?: string | null
          due_date?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          priority?: string
          roadmap_id?: string
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_items_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_items_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      roadmaps: {
        Row: {
          created_at: string
          dependent_id: string | null
          household_id: string
          id: string
          is_household_default: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dependent_id?: string | null
          household_id: string
          id?: string
          is_household_default?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dependent_id?: string | null
          household_id?: string
          id?: string
          is_household_default?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadmaps_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmaps_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      specialists: {
        Row: {
          availability_status: string
          bio: string | null
          created_at: string
          id: string
          languages: string[]
          specialties: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          availability_status?: string
          bio?: string | null
          created_at?: string
          id?: string
          languages?: string[]
          specialties?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          availability_status?: string
          bio?: string | null
          created_at?: string
          id?: string
          languages?: string[]
          specialties?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "specialists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string
          support_thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id: string
          support_thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
          support_thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_support_thread_id_fkey"
            columns: ["support_thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          household_id: string
          id: string
          specialist_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          specialist_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          specialist_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progress: {
        Row: {
          completed_at: string | null
          completed_sections: string[]
          course_key: string
          id: string
          last_section: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_sections?: string[]
          course_key: string
          id?: string
          last_section?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_sections?: string[]
          course_key?: string
          id?: string
          last_section?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_roadmap_item: {
        Args: { expected_updated_at: string; target_item_id: string }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      can_access_household: {
        Args: { target_household: string }
        Returns: boolean
      }
      claim_next_document_chat_message: {
        Args: { worker_identity: string }
        Returns: {
          attempt_count: number
          conversation_id: string
          document_id: string
          household_id: string
          language: string
          max_attempts: number
          message_id: string
        }[]
      }
      claim_next_document_ocr_job: {
        Args: { worker_identity: string }
        Returns: {
          attempt_count: number
          dependent_id: string
          document_id: string
          file_size: number
          household_id: string
          job_id: string
          max_attempts: number
          mime_type: string
          original_filename: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      claim_next_document_processing_job: {
        Args: { worker_identity: string }
        Returns: {
          attempt_count: number
          dependent_id: string
          document_id: string
          file_size: number
          household_id: string
          job_id: string
          max_attempts: number
          mime_type: string
          original_filename: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      claim_next_document_question_job: {
        Args: { worker_identity: string }
        Returns: {
          attempt_count: number
          document_id: string
          household_id: string
          language: string
          max_attempts: number
          prompt_version: string
          question: string
          question_id: string
        }[]
      }
      claim_next_document_summary_job: {
        Args: { worker_identity: string }
        Returns: {
          attempt_count: number
          document_id: string
          household_id: string
          language: string
          max_attempts: number
          prompt_version: string
          summary_id: string
        }[]
      }
      complete_document_chat_message: {
        Args: {
          completed_citations: Json
          completed_content: string
          completed_model_identifier: string
          completed_provider: string
          completed_provider_call_count: number
          completed_result_type: string
          completed_source_character_count: number
          completed_source_coverage: string
          completed_source_item_count: number
          expected_worker_identity: string
          target_message_id: string
        }
        Returns: boolean
      }
      complete_document_ocr_job: {
        Args: {
          chunk_rows: Json
          completed_model_identifier: string
          completed_provider: string
          expected_worker_identity: string
          page_rows: Json
          target_job_id: string
        }
        Returns: boolean
      }
      complete_document_processing_job: {
        Args: {
          chunk_rows: Json
          expected_worker_identity: string
          final_status: string
          page_rows: Json
          target_job_id: string
        }
        Returns: boolean
      }
      complete_document_question_job: {
        Args: {
          completed_answer_text: string
          completed_model_identifier: string
          completed_provider: string
          completed_provider_call_count: number
          completed_source_character_count: number
          completed_source_coverage: string
          completed_source_item_count: number
          completed_source_references: Json
          expected_worker_identity: string
          target_question_id: string
        }
        Returns: boolean
      }
      complete_document_summary_job: {
        Args: {
          completed_model_identifier: string
          completed_provider: string
          completed_provider_call_count: number
          completed_source_character_count: number
          completed_source_coverage: string
          completed_source_item_count: number
          completed_source_references: Json
          completed_structured_summary: Json
          completed_summary_text: string
          expected_worker_identity: string
          target_summary_id: string
        }
        Returns: boolean
      }
      complete_household_onboarding: {
        Args: {
          raw_first_name?: string
          raw_last_name?: string
          raw_name: string
          raw_policy_version: string
          raw_preferred_locale?: string
          raw_timezone?: string
        }
        Returns: string
      }
      create_document_chat_conversation: {
        Args: {
          initial_message_content: string
          requested_idempotency_key: string
          requested_language: string
          target_document_id: string
        }
        Returns: {
          already_exists: boolean
          assistant_message_id: string
          conversation_id: string
        }[]
      }
      create_household: { Args: { raw_name: string }; Returns: string }
      create_roadmap_item: {
        Args: {
          input_assigned_to?: string
          input_category?: string
          input_dependent_id?: string
          input_description?: string
          input_due_date?: string
          input_idempotency_key?: string
          input_priority?: string
          input_status?: string
          input_title: string
        }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      evaluate_document_summary: {
        Args: { requested_language: string; target_document_id: string }
        Returns: boolean
      }
      fail_document_chat_message: {
        Args: {
          expected_worker_identity: string
          safe_error_code: string
          target_message_id: string
        }
        Returns: boolean
      }
      fail_document_ocr_job: {
        Args: {
          expected_worker_identity: string
          safe_error_code: string
          target_job_id: string
        }
        Returns: boolean
      }
      fail_document_processing_job: {
        Args: {
          expected_worker_identity: string
          safe_error_code: string
          target_job_id: string
        }
        Returns: boolean
      }
      fail_document_question_job: {
        Args: {
          expected_worker_identity: string
          safe_error_code: string
          target_question_id: string
        }
        Returns: boolean
      }
      fail_document_summary_job: {
        Args: {
          expected_worker_identity: string
          safe_error_code: string
          target_summary_id: string
        }
        Returns: boolean
      }
      get_document_chat_conversation: {
        Args: { target_conversation_id: string; target_document_id: string }
        Returns: {
          citations: Json
          completed_at: string
          content: string
          conversation_id: string
          created_at: string
          language: string
          message_id: string
          result_type: string
          retryable: boolean
          role: string
          source_coverage: string
          status: string
          title: string
        }[]
      }
      get_document_chat_conversations: {
        Args: { target_document_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          has_failed_response: boolean
          has_pending_response: boolean
          language: string
          last_message_at: string
          message_count: number
          title: string
        }[]
      }
      get_document_chat_worker_history: {
        Args: { target_conversation_id: string }
        Returns: {
          content: string
          role: string
          sequence_number: number
        }[]
      }
      get_document_citation_evidence: {
        Args: {
          target_citation_index: number
          target_document_id: string
          target_owner_id: string
          target_owner_type: string
        }
        Returns: {
          availability: string
          can_open_original: boolean
          document_name: string
          excerpt: string
          excerpt_shortened: boolean
          is_partial_document: boolean
          page_number: number
          source_kind: string
        }[]
      }
      get_document_extraction_availability: {
        Args: { target_document_id: string }
        Returns: {
          has_sources: boolean
        }[]
      }
      get_document_ocr_status: {
        Args: { target_document_id: string }
        Returns: {
          attempt_count: number
          completed_at: string
          failed_at: string
          retryable: boolean
          started_at: string
          status: string
        }[]
      }
      get_document_processing_status: {
        Args: { target_document_id: string }
        Returns: {
          attempt_count: number
          completed_at: string
          failed_at: string
          retryable: boolean
          started_at: string
          status: string
        }[]
      }
      get_document_question_status: {
        Args: { target_question_id: string }
        Returns: {
          completed_at: string
          failed_at: string
          question_id: string
          requested_at: string
          retryable: boolean
          source_coverage: string
          started_at: string
          status: string
        }[]
      }
      get_document_questions: {
        Args: { target_document_id: string }
        Returns: {
          answer_text: string
          completed_at: string
          language: string
          question: string
          question_id: string
          retryable: boolean
          source_coverage: string
          source_references: Json
          status: string
        }[]
      }
      get_document_summary_status: {
        Args: { requested_language: string; target_document_id: string }
        Returns: {
          completed_at: string
          failed_at: string
          language: string
          requested_at: string
          retryable: boolean
          source_coverage: string
          started_at: string
          status: string
          summary_id: string
        }[]
      }
      is_active_household_member: {
        Args: { target_household: string }
        Returns: boolean
      }
      is_administrator: { Args: never; Returns: boolean }
      is_assigned_specialist: {
        Args: { target_household: string }
        Returns: boolean
      }
      list_roadmap_assignable_members: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      list_roadmap_items: {
        Args: {
          input_archived?: boolean
          input_assignee?: string
          input_category?: string
          input_completed?: boolean
          input_dependent_id?: string
          input_item_id?: string
          input_overdue?: boolean
          input_page?: number
          input_priority?: string
          input_sort?: string
          input_status?: string
        }
        Returns: {
          archived_at: string
          assigned_to: string
          assignee_is_former: boolean
          assignee_name: string
          can_archive: boolean
          can_edit: boolean
          can_reorder: boolean
          can_restore: boolean
          category: string
          completed_at: string
          created_at: string
          created_by: string
          dependent_id: string
          dependent_name: string
          description: string
          due_date: string
          id: string
          priority: string
          sort_order: number
          status: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      queue_document_ocr: {
        Args: { target_document_id: string }
        Returns: {
          already_queued: boolean
          attempt_count: number
          job_id: string
          ocr_status: string
        }[]
      }
      queue_document_processing: {
        Args: { target_document_id: string }
        Returns: {
          already_queued: boolean
          attempt_count: number
          job_id: string
          processing_status: string
        }[]
      }
      record_training_progress: {
        Args: { mark_completed?: boolean; target_section: string }
        Returns: {
          completed_at: string
          completed_sections: string[]
          last_section: string
        }[]
      }
      reorder_roadmap_items: {
        Args: {
          expected_updated_at: string
          input_direction: string
          target_item_id: string
        }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      request_document_question: {
        Args: {
          requested_language: string
          requested_question: string
          target_document_id: string
        }
        Returns: {
          already_active: boolean
          question_id: string
          question_status: string
          reused_completed: boolean
        }[]
      }
      request_document_summary: {
        Args: { requested_language: string; target_document_id: string }
        Returns: {
          already_active: boolean
          reused_completed: boolean
          summary_id: string
          summary_status: string
        }[]
      }
      restore_roadmap_item: {
        Args: { expected_updated_at: string; target_item_id: string }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      retry_document_chat_response: {
        Args: {
          target_conversation_id: string
          target_document_id: string
          target_message_id: string
        }
        Returns: boolean
      }
      send_document_chat_message: {
        Args: {
          requested_idempotency_key: string
          requested_message_content: string
          target_conversation_id: string
          target_document_id: string
        }
        Returns: {
          already_exists: boolean
          assistant_message_id: string
        }[]
      }
      update_roadmap_item: {
        Args: {
          expected_updated_at: string
          input_assigned_to?: string
          input_category?: string
          input_dependent_id?: string
          input_description?: string
          input_due_date?: string
          input_priority?: string
          input_status?: string
          input_title: string
          target_item_id: string
        }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      upsert_document_summary_review: {
        Args: {
          requested_accuracy_rating: number
          requested_citation_rating: number
          requested_completeness_rating: number
          requested_decision: string
          requested_feedback: string
          requested_issue_categories: string[]
          requested_language: string
          requested_language_rating: number
          requested_overall_rating: number
          target_document_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "member" | "specialist" | "content_editor" | "administrator"
      document_upload_status: "pending" | "uploaded" | "failed" | "archived"
      household_permission: "owner" | "administrator" | "member" | "viewer"
      member_status: "active" | "invited" | "removed"
      membership_status: "active" | "invited" | "removed"
      permission_level: "owner" | "editor" | "viewer"
      processing_status:
        | "pending"
        | "processing"
        | "ready"
        | "failed"
        | "deleted"
      resource_status: "draft" | "in_review" | "published" | "archived"
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
    Enums: {
      app_role: ["member", "specialist", "content_editor", "administrator"],
      document_upload_status: ["pending", "uploaded", "failed", "archived"],
      household_permission: ["owner", "administrator", "member", "viewer"],
      member_status: ["active", "invited", "removed"],
      membership_status: ["active", "invited", "removed"],
      permission_level: ["owner", "editor", "viewer"],
      processing_status: [
        "pending",
        "processing",
        "ready",
        "failed",
        "deleted",
      ],
      resource_status: ["draft", "in_review", "published", "archived"],
    },
  },
} as const

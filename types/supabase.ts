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
      appointments: {
        Row: {
          appointment_date: string
          booked_by: string | null
          created_at: string
          department_id: string | null
          doctor_id: string
          fee_status: string
          id: string
          organization_id: string
          patient_id: string
          patient_notes: string | null
          payment_status: string | null
          schedule_id: string | null
          source: string
          status: string
          time_slot: string | null
          token_number: string
        }
        Insert: {
          appointment_date?: string
          booked_by?: string | null
          created_at?: string
          department_id?: string | null
          doctor_id: string
          fee_status?: string
          id?: string
          organization_id: string
          patient_id: string
          patient_notes?: string | null
          payment_status?: string | null
          schedule_id?: string | null
          source?: string
          status?: string
          time_slot?: string | null
          token_number: string
        }
        Update: {
          appointment_date?: string
          booked_by?: string | null
          created_at?: string
          department_id?: string | null
          doctor_id?: string
          fee_status?: string
          id?: string
          organization_id?: string
          patient_id?: string
          patient_notes?: string | null
          payment_status?: string | null
          schedule_id?: string | null
          source?: string
          status?: string
          time_slot?: string | null
          token_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "doctor_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_devices: {
        Row: {
          auth_token: string | null
          created_at: string
          device_ip: string
          device_location: string
          device_name: string
          id: string
          is_active: boolean
          last_ping_at: string | null
          organization_id: string
          port: number
        }
        Insert: {
          auth_token?: string | null
          created_at?: string
          device_ip: string
          device_location: string
          device_name: string
          id?: string
          is_active?: boolean
          last_ping_at?: string | null
          organization_id: string
          port?: number
        }
        Update: {
          auth_token?: string | null
          created_at?: string
          device_ip?: string
          device_location?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_ping_at?: string | null
          organization_id?: string
          port?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          device_id: string | null
          employee_id: string
          id: string
          is_late: boolean
          organization_id: string
          punch_time: string
          punch_type: string
          verification_mode: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          employee_id: string
          id?: string
          is_late?: boolean
          organization_id: string
          punch_time: string
          punch_type?: string
          verification_mode?: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          employee_id?: string
          id?: string
          is_late?: boolean
          organization_id?: string
          punch_time?: string
          punch_type?: string
          verification_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "attendance_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          ip_address: string | null
          module: string
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: number
          ip_address?: string | null
          module: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: number
          ip_address?: string | null
          module?: string
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bed_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          bed_id: string | null
          cabin_id: string | null
          daily_charge: number
          id: string
          organization_id: string
          patient_id: string
          status: string
          vacated_at: string | null
          visit_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          bed_id?: string | null
          cabin_id?: string | null
          daily_charge: number
          id?: string
          organization_id: string
          patient_id: string
          status?: string
          vacated_at?: string | null
          visit_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          bed_id?: string | null
          cabin_id?: string | null
          daily_charge?: number
          id?: string
          organization_id?: string
          patient_id?: string
          status?: string
          vacated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bed_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_cabin_id_fkey"
            columns: ["cabin_id"]
            isOneToOne: false
            referencedRelation: "cabins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      bed_types: {
        Row: {
          created_at: string
          daily_rate: number
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          daily_rate: number
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          daily_rate?: number
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bed_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          admitted_at: string | null
          bed_number: string
          bed_type: string
          daily_rate: number
          id: string
          organization_id: string | null
          patient_name: string | null
          status: string
          ward_name: string
        }
        Insert: {
          admitted_at?: string | null
          bed_number: string
          bed_type?: string
          daily_rate?: number
          id?: string
          organization_id?: string | null
          patient_name?: string | null
          status?: string
          ward_name: string
        }
        Update: {
          admitted_at?: string | null
          bed_number?: string
          bed_type?: string
          daily_rate?: number
          id?: string
          organization_id?: string | null
          patient_name?: string | null
          status?: string
          ward_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cabins: {
        Row: {
          amenities: string | null
          cabin_number: string
          cabin_type: string
          created_at: string
          daily_rate: number
          floor_number: string
          id: string
          organization_id: string
          status: string
        }
        Insert: {
          amenities?: string | null
          cabin_number: string
          cabin_type: string
          created_at?: string
          daily_rate: number
          floor_number: string
          id?: string
          organization_id: string
          status?: string
        }
        Update: {
          amenities?: string | null
          cabin_number?: string
          cabin_type?: string
          created_at?: string
          daily_rate?: number
          floor_number?: string
          id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          cash_collected: number
          cash_handed_over: number | null
          cashier_id: string
          created_at: string
          id: string
          mfs_collected: number
          opening_float: number
          organization_id: string
          shift_end: string | null
          shift_start: string
          status: string
          supervisor_verified_by: string | null
        }
        Insert: {
          cash_collected?: number
          cash_handed_over?: number | null
          cashier_id: string
          created_at?: string
          id?: string
          mfs_collected?: number
          opening_float?: number
          organization_id: string
          shift_end?: string | null
          shift_start: string
          status?: string
          supervisor_verified_by?: string | null
        }
        Update: {
          cash_collected?: number
          cash_handed_over?: number | null
          cashier_id?: string
          created_at?: string
          id?: string
          mfs_collected?: number
          opening_float?: number
          organization_id?: string
          shift_end?: string | null
          shift_start?: string
          status?: string
          supervisor_verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_supervisor_verified_by_fkey"
            columns: ["supervisor_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_alerts: {
        Row: {
          alert_type: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message: string
          organization_id: string
          patient_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message: string
          organization_id: string
          patient_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message?: string
          organization_id?: string
          patient_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_notes: {
        Row: {
          amendment_reason: string | null
          author_id: string | null
          author_name: string | null
          created_at: string
          id: string
          is_amended: boolean
          note_content: string
          note_type: string
          organization_id: string
          original_note_id: string | null
          patient_id: string
          visit_id: string | null
        }
        Insert: {
          amendment_reason?: string | null
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          is_amended?: boolean
          note_content: string
          note_type?: string
          organization_id: string
          original_note_id?: string | null
          patient_id: string
          visit_id?: string | null
        }
        Update: {
          amendment_reason?: string | null
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          id?: string
          is_amended?: boolean
          note_content?: string
          note_type?: string
          organization_id?: string
          original_note_id?: string | null
          patient_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_original_note_id_fkey"
            columns: ["original_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      department_services: {
        Row: {
          created_at: string
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          organization_id: string
          service_name: string
        }
        Insert: {
          created_at?: string
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          service_name: string
        }
        Update: {
          created_at?: string
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          service_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_services_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_services_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_services_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "department_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          organization_id: string
          slug: string | null
          type: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          organization_id: string
          slug?: string | null
          type?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          organization_id?: string
          slug?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_categories: {
        Row: {
          category_code: string
          category_name: string
          created_at: string
          description: string | null
          id: string
          organization_id: string
        }
        Insert: {
          category_code: string
          category_name: string
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          category_code?: string
          category_name?: string
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          status: string
          test_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price: number
          status?: string
          test_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          status?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_order_items_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_orders: {
        Row: {
          created_at: string
          id: string
          order_number: string
          organization_id: string
          patient_id: string
          referred_by_doctor_id: string | null
          status: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_number: string
          organization_id: string
          patient_id: string
          referred_by_doctor_id?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_number?: string
          organization_id?: string
          patient_id?: string
          referred_by_doctor_id?: string | null
          status?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_orders_referred_by_doctor_id_fkey"
            columns: ["referred_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_orders_referred_by_doctor_id_fkey"
            columns: ["referred_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_orders_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_report_verifications: {
        Row: {
          id: string
          order_item_id: string
          remarks: string | null
          signature_hash: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          id?: string
          order_item_id: string
          remarks?: string | null
          signature_hash: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          id?: string
          order_item_id?: string
          remarks?: string | null
          signature_hash?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_report_verifications_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "diagnostic_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_report_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_result_values: {
        Row: {
          created_at: string
          id: string
          is_abnormal: boolean
          observed_value: string
          parameter_id: string
          result_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_abnormal?: boolean
          observed_value: string
          parameter_id: string
          result_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_abnormal?: boolean
          observed_value?: string
          parameter_id?: string
          result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_result_values_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_test_parameters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_result_values_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_results"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_results: {
        Row: {
          created_at: string
          descriptive_findings: string | null
          entered_at: string | null
          id: string
          order_item_id: string
          technician_id: string | null
        }
        Insert: {
          created_at?: string
          descriptive_findings?: string | null
          entered_at?: string | null
          id?: string
          order_item_id: string
          technician_id?: string | null
        }
        Update: {
          created_at?: string
          descriptive_findings?: string | null
          entered_at?: string | null
          id?: string
          order_item_id?: string
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_results_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_test_parameters: {
        Row: {
          created_at: string
          display_order: number
          id: string
          parameter_name: string
          reference_range_child: string | null
          reference_range_female: string | null
          reference_range_male: string | null
          test_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          parameter_name: string
          reference_range_child?: string | null
          reference_range_female?: string | null
          reference_range_male?: string | null
          test_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          parameter_name?: string
          reference_range_child?: string | null
          reference_range_female?: string | null
          reference_range_male?: string | null
          test_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_test_parameters_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_tests: {
        Row: {
          category_id: string
          created_at: string
          delivery_turnaround_hours: number
          has_numerical_parameters: boolean
          id: string
          is_active: boolean
          organization_id: string
          price: number
          report_template: string | null
          specimen_type: string
          test_code: string
          test_name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          delivery_turnaround_hours?: number
          has_numerical_parameters?: boolean
          id?: string
          is_active?: boolean
          organization_id: string
          price: number
          report_template?: string | null
          specimen_type?: string
          test_code: string
          test_name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          delivery_turnaround_hours?: number
          has_numerical_parameters?: boolean
          id?: string
          is_active?: boolean
          organization_id?: string
          price?: number
          report_template?: string | null
          specimen_type?: string
          test_code?: string
          test_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_tests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_tests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_summaries: {
        Row: {
          approved_by: string | null
          condition_at_discharge: string | null
          created_at: string
          discharge_advice: string | null
          discharge_type: string
          final_diagnosis: string
          followup_instructions: string | null
          hospital_course: string | null
          id: string
          prepared_by: string | null
          visit_id: string
        }
        Insert: {
          approved_by?: string | null
          condition_at_discharge?: string | null
          created_at?: string
          discharge_advice?: string | null
          discharge_type: string
          final_diagnosis: string
          followup_instructions?: string | null
          hospital_course?: string | null
          id?: string
          prepared_by?: string | null
          visit_id: string
        }
        Update: {
          approved_by?: string | null
          condition_at_discharge?: string | null
          created_at?: string
          discharge_advice?: string | null
          discharge_type?: string
          final_diagnosis?: string
          followup_instructions?: string | null
          hospital_course?: string | null
          id?: string
          prepared_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discharge_summaries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_summaries_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_summaries_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_commission_rules: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          doctor_id: string
          id: string
          is_active: boolean
          organization_id: string
          service_category: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          doctor_id: string
          id?: string
          is_active?: boolean
          organization_id: string
          service_category: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          doctor_id?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          service_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_commission_rules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commission_rules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_commissions: {
        Row: {
          bill_amount: number
          commission_amount: number
          created_at: string
          doctor_id: string
          id: string
          organization_id: string
          paid_at: string | null
          payout_status: string
          reference_id: string
          service_category: string
        }
        Insert: {
          bill_amount: number
          commission_amount: number
          created_at?: string
          doctor_id: string
          id?: string
          organization_id: string
          paid_at?: string | null
          payout_status?: string
          reference_id: string
          service_category: string
        }
        Update: {
          bill_amount?: number
          commission_amount?: number
          created_at?: string
          doctor_id?: string
          id?: string
          organization_id?: string
          paid_at?: string | null
          payout_status?: string
          reference_id?: string
          service_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_commissions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_departments: {
        Row: {
          created_at: string
          department_id: string
          doctor_id: string
          id: string
          is_primary: boolean
        }
        Insert: {
          created_at?: string
          department_id: string
          doctor_id: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          created_at?: string
          department_id?: string
          doctor_id?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "doctor_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "doctor_departments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_departments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_leaves: {
        Row: {
          created_at: string
          doctor_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_leaves_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_leaves_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_schedules: {
        Row: {
          avg_consultation_minutes: number
          created_at: string
          day_of_week: string
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean
          max_tokens: number
          organization_id: string
          room_number: string | null
          start_time: string
        }
        Insert: {
          avg_consultation_minutes?: number
          created_at?: string
          day_of_week: string
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          organization_id: string
          room_number?: string | null
          start_time: string
        }
        Update: {
          avg_consultation_minutes?: number
          created_at?: string
          day_of_week?: string
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean
          max_tokens?: number
          organization_id?: string
          room_number?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_schedules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_schedules_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          bmdc_reg_number: string
          commission_rate: number
          created_at: string
          degrees: string
          department_id: string
          designation: string
          doctor_code: string
          experience_years: number | null
          followup_fee: number | null
          full_name: string
          id: string
          is_active: boolean
          is_public: boolean
          opd_fee: number
          organization_id: string
          public_bio: string | null
          report_fee: number | null
          room_number: string
          specialization: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          bmdc_reg_number: string
          commission_rate?: number
          created_at?: string
          degrees: string
          department_id: string
          designation: string
          doctor_code: string
          experience_years?: number | null
          followup_fee?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          opd_fee?: number
          organization_id: string
          public_bio?: string | null
          report_fee?: number | null
          room_number: string
          specialization: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          bmdc_reg_number?: string
          commission_rate?: number
          created_at?: string
          degrees?: string
          department_id?: string
          designation?: string
          doctor_code?: string
          experience_years?: number | null
          followup_fee?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          opd_fee?: number
          organization_id?: string
          public_bio?: string | null
          report_fee?: number | null
          room_number?: string
          specialization?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "doctors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_print_logs: {
        Row: {
          client_ip: string | null
          created_at: string
          document_reference_id: string
          document_type: string
          id: string
          is_reprint: boolean
          organization_id: string
          patient_id: string | null
          print_format: string
          printed_by: string | null
          reprint_reason: string | null
        }
        Insert: {
          client_ip?: string | null
          created_at?: string
          document_reference_id: string
          document_type: string
          id?: string
          is_reprint?: boolean
          organization_id: string
          patient_id?: string | null
          print_format?: string
          printed_by?: string | null
          reprint_reason?: string | null
        }
        Update: {
          client_ip?: string | null
          created_at?: string
          document_reference_id?: string
          document_type?: string
          id?: string
          is_reprint?: boolean
          organization_id?: string
          patient_id?: string | null
          print_format?: string
          printed_by?: string | null
          reprint_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_print_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_print_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_designations: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          organization_id: string
          title: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          organization_id: string
          title: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_designations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_designations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_designations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "employee_designations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          basic_salary: number
          biometric_device_pin: string | null
          created_at: string
          department_id: string | null
          designation_id: string | null
          email: string | null
          employee_code: string
          full_name: string
          house_rent: number
          id: string
          joining_date: string
          medical_allowance: number
          organization_id: string
          phone: string
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          basic_salary?: number
          biometric_device_pin?: string | null
          created_at?: string
          department_id?: string | null
          designation_id?: string | null
          email?: string | null
          employee_code: string
          full_name: string
          house_rent?: number
          id?: string
          joining_date: string
          medical_allowance?: number
          organization_id: string
          phone: string
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          basic_salary?: number
          biometric_device_pin?: string | null
          created_at?: string
          department_id?: string | null
          designation_id?: string | null
          email?: string | null
          employee_code?: string
          full_name?: string
          house_rent?: number
          id?: string
          joining_date?: string
          medical_allowance?: number
          organization_id?: string
          phone?: string
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "employees_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "employee_designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_by: string
          category_id: string
          created_at: string
          expense_date: string
          id: string
          organization_id: string
          paid_to: string | null
          title: string
          voucher_number: string | null
        }
        Insert: {
          amount: number
          approved_by: string
          category_id: string
          created_at?: string
          expense_date?: string
          id?: string
          organization_id: string
          paid_to?: string | null
          title: string
          voucher_number?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string
          category_id?: string
          created_at?: string
          expense_date?: string
          id?: string
          organization_id?: string
          paid_to?: string | null
          title?: string
          voucher_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          current_quantity: number
          id: string
          item_name: string
          min_stock_alert: number
          organization_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          current_quantity?: number
          id?: string
          item_name: string
          min_stock_alert?: number
          organization_id: string
          unit?: string
        }
        Update: {
          created_at?: string
          current_quantity?: number
          id?: string
          item_name?: string
          min_stock_alert?: number
          organization_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          organization_id: string
          quantity: number
          transaction_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          organization_id: string
          quantity: number
          transaction_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          item_name: string
          quantity: number
          reference_id: string | null
          service_category: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          item_name: string
          quantity?: number
          reference_id?: string | null
          service_category: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          item_name?: string
          quantity?: number
          reference_id?: string | null
          service_category?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          discount_amount: number
          due_amount: number
          grand_total: number | null
          id: string
          invoice_number: string
          is_void: boolean
          organization_id: string
          paid_amount: number
          patient_id: string
          payment_method: string
          payment_status: string
          status: string | null
          subtotal: number
          total_amount: number
          updated_at: string | null
          void_reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_amount?: number
          grand_total?: number | null
          id?: string
          invoice_number: string
          is_void?: boolean
          organization_id: string
          paid_amount?: number
          patient_id: string
          payment_method?: string
          payment_status?: string
          status?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          void_reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_amount?: number
          grand_total?: number | null
          id?: string
          invoice_number?: string
          is_void?: boolean
          organization_id?: string
          paid_amount?: number
          patient_id?: string
          payment_method?: string
          payment_status?: string
          status?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tests: {
        Row: {
          category_name: string
          code: string
          delivery_hours: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
          price: number
          reference_range: string | null
          sample_type: string
          unit: string | null
        }
        Insert: {
          category_name: string
          code: string
          delivery_hours?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          price: number
          reference_range?: string | null
          sample_type?: string
          unit?: string | null
        }
        Update: {
          category_name?: string
          code?: string
          delivery_hours?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          price?: number
          reference_range?: string | null
          sample_type?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_tests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          organization_id: string
          reason: string
          start_date: string
          status: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          organization_id: string
          reason: string
          start_date: string
          status?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          organization_id?: string
          reason?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_quota_days: number
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          annual_quota_days?: number
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          annual_quota_days?: number
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_batches: {
        Row: {
          batch_number: string
          created_at: string
          current_stock: number
          expiry_date: string
          id: string
          medicine_id: string
          mrp: number
          organization_id: string
          purchase_rate: number
        }
        Insert: {
          batch_number: string
          created_at?: string
          current_stock?: number
          expiry_date: string
          id?: string
          medicine_id: string
          mrp: number
          organization_id: string
          purchase_rate: number
        }
        Update: {
          batch_number?: string
          created_at?: string
          current_stock?: number
          expiry_date?: string
          id?: string
          medicine_id?: string
          mrp?: number
          organization_id?: string
          purchase_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicine_batches_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicine_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_generics: {
        Row: {
          created_at: string
          generic_name: string
          id: string
          therapeutic_class: string | null
        }
        Insert: {
          created_at?: string
          generic_name: string
          id?: string
          therapeutic_class?: string | null
        }
        Update: {
          created_at?: string
          generic_name?: string
          id?: string
          therapeutic_class?: string | null
        }
        Relationships: []
      }
      medicine_suppliers: {
        Row: {
          address: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          organization_id: string
          phone: string
        }
        Insert: {
          address?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          phone: string
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          brand_name: string
          category: string
          current_stock: number
          generic_name: string
          id: string
          is_active: boolean
          manufacturer: string
          organization_id: string
          reorder_level: number
          strength: string | null
          unit_price: number
        }
        Insert: {
          brand_name: string
          category: string
          current_stock?: number
          generic_name: string
          id?: string
          is_active?: boolean
          manufacturer: string
          organization_id: string
          reorder_level?: number
          strength?: string | null
          unit_price: number
        }
        Update: {
          brand_name?: string
          category?: string
          current_stock?: number
          generic_name?: string
          id?: string
          is_active?: boolean
          manufacturer?: string
          organization_id?: string
          reorder_level?: number
          strength?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          delivered_at: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string
          max_retries: number
          message_content: string
          next_retry_at: string | null
          notification_type: string
          organization_id: string
          patient_id: string | null
          provider_message_id: string | null
          provider_name: string | null
          recipient: string
          sent_at: string | null
          source_reference_id: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          max_retries?: number
          message_content: string
          next_retry_at?: string | null
          notification_type: string
          organization_id: string
          patient_id?: string | null
          provider_message_id?: string | null
          provider_name?: string | null
          recipient: string
          sent_at?: string | null
          source_reference_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          max_retries?: number
          message_content?: string
          next_retry_at?: string | null
          notification_type?: string
          organization_id?: string
          patient_id?: string | null
          provider_message_id?: string | null
          provider_name?: string | null
          recipient?: string
          sent_at?: string | null
          source_reference_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          id: string
          marketing_consent: boolean
          organization_id: string
          patient_id: string
          sms_enabled: boolean
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          id?: string
          marketing_consent?: boolean
          organization_id: string
          patient_id: string
          sms_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          id?: string
          marketing_consent?: boolean
          organization_id?: string
          patient_id?: string
          sms_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          language: string
          organization_id: string
          provider_template_id: string | null
          subject: string | null
          template_code: string
          updated_at: string
        }
        Insert: {
          body_template: string
          channel: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          organization_id: string
          provider_template_id?: string | null
          subject?: string | null
          template_code: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language?: string
          organization_id?: string
          provider_template_id?: string | null
          subject?: string | null
          template_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branches: {
        Row: {
          address: string | null
          branch_code: string
          branch_name: string
          created_at: string
          id: string
          is_active: boolean
          is_main_branch: boolean
          organization_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          branch_code: string
          branch_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main_branch?: boolean
          organization_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          branch_code?: string
          branch_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main_branch?: boolean
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_credentials: Json
          environment: string
          id: string
          integration_type: string
          is_enabled: boolean
          organization_id: string
          provider_name: string
          sender_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_credentials?: Json
          environment?: string
          id?: string
          integration_type: string
          is_enabled?: boolean
          organization_id: string
          provider_name: string
          sender_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_credentials?: Json
          environment?: string
          id?: string
          integration_type?: string
          is_enabled?: boolean
          organization_id?: string
          provider_name?: string
          sender_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          ambulance_hotline: string | null
          created_at: string
          currency: string
          emergency_hotline: string | null
          invoice_prefix: string
          max_cashier_discount_pct: number | null
          organization_id: string
          pad_bottom_margin_cm: number | null
          pad_top_margin_cm: number | null
          patient_id_prefix: string
          sms_sender_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          ambulance_hotline?: string | null
          created_at?: string
          currency?: string
          emergency_hotline?: string | null
          invoice_prefix?: string
          max_cashier_discount_pct?: number | null
          organization_id: string
          pad_bottom_margin_cm?: number | null
          pad_top_margin_cm?: number | null
          patient_id_prefix?: string
          sms_sender_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          ambulance_hotline?: string | null
          created_at?: string
          currency?: string
          emergency_hotline?: string | null
          invoice_prefix?: string
          max_cashier_discount_pct?: number | null
          organization_id?: string
          pad_bottom_margin_cm?: number | null
          pad_top_margin_cm?: number | null
          patient_id_prefix?: string
          sms_sender_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string
          code: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_canonical_public: boolean | null
          name: string
          phone: string
          slug: string | null
          status: string | null
        }
        Insert: {
          address: string
          code: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_canonical_public?: boolean | null
          name: string
          phone: string
          slug?: string | null
          status?: string | null
        }
        Update: {
          address?: string
          code?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_canonical_public?: boolean | null
          name?: string
          phone?: string
          slug?: string | null
          status?: string | null
        }
        Relationships: []
      }
      ot_bookings: {
        Row: {
          anesthesia_type: string | null
          anesthetist_id: string | null
          created_at: string
          id: string
          lead_surgeon_id: string
          organization_id: string
          ot_charge: number
          ot_room_id: string
          procedure_name: string
          scheduled_end: string
          scheduled_start: string
          status: string
          visit_id: string
        }
        Insert: {
          anesthesia_type?: string | null
          anesthetist_id?: string | null
          created_at?: string
          id?: string
          lead_surgeon_id: string
          organization_id: string
          ot_charge?: number
          ot_room_id: string
          procedure_name: string
          scheduled_end: string
          scheduled_start: string
          status?: string
          visit_id: string
        }
        Update: {
          anesthesia_type?: string | null
          anesthetist_id?: string | null
          created_at?: string
          id?: string
          lead_surgeon_id?: string
          organization_id?: string
          ot_charge?: number
          ot_room_id?: string
          procedure_name?: string
          scheduled_end?: string
          scheduled_start?: string
          status?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_bookings_anesthetist_id_fkey"
            columns: ["anesthetist_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_anesthetist_id_fkey"
            columns: ["anesthetist_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_lead_surgeon_id_fkey"
            columns: ["lead_surgeon_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_lead_surgeon_id_fkey"
            columns: ["lead_surgeon_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_ot_room_id_fkey"
            columns: ["ot_room_id"]
            isOneToOne: false
            referencedRelation: "ot_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_bookings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_rooms: {
        Row: {
          created_at: string
          id: string
          is_major_ot: boolean
          organization_id: string
          room_name: string
          room_number: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_major_ot?: boolean
          organization_id: string
          room_name: string
          room_number: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_major_ot?: boolean
          organization_id?: string
          room_name?: string
          room_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ot_team_members: {
        Row: {
          created_at: string
          id: string
          ot_booking_id: string
          profile_id: string
          role_in_surgery: string
        }
        Insert: {
          created_at?: string
          id?: string
          ot_booking_id: string
          profile_id: string
          role_in_surgery: string
        }
        Update: {
          created_at?: string
          id?: string
          ot_booking_id?: string
          profile_id?: string
          role_in_surgery?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_team_members_ot_booking_id_fkey"
            columns: ["ot_booking_id"]
            isOneToOne: false
            referencedRelation: "ot_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ot_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_addresses: {
        Row: {
          address_type: string
          created_at: string
          district: string
          division: string
          id: string
          patient_id: string
          post_code: string | null
          street_address: string
          upazila_or_thana: string | null
        }
        Insert: {
          address_type?: string
          created_at?: string
          district?: string
          division?: string
          id?: string
          patient_id: string
          post_code?: string | null
          street_address: string
          upazila_or_thana?: string | null
        }
        Update: {
          address_type?: string
          created_at?: string
          district?: string
          division?: string
          id?: string
          patient_id?: string
          post_code?: string | null
          street_address?: string
          upazila_or_thana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_addresses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_allergies: {
        Row: {
          allergen: string
          id: string
          notes: string | null
          organization_id: string
          patient_id: string
          reaction: string | null
          recorded_at: string
          recorded_by: string | null
          severity: string
          status: string
        }
        Insert: {
          allergen: string
          id?: string
          notes?: string | null
          organization_id: string
          patient_id: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          allergen?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string
          reaction?: string | null
          recorded_at?: string
          recorded_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_allergies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_allergies_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_consents: {
        Row: {
          captured_at: string
          captured_by: string | null
          consent_type: string
          id: string
          notes: string | null
          organization_id: string
          patient_id: string
          status: string
          visit_id: string | null
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          consent_type: string
          id?: string
          notes?: string | null
          organization_id: string
          patient_id: string
          status?: string
          visit_id?: string | null
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          consent_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_consents_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_contacts: {
        Row: {
          contact_name: string
          created_at: string
          id: string
          is_primary_emergency: boolean
          patient_id: string
          phone: string
          relationship: string
        }
        Insert: {
          contact_name: string
          created_at?: string
          id?: string
          is_primary_emergency?: boolean
          patient_id: string
          phone: string
          relationship: string
        }
        Update: {
          contact_name?: string
          created_at?: string
          id?: string
          is_primary_emergency?: boolean
          patient_id?: string
          phone?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_diagnoses: {
        Row: {
          diagnosis_name: string
          diagnosis_type: string
          icd_code: string | null
          id: string
          notes: string | null
          onset_date: string | null
          organization_id: string
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          visit_id: string | null
        }
        Insert: {
          diagnosis_name: string
          diagnosis_type?: string
          icd_code?: string | null
          id?: string
          notes?: string | null
          onset_date?: string | null
          organization_id: string
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          diagnosis_name?: string
          diagnosis_type?: string
          icd_code?: string | null
          id?: string
          notes?: string | null
          onset_date?: string | null
          organization_id?: string
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_diagnoses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_documents: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          id: string
          organization_id: string
          patient_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          organization_id: string
          patient_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          organization_id?: string
          patient_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_history: {
        Row: {
          allergies: string | null
          chronic_conditions: string | null
          created_at: string
          family_history: string | null
          id: string
          past_surgeries: string | null
          patient_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          family_history?: string | null
          id?: string
          past_surgeries?: string | null
          patient_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          chronic_conditions?: string | null
          created_at?: string
          family_history?: string | null
          id?: string
          past_surgeries?: string | null
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_identifications: {
        Row: {
          created_at: string
          id: string
          id_number: string
          id_type: string
          is_verified: boolean
          patient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_number: string
          id_type: string
          is_verified?: boolean
          patient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          id_number?: string
          id_type?: string
          is_verified?: boolean
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_identifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_merge_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          reason: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_patient_id: string
          status: string
          target_patient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          reason: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_patient_id: string
          status?: string
          target_patient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_patient_id?: string
          status?: string
          target_patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_merge_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_merge_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_merge_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_merge_requests_source_patient_id_fkey"
            columns: ["source_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_merge_requests_target_patient_id_fkey"
            columns: ["target_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_notes: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          note: string
          note_type: string
          patient_id: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          note: string
          note_type?: string
          patient_id: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
          note_type?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_transfers: {
        Row: {
          authorized_by: string | null
          from_bed_id: string | null
          from_ward_id: string | null
          id: string
          organization_id: string
          patient_id: string
          reason: string
          to_bed_id: string | null
          to_ward_id: string | null
          transfer_time: string
          visit_id: string
        }
        Insert: {
          authorized_by?: string | null
          from_bed_id?: string | null
          from_ward_id?: string | null
          id?: string
          organization_id: string
          patient_id: string
          reason: string
          to_bed_id?: string | null
          to_ward_id?: string | null
          transfer_time?: string
          visit_id: string
        }
        Update: {
          authorized_by?: string | null
          from_bed_id?: string | null
          from_ward_id?: string | null
          id?: string
          organization_id?: string
          patient_id?: string
          reason?: string
          to_bed_id?: string | null
          to_ward_id?: string | null
          transfer_time?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_transfers_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_from_bed_id_fkey"
            columns: ["from_bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_from_ward_id_fkey"
            columns: ["from_ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_to_bed_id_fkey"
            columns: ["to_bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_to_ward_id_fkey"
            columns: ["to_ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_transfers_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_visits: {
        Row: {
          admitted_at: string
          chief_complaint: string | null
          created_at: string
          department_id: string | null
          discharged_at: string | null
          doctor_id: string | null
          id: string
          organization_id: string
          patient_id: string
          priority: string
          reason_for_visit: string | null
          status: string
          triage_priority: string | null
          updated_at: string
          visit_number: string | null
          visit_type: string
        }
        Insert: {
          admitted_at?: string
          chief_complaint?: string | null
          created_at?: string
          department_id?: string | null
          discharged_at?: string | null
          doctor_id?: string | null
          id?: string
          organization_id: string
          patient_id: string
          priority?: string
          reason_for_visit?: string | null
          status?: string
          triage_priority?: string | null
          updated_at?: string
          visit_number?: string | null
          visit_type: string
        }
        Update: {
          admitted_at?: string
          chief_complaint?: string | null
          created_at?: string
          department_id?: string | null
          discharged_at?: string | null
          doctor_id?: string | null
          id?: string
          organization_id?: string
          patient_id?: string
          priority?: string
          reason_for_visit?: string | null
          status?: string
          triage_priority?: string | null
          updated_at?: string
          visit_number?: string | null
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_visits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_departments_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "patient_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          age: number | null
          age_years: number | null
          alternate_phone: string | null
          blood_group: string | null
          created_at: string
          created_by: string | null
          deceased_at: string | null
          deceased_reason: string | null
          dob: string | null
          email: string | null
          full_name: string
          gender: string
          guardian_name: string | null
          id: string
          is_deceased: boolean
          is_deleted: boolean
          is_temporary: boolean
          merged_into_patient_id: string | null
          nid_or_birth_cert: string | null
          normalized_phone: string | null
          organization_id: string
          patient_code: string | null
          patient_id: string | null
          phone: string
          temp_identifier: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          age_years?: number | null
          alternate_phone?: string | null
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          deceased_at?: string | null
          deceased_reason?: string | null
          dob?: string | null
          email?: string | null
          full_name: string
          gender: string
          guardian_name?: string | null
          id?: string
          is_deceased?: boolean
          is_deleted?: boolean
          is_temporary?: boolean
          merged_into_patient_id?: string | null
          nid_or_birth_cert?: string | null
          normalized_phone?: string | null
          organization_id: string
          patient_code?: string | null
          patient_id?: string | null
          phone: string
          temp_identifier?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          age_years?: number | null
          alternate_phone?: string | null
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          deceased_at?: string | null
          deceased_reason?: string | null
          dob?: string | null
          email?: string | null
          full_name?: string
          gender?: string
          guardian_name?: string | null
          id?: string
          is_deceased?: boolean
          is_deleted?: boolean
          is_temporary?: boolean
          merged_into_patient_id?: string | null
          nid_or_birth_cert?: string | null
          normalized_phone?: string | null
          organization_id?: string
          patient_code?: string | null
          patient_id?: string | null
          phone?: string
          temp_identifier?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_merged_into_patient_id_fkey"
            columns: ["merged_into_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          intent_reference: string
          invoice_id: string
          organization_id: string
          patient_id: string | null
          payable_amount: number
          provider: string
          provider_session_id: string | null
          provider_transaction_id: string | null
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          intent_reference: string
          invoice_id: string
          organization_id: string
          patient_id?: string | null
          payable_amount: number
          provider: string
          provider_session_id?: string | null
          provider_transaction_id?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          intent_reference?: string
          invoice_id?: string
          organization_id?: string
          patient_id?: string | null
          payable_amount?: number
          provider?: string
          provider_session_id?: string | null
          provider_transaction_id?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliations: {
        Row: {
          created_at: string
          expected_amount: number
          id: string
          invoice_id: string
          mismatch_type: string
          organization_id: string
          payment_intent_id: string | null
          provider_transaction_id: string | null
          received_amount: number
          resolution_notes: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_amount: number
          id?: string
          invoice_id: string
          mismatch_type: string
          organization_id: string
          payment_intent_id?: string | null
          provider_transaction_id?: string | null
          received_amount: number
          resolution_notes?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_amount?: number
          id?: string
          invoice_id?: string
          mismatch_type?: string
          organization_id?: string
          payment_intent_id?: string | null
          provider_transaction_id?: string | null
          received_amount?: number
          resolution_notes?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliations_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cashier_id: string
          created_at: string
          gateway_transaction_id: string | null
          id: string
          invoice_id: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: string
          receipt_number: string
        }
        Insert: {
          amount: number
          cashier_id: string
          created_at?: string
          gateway_transaction_id?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_method: string
          receipt_number: string
        }
        Update: {
          amount?: number
          cashier_id?: string
          created_at?: string
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: string
          receipt_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          basic_salary: number
          created_at: string
          deductions: number
          employee_id: string
          id: string
          net_salary: number
          payment_status: string
          payroll_run_id: string
        }
        Insert: {
          allowances?: number
          basic_salary: number
          created_at?: string
          deductions?: number
          employee_id: string
          id?: string
          net_salary: number
          payment_status?: string
          payroll_run_id: string
        }
        Update: {
          allowances?: number
          basic_salary?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          id?: string
          net_salary?: number
          payment_status?: string
          payroll_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_by: string | null
          created_at: string
          disbursed_at: string | null
          id: string
          month_year: string
          organization_id: string
          prepared_by: string | null
          status: string
          total_deductions: number
          total_gross: number
          total_net: number
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          id?: string
          month_year: string
          organization_id: string
          prepared_by?: string | null
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          disbursed_at?: string | null
          id?: string
          month_year?: string
          organization_id?: string
          prepared_by?: string | null
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          key: string
          module: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          module?: string
        }
        Relationships: []
      }
      pharmacy_sales: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          organization_id: string
          patient_id: string | null
          prescription_id: string | null
          sale_number: string
          sold_by: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          organization_id: string
          patient_id?: string | null
          prescription_id?: string | null
          sale_number: string
          sold_by: string
          total_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          organization_id?: string
          patient_id?: string | null
          prescription_id?: string | null
          sale_number?: string
          sold_by?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_sales_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_sales_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_sales_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          created_at: string
          display_order: number
          dosage_pattern: string
          duration: string
          generic_name: string | null
          id: string
          meal_instruction: string | null
          medicine_name: string
          prescription_id: string
          special_notes: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          dosage_pattern: string
          duration: string
          generic_name?: string | null
          id?: string
          meal_instruction?: string | null
          medicine_name: string
          prescription_id: string
          special_notes?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          dosage_pattern?: string
          duration?: string
          generic_name?: string | null
          id?: string
          meal_instruction?: string | null
          medicine_name?: string
          prescription_id?: string
          special_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          note_type: string
          prescription_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          note_type?: string
          prescription_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          note_type?: string
          prescription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_notes_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          chief_complaints: string | null
          clinical_findings: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          followup_date: string | null
          general_advice: string | null
          id: string
          investigation_advice: string | null
          organization_id: string
          patient_id: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          chief_complaints?: string | null
          clinical_findings?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id: string
          followup_date?: string | null
          general_advice?: string | null
          id?: string
          investigation_advice?: string | null
          organization_id: string
          patient_id: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          chief_complaints?: string | null
          clinical_findings?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string
          followup_date?: string | null
          general_advice?: string | null
          id?: string
          investigation_advice?: string | null
          organization_id?: string
          patient_id?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      print_templates: {
        Row: {
          created_at: string
          disclaimer_text: string | null
          document_type: string
          footer_html: string | null
          format: string
          header_html: string | null
          id: string
          is_active: boolean
          organization_id: string
          show_barcode: boolean
          show_hospital_logo: boolean
          show_qr_code: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          disclaimer_text?: string | null
          document_type: string
          footer_html?: string | null
          format?: string
          header_html?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          show_barcode?: boolean
          show_hospital_logo?: boolean
          show_qr_code?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          disclaimer_text?: string | null
          document_type?: string
          footer_html?: string | null
          format?: string
          header_html?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          show_barcode?: boolean
          show_hospital_logo?: boolean
          show_qr_code?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_organization_id: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          organization_id: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          organization_id?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_organization_id_fkey"
            columns: ["active_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_contact_inquiries: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string
          name: string
          organization_id: string
          phone: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message: string
          name: string
          organization_id: string
          phone: string
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          name?: string
          organization_id?: string
          phone?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_contact_inquiries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          medicine_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          medicine_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          total_cost: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          medicine_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          id: string
          ordered_by: string | null
          organization_id: string
          po_number: string
          received_at: string | null
          status: string
          supplier_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          ordered_by?: string | null
          organization_id: string
          po_number: string
          received_at?: string | null
          status?: string
          supplier_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          ordered_by?: string | null
          organization_id?: string
          po_number?: string
          received_at?: string | null
          status?: string
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "medicine_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          browser: string | null
          created_at: string
          device: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          organization_id: string
          p256dh: string
          revoked_at: string | null
          user_id: string | null
        }
        Insert: {
          auth: string
          browser?: string | null
          created_at?: string
          device?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          organization_id: string
          p256dh: string
          revoked_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          browser?: string | null
          created_at?: string
          device?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          organization_id?: string
          p256dh?: string
          revoked_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          approved_by: string
          id: string
          invoice_id: string
          organization_id: string
          processed_by: string
          reason: string
          refund_method: string
          refund_receipt_number: string
          refunded_at: string
        }
        Insert: {
          amount: number
          approved_by: string
          id?: string
          invoice_id: string
          organization_id: string
          processed_by: string
          reason: string
          refund_method?: string
          refund_receipt_number: string
          refunded_at?: string
        }
        Update: {
          amount?: number
          approved_by?: string
          id?: string
          invoice_id?: string
          organization_id?: string
          processed_by?: string
          reason?: string
          refund_method?: string
          refund_receipt_number?: string
          refunded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_collections: {
        Row: {
          barcode: string
          collected_at: string
          collected_by: string | null
          id: string
          order_item_id: string
          specimen_type: string
        }
        Insert: {
          barcode: string
          collected_at?: string
          collected_by?: string | null
          id?: string
          order_item_id: string
          specimen_type: string
        }
        Update: {
          barcode?: string
          collected_at?: string
          collected_by?: string | null
          id?: string
          order_item_id?: string
          specimen_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_collections_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "diagnostic_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          created_at: string
          gateway_response: string | null
          id: string
          message_text: string
          organization_id: string
          purpose: string
          recipient_phone: string
          status: string
        }
        Insert: {
          created_at?: string
          gateway_response?: string | null
          id?: string
          message_text: string
          organization_id: string
          purpose: string
          recipient_phone: string
          status?: string
        }
        Update: {
          created_at?: string
          gateway_response?: string | null
          id?: string
          message_text?: string
          organization_id?: string
          purpose?: string
          recipient_phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_providers: {
        Row: {
          api_url: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          provider_name: string
          sender_id: string
        }
        Insert: {
          api_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          provider_name: string
          sender_id: string
        }
        Update: {
          api_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          provider_name?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          approved_by: string
          batch_id: string
          created_at: string
          id: string
          new_quantity: number
          old_quantity: number
          organization_id: string
          reason: string
          variance: number
        }
        Insert: {
          approved_by: string
          batch_id: string
          created_at?: string
          id?: string
          new_quantity: number
          old_quantity: number
          organization_id: string
          reason: string
          variance: number
        }
        Update: {
          approved_by?: string
          batch_id?: string
          created_at?: string
          id?: string
          new_quantity?: number
          old_quantity?: number
          organization_id?: string
          reason?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "medicine_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          quantity_in: number
          quantity_out: number
          reference_id: string | null
          running_balance: number
          transaction_type: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          quantity_in?: number
          quantity_out?: number
          reference_id?: string | null
          running_balance: number
          transaction_type: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          quantity_in?: number
          quantity_out?: number
          reference_id?: string | null
          running_balance?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "medicine_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      token_calls: {
        Row: {
          call_number: number
          called_at: string
          called_by: string | null
          id: string
          waiting_queue_id: string
        }
        Insert: {
          call_number?: number
          called_at?: string
          called_by?: string | null
          id?: string
          waiting_queue_id: string
        }
        Update: {
          call_number?: number
          called_at?: string
          called_by?: string | null
          id?: string
          waiting_queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_calls_called_by_fkey"
            columns: ["called_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_calls_waiting_queue_id_fkey"
            columns: ["waiting_queue_id"]
            isOneToOne: false
            referencedRelation: "waiting_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      token_counters: {
        Row: {
          counter_date: string
          created_at: string
          doctor_id: string
          id: string
          last_token: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          counter_date?: string
          created_at?: string
          doctor_id: string
          id?: string
          last_token?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          counter_date?: string
          created_at?: string
          doctor_id?: string
          id?: string
          last_token?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_counters_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_counters_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          organization_id: string
          phone: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          phone?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vital_signs: {
        Row: {
          diastolic_bp: number | null
          height_cm: number | null
          id: string
          pulse_rate: number | null
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          spo2_pct: number | null
          systolic_bp: number | null
          temperature_c: number | null
          visit_id: string
          weight_kg: number | null
        }
        Insert: {
          diastolic_bp?: number | null
          height_cm?: number | null
          id?: string
          pulse_rate?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2_pct?: number | null
          systolic_bp?: number | null
          temperature_c?: number | null
          visit_id: string
          weight_kg?: number | null
        }
        Update: {
          diastolic_bp?: number | null
          height_cm?: number | null
          id?: string
          pulse_rate?: number | null
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2_pct?: number | null
          systolic_bp?: number | null
          temperature_c?: number | null
          visit_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "patient_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_queue: {
        Row: {
          appointment_id: string | null
          called_at: string | null
          doctor_id: string
          id: string
          organization_id: string
          queue_status: string | null
          room_number: string | null
          status: string
          token_number: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          called_at?: string | null
          doctor_id: string
          id?: string
          organization_id: string
          queue_status?: string | null
          room_number?: string | null
          status?: string
          token_number: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          called_at?: string | null
          doctor_id?: string
          id?: string
          organization_id?: string
          queue_status?: string | null
          room_number?: string | null
          status?: string
          token_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiting_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_queue_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_queue_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "public_doctors_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wards: {
        Row: {
          created_at: string
          floor_number: string
          id: string
          name: string
          organization_id: string
          total_beds: number
          ward_type: string
        }
        Insert: {
          created_at?: string
          floor_number: string
          id?: string
          name: string
          organization_id: string
          total_beds?: number
          ward_type: string
        }
        Update: {
          created_at?: string
          floor_number?: string
          id?: string
          name?: string
          organization_id?: string
          total_beds?: number
          ward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          correlation_id: string | null
          event_type: string
          failure_reason: string | null
          id: string
          is_signature_valid: boolean
          organization_id: string
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string | null
          received_at: string
          signature_header: string | null
        }
        Insert: {
          correlation_id?: string | null
          event_type: string
          failure_reason?: string | null
          id?: string
          is_signature_valid?: boolean
          organization_id: string
          payload: Json
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_event_id?: string | null
          received_at?: string
          signature_header?: string | null
        }
        Update: {
          correlation_id?: string | null
          event_type?: string
          failure_reason?: string | null
          id?: string
          is_signature_valid?: boolean
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          signature_header?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_trail_summary: {
        Row: {
          action: string | null
          event_count: number | null
          last_event_at: string | null
          module: string | null
          organization_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_departments_view: {
        Row: {
          code: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          name: string | null
          organization_id: string | null
          slug: string | null
          type: string | null
        }
        Insert: {
          code?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string | null
          organization_id?: string | null
          slug?: string | null
          type?: string | null
        }
        Update: {
          code?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string | null
          organization_id?: string | null
          slug?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_doctors_view: {
        Row: {
          avatar_url: string | null
          bio: string | null
          bmdc_reg_number: string | null
          degrees: string | null
          department_id: string | null
          department_name: string | null
          department_slug: string | null
          designation: string | null
          experience_years: number | null
          followup_fee: number | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          opd_fee: number | null
          organization_id: string | null
          public_bio: string | null
          room_number: string | null
          specialization: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      book_online_appointment: {
        Args: {
          p_appointment_date: string
          p_doctor_id: string
          p_notes?: string
          p_org_id: string
          p_patient_age?: number
          p_patient_gender: string
          p_patient_name: string
          p_patient_phone: string
          p_schedule_id: string
        }
        Returns: Json
      }
      book_staff_appointment_atomic: {
        Args: {
          p_appointment_date?: string
          p_doctor_id: string
          p_notes?: string
          p_org_id: string
          p_patient_id: string
          p_schedule_id: string
          p_source?: string
        }
        Returns: Json
      }
      current_org_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      generate_diagnostic_order_number: {
        Args: { p_org_id: string }
        Returns: string
      }
      generate_emergency_temp_id: {
        Args: { p_org_id: string }
        Returns: string
      }
      generate_employee_code: { Args: { p_org_id: string }; Returns: string }
      generate_invoice_number: { Args: { p_org_id: string }; Returns: string }
      generate_patient_code: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_pharmacy_sale_number: {
        Args: { p_org_id: string }
        Returns: string
      }
      generate_receipt_number: { Args: { p_org_id: string }; Returns: string }
      generate_visit_number: {
        Args: { p_organization_id: string; p_type: string }
        Returns: string
      }
      get_audit_trail_logs: {
        Args: {
          p_action?: string
          p_limit?: number
          p_module?: string
          p_offset?: number
          p_org_id: string
        }
        Returns: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          ip_address: string
          module: string
          new_values: Json
          old_values: Json
          organization_id: string
          user_agent: string
          user_id: string
        }[]
      }
      get_current_org_id: { Args: never; Returns: string }
      get_next_token: {
        Args: { p_date: string; p_doctor_id: string; p_org_id: string }
        Returns: number
      }
      has_permission: { Args: { perm_code: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_and_record_online_payment: {
        Args: {
          p_cashier_id?: string
          p_gateway_method: string
          p_intent_id: string
          p_org_id: string
          p_paid_amount: number
          p_provider_trx_id: string
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

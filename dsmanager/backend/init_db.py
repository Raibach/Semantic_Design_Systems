#!/usr/bin/env python3
"""
Database Initialization Script
Creates core tables if they don't exist, and safely adds missing columns.
NEVER drops existing tables - uses migrations only.
"""
import os
import sys
import psycopg2

# Tables to create if they don't exist
TABLE_DEFINITIONS = {
    'users': """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            status VARCHAR(20) DEFAULT 'active',
            email_verified BOOLEAN DEFAULT FALSE,
            email_verification_token VARCHAR(255),
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            last_login_at TIMESTAMP,
            last_login_ip INET,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )
    """,
    'projects': """
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_archived BOOLEAN DEFAULT FALSE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'conversations': """
        CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
            title VARCHAR(255),
            summary TEXT,
            message_count INTEGER DEFAULT 0,
            metadata JSONB DEFAULT '{}',
            surface_state_json TEXT,
            surface_updated_at TIMESTAMP,
            is_archived BOOLEAN DEFAULT FALSE,
            tab VARCHAR(20) DEFAULT 'chat',
            deleted_at TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'conversation_messages': """
        CREATE TABLE IF NOT EXISTS conversation_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'user_memories': """
        CREATE TABLE IF NOT EXISTS user_memories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            content_preview TEXT,
            content_type VARCHAR(50),
            source_type VARCHAR(50) NOT NULL,
            source_id UUID,
            milvus_collection VARCHAR(100),
            milvus_vector_id VARCHAR(255),
            embedding_dimension INTEGER,
            importance_score DECIMAL(3,2) DEFAULT 0.5,
            memory_category VARCHAR(100),
            memory_category_confidence DECIMAL(3,2),
            access_count INTEGER DEFAULT 0,
            last_accessed_at TIMESTAMP,
            metadata JSONB DEFAULT '{}',
            tags TEXT[] DEFAULT '{}',
            is_archived BOOLEAN DEFAULT FALSE,
            archived_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_sessions': """
        CREATE TABLE IF NOT EXISTS prompt_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
            conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
            title VARCHAR(255),
            description TEXT,
            left_column_content TEXT,
            compiled_output TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            is_archived BOOLEAN DEFAULT FALSE,
            current_version INTEGER DEFAULT 0,
            category VARCHAR(100),
            last_accessed_at TIMESTAMP,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_versions': """
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            left_column_content TEXT,
            compiled_output TEXT,
            change_description TEXT,
            change_type VARCHAR(50),
            created_by_user_id UUID REFERENCES users(id),
            overall_score DECIMAL(5,2),
            score_breakdown JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'ai_suggestions': """
        CREATE TABLE IF NOT EXISTS ai_suggestions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            suggestion_type VARCHAR(50),
            suggestion_content TEXT,
            content TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            used BOOLEAN DEFAULT FALSE,
            used_at TIMESTAMP,
            inserted_position INTEGER,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'tags': """
        CREATE TABLE IF NOT EXISTS tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_context': """
        CREATE TABLE IF NOT EXISTS prompt_context (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            context_type VARCHAR(50) NOT NULL DEFAULT 'workspace',
            content TEXT NOT NULL,
            source VARCHAR(255),
            captured_at TIMESTAMP DEFAULT NOW(),
            relevance_score DECIMAL(3,2) DEFAULT 1.0,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    # Category registry — every category owns a color that tints its console
    # card (agent-card-element background). Global list for now; a dropdown
    # editor in the composer UI will manage these later.
    'categories': """
        CREATE TABLE IF NOT EXISTS categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) UNIQUE NOT NULL,
            color VARCHAR(20) NOT NULL DEFAULT '#658D1B',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    # Figma design-spec cache — extracted style specs (fills, strokes,
    # effects, fonts, layout, bounds) pulled from the Figma API and served
    # to the Lit catalog. PostgreSQL caches; Figma authors.
    'figma_specs': """
        CREATE TABLE IF NOT EXISTS figma_specs (
            file_key VARCHAR(100) NOT NULL,
            node_id VARCHAR(100) NOT NULL,
            name VARCHAR(255),
            spec JSONB NOT NULL DEFAULT '{}',
            synced_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (file_key, node_id)
        )
    """,
    # ── Tables below were present in the live database but missing from
    # init_db.py. Added 2026-08-01 so production deployments get the full
    # schema. Generated from the local database snapshot.
    'audit_logs': """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid,
            action character varying(100) NOT NULL,
            resource_type character varying(50),
            resource_id uuid,
            ip_address inet,
            user_agent text,
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'conversation_tags': """
        CREATE TABLE IF NOT EXISTS conversation_tags (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            tag_id uuid NOT NULL,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'data_dignity_ledger': """
        CREATE TABLE IF NOT EXISTS data_dignity_ledger (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            memory_id uuid,
            event_type character varying(50) NOT NULL,
            value_points numeric(10,2) NOT NULL,
            value_usd numeric(10,4),
            usage_context character varying(100),
            usage_count integer DEFAULT 1,
            beneficiary_type character varying(50),
            beneficiary_id uuid,
            compensation_status character varying(20) DEFAULT 'pending'::character varying,
            paid_at timestamp without time zone,
            payment_method character varying(50),
            payment_reference character varying(255),
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'grace_context': """
        CREATE TABLE IF NOT EXISTS grace_context (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            memory_id uuid NOT NULL,
            context_category character varying(100),
            priority integer DEFAULT 50,
            retrieval_count integer DEFAULT 0,
            last_retrieved_at timestamp without time zone,
            relevance_score numeric(3,2) DEFAULT 1.00,
            hallucination_flags integer DEFAULT 0,
            negative_feedback_count integer DEFAULT 0,
            is_active boolean DEFAULT true,
            deactivated_at timestamp without time zone,
            deactivation_reason text,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'grace_decisions': """
        CREATE TABLE IF NOT EXISTS grace_decisions (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            request_type character varying(50) NOT NULL,
            request_summary text NOT NULL,
            request_metadata jsonb DEFAULT '{}'::jsonb,
            decision character varying(20) NOT NULL,
            decision_reason text NOT NULL,
            confidence_level numeric(3,2),
            reasoning_trace text,
            related_memory_id uuid,
            related_context_id uuid,
            was_overridden boolean DEFAULT false,
            overridden_at timestamp without time zone,
            override_justification text,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'grace_health_metrics': """
        CREATE TABLE IF NOT EXISTS grace_health_metrics (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            metric_period timestamp without time zone NOT NULL,
            response_quality_avg numeric(3,2),
            hallucination_rate numeric(5,4),
            coherence_score numeric(3,2),
            creativity_score numeric(3,2),
            mood_state character varying(50),
            confidence_avg numeric(3,2),
            uncertainty_rate numeric(3,2),
            context_size_mb numeric(10,2),
            context_utilization_pct numeric(5,2),
            stale_context_pct numeric(5,2),
            bad_source_exposure_count integer DEFAULT 0,
            correction_count integer DEFAULT 0,
            positive_feedback_count integer DEFAULT 0,
            refusal_count integer DEFAULT 0,
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'invoices': """
        CREATE TABLE IF NOT EXISTS invoices (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            subscription_id uuid,
            stripe_invoice_id character varying(255),
            amount_due integer NOT NULL,
            amount_paid integer,
            currency character varying(3) DEFAULT 'USD'::character varying,
            status character varying(20) DEFAULT 'draft'::character varying,
            invoice_pdf_url text,
            due_date timestamp without time zone,
            paid_at timestamp without time zone,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'memory_provenance': """
        CREATE TABLE IF NOT EXISTS memory_provenance (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            memory_id uuid NOT NULL,
            user_id uuid NOT NULL,
            event_type character varying(50) NOT NULL,
            event_metadata jsonb DEFAULT '{}'::jsonb,
            initiated_by uuid,
            initiated_by_type character varying(20),
            context_type character varying(50),
            context_id uuid,
            usage_value numeric(10,4),
            ip_address inet,
            user_agent text,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'payment_methods': """
        CREATE TABLE IF NOT EXISTS payment_methods (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            stripe_payment_method_id character varying(255) NOT NULL,
            type character varying(50),
            brand character varying(50),
            last4 character varying(4),
            exp_month integer,
            exp_year integer,
            is_default boolean DEFAULT false,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'promotion_queue': """
        CREATE TABLE IF NOT EXISTS promotion_queue (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            memory_id uuid NOT NULL,
            user_id uuid NOT NULL,
            requested_by uuid NOT NULL,
            request_reason text,
            priority_level character varying(20) DEFAULT 'normal'::character varying,
            status character varying(20) DEFAULT 'pending'::character varying,
            reviewed_by uuid,
            reviewed_at timestamp without time zone,
            reviewer_notes text,
            approval_votes integer DEFAULT 0,
            rejection_votes integer DEFAULT 0,
            automated_quality_score numeric(3,2),
            manual_quality_score numeric(3,2),
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_artifacts': """
        CREATE TABLE IF NOT EXISTS prompt_artifacts (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            project_id uuid,
            artifact_type character varying(50) NOT NULL,
            artifact_data jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_comments': """
        CREATE TABLE IF NOT EXISTS prompt_comments (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            user_id uuid NOT NULL,
            parent_id uuid,
            content text NOT NULL,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_feedback': """
        CREATE TABLE IF NOT EXISTS prompt_feedback (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            user_id uuid NOT NULL,
            feedback_type character varying(50) NOT NULL,
            content text NOT NULL,
            status character varying(20) DEFAULT 'pending'::character varying,
            curator_notes text,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_history': """
        CREATE TABLE IF NOT EXISTS prompt_history (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            action character varying(50) NOT NULL,
            user_id uuid NOT NULL,
            changes jsonb,
            timestamp timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_permissions': """
        CREATE TABLE IF NOT EXISTS prompt_permissions (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            user_id uuid NOT NULL,
            permission character varying(20) NOT NULL,
            granted_by uuid,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_ratings': """
        CREATE TABLE IF NOT EXISTS prompt_ratings (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            user_id uuid NOT NULL,
            rating integer NOT NULL,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'prompt_shares': """
        CREATE TABLE IF NOT EXISTS prompt_shares (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            conversation_id uuid NOT NULL,
            shared_by uuid NOT NULL,
            shared_with uuid NOT NULL,
            permission_level character varying(20) DEFAULT 'read'::character varying,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'quarantine_items': """
        CREATE TABLE IF NOT EXISTS quarantine_items (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            source_type character varying(50) NOT NULL,
            source_id character varying(255),
            url text,
            title text,
            content_preview text,
            threat_level character varying(20) NOT NULL,
            threat_category character varying(100),
            threat_details jsonb,
            status character varying(20) DEFAULT 'pending_review'::character varying,
            reviewed_at timestamp without time zone,
            reviewer_notes text,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'session_permissions': """
        CREATE TABLE IF NOT EXISTS session_permissions (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            session_id uuid NOT NULL,
            user_id uuid NOT NULL,
            role character varying(20) NOT NULL DEFAULT 'owner'::character varying,
            granted_by uuid,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'student_grades': """
        CREATE TABLE IF NOT EXISTS student_grades (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            teacher_id uuid NOT NULL,
            student_id uuid NOT NULL,
            assignment_name character varying(255) NOT NULL,
            assignment_type character varying(50) DEFAULT 'general'::character varying,
            grade numeric(5,2),
            max_points numeric(5,2),
            letter_grade character varying(5),
            feedback text,
            rubric_data jsonb DEFAULT '{}'::jsonb,
            metadata jsonb DEFAULT '{}'::jsonb,
            due_date timestamp without time zone,
            submitted_at timestamp without time zone,
            graded_at timestamp without time zone DEFAULT now(),
            status character varying(20) DEFAULT 'graded'::character varying,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now(),
            deleted_at timestamp without time zone
        )
    """,
    'student_profiles': """
        CREATE TABLE IF NOT EXISTS student_profiles (
            student_id uuid NOT NULL,
            student_number character varying(50),
            enrollment_date timestamp without time zone DEFAULT now(),
            graduation_date timestamp without time zone,
            gpa numeric(4,2),
            total_credits integer DEFAULT 0,
            academic_level character varying(50),
            parent_email character varying(255),
            parent_phone character varying(50),
            emergency_contact_name character varying(255),
            emergency_contact_phone character varying(50),
            notes text,
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'subscription_plans': """
        CREATE TABLE IF NOT EXISTS subscription_plans (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            name character varying(100) NOT NULL,
            slug character varying(50) NOT NULL,
            description text,
            price_monthly numeric(10,2) NOT NULL,
            price_yearly numeric(10,2),
            stripe_price_id_monthly character varying(255),
            stripe_price_id_yearly character varying(255),
            queries_per_month integer,
            pdf_uploads_per_month integer,
            memory_storage_mb integer,
            max_file_size_mb integer DEFAULT 10,
            features jsonb DEFAULT '{}'::jsonb,
            is_active boolean DEFAULT true,
            sort_order integer DEFAULT 0,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'tag_definitions': """
        CREATE TABLE IF NOT EXISTS tag_definitions (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            tag_name character varying(255) NOT NULL,
            tag_level integer NOT NULL,
            parent_tag_id uuid,
            tag_path character varying(500) NOT NULL,
            description text,
            user_id uuid,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'teacher_students': """
        CREATE TABLE IF NOT EXISTS teacher_students (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            teacher_id uuid NOT NULL,
            student_id uuid NOT NULL,
            status character varying(20) DEFAULT 'active'::character varying,
            enrollment_date timestamp without time zone DEFAULT now(),
            notes text,
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now(),
            deleted_at timestamp without time zone
        )
    """,
    'training_data': """
        CREATE TABLE IF NOT EXISTS training_data (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            question text NOT NULL,
            answer text NOT NULL,
            reasoning_trace text,
            confidence_score numeric(3,2),
            quality_score numeric(3,2),
            source_type character varying(50),
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'usage_metrics': """
        CREATE TABLE IF NOT EXISTS usage_metrics (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            metric_type character varying(50) NOT NULL,
            count integer DEFAULT 1,
            period_month date NOT NULL,
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamp without time zone DEFAULT now()
        )
    """,
    'user_grace_settings': """
        CREATE TABLE IF NOT EXISTS user_grace_settings (
            user_id uuid NOT NULL,
            temperature numeric(3,2) DEFAULT 0.45,
            reasoning_style character varying(50) DEFAULT 'chain_of_thought'::character varying,
            self_reflection boolean DEFAULT true,
            second_order_reasoning boolean DEFAULT false,
            memory_integration boolean DEFAULT true,
            training_mode character varying(50) DEFAULT 'balanced'::character varying,
            confidence_threshold character varying(50) DEFAULT 'medium'::character varying,
            learning_focus jsonb DEFAULT '{"writingStyle": true, "topicKnowledge": true, "errorCorrections": true, "feedbackPatterns": true}'::jsonb,
            auto_qna boolean DEFAULT true,
            editorial jsonb DEFAULT '{"stance": "collaborative", "enabled": true, "askObjectiveFirst": true, "structuralCritique": false, "detectChatGPTPatterns": true, "voicePreservationPriority": "high"}'::jsonb,
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
    'user_memory_log': """
        CREATE TABLE IF NOT EXISTS user_memory_log (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            qdrant_point_id character varying(255) NOT NULL,
            qdrant_collection character varying(255) NOT NULL,
            content_preview text,
            content_hash character varying(64),
            source_type character varying(50) NOT NULL,
            source_id uuid,
            importance_score numeric(3,2) DEFAULT 0.5,
            access_count integer DEFAULT 0,
            last_accessed_at timestamp without time zone,
            is_archived boolean DEFAULT false,
            archived_at timestamp without time zone,
            archive_location text,
            created_at timestamp without time zone DEFAULT now(),
            milvus_point_id character varying(255),
            milvus_collection character varying(255),
            embedding_model_version character varying(100) DEFAULT 'bge-small-en-v1'::character varying,
            context_type character varying(50) DEFAULT 'general'::character varying,
            chunk_index integer,
            total_chunks integer DEFAULT 1
        )
    """,
    'user_subscriptions': """
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id uuid NOT NULL DEFAULT uuid_generate_v4(),
            user_id uuid NOT NULL,
            plan_id uuid NOT NULL,
            status character varying(20) DEFAULT 'active'::character varying,
            billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
            current_period_start timestamp without time zone NOT NULL,
            current_period_end timestamp without time zone NOT NULL,
            trial_end timestamp without time zone,
            cancel_at_period_end boolean DEFAULT false,
            canceled_at timestamp without time zone,
            cancellation_reason text,
            stripe_customer_id character varying(255),
            stripe_subscription_id character varying(255),
            created_at timestamp without time zone DEFAULT now(),
            updated_at timestamp without time zone DEFAULT now()
        )
    """,
}

# Safe column migrations - adds column if missing, never drops
COLUMN_MIGRATIONS = [
    # conversations table — session_id is the anchor, user_id is transient
    # (sessions can be transferred/shared; user_id changes, session_id never does)
    ("conversations", "session_id", "UUID NOT NULL DEFAULT gen_random_uuid()"),
    ("conversations", "created_by", "UUID"),
    ("conversations", "user_id", "UUID"),  # nullable — sessions can be ported between users
    ("conversations", "tab", "VARCHAR(20) DEFAULT 'chat'"),
    ("conversations", "deleted_at", "TEXT"),
    ("conversations", "surface_state_json", "TEXT"),
    ("conversations", "surface_updated_at", "TIMESTAMP"),
    ("conversations", "is_archived", "BOOLEAN DEFAULT FALSE"),
    # conversation_messages — same principle: user_id is transient
    ("conversation_messages", "user_id", "UUID"),  # nullable
    ("conversation_messages", "created_by", "UUID"),
    # projects table
    ("projects", "is_archived", "BOOLEAN DEFAULT FALSE"),
    # prompt_sessions table
    ("prompt_sessions", "left_column_content", "TEXT"),
    ("prompt_sessions", "conversation_id", "UUID REFERENCES conversations(id) ON DELETE SET NULL"),
    # prompt_sessions — console card fields (agent-card-element, Figma 40000717:17091)
    ("prompt_sessions", "status", "VARCHAR(20) DEFAULT 'Active'"),
    ("prompt_sessions", "likes", "INTEGER DEFAULT 0"),
    ("prompt_sessions", "model_name", "VARCHAR(100)"),
    ("prompt_sessions", "team_name", "VARCHAR(100)"),
    ("prompt_sessions", "avatar_url", "TEXT"),
    # categories — per-category theme text colors (CARD_THEMES titleColor/textColor)
    ("categories", "title_color", "VARCHAR(20)"),
    ("categories", "text_color", "VARCHAR(20)"),
    # prompt_versions table
    ("prompt_versions", "version_number", "INTEGER NOT NULL DEFAULT 0"),
    # ai_suggestions table
    ("ai_suggestions", "used", "BOOLEAN DEFAULT FALSE"),
    ("ai_suggestions", "used_at", "TIMESTAMP"),
    ("ai_suggestions", "inserted_position", "INTEGER"),
    ("ai_suggestions", "content", "TEXT"),
    ("ai_suggestions", "source_message_id", "UUID"),
    ("ai_suggestions", "suggestion_label", "VARCHAR(255)"),
    ("ai_suggestions", "context", "TEXT"),
    ("ai_suggestions", "generated_by_model", "VARCHAR(255)"),
    ("ai_suggestions", "confidence_score", "NUMERIC DEFAULT 1.0"),
    ("ai_suggestions", "relevance_score", "NUMERIC DEFAULT 1.0"),
    ("ai_suggestions", "updated_at", "TIMESTAMP DEFAULT NOW()"),
    # users table
    ("users", "role", "VARCHAR(20) DEFAULT 'student'"),
    ("users", "prompt_role", "VARCHAR(20) DEFAULT 'viewer'"),
    # user_memories table
    ("user_memories", "title", "VARCHAR(500)"),
    ("user_memories", "source_url", "TEXT"),
    ("user_memories", "source_metadata", "JSONB DEFAULT '{}'"),
    ("user_memories", "quarantine_status", "VARCHAR(20) NOT NULL DEFAULT 'pending'"),
    ("user_memories", "quarantine_score", "NUMERIC"),
    ("user_memories", "quarantine_details", "JSONB DEFAULT '{}'"),
    ("user_memories", "quarantine_reviewed_at", "TIMESTAMP"),
    ("user_memories", "vector_id", "VARCHAR(255)"),
    ("user_memories", "embedding_model", "VARCHAR(100) DEFAULT 'sentence-transformers/all-MiniLM-L6-v2'"),
    ("user_memories", "quality_score", "NUMERIC"),
    ("user_memories", "view_count", "INTEGER DEFAULT 0"),
    ("user_memories", "last_viewed_at", "TIMESTAMP"),
    ("user_memories", "promoted_to_grace", "BOOLEAN DEFAULT FALSE"),
    ("user_memories", "promoted_at", "TIMESTAMP"),
    ("user_memories", "promoted_by", "UUID"),
    ("user_memories", "project_id", "UUID"),
]

# SQL to run after column migrations — fixes NOT NULL constraints that should be nullable
# Conversations belong to sessions, not users. user_id must be nullable so sessions
# can be transferred/shared between users without breaking the conversation.
POST_COLUMN_MIGRATION_SQL = [
    "ALTER TABLE public.conversations ALTER COLUMN user_id DROP NOT NULL",
    "ALTER TABLE public.conversation_messages ALTER COLUMN user_id DROP NOT NULL",
]

# Indexes to create if they don't exist
INDEX_DEFINITIONS = [
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_sessions_user ON prompt_sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_versions_session ON prompt_versions(session_id, version_number)",
    "CREATE INDEX IF NOT EXISTS idx_ai_suggestions_session ON ai_suggestions(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_context_session ON prompt_context(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_context_type ON prompt_context(context_type)",
]

# Default user that the frontend expects
DEFAULT_USER_SQL = """
INSERT INTO users (id, email, password_hash, full_name, status, email_verified)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default@system.local',
    '$2b$12$defaulthashnotforlogin000000000000000000000000000',
    'Default User',
    'active',
    TRUE
)
ON CONFLICT (id) DO NOTHING;
"""

# Default category palette + theme text colors — every value sourced 1:1
# from the design system; the AI never picks colors:
#   Writing        — from the Figma console-card node itself (40000717:17091):
#                    fill #658D1B, category gold #F6C031, dark text #2A2836
#   Design System  — CARD_THEMES.ds       (PromptDashboardCanvas.tsx)
#   Learning       — CARD_THEMES.learning
#   Graphics       — CARD_THEMES.graphics
#   Coding         — no CARD_THEMES entry; per the app's own resolveTheme()
#                    fallback rule (DEFAULT_THEME = ds) it inherits Design
#                    System's theme until a distinct one is assigned.
# Updating a row is a data change, not a code change.
DEFAULT_CATEGORIES_SQL = """
INSERT INTO categories (name, color, title_color, text_color) VALUES
    ('Writing',         '#658D1B', '#F6C031', '#2A2836'),
    ('Design System',   '#10455F', '#fb8d67', '#fff'),
    ('Learning Module', '#589678', '#f6c031', '#fff'),
    ('Graphics',        '#D3DF44', '#484460', '#484460'),
    ('Coding',          '#10455F', '#fb8d67', '#fff')
ON CONFLICT (name) DO NOTHING;
"""

# Stored procedure for creating prompt sessions
# FIXED 2026-07-26: conversations.session_id has a NOT NULL FK → prompt_sessions.id.
# We must pre-generate the UUID and INSERT into prompt_sessions FIRST, then
# INSERT into conversations with the FK reference, then link back.
CREATE_PROMPT_SESSION_FUNCTION = """
CREATE OR REPLACE FUNCTION create_prompt_session(
    p_user_id UUID,
    p_title VARCHAR(255) DEFAULT 'Untitled Prompt Session',
    p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_conversation_id UUID;
    v_session_id UUID;
BEGIN
    -- Pre-generate the session UUID so we can satisfy the FK constraint
    v_session_id := gen_random_uuid();

    -- Step 1: Create the prompt session FIRST (FK target must exist)
    INSERT INTO prompt_sessions (id, user_id, title, description, metadata)
    VALUES (
        v_session_id,
        p_user_id,
        p_title,
        p_description,
        '{}'::jsonb
    );

    -- Step 2: Create the conversation with the session_id FK
    INSERT INTO conversations (session_id, user_id, title, message_count, metadata)
    VALUES (
        v_session_id,
        p_user_id,
        p_title || ' - Chat',
        0,
        jsonb_build_object(
            'session_type', 'prompt_engineering',
            'has_prompt_session', true,
            'prompt_session_id', v_session_id
        )
    )
    RETURNING id INTO v_conversation_id;

    -- Step 3: Link the conversation back to the prompt session
    UPDATE prompt_sessions
    SET conversation_id = v_conversation_id,
        metadata = jsonb_build_object('initial_conversation_id', v_conversation_id)
    WHERE id = v_session_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;
"""

# Function to save prompt versions
SAVE_PROMPT_VERSION_FUNCTION = """
CREATE OR REPLACE FUNCTION save_prompt_version(
    p_session_id UUID,
    p_user_id UUID,
    p_left_column_content TEXT,
    p_compiled_output TEXT DEFAULT NULL,
    p_change_description TEXT DEFAULT NULL,
    p_change_type VARCHAR(50) DEFAULT 'manual'
) RETURNS INTEGER AS $$
DECLARE
    v_next_version INTEGER;
    v_session_user_id UUID;
BEGIN
    -- Verify session belongs to user
    SELECT user_id INTO v_session_user_id
    FROM prompt_sessions
    WHERE id = p_session_id;

    IF v_session_user_id != p_user_id THEN
        RAISE EXCEPTION 'User does not own this session';
    END IF;

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM prompt_versions
    WHERE session_id = p_session_id;

    -- Create new version
    INSERT INTO prompt_versions (
        session_id,
        version_number,
        left_column_content,
        compiled_output,
        change_description,
        change_type,
        created_by_user_id
    )
    VALUES (
        p_session_id,
        v_next_version,
        p_left_column_content,
        p_compiled_output,
        p_change_description,
        p_change_type,
        p_user_id
    );

    -- Update session's current version and content
    UPDATE prompt_sessions
    SET
        current_version = v_next_version,
        left_column_content = p_left_column_content,
        compiled_output = COALESCE(p_compiled_output, compiled_output),
        updated_at = NOW(),
        last_accessed_at = NOW()
    WHERE id = p_session_id;

    RETURN v_next_version;
END;
$$ LANGUAGE plpgsql;
"""

# Function to get context for AI query
GET_PROMPT_CONTEXT_FOR_AI_FUNCTION = """
CREATE OR REPLACE FUNCTION get_prompt_context_for_ai(
    p_session_id UUID,
    p_limit_contexts INTEGER DEFAULT 10
) RETURNS TEXT AS $$
DECLARE
    v_context TEXT := '';
    v_session_title VARCHAR(255);
    v_left_column_content TEXT;
    v_compiled_output TEXT;
    v_recent_versions TEXT;
    v_ai_suggestions TEXT;
    v_conversation_context TEXT;
BEGIN
    -- Get session basic info
    SELECT title, left_column_content, compiled_output
    INTO v_session_title, v_left_column_content, v_compiled_output
    FROM prompt_sessions
    WHERE id = p_session_id;

    -- Build context string
    v_context := v_context || 'PROMPT SESSION: ' || COALESCE(v_session_title, 'Untitled') || E'\\n\\n';

    -- Add current left column content
    IF v_left_column_content IS NOT NULL AND v_left_column_content != '' THEN
        v_context := v_context || 'CURRENT PROMPT WORKSPACE (left column):' || E'\\n';
        v_context := v_context || v_left_column_content || E'\\n\\n';
    END IF;

    -- Add compiled output if exists
    IF v_compiled_output IS NOT NULL AND v_compiled_output != '' THEN
        v_context := v_context || 'COMPILED PROMPT OUTPUT (third column):' || E'\\n';
        v_context := v_context || v_compiled_output || E'\\n\\n';
    END IF;

    -- Get recent versions
    SELECT string_agg(
        'Version ' || version_number || ' (' || COALESCE(change_type, 'unknown') || '): ' ||
        COALESCE(change_description, 'No description') || E'\\n' ||
        'Content preview: ' || LEFT(COALESCE(left_column_content, ''), 200) || '...',
        E'\\n---\\n'
    ) INTO v_recent_versions
    FROM prompt_versions
    WHERE session_id = p_session_id
    ORDER BY version_number DESC
    LIMIT 3;

    IF v_recent_versions IS NOT NULL THEN
        v_context := v_context || 'RECENT PROMPT VERSIONS:' || E'\\n';
        v_context := v_context || v_recent_versions || E'\\n\\n';
    END IF;

    -- Get unused AI suggestions
    SELECT string_agg(
        '[' || COALESCE(suggestion_type, 'unknown') || '] ' || E'\\n' ||
        COALESCE(content, ''),
        E'\\n---\\n'
    ) INTO v_ai_suggestions
    FROM ai_suggestions
    WHERE session_id = p_session_id
    AND used = FALSE
    ORDER BY created_at DESC
    LIMIT 5;

    IF v_ai_suggestions IS NOT NULL THEN
        v_context := v_context || 'AVAILABLE AI SUGGESTIONS (drag-and-drop):' || E'\\n';
        v_context := v_context || v_ai_suggestions || E'\\n\\n';
    END IF;

    -- Get recent conversation context
    SELECT string_agg(
        '[' || role || ']: ' || content,
        E'\\n'
    ) INTO v_conversation_context
    FROM conversation_messages cm
    JOIN conversations c ON cm.conversation_id = c.id
    JOIN prompt_sessions ps ON c.id = ps.conversation_id
    WHERE ps.id = p_session_id
    ORDER BY cm.created_at DESC
    LIMIT 10;

    IF v_conversation_context IS NOT NULL THEN
        v_context := v_context || 'RECENT CONVERSATION (right column chat):' || E'\\n';
        v_context := v_context || v_conversation_context || E'\\n\\n';
    END IF;

    RETURN v_context;
END;
$$ LANGUAGE plpgsql;
"""

def column_exists(cur, table_name, column_name):
    """Check if a column exists in a table."""
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table_name, column_name))
    return cur.fetchone()[0] > 0

def table_exists(cur, table_name):
    """Check if a table exists."""
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = %s AND table_schema = 'public'
    """, (table_name,))
    return cur.fetchone()[0] > 0

def init_database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set, skipping init")
        return

    print("Initializing database (safe migrations)...")

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Step 0: Ensure uuid-ossp extension (needed by uuid_generate_v4())
        cur.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

        # Step 1: Create tables if they don't exist (order matters for foreign keys)
        table_order = [
            'users', 'projects', 'conversations', 'conversation_messages',
            'user_memories', 'prompt_sessions', 'prompt_versions', 'ai_suggestions', 'tags',
            'prompt_context', 'categories', 'figma_specs',
            'audit_logs', 'conversation_tags', 'data_dignity_ledger',
            'grace_context', 'grace_decisions', 'grace_health_metrics',
            'invoices', 'memory_provenance', 'payment_methods',
            'promotion_queue', 'prompt_artifacts', 'prompt_comments',
            'prompt_feedback', 'prompt_history', 'prompt_permissions',
            'prompt_ratings', 'prompt_shares', 'quarantine_items',
            'session_permissions', 'student_grades', 'student_profiles',
            'subscription_plans', 'tag_definitions', 'teacher_students',
            'training_data', 'usage_metrics', 'user_grace_settings',
            'user_memory_log', 'user_subscriptions'
        ]

        for table_name in table_order:
            if table_name in TABLE_DEFINITIONS:
                if not table_exists(cur, table_name):
                    print(f"  Creating table: {table_name}")
                    cur.execute(TABLE_DEFINITIONS[table_name])
                else:
                    print(f"  Table exists: {table_name}")

        # Step 2: Add missing columns (safe migrations)
        print("Applying column migrations...")
        for table_name, column_name, column_type in COLUMN_MIGRATIONS:
            if table_exists(cur, table_name) and not column_exists(cur, table_name, column_name):
                print(f"  Adding column: {table_name}.{column_name}")
                try:
                    cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                except Exception as e:
                    print(f"  Warning: Could not add {table_name}.{column_name}: {e}")

        # Step 2b: Fix NOT NULL constraints that should be nullable
        # Conversations belong to sessions, not users. user_id must be nullable
        # so sessions can be transferred/shared between users.
        print("Applying constraint fixes...")
        for sql in POST_COLUMN_MIGRATION_SQL:
            try:
                cur.execute(sql)
            except Exception as e:
                # Column might already be nullable
                pass

        # Step 3: Create indexes
        print("Creating indexes...")
        for index_sql in INDEX_DEFINITIONS:
            try:
                cur.execute(index_sql)
            except Exception as e:
                # Index might already exist
                pass

        # Step 4: Create stored procedures
        print("Creating stored procedures...")
        try:
            cur.execute(CREATE_PROMPT_SESSION_FUNCTION)
            print("  Created function: create_prompt_session")
        except Exception as e:
            print(f"  Warning: Could not create create_prompt_session: {e}")

        try:
            cur.execute(SAVE_PROMPT_VERSION_FUNCTION)
            print("  Created function: save_prompt_version")
        except Exception as e:
            print(f"  Warning: Could not create save_prompt_version: {e}")

        try:
            cur.execute(GET_PROMPT_CONTEXT_FOR_AI_FUNCTION)
            print("  Created function: get_prompt_context_for_ai")
        except Exception as e:
            print(f"  Warning: Could not create get_prompt_context_for_ai: {e}")

        # Step 5: Create default user
        print("Creating default user...")
        try:
            cur.execute(DEFAULT_USER_SQL)
            print("  Default user created or already exists")
        except Exception as e:
            print(f"  Warning: Could not create default user: {e}")

        # Step 6: Seed default categories (name → card color)
        print("Seeding default categories...")
        try:
            cur.execute(DEFAULT_CATEGORIES_SQL)
            print("  Default categories seeded or already exist")
        except Exception as e:
            print(f"  Warning: Could not seed categories: {e}")

        cur.close()
        conn.close()
        print("Database initialization complete (no data lost)")

    except Exception as e:
        print(f"Database init error: {e}")
        import traceback
        traceback.print_exc()
        # Don't exit - let app try to provide better error info

if __name__ == "__main__":
    init_database()

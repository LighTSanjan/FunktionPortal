
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('EXCO', 'MEMBER');

-- CreateEnum
CREATE TYPE "ExcoOffice" AS ENUM ('PRESIDENT', 'VICE_PRESIDENT', 'TREASURER', 'ASSISTANT_TREASURER', 'SECRETARY', 'OTHER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "FundSource" AS ENUM ('SEED', 'INCOME', 'DONATION');

-- CreateEnum
CREATE TYPE "DocSeries" AS ENUM ('SCF', 'IV', 'PO', 'INC');

-- CreateEnum
CREATE TYPE "InstructorEngagement" AS ENUM ('CONTRACTED', 'GUEST');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'GENERATED', 'SIGNED', 'SUBMITTED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "FeeTier" AS ENUM ('FULL', 'HALF', 'EXCHANGE_DISCOUNT', 'WAIVED');

-- CreateEnum
CREATE TYPE "FeeRoute" AS ENUM ('OFFICIAL', 'UNOFFICIAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DECLARED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PurchaseFormType" AS ENUM ('PRF', 'PAF');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_TREASURER', 'PENDING_PRESIDENT', 'PENDING_OSL', 'APPROVED', 'REJECTED', 'PURCHASED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RegisterSection" AS ENUM ('SEED_FUND', 'INCOME', 'DONATION');

-- CreateEnum
CREATE TYPE "RegisterSyncStatus" AS ENUM ('PENDING', 'PREVIEWED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttendanceImportStatus" AS ENUM ('PARSED', 'NEEDS_MAPPING', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "series" "DocSeries" NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_numbers" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "series" "DocSeries" NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "formatted" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,

    CONSTRAINT "reference_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_accounts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "source" "FundSource" NOT NULL,
    "wbs_element" TEXT NOT NULL,
    "wbs_element_revenue" TEXT,
    "opening_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "rolls_over" BOOLEAN NOT NULL DEFAULT true,
    "submission_deadline" TIMESTAMP(3),

    CONSTRAINT "fund_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "student_id" TEXT,
    "email" TEXT,
    "user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "phone" TEXT,
    "birth_day" INTEGER,
    "birth_month" INTEGER,
    "birth_year" INTEGER,
    "academic_term" INTEGER,
    "overridden_fields" TEXT[],
    "last_import_id" TEXT,
    "roster_label" TEXT,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructors" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "dance_style" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "postal_code" TEXT,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "hourly_rate_cents" INTEGER NOT NULL,
    "engagement" "InstructorEngagement" NOT NULL DEFAULT 'CONTRACTED',
    "contract_ref" TEXT,
    "contract_start" TIMESTAMP(3),
    "contract_end" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "signature_image_path" TEXT,
    "signature_updated_at" TIMESTAMP(3),

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "held_on" DATE NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "notes" TEXT,
    "import_id" TEXT,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_attendance" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sheets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "total_present_by_date" JSONB NOT NULL,
    "coach_claim_cents" INTEGER NOT NULL,
    "club_fund_balance_cents" INTEGER,
    "verified_by_user_id" TEXT,
    "verified_as_office" "ExcoOffice",
    "verified_at" TIMESTAMP(3),
    "generated_doc_url" TEXT,
    "drive_file_id" TEXT,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "attendance_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "reference_number_id" TEXT,
    "attendance_sheet_id" TEXT,
    "document_no" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "invoice_date" DATE NOT NULL,
    "fund_source" "FundSource" NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "gst_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_doc_url" TEXT,
    "drive_file_id" TEXT,
    "generated_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "submitted_to_osl_at" TIMESTAMP(3),
    "submission_due_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "session_id" TEXT,
    "description" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "rate_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "full_fee_cents" INTEGER NOT NULL,
    "half_fee_cents" INTEGER NOT NULL,
    "collection_opens_at" TIMESTAMP(3),
    "final_collection_at" TIMESTAMP(3),
    "summary_doc_url" TEXT,
    "summary_drive_file_id" TEXT,
    "summary_generated_at" TIMESTAMP(3),

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "tier" "FeeTier" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "route" "FeeRoute" NOT NULL DEFAULT 'OFFICIAL',
    "route_reason" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DECLARED',
    "declared_at" TIMESTAMP(3),
    "declared_by_user_id" TEXT,
    "payment_reference" TEXT,
    "payment_proof_path" TEXT,
    "announced_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_user_id" TEXT,
    "rejected_reason" TEXT,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_deposits" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "reference_number_id" TEXT,
    "event_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "wbs_element" TEXT NOT NULL,
    "gross_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "gst_cents" INTEGER NOT NULL,
    "final_collection_at" TIMESTAMP(3),
    "submission_due_at" TIMESTAMP(3),
    "submitted_to_osl_at" TIMESTAMP(3),
    "generated_doc_url" TEXT,
    "drive_file_id" TEXT,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "income_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "form_type" "PurchaseFormType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "fund_source" "FundSource" NOT NULL,
    "requested_by_member_id" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "treasurer_approved_by_id" TEXT,
    "treasurer_approved_at" TIMESTAMP(3),
    "president_approved_by_id" TEXT,
    "president_approved_at" TIMESTAMP(3),
    "osl_approved_at" TIMESTAMP(3),
    "quotation_exemption_reason" TEXT,
    "conflict_declared_note" TEXT,
    "purchased_at" TIMESTAMP(3),
    "generated_doc_url" TEXT,
    "drive_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "purchase_request_id" TEXT NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "file_url" TEXT,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "register_entries" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "section" "RegisterSection" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "reference_number" TEXT,
    "description" TEXT NOT NULL,
    "document_date" DATE,
    "payee_name" TEXT,
    "student_id" TEXT,
    "expense_without_gst_cents" INTEGER,
    "expense_with_gst_cents" INTEGER,
    "income_cents" INTEGER,
    "submitted_to_osl_at" DATE,
    "banked_in_at" DATE,
    "sheet_row_number" INTEGER,
    "synced_at" TIMESTAMP(3),
    "sync_id" TEXT,

    CONSTRAINT "register_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "register_syncs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "status" "RegisterSyncStatus" NOT NULL DEFAULT 'PENDING',
    "diff" JSONB NOT NULL,
    "snapshot_before" JSONB,
    "rows_added" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "register_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_imports" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_id" TEXT,
    "spreadsheet_id" TEXT NOT NULL,
    "sheet_tab_name" TEXT,
    "source_title" TEXT,
    "status" "AttendanceImportStatus" NOT NULL DEFAULT 'PARSED',
    "parsed" JSONB NOT NULL,
    "unmatched_rows" JSONB,
    "date_instructor_map" JSONB,
    "members_created" INTEGER NOT NULL DEFAULT 0,
    "sessions_created" INTEGER NOT NULL DEFAULT 0,
    "marks_imported" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "imported_by_user_id" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "telegram_chat_id" TEXT,
    "signature_image_path" TEXT,
    "signature_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "office" "ExcoOffice",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_settings" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "date_format" TEXT NOT NULL DEFAULT 'DD-MMM-YY',
    "brand_primary_color" TEXT,
    "brand_logo_url" TEXT,
    "tagline" TEXT,
    "brand_band_colors" TEXT[],
    "bill_to_name" TEXT,
    "bill_to_address_lines" TEXT[],
    "country_code" TEXT NOT NULL DEFAULT 'SG',
    "project_code" TEXT NOT NULL DEFAULT '097',
    "cluster" TEXT NOT NULL DEFAULT 'ARTS',
    "gst_basis_points" INTEGER NOT NULL DEFAULT 900,
    "drive_folder_id" TEXT,
    "register_sheet_id" TEXT,
    "attendance_folder_id" TEXT,
    "session_instructor_defaults" JSONB,
    "paynow_qr_url" TEXT,
    "telegram_chat_id" TEXT,

    CONSTRAINT "organisation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_modules" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_setup_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_setup_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_org_id_idx" ON "notifications"("org_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "dashboard_layouts_user_id_idx" ON "dashboard_layouts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_user_id_org_id_key" ON "dashboard_layouts"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_counters_org_id_series_financial_year_key" ON "reference_counters"("org_id", "series", "financial_year");

-- CreateIndex
CREATE INDEX "reference_numbers_org_id_series_financial_year_idx" ON "reference_numbers"("org_id", "series", "financial_year");

-- CreateIndex
CREATE UNIQUE INDEX "reference_numbers_org_id_series_financial_year_sequence_key" ON "reference_numbers"("org_id", "series", "financial_year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "reference_numbers_org_id_formatted_key" ON "reference_numbers"("org_id", "formatted");

-- CreateIndex
CREATE UNIQUE INDEX "fund_accounts_org_id_financial_year_source_key" ON "fund_accounts"("org_id", "financial_year", "source");

-- CreateIndex
CREATE UNIQUE INDEX "members_user_id_key" ON "members"("user_id");

-- CreateIndex
CREATE INDEX "members_org_id_idx" ON "members"("org_id");

-- CreateIndex
CREATE INDEX "members_org_id_is_active_idx" ON "members"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "members_org_id_student_id_key" ON "members"("org_id", "student_id");

-- CreateIndex
CREATE INDEX "instructors_org_id_idx" ON "instructors"("org_id");

-- CreateIndex
CREATE INDEX "class_sessions_org_id_held_on_idx" ON "class_sessions"("org_id", "held_on");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_org_id_instructor_id_held_on_key" ON "class_sessions"("org_id", "instructor_id", "held_on");

-- CreateIndex
CREATE INDEX "session_attendance_org_id_idx" ON "session_attendance"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_attendance_session_id_member_id_key" ON "session_attendance"("session_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sheets_org_id_instructor_id_period_year_period_m_key" ON "attendance_sheets"("org_id", "instructor_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_reference_number_id_key" ON "invoices"("reference_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_attendance_sheet_id_key" ON "invoices"("attendance_sheet_id");

-- CreateIndex
CREATE INDEX "invoices_org_id_status_idx" ON "invoices"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_org_id_instructor_id_period_year_period_month_key" ON "invoices"("org_id", "instructor_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "terms_org_id_idx" ON "terms"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_org_id_name_key" ON "terms"("org_id", "name");

-- CreateIndex
CREATE INDEX "fee_payments_org_id_status_idx" ON "fee_payments"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_term_id_member_id_key" ON "fee_payments"("term_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_deposits_term_id_key" ON "income_deposits"("term_id");

-- CreateIndex
CREATE UNIQUE INDEX "income_deposits_reference_number_id_key" ON "income_deposits"("reference_number_id");

-- CreateIndex
CREATE INDEX "purchase_requests_org_id_status_idx" ON "purchase_requests"("org_id", "status");

-- CreateIndex
CREATE INDEX "quotations_purchase_request_id_idx" ON "quotations"("purchase_request_id");

-- CreateIndex
CREATE INDEX "register_entries_org_id_financial_year_section_idx" ON "register_entries"("org_id", "financial_year", "section");

-- CreateIndex
CREATE UNIQUE INDEX "register_entries_org_id_source_type_source_id_key" ON "register_entries"("org_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "register_syncs_org_id_status_idx" ON "register_syncs"("org_id", "status");

-- CreateIndex
CREATE INDEX "attendance_imports_org_id_status_idx" ON "attendance_imports"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organisation_memberships_org_id_idx" ON "organisation_memberships"("org_id");

-- CreateIndex
CREATE INDEX "organisation_memberships_user_id_idx" ON "organisation_memberships"("user_id");

-- CreateIndex
CREATE INDEX "organisation_memberships_org_id_office_idx" ON "organisation_memberships"("org_id", "office");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_memberships_user_id_org_id_key" ON "organisation_memberships"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_org_id_idx" ON "invitations"("org_id");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_settings_org_id_key" ON "organisation_settings"("org_id");

-- CreateIndex
CREATE INDEX "organisation_settings_org_id_idx" ON "organisation_settings"("org_id");

-- CreateIndex
CREATE INDEX "organisation_modules_org_id_idx" ON "organisation_modules"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_modules_org_id_module_id_key" ON "organisation_modules"("org_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_setup_progress_user_id_key" ON "org_setup_progress"("user_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_counters" ADD CONSTRAINT "reference_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_numbers" ADD CONSTRAINT "reference_numbers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_accounts" ADD CONSTRAINT "fund_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_last_import_id_fkey" FOREIGN KEY ("last_import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "attendance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_attendance" ADD CONSTRAINT "session_attendance_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sheets" ADD CONSTRAINT "attendance_sheets_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reference_number_id_fkey" FOREIGN KEY ("reference_number_id") REFERENCES "reference_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_attendance_sheet_id_fkey" FOREIGN KEY ("attendance_sheet_id") REFERENCES "attendance_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_declared_by_user_id_fkey" FOREIGN KEY ("declared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_deposits" ADD CONSTRAINT "income_deposits_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_deposits" ADD CONSTRAINT "income_deposits_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_deposits" ADD CONSTRAINT "income_deposits_reference_number_id_fkey" FOREIGN KEY ("reference_number_id") REFERENCES "reference_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_member_id_fkey" FOREIGN KEY ("requested_by_member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_treasurer_approved_by_id_fkey" FOREIGN KEY ("treasurer_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_president_approved_by_id_fkey" FOREIGN KEY ("president_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_sync_id_fkey" FOREIGN KEY ("sync_id") REFERENCES "register_syncs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_syncs" ADD CONSTRAINT "register_syncs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "register_syncs" ADD CONSTRAINT "register_syncs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_imported_by_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_settings" ADD CONSTRAINT "organisation_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_modules" ADD CONSTRAINT "organisation_modules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_setup_progress" ADD CONSTRAINT "org_setup_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


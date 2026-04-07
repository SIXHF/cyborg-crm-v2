CREATE TYPE "public"."call_outcome" AS ENUM('picked_up', 'no_answer', 'voicemail', 'callback', 'wrong_number', 'do_not_call', 'busy', 'other');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'select', 'textarea', 'checkbox');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'running', 'done', 'error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'in_review', 'approved', 'declined', 'forwarded', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('lead_assigned', 'lead_updated', 'comment_added', 'followup_due', 'import_done', 'system');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'processor', 'agent');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"username" varchar(100),
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" bigint,
	"details" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bin_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bin6" varchar(8) NOT NULL,
	"brand" varchar(30),
	"type" varchar(30),
	"issuer" varchar(200),
	"country" varchar(100),
	"prepaid" boolean,
	"source" varchar(50),
	"looked_up" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bin_cache_bin6_unique" UNIQUE("bin6")
);
--> statement-breakpoint
CREATE TABLE "call_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"agent_id" bigint NOT NULL,
	"outcome" "call_outcome",
	"notes" text,
	"call_duration" integer,
	"phone_dialed" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"agent_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collab_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"user_name" varchar(200),
	"user_role" varchar(20),
	"field" varchar(100),
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"field_key" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"field_type" "custom_field_type" DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false,
	"is_searchable" boolean DEFAULT false,
	"show_in_list" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_fields_field_key_unique" UNIQUE("field_key")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"filename" varchar(255),
	"file_path" varchar(500),
	"delimiter" varchar(5),
	"mapping" jsonb,
	"assign_to" bigint,
	"total_rows" integer DEFAULT 0,
	"processed" integer DEFAULT 0,
	"imported" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"error_log" text,
	"import_ref" varchar(100),
	"validation_rules" jsonb,
	"job_token" varchar(64),
	"file_offset" bigint DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ip_whitelist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"label" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_addresses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"address" text,
	"city" varchar(120),
	"state" varchar(80),
	"zip" varchar(20),
	"year_from" integer,
	"year_to" integer,
	"is_current" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"filename" varchar(255) NOT NULL,
	"stored_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"file_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"bank" varchar(120),
	"card_type" varchar(60),
	"noc" varchar(255),
	"ccn" varchar(30),
	"cvc" varchar(10),
	"exp_date" varchar(10),
	"credit_limit" numeric(12, 2),
	"balance" numeric(12, 2),
	"available" numeric(12, 2),
	"last_payment" numeric(12, 2),
	"last_pay_date" date,
	"last_pay_from" varchar(200),
	"last_charge" varchar(200),
	"transactions" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"body" text NOT NULL,
	"is_private" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_cosigners" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"full_name" varchar(200),
	"dob" date,
	"phone" varchar(30),
	"email" varchar(255),
	"ssn" varchar(20),
	"address" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_emails" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"label" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_employers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"employer" varchar(200),
	"position" varchar(120),
	"phone" varchar(30),
	"year_from" integer,
	"year_to" integer,
	"is_current" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_followups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"note" text,
	"is_done" boolean DEFAULT false,
	"notified" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_licenses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"dl_number" varchar(50),
	"dl_state" varchar(10),
	"dl_expiry" date,
	"dl_issued" date,
	"eye_color" varchar(20),
	"hair_color" varchar(20),
	"height" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_relatives" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"full_name" varchar(200),
	"relation" varchar(60),
	"dob" date,
	"phone" varchar(30),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_vehicles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"year" integer,
	"make" varchar(100),
	"model" varchar(100),
	"color" varchar(50),
	"vin" varchar(30),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_views" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ref_number" varchar(20) NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"email" varchar(255),
	"phone" varchar(30),
	"landline" varchar(30),
	"dob" date,
	"ssn_last4" varchar(10),
	"mmn" varchar(120),
	"county" varchar(120),
	"vpass" varchar(255),
	"address" varchar(500),
	"city" varchar(120),
	"state" varchar(80),
	"zip" varchar(20),
	"country" varchar(80),
	"annual_income" numeric(12, 2),
	"employment_status" varchar(60),
	"credit_score_range" varchar(30),
	"requested_limit" numeric(12, 2),
	"card_type" varchar(60),
	"card_number_bin" varchar(8),
	"card_number_masked" varchar(30),
	"card_brand" varchar(30),
	"card_issuer" varchar(200),
	"business_name" varchar(200),
	"business_ein" varchar(20),
	"mortgage_bank" varchar(200),
	"mortgage_payment" numeric(12, 2),
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"agent_id" bigint,
	"assigned_to" bigint,
	"lead_score" integer DEFAULT 0,
	"processor_notes" text,
	"notes" text,
	"import_ref" varchar(100),
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_ref_number_unique" UNIQUE("ref_number")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"username" varchar(100),
	"success" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" "notification_type" NOT NULL,
	"lead_id" bigint,
	"message" text NOT NULL,
	"url" varchar(500),
	"is_read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "phone_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"phone" varchar(30) NOT NULL,
	"carrier" varchar(200),
	"line_type" varchar(30),
	"country" varchar(100),
	"source" varchar(50),
	"looked_up" timestamp with time zone DEFAULT now(),
	CONSTRAINT "phone_cache_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sip_call_debug" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"call_log_id" bigint,
	"sip_call_id" varchar(255),
	"ring_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"end_reason" varchar(50),
	"sip_status" integer,
	"ice_state" varchar(50),
	"local_sdp" text,
	"remote_sdp" text,
	"audio_stats" jsonb,
	"events" jsonb,
	"error_msg" text,
	"server_logs" text,
	"server_data" jsonb,
	"ai_analysis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" bigint,
	"user_id" bigint,
	"phone" varchar(30) NOT NULL,
	"message" text NOT NULL,
	"direction" varchar(10) DEFAULT 'outbound',
	"status" varchar(30),
	"provider" varchar(50),
	"provider_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"module" varchar(50),
	"action" varchar(50),
	"lead_id" bigint,
	"lead_name" varchar(200),
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"page_url" varchar(500),
	"ip" varchar(45),
	"user_agent" text,
	"session_start" timestamp with time zone,
	CONSTRAINT "user_presence_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" "user_role" DEFAULT 'agent' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"leads_visibility" varchar(20) DEFAULT 'own',
	"allowed_ips" text,
	"sip_username" varchar(100),
	"sip_password" varchar(100),
	"force_logout_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_log" ADD CONSTRAINT "call_log_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_queue" ADD CONSTRAINT "call_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_queue" ADD CONSTRAINT "call_queue_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_events" ADD CONSTRAINT "collab_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_events" ADD CONSTRAINT "collab_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_addresses" ADD CONSTRAINT "lead_addresses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cards" ADD CONSTRAINT "lead_cards_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cosigners" ADD CONSTRAINT "lead_cosigners_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_emails" ADD CONSTRAINT "lead_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_employers" ADD CONSTRAINT "lead_employers_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_followups" ADD CONSTRAINT "lead_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_licenses" ADD CONSTRAINT "lead_licenses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_relatives" ADD CONSTRAINT "lead_relatives_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_vehicles" ADD CONSTRAINT "lead_vehicles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_views" ADD CONSTRAINT "lead_views_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_views" ADD CONSTRAINT "lead_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sip_call_debug" ADD CONSTRAINT "sip_call_debug_call_log_id_call_log_id_fk" FOREIGN KEY ("call_log_id") REFERENCES "public"."call_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_call_log_lead" ON "call_log" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_call_log_agent" ON "call_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_call_log_created" ON "call_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_call_queue_agent" ON "call_queue" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_call_queue_agent_lead" ON "call_queue" USING btree ("agent_id","lead_id");--> statement-breakpoint
CREATE INDEX "idx_collab_lead" ON "collab_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_user" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_addresses_lead" ON "lead_addresses" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_attachments_lead" ON "lead_attachments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_cards_lead" ON "lead_cards" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_comments_lead" ON "lead_comments" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_comments_user" ON "lead_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lead_cosigners_lead" ON "lead_cosigners" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_emails_lead" ON "lead_emails" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_employers_lead" ON "lead_employers" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_followups_lead" ON "lead_followups" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_followups_due" ON "lead_followups" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "idx_lead_followups_user" ON "lead_followups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lead_licenses_lead" ON "lead_licenses" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_relatives_lead" ON "lead_relatives" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_vehicles_lead" ON "lead_vehicles" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_views_lead" ON "lead_views" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leads_agent" ON "leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_leads_assigned" ON "leads" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_leads_created" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_leads_email" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_leads_phone" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_leads_ssn" ON "leads" USING btree ("ssn_last4");--> statement-breakpoint
CREATE INDEX "idx_leads_ref" ON "leads" USING btree ("ref_number");--> statement-breakpoint
CREATE INDEX "idx_leads_import_ref" ON "leads" USING btree ("import_ref");--> statement-breakpoint
CREATE INDEX "idx_leads_name" ON "leads" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_unread" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sip_debug_call" ON "sip_call_debug" USING btree ("call_log_id");--> statement-breakpoint
CREATE INDEX "idx_sms_log_lead" ON "sms_log" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_sms_log_phone" ON "sms_log" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_sms_log_created" ON "sms_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_active" ON "users" USING btree ("is_active");
import {
  pgTable, serial, bigserial, text, varchar, integer, bigint, boolean,
  timestamp, date, decimal, jsonb, uniqueIndex, index, pgEnum,
} from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['admin', 'processor', 'agent']);
export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'in_review', 'approved', 'declined', 'forwarded', 'on_hold',
]);
export const importStatusEnum = pgEnum('import_status', [
  'pending', 'running', 'done', 'error', 'cancelled',
]);
export const callOutcomeEnum = pgEnum('call_outcome', [
  'picked_up', 'no_answer', 'voicemail', 'callback', 'wrong_number', 'do_not_call', 'busy', 'other',
]);
export const customFieldTypeEnum = pgEnum('custom_field_type', [
  'text', 'number', 'date', 'select', 'textarea', 'checkbox',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'lead_assigned', 'lead_updated', 'comment_added', 'followup_due', 'import_done', 'system',
]);

// ─── Users & Auth ───────────────────────────────────────
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  role: userRoleEnum('role').notNull().default('agent'),
  isActive: boolean('is_active').notNull().default(true),
  leadsVisibility: varchar('leads_visibility', { length: 20 }).default('own'),
  allowedIps: text('allowed_ips'),
  sipUsername: varchar('sip_username', { length: 100 }),
  sipPassword: varchar('sip_password', { length: 100 }),
  forceLogoutAt: timestamp('force_logout_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp: varchar('last_login_ip', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_users_role').on(t.role),
  index('idx_users_active').on(t.isActive),
]);

export const passwordResets = pgTable('password_resets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sessions_user').on(t.userId),
  index('idx_sessions_expires').on(t.expiresAt),
]);

export const loginAttempts = pgTable('login_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  username: varchar('username', { length: 100 }),
  success: boolean('success').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_login_attempts_ip').on(t.ipAddress),
]);

// ─── Leads (Core) ───────────────────────────────────────
export const leads = pgTable('leads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  refNumber: varchar('ref_number', { length: 20 }).notNull().unique(),
  firstName: varchar('first_name', { length: 120 }),
  lastName: varchar('last_name', { length: 120 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 30 }),
  landline: varchar('landline', { length: 30 }),
  dob: date('dob'),
  ssnLast4: varchar('ssn_last4', { length: 10 }),
  mmn: varchar('mmn', { length: 120 }),
  county: varchar('county', { length: 120 }),
  vpass: varchar('vpass', { length: 255 }),
  address: varchar('address', { length: 500 }),
  city: varchar('city', { length: 120 }),
  state: varchar('state', { length: 80 }),
  zip: varchar('zip', { length: 20 }),
  country: varchar('country', { length: 80 }),
  annualIncome: decimal('annual_income', { precision: 12, scale: 2 }),
  employmentStatus: varchar('employment_status', { length: 60 }),
  creditScoreRange: varchar('credit_score_range', { length: 30 }),
  requestedLimit: decimal('requested_limit', { precision: 12, scale: 2 }),
  cardType: varchar('card_type', { length: 60 }),
  cardNumberBin: varchar('card_number_bin', { length: 8 }),
  cardNumberMasked: varchar('card_number_masked', { length: 30 }),
  cardBrand: varchar('card_brand', { length: 30 }),
  cardIssuer: varchar('card_issuer', { length: 200 }),
  businessName: varchar('business_name', { length: 200 }),
  businessEin: varchar('business_ein', { length: 20 }),
  mortgageBank: varchar('mortgage_bank', { length: 200 }),
  mortgagePayment: decimal('mortgage_payment', { precision: 12, scale: 2 }),
  status: leadStatusEnum('status').notNull().default('new'),
  agentId: bigint('agent_id', { mode: 'number' }).references(() => users.id),
  assignedTo: bigint('assigned_to', { mode: 'number' }).references(() => users.id),
  leadScore: integer('lead_score').default(0),
  processorNotes: text('processor_notes'),
  notes: text('notes'),
  importRef: varchar('import_ref', { length: 100 }),
  customFields: jsonb('custom_fields').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_leads_status').on(t.status),
  index('idx_leads_agent').on(t.agentId),
  index('idx_leads_assigned').on(t.assignedTo),
  index('idx_leads_created').on(t.createdAt),
  index('idx_leads_email').on(t.email),
  index('idx_leads_phone').on(t.phone),
  index('idx_leads_ssn').on(t.ssnLast4),
  index('idx_leads_ref').on(t.refNumber),
  index('idx_leads_import_ref').on(t.importRef),
  index('idx_leads_name').on(t.lastName, t.firstName),
]);

// ─── Lead Sub-Tables ────────────────────────────────────
export const leadCards = pgTable('lead_cards', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  bank: varchar('bank', { length: 120 }),
  cardType: varchar('card_type', { length: 60 }),
  noc: varchar('noc', { length: 255 }),
  ccn: varchar('ccn', { length: 30 }),
  cvc: varchar('cvc', { length: 10 }),
  expDate: varchar('exp_date', { length: 10 }),
  creditLimit: decimal('credit_limit', { precision: 12, scale: 2 }),
  balance: decimal('balance', { precision: 12, scale: 2 }),
  available: decimal('available', { precision: 12, scale: 2 }),
  lastPayment: decimal('last_payment', { precision: 12, scale: 2 }),
  lastPayDate: date('last_pay_date'),
  lastPayFrom: varchar('last_pay_from', { length: 200 }),
  lastCharge: varchar('last_charge', { length: 200 }),
  transactions: text('transactions'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_cards_lead').on(t.leadId),
]);

export const leadCosigners = pgTable('lead_cosigners', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 200 }),
  dob: date('dob'),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 255 }),
  ssn: varchar('ssn', { length: 20 }),
  address: text('address'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_cosigners_lead').on(t.leadId),
]);

export const leadEmployers = pgTable('lead_employers', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  employer: varchar('employer', { length: 200 }),
  position: varchar('position', { length: 120 }),
  phone: varchar('phone', { length: 30 }),
  yearFrom: integer('year_from'),
  yearTo: integer('year_to'),
  isCurrent: boolean('is_current').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_employers_lead').on(t.leadId),
]);

export const leadVehicles = pgTable('lead_vehicles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  year: integer('year'),
  make: varchar('make', { length: 100 }),
  model: varchar('model', { length: 100 }),
  color: varchar('color', { length: 50 }),
  vin: varchar('vin', { length: 30 }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_vehicles_lead').on(t.leadId),
]);

export const leadRelatives = pgTable('lead_relatives', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 200 }),
  relation: varchar('relation', { length: 60 }),
  dob: date('dob'),
  phone: varchar('phone', { length: 30 }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_relatives_lead').on(t.leadId),
]);

export const leadAddresses = pgTable('lead_addresses', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  address: text('address'),
  city: varchar('city', { length: 120 }),
  state: varchar('state', { length: 80 }),
  zip: varchar('zip', { length: 20 }),
  yearFrom: integer('year_from'),
  yearTo: integer('year_to'),
  isCurrent: boolean('is_current').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_addresses_lead').on(t.leadId),
]);

export const leadEmails = pgTable('lead_emails', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  label: varchar('label', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_emails_lead').on(t.leadId),
]);

export const leadLicenses = pgTable('lead_licenses', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  dlNumber: varchar('dl_number', { length: 50 }),
  dlState: varchar('dl_state', { length: 10 }),
  dlExpiry: date('dl_expiry'),
  dlIssued: date('dl_issued'),
  eyeColor: varchar('eye_color', { length: 20 }),
  hairColor: varchar('hair_color', { length: 20 }),
  height: varchar('height', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_licenses_lead').on(t.leadId),
]);

// ─── Interactions ───────────────────────────────────────
export const leadComments = pgTable('lead_comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  body: text('body').notNull(),
  isPrivate: boolean('is_private').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_comments_lead').on(t.leadId),
  index('idx_lead_comments_user').on(t.userId),
]);

export const leadAttachments = pgTable('lead_attachments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  filename: varchar('filename', { length: 255 }).notNull(),
  storedName: varchar('stored_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_attachments_lead').on(t.leadId),
]);

export const leadFollowups = pgTable('lead_followups', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  note: text('note'),
  isDone: boolean('is_done').default(false),
  notified: boolean('notified').default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_followups_lead').on(t.leadId),
  index('idx_lead_followups_due').on(t.dueAt),
  index('idx_lead_followups_user').on(t.userId),
]);

export const leadViews = pgTable('lead_views', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_lead_views_lead').on(t.leadId),
]);

// ─── Custom Fields ──────────────────────────────────────
export const customFields = pgTable('custom_fields', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  fieldKey: varchar('field_key', { length: 100 }).notNull().unique(),
  label: varchar('label', { length: 200 }).notNull(),
  fieldType: customFieldTypeEnum('field_type').notNull().default('text'),
  options: jsonb('options'),
  isRequired: boolean('is_required').default(false),
  isSearchable: boolean('is_searchable').default(false),
  showInList: boolean('show_in_list').default(false),
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Call Management ────────────────────────────────────
export const callQueue = pgTable('call_queue', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_call_queue_agent').on(t.agentId),
  uniqueIndex('uq_call_queue_agent_lead').on(t.agentId, t.leadId),
]);

export const callLog = pgTable('call_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  agentId: bigint('agent_id', { mode: 'number' }).notNull().references(() => users.id),
  outcome: callOutcomeEnum('outcome'),
  notes: text('notes'),
  callDuration: integer('call_duration'),
  phoneDialed: varchar('phone_dialed', { length: 30 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_call_log_lead').on(t.leadId),
  index('idx_call_log_agent').on(t.agentId),
  index('idx_call_log_created').on(t.createdAt),
]);

export const sipCallDebug = pgTable('sip_call_debug', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  callLogId: bigint('call_log_id', { mode: 'number' }).references(() => callLog.id, { onDelete: 'cascade' }),
  sipCallId: varchar('sip_call_id', { length: 255 }),
  ringAt: timestamp('ring_at', { withTimezone: true }),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'),
  endReason: varchar('end_reason', { length: 50 }),
  sipStatus: integer('sip_status'),
  iceState: varchar('ice_state', { length: 50 }),
  localSdp: text('local_sdp'),
  remoteSdp: text('remote_sdp'),
  audioStats: jsonb('audio_stats'),
  events: jsonb('events'),
  errorMsg: text('error_msg'),
  serverLogs: text('server_logs'),
  serverData: jsonb('server_data'),
  aiAnalysis: text('ai_analysis'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sip_debug_call').on(t.callLogId),
]);

// ─── SMS ────────────────────────────────────────────────
export const smsLog = pgTable('sms_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).references(() => leads.id, { onDelete: 'set null' }),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
  phone: varchar('phone', { length: 30 }).notNull(),
  message: text('message').notNull(),
  direction: varchar('direction', { length: 10 }).default('outbound'),
  status: varchar('status', { length: 30 }),
  provider: varchar('provider', { length: 50 }),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sms_log_lead').on(t.leadId),
  index('idx_sms_log_phone').on(t.phone),
  index('idx_sms_log_created').on(t.createdAt),
]);

// ─── Import Jobs ────────────────────────────────────────
export const importJobs = pgTable('import_jobs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  filename: varchar('filename', { length: 255 }),
  filePath: varchar('file_path', { length: 500 }),
  delimiter: varchar('delimiter', { length: 5 }),
  mapping: jsonb('mapping'),
  assignTo: bigint('assign_to', { mode: 'number' }),
  totalRows: integer('total_rows').default(0),
  processed: integer('processed').default(0),
  imported: integer('imported').default(0),
  failed: integer('failed').default(0),
  status: importStatusEnum('status').notNull().default('pending'),
  errorLog: text('error_log'),
  importRef: varchar('import_ref', { length: 100 }),
  validationRules: jsonb('validation_rules'),
  jobToken: varchar('job_token', { length: 64 }),
  fileOffset: bigint('file_offset', { mode: 'number' }).default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [
  index('idx_import_jobs_user').on(t.userId),
  index('idx_import_jobs_status').on(t.status),
]);

// ─── Cache Tables ───────────────────────────────────────
export const binCache = pgTable('bin_cache', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bin6: varchar('bin6', { length: 8 }).notNull().unique(),
  brand: varchar('brand', { length: 30 }),
  type: varchar('type', { length: 30 }),
  issuer: varchar('issuer', { length: 200 }),
  country: varchar('country', { length: 100 }),
  prepaid: boolean('prepaid'),
  source: varchar('source', { length: 50 }),
  lookedUp: timestamp('looked_up', { withTimezone: true }).defaultNow(),
});

export const phoneCache = pgTable('phone_cache', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  phone: varchar('phone', { length: 30 }).notNull().unique(),
  carrier: varchar('carrier', { length: 200 }),
  lineType: varchar('line_type', { length: 30 }),
  country: varchar('country', { length: 100 }),
  source: varchar('source', { length: 50 }),
  lookedUp: timestamp('looked_up', { withTimezone: true }).defaultNow(),
});

// ─── System ─────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  username: varchar('username', { length: 100 }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: bigint('entity_id', { mode: 'number' }),
  details: text('details'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_audit_user').on(t.userId),
  index('idx_audit_action').on(t.action),
  index('idx_audit_entity').on(t.entityType, t.entityId),
  index('idx_audit_created').on(t.createdAt),
]);

export const notifications = pgTable('notifications', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  leadId: bigint('lead_id', { mode: 'number' }).references(() => leads.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  url: varchar('url', { length: 500 }),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user').on(t.userId),
  index('idx_notifications_unread').on(t.userId, t.isRead),
]);

export const collabEvents = pgTable('collab_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  leadId: bigint('lead_id', { mode: 'number' }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  userName: varchar('user_name', { length: 200 }),
  userRole: varchar('user_role', { length: 20 }),
  field: varchar('field', { length: 100 }),
  value: text('value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_collab_lead').on(t.leadId),
]);

export const userPresence = pgTable('user_presence', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  module: varchar('module', { length: 50 }),
  action: varchar('action', { length: 50 }),
  leadId: bigint('lead_id', { mode: 'number' }),
  leadName: varchar('lead_name', { length: 200 }),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  pageUrl: varchar('page_url', { length: 500 }),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  sessionStart: timestamp('session_start', { withTimezone: true }),
});

export const appSettings = pgTable('app_settings', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ipWhitelist = pgTable('ip_whitelist', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  label: varchar('label', { length: 200 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

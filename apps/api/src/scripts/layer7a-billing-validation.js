#!/usr/bin/env node
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const API_BASE = process.env.LAYER7A_API_BASE || 'http://127.0.0.1:5050';
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function api(path, token, method = 'GET', body = null, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function ensureAgencyAdmin(orgId, email) {
  const password = 'Agency1234!';
  const hash = await bcrypt.hash(password, 10);
  const user = await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1,$2,$3,'Agency','Admin','agency_admin',true)
     ON CONFLICT (email) DO UPDATE SET role='agency_admin', is_active=true, password_hash=EXCLUDED.password_hash
     RETURNING id,email`,
    [randomUUID(), email, hash]
  );
  await db.query(
    `INSERT INTO organisation_members (id, organisation_id, user_id, role)
     VALUES ($1,$2,$3,'agency_admin')
     ON CONFLICT (organisation_id, user_id) DO UPDATE SET role='agency_admin'`,
    [randomUUID(), orgId, user.rows[0].id]
  );
  return { email: user.rows[0].email, password };
}

async function main() {
  assertOk(ADMIN_EMAIL && ADMIN_PASSWORD, 'Missing SUPER_ADMIN credentials');
  const auth = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assertOk(auth.status === 200 && auth.data.token, 'Super admin login failed');
  const adminToken = auth.data.token;

  const orgs = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 2');
  assertOk(orgs.rows.length >= 2, 'Need at least two organisations for tenant isolation validation');
  const orgA = orgs.rows[0].id;
  const orgB = orgs.rows[1].id;

  const adminA = await ensureAgencyAdmin(orgA, 'layer7a-agency-a@example.com');
  const adminB = await ensureAgencyAdmin(orgB, 'layer7a-agency-b@example.com');
  const loginA = await login(adminA.email, adminA.password);
  const loginB = await login(adminB.email, adminB.password);
  assertOk(loginA.status === 200 && loginA.data.token, 'Agency A login failed');
  assertOk(loginB.status === 200 && loginB.data.token, 'Agency B login failed');
  const tokenA = loginA.data.token;
  const tokenB = loginB.data.token;

  const generateAll = await api('/api/v1/admin/enterprise/billing/platform/generate-monthly', adminToken, 'POST', {}, { 'x-org-id': orgA });
  assertOk(generateAll.status === 200, `Platform monthly generation failed (${generateAll.status})`);

  const platformInvoices = await api('/api/v1/admin/enterprise/billing/platform/invoices', adminToken, 'GET', null, { 'x-org-id': orgA });
  assertOk(platformInvoices.status === 200, 'Platform invoice list failed');
  assertOk((platformInvoices.data.data || []).length > 0, 'No invoices generated');

  const agencyDashA = await api('/api/v1/admin/enterprise/billing/agency/dashboard', tokenA, 'GET', null, { 'x-org-id': orgA });
  assertOk(agencyDashA.status === 200, 'Agency dashboard failed');
  const estimate = agencyDashA.data?.data?.current_estimate || {};
  assertOk(Number(estimate.total_amount) >= 30, 'Monthly base billing incorrect');

  const agencyGenerate1 = await api('/api/v1/admin/enterprise/billing/agency/invoices/generate', tokenA, 'POST', {}, { 'x-org-id': orgA });
  const agencyGenerate2 = await api('/api/v1/admin/enterprise/billing/agency/invoices/generate', tokenA, 'POST', {}, { 'x-org-id': orgA });
  assertOk([200, 201].includes(agencyGenerate1.status), 'Agency invoice generate #1 failed');
  assertOk([200, 201].includes(agencyGenerate2.status), 'Agency invoice generate #2 failed');

  const dupCheck = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM billing_invoices
     WHERE organisation_id = $1 AND billing_month = date_trunc('month', NOW())::date`,
    [orgA]
  );
  assertOk(dupCheck.rows[0].count === 1, 'Duplicate invoice prevention failed');

  const invoiceId = agencyDashA.data?.data?.invoices?.[0]?.id;
  assertOk(invoiceId, 'No invoice id available');
  const markPaid = await api(`/api/v1/admin/enterprise/billing/platform/invoices/${invoiceId}/mark-paid`, adminToken, 'POST', {}, { 'x-org-id': orgA });
  assertOk(markPaid.status === 200, 'Mark invoice paid failed');

  const suspend = await api(`/api/v1/admin/enterprise/billing/platform/organisations/${orgA}/subscription-state`, adminToken, 'POST', { state: 'suspended' }, { 'x-org-id': orgA });
  assertOk(suspend.status === 200, 'Suspend agency failed');
  const reactivate = await api(`/api/v1/admin/enterprise/billing/platform/organisations/${orgA}/subscription-state`, adminToken, 'POST', { state: 'active' }, { 'x-org-id': orgA });
  assertOk(reactivate.status === 200, 'Reactivate agency failed');

  const crossAttempt = await api(`/api/v1/admin/enterprise/billing/agency/invoices/${invoiceId}`, tokenB, 'GET', null, { 'x-org-id': orgB });
  assertOk(crossAttempt.status === 403, 'Cross-tenant invoice access should be blocked');

  const usageConsistency = await db.query(
    `SELECT
      (SELECT COUNT(*)::int FROM certificates WHERE organisation_id = $1) AS certs,
      (SELECT COUNT(*)::int FROM billing_certificate_usage WHERE organisation_id = $1) AS usage_rows`,
    [orgA]
  );
  assertOk(Number(usageConsistency.rows[0].usage_rows) <= Number(usageConsistency.rows[0].certs), 'Certificate usage recount inconsistent');

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action LIKE 'layer7a_billing_%'`
  );
  assertOk(audit.rows[0].count >= 5, 'Billing audit trail incomplete');

  console.log(`layer7a_validation_ok ${JSON.stringify({
    invoices_total: platformInvoices.data.data.length,
    agency_estimate_total: estimate.total_amount,
    duplicate_invoice_count_month: dupCheck.rows[0].count,
    cross_tenant_blocked: true,
    audit_rows: audit.rows[0].count,
    usage_rows_orgA: usageConsistency.rows[0].usage_rows,
  })}`);
}

main().catch((err) => {
  console.error(`layer7a_validation_fail ${err.message}`);
  process.exit(1);
});

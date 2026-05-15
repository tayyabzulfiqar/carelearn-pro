#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER7B_API_BASE || 'http://127.0.0.1:5050';
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

async function main() {
  const auth = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assertOk(auth.status === 200 && auth.data.token, 'Platform owner/super admin login failed');
  const token = auth.data.token;

  const uniq = Date.now();
  const agencyName = `Layer7B Care ${uniq}`;
  const adminEmail = `layer7b-admin-${uniq}@example.com`;
  const onboard = await api('/api/v1/admin/platform/agencies/onboard', token, 'POST', {
    agency_name: agencyName,
    admin_full_name: 'Layer SevenB Admin',
    admin_email: adminEmail,
    phone: '+49123456789',
    notes: 'demo onboarding',
  });
  assertOk(onboard.status === 201, `Onboarding failed (${onboard.status})`);
  const payload = onboard.data.data || {};
  assertOk(payload.temporary_password, 'Temporary password missing');
  assertOk(payload.organisation?.id, 'Organisation missing');
  assertOk(payload.billing_invoice_id, 'Billing profile/invoice missing');
  assertOk(Number(payload.starter_course_assignments) >= 0, 'Starter course assignment missing');

  const adminLogin = await login(adminEmail, payload.temporary_password);
  assertOk(adminLogin.status === 200, 'Agency admin login with temporary password failed');
  const agencyToken = adminLogin.data.token;
  const orgId = payload.organisation.id;

  const sub = await api(`/api/v1/admin/platform/organisations/${orgId}/subscription`, token, 'GET');
  assertOk(sub.status === 200, 'Subscription fetch failed');
  assertOk(sub.data?.data?.subscription?.state === 'trial', 'Trial state not enabled');

  const agencyBilling = await api('/api/v1/admin/enterprise/billing/agency/dashboard', agencyToken, 'GET', null, { 'x-org-id': orgId });
  assertOk(agencyBilling.status === 200, 'Agency billing dashboard unavailable');

  const orgMembers = await api(`/api/v1/organisations/${orgId}/members`, agencyToken, 'GET', null, { 'x-org-id': orgId });
  assertOk(orgMembers.status === 200, 'Agency members endpoint failed');
  assertOk((orgMembers.data.members || []).some((m) => String(m.email).toLowerCase() === adminEmail.toLowerCase()), 'Agency admin membership missing');

  const invoices = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM billing_invoices
     WHERE organisation_id = $1`,
    [orgId]
  );
  assertOk(invoices.rows[0].count >= 1, 'Billing invoice not persisted');

  const dup = await api('/api/v1/admin/platform/agencies/onboard', token, 'POST', {
    agency_name: `${agencyName} Duplicate`,
    admin_full_name: 'Layer SevenB Dup',
    admin_email: adminEmail,
  });
  assertOk(dup.status === 409, 'Duplicate admin email prevention failed');

  const otherOrg = await db.query('SELECT id FROM organisations WHERE id <> $1 ORDER BY created_at ASC LIMIT 1', [orgId]);
  if (otherOrg.rows.length) {
    const foreignOrgId = otherOrg.rows[0].id;
    const foreignInvoices = await db.query(
      `SELECT id FROM billing_invoices WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [foreignOrgId]
    );
    if (foreignInvoices.rows.length) {
      const cross = await api(`/api/v1/admin/enterprise/billing/agency/invoices/${foreignInvoices.rows[0].id}`, agencyToken, 'GET', null, { 'x-org-id': orgId });
      assertOk(cross.status === 403, 'Cross-tenant invoice access not blocked');
    }
  }

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('platform_agency_onboard','layer7a_billing_agency_dashboard')`
  );
  assertOk(audit.rows[0].count >= 2, 'Onboarding audit rows missing');

  console.log(`layer7b_validation_ok ${JSON.stringify({
    organisation_id: orgId,
    starter_course_assignments: payload.starter_course_assignments,
    trial_state: sub.data?.data?.subscription?.state,
    invoice_count: invoices.rows[0].count,
    duplicate_prevention: true,
    audit_rows: audit.rows[0].count,
  })}`);
}

main().catch((err) => {
  console.error(`layer7b_validation_fail ${err.message}`);
  process.exit(1);
});

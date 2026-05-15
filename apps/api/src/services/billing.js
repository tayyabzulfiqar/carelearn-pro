const { randomUUID } = require('crypto');
const db = require('../config/database');
const { getSubscriptionState, setSubscriptionState } = require('../middleware/subscription');

const BASE_MONTHLY_PRICE = 30;
const CERTIFICATE_PRICE = 5;

function monthStart(value = new Date()) {
  const d = new Date(value);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function monthLabel(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function invoiceNumber(organisationId, billingMonth) {
  const compact = String(organisationId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  const month = monthLabel(billingMonth).slice(0, 7).replace('-', '');
  return `INV-${month}-${compact}`;
}

async function recordCertificateUsage(certificate) {
  if (!certificate?.id || !certificate?.organisation_id) return;
  const billingMonth = monthStart(certificate.issued_at || new Date());
  await db.query(
    `INSERT INTO billing_certificate_usage
     (id, organisation_id, certificate_id, billing_month, unit_price, amount)
     VALUES ($1,$2,$3,$4,$5,$5)
     ON CONFLICT (certificate_id) DO NOTHING`,
    [randomUUID(), certificate.organisation_id, certificate.id, monthLabel(billingMonth), CERTIFICATE_PRICE]
  );
}

async function computeInvoiceValues(organisationId, billingMonthDate) {
  const usage = await db.query(
    `SELECT COUNT(*)::int AS certificate_count, COALESCE(SUM(amount),0)::numeric(10,2) AS certificate_amount
     FROM billing_certificate_usage
     WHERE organisation_id = $1 AND billing_month = $2`,
    [organisationId, monthLabel(billingMonthDate)]
  );
  const certificateCount = Number(usage.rows[0]?.certificate_count || 0);
  const certificateAmount = Number(usage.rows[0]?.certificate_amount || 0);
  const totalAmount = Number((BASE_MONTHLY_PRICE + certificateAmount).toFixed(2));
  return { certificateCount, certificateAmount, totalAmount };
}

async function ensureInvoiceForMonth(organisationId, billingMonthDate, actorId = null) {
  const agencyRow = await db.query(
    `SELECT a.id
     FROM agencies a
     JOIN organisations o ON o.slug = a.slug
     WHERE o.id = $1
     LIMIT 1`,
    [organisationId]
  );
  const agencyId = agencyRow.rows[0]?.id || null;
  const values = await computeInvoiceValues(organisationId, billingMonthDate);
  const invNo = invoiceNumber(organisationId, billingMonthDate);
  const row = await db.query(
    `INSERT INTO billing_invoices
     (id, organisation_id, agency_id, invoice_number, billing_month, base_monthly_price, certificate_count, certificate_amount, total_amount, payment_status, due_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unpaid', NOW() + interval '14 days', $10)
     ON CONFLICT (organisation_id, billing_month)
     DO UPDATE SET
      base_monthly_price = EXCLUDED.base_monthly_price,
      certificate_count = EXCLUDED.certificate_count,
      certificate_amount = EXCLUDED.certificate_amount,
      total_amount = EXCLUDED.total_amount,
      updated_at = NOW(),
      metadata = billing_invoices.metadata || EXCLUDED.metadata
     RETURNING *`,
    [
      randomUUID(),
      organisationId,
      agencyId,
      invNo,
      monthLabel(billingMonthDate),
      BASE_MONTHLY_PRICE,
      values.certificateCount,
      values.certificateAmount,
      values.totalAmount,
      { generated_by: actorId, generated_at: new Date().toISOString() },
    ]
  );
  return row.rows[0];
}

async function markInvoicePaid(invoiceId) {
  const row = await db.query(
    `UPDATE billing_invoices
     SET payment_status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [invoiceId]
  );
  return row.rows[0] || null;
}

async function setOrganisationBillingState(organisationId, state, actorId) {
  const current = await getSubscriptionState(organisationId);
  return setSubscriptionState({
    organisationId,
    actorId,
    payload: {
      ...current,
      state,
    },
  });
}

async function seedDemoBillingData() {
  const existing = await db.query('SELECT COUNT(*)::int AS count FROM billing_invoices');
  if (Number(existing.rows[0]?.count || 0) > 0) return { seeded: false };
  const orgs = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 3');
  if (!orgs.rows.length) return { seeded: false };
  const states = ['active', 'trial', 'unpaid'];
  const seededInvoices = [];
  for (let i = 0; i < orgs.rows.length; i += 1) {
    const orgId = orgs.rows[i].id;
    const currentMonth = monthStart();
    const previousMonth = monthStart(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    await ensureInvoiceForMonth(orgId, previousMonth, null);
    const inv = await ensureInvoiceForMonth(orgId, currentMonth, null);
    if (i === 0) {
      await db.query("UPDATE billing_invoices SET payment_status='paid', paid_at=NOW() WHERE id=$1", [inv.id]);
    }
    await setOrganisationBillingState(orgId, states[i] || 'active', null);
    seededInvoices.push(inv.id);
  }
  return { seeded: true, invoices: seededInvoices.length };
}

module.exports = {
  BASE_MONTHLY_PRICE,
  CERTIFICATE_PRICE,
  monthStart,
  monthLabel,
  recordCertificateUsage,
  computeInvoiceValues,
  ensureInvoiceForMonth,
  markInvoicePaid,
  setOrganisationBillingState,
  seedDemoBillingData,
};

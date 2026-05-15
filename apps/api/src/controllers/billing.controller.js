const db = require('../config/database');
const {
  BASE_MONTHLY_PRICE,
  CERTIFICATE_PRICE,
  monthStart,
  monthLabel,
  computeInvoiceValues,
  ensureInvoiceForMonth,
  markInvoicePaid,
  setOrganisationBillingState,
} = require('../services/billing');
const { getSubscriptionState } = require('../middleware/subscription');
const { isGlobalRole } = require('../middleware/tenantAccess');

function resolveOrgId(req) {
  return req.scopedOrganisationId || req.tenant?.organisationId || req.headers['x-org-id'] || null;
}

exports.generateMonthlyInvoices = async (req, res, next) => {
  try {
    const billingMonth = monthStart(req.body?.billing_month ? new Date(req.body.billing_month) : new Date());
    const orgs = await db.query('SELECT id FROM organisations ORDER BY created_at ASC');
    const invoices = [];
    for (const row of orgs.rows) {
      invoices.push(await ensureInvoiceForMonth(row.id, billingMonth, req.user.id));
    }
    return res.json({ success: true, data: { billing_month: monthLabel(billingMonth), invoices_generated: invoices.length } });
  } catch (err) {
    return next(err);
  }
};

exports.listPlatformInvoices = async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT bi.*, o.name AS organisation_name, a.name AS agency_name
       FROM billing_invoices bi
       JOIN organisations o ON o.id = bi.organisation_id
       LEFT JOIN agencies a ON a.id = bi.agency_id
       ORDER BY bi.billing_month DESC, bi.created_at DESC
       LIMIT 500`
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return next(err);
  }
};

exports.platformBillingDashboard = async (_req, res, next) => {
  try {
    const summary = await db.query(
      `SELECT
         COUNT(*)::int AS invoice_count,
         COUNT(*) FILTER (WHERE payment_status='unpaid')::int AS unpaid_count,
         COALESCE(SUM(total_amount),0)::numeric(10,2) AS total_amount
       FROM billing_invoices`
    );
    const unpaidAgencies = await db.query(
      `SELECT DISTINCT o.id, o.name
       FROM billing_invoices bi
       JOIN organisations o ON o.id = bi.organisation_id
       WHERE bi.payment_status = 'unpaid'
       ORDER BY o.name ASC`
    );
    return res.json({ success: true, data: { summary: summary.rows[0], unpaid_agencies: unpaidAgencies.rows } });
  } catch (err) {
    return next(err);
  }
};

exports.markInvoicePaid = async (req, res, next) => {
  try {
    const invoice = await markInvoicePaid(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    return res.json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

exports.setAgencySubscriptionState = async (req, res, next) => {
  try {
    const { organisationId } = req.params;
    const { state } = req.body || {};
    if (!['active', 'trial', 'suspended', 'unpaid', 'cancelled'].includes(state)) {
      return res.status(422).json({ error: 'Invalid subscription state' });
    }
    const mappedState = state === 'unpaid' ? 'suspended' : state;
    const sub = await setOrganisationBillingState(organisationId, mappedState, req.user.id);
    return res.json({ success: true, data: { requested_state: state, applied_subscription_state: mappedState, subscription: sub } });
  } catch (err) {
    return next(err);
  }
};

exports.getAgencyBillingDashboard = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const currentMonth = monthStart();
    const estimate = await computeInvoiceValues(organisationId, currentMonth);
    const subscription = await getSubscriptionState(organisationId);
    const invoices = await db.query(
      `SELECT id, invoice_number, billing_month, certificate_count, base_monthly_price, certificate_amount, total_amount, payment_status, issued_at, paid_at
       FROM billing_invoices
       WHERE organisation_id = $1
       ORDER BY billing_month DESC
       LIMIT 24`,
      [organisationId]
    );
    return res.json({
      success: true,
      data: {
        subscription_state: subscription.state,
        pricing: { base_monthly_price: BASE_MONTHLY_PRICE, certificate_price: CERTIFICATE_PRICE },
        current_month: monthLabel(currentMonth),
        current_estimate: {
          certificate_count: estimate.certificateCount,
          certificate_amount: estimate.certificateAmount,
          total_amount: estimate.totalAmount,
        },
        invoices: invoices.rows,
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getInvoiceById = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    const result = await db.query('SELECT * FROM billing_invoices WHERE id = $1 LIMIT 1', [req.params.invoiceId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = result.rows[0];
    if (!isGlobalRole(req.user.role) && invoice.organisation_id !== organisationId) {
      return res.status(403).json({ error: 'Cross-tenant invoice access blocked' });
    }
    return res.json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

exports.generateAgencyInvoice = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const billingMonth = monthStart(req.body?.billing_month ? new Date(req.body.billing_month) : new Date());
    const invoice = await ensureInvoiceForMonth(organisationId, billingMonth, req.user.id);
    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

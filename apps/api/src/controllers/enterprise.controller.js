const crypto = require('crypto');
const db = require('../config/database');
const { getSubscriptionState } = require('../middleware/subscription');
const { isGlobalRole } = require('../middleware/tenantAccess');

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function resolveOrgId(req) {
  return req.scopedOrganisationId || req.tenant?.organisationId || req.headers['x-org-id'] || null;
}

async function createNotification({
  organisationId,
  userId,
  type,
  title,
  body,
  payload,
  dedupKey,
  cooldownHours = 24,
}) {
  const now = new Date();
  const payloadHash = hashPayload(payload || {});
  const state = await db.query(
    `SELECT id, cooldown_until, payload_hash
     FROM notification_delivery_state
     WHERE organisation_id = $1 AND type = $2 AND dedup_key = $3
     LIMIT 1`,
    [organisationId, type, dedupKey]
  );
  if (state.rows.length) {
    const row = state.rows[0];
    if (new Date(row.cooldown_until) > now && row.payload_hash === payloadHash) {
      return { created: false, reason: 'cooldown_active' };
    }
  }

  await db.query(
    `INSERT INTO notifications (organisation_id, user_id, type, title, body, channel, payload)
     VALUES ($1, $2, $3, $4, $5, 'in_app', $6)`,
    [organisationId, userId || null, type, title, body, payload || {}]
  );
  await db.query(
    `INSERT INTO notification_delivery_state
      (organisation_id, type, dedup_key, last_sent_at, cooldown_until, send_count, payload_hash)
     VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' hours')::interval, 1, $5)
     ON CONFLICT (organisation_id, type, dedup_key)
     DO UPDATE SET
       last_sent_at = NOW(),
       cooldown_until = NOW() + (EXCLUDED.cooldown_until - EXCLUDED.last_sent_at),
       send_count = notification_delivery_state.send_count + 1,
       payload_hash = EXCLUDED.payload_hash,
       updated_at = NOW()`,
    [organisationId, type, dedupKey, String(cooldownHours), payloadHash]
  );
  return { created: true };
}

exports.runNotificationScan = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });

    const created = [];
    const skipped = [];
    const expiryRows = await db.query(
      `SELECT c.id, c.user_id, c.expires_at, cr.title
       FROM certificates c
       JOIN courses cr ON cr.id = c.course_id
       WHERE c.organisation_id = $1
         AND c.is_valid = true
         AND c.expires_at IS NOT NULL
         AND c.expires_at <= NOW() + interval '30 days'`,
      [organisationId]
    );
    for (const row of expiryRows.rows) {
      const result = await createNotification({
        organisationId,
        userId: row.user_id,
        type: 'certificate_expiry_reminder',
        title: 'Certificate expiry reminder',
        body: `Certificate for ${row.title} is nearing expiry.`,
        payload: { certificate_id: row.id, expires_at: row.expires_at },
        dedupKey: `cert-expiry:${row.id}`,
        cooldownHours: 72,
      });
      (result.created ? created : skipped).push({ type: 'certificate_expiry_reminder', id: row.id });
    }

    const incompleteRows = await db.query(
      `SELECT e.id, e.user_id, e.course_id, c.title
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.organisation_id = $1
         AND e.status IN ('enrolled', 'in_progress')
         AND e.enrolled_at <= NOW() - interval '7 days'`,
      [organisationId]
    );
    for (const row of incompleteRows.rows) {
      const result = await createNotification({
        organisationId,
        userId: row.user_id,
        type: 'incomplete_course_reminder',
        title: 'Incomplete course reminder',
        body: `You still need to complete ${row.title}.`,
        payload: { enrollment_id: row.id, course_id: row.course_id },
        dedupKey: `incomplete:${row.id}`,
        cooldownHours: 48,
      });
      (result.created ? created : skipped).push({ type: 'incomplete_course_reminder', id: row.id });
    }

    const sub = await getSubscriptionState(organisationId);
    if (['expired', 'suspended', 'cancelled'].includes(sub.state)) {
      const adminMembers = await db.query(
        `SELECT user_id
         FROM organisation_members
         WHERE organisation_id = $1
           AND role IN ('org_admin', 'agency_admin')
         LIMIT 20`,
        [organisationId]
      );
      for (const adminRow of adminMembers.rows) {
        const result = await createNotification({
          organisationId,
          userId: adminRow.user_id,
          type: 'subscription_expiry_reminder',
          title: 'Subscription action required',
          body: `Subscription status is ${sub.state}. Critical actions are restricted.`,
          payload: { subscription_state: sub.state },
          dedupKey: `subscription:${sub.state}`,
          cooldownHours: 24,
        });
        (result.created ? created : skipped).push({ type: 'subscription_expiry_reminder', id: adminRow.user_id });
      }
    }

    return res.json({
      success: true,
      data: {
        created_count: created.length,
        skipped_count: skipped.length,
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.listNotifications = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const rows = await db.query(
      `SELECT id, organisation_id, user_id, type, title, body, channel, is_read, read_at, payload, created_at
       FROM notifications
       WHERE organisation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [organisationId, limit]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return next(err);
  }
};

exports.getComplianceDashboard = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const rows = await db.query(
      `SELECT
         e.user_id,
         COUNT(*)::int AS total_enrollments,
         COUNT(*) FILTER (WHERE e.status = 'completed')::int AS completed_enrollments,
         COUNT(*) FILTER (WHERE e.status IN ('overdue', 'expired'))::int AS overdue_enrollments
       FROM enrollments e
       WHERE e.organisation_id = $1
       GROUP BY e.user_id`,
      [organisationId]
    );
    const expiring = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM certificates
       WHERE organisation_id = $1 AND is_valid = true
         AND expires_at IS NOT NULL
         AND expires_at <= NOW() + interval '30 days'`,
      [organisationId]
    );

    const users = rows.rows.map((r) => {
      let status = 'compliant';
      if (r.overdue_enrollments > 0) status = 'overdue';
      else if (r.completed_enrollments < r.total_enrollments) status = 'warning';
      return { ...r, compliance_status: status };
    });
    const totals = users.reduce((acc, u) => {
      acc[u.compliance_status] = (acc[u.compliance_status] || 0) + 1;
      return acc;
    }, { compliant: 0, warning: 0, overdue: 0, expired: 0, suspended: 0 });
    const snapshot = {
      schema: 'layer5e.compliance_dashboard.v1',
      organisation_id: organisationId,
      generated_at: new Date().toISOString(),
      totals,
      expiring_certificates_30d: expiring.rows[0].count,
      users,
    };
    const checksum = hashPayload(snapshot);
    await db.query(
      `INSERT INTO compliance_snapshots (organisation_id, snapshot_type, snapshot, checksum, created_by)
       VALUES ($1, 'compliance_dashboard', $2, $3, $4)`,
      [organisationId, snapshot, checksum, req.user.id]
    );
    await db.query(
      `INSERT INTO organisation_settings (organisation_id, key, value)
       VALUES ($1, 'layer5e_compliance_snapshot_last', $2)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [organisationId, snapshot]
    );
    return res.json({ success: true, data: snapshot, checksum });
  } catch (err) {
    return next(err);
  }
};

exports.generateReportExport = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const { report_type, format = 'csv', filters = {} } = req.body || {};
    if (!['completion', 'certificate', 'compliance', 'subscription_usage'].includes(report_type)) {
      return res.status(400).json({ error: 'Invalid report_type' });
    }
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    let lines = [];
    if (report_type === 'completion') {
      const rows = await db.query(
        `SELECT e.user_id, e.course_id, e.status, e.enrolled_at, e.completed_at
         FROM enrollments e
         WHERE e.organisation_id = $1
         ORDER BY e.enrolled_at DESC`,
        [organisationId]
      );
      lines = ['user_id,course_id,status,enrolled_at,completed_at', ...rows.rows.map((r) =>
        `${r.user_id},${r.course_id},${r.status},${r.enrolled_at?.toISOString?.() || ''},${r.completed_at?.toISOString?.() || ''}`)];
    } else if (report_type === 'certificate') {
      const rows = await db.query(
        `SELECT user_id, course_id, certificate_number, issued_at, expires_at, is_valid
         FROM certificates
         WHERE organisation_id = $1
         ORDER BY issued_at DESC`,
        [organisationId]
      );
      lines = ['user_id,course_id,certificate_number,issued_at,expires_at,is_valid', ...rows.rows.map((r) =>
        `${r.user_id},${r.course_id},${r.certificate_number},${r.issued_at?.toISOString?.() || ''},${r.expires_at?.toISOString?.() || ''},${r.is_valid}`)];
    } else if (report_type === 'subscription_usage') {
      const sub = await getSubscriptionState(organisationId);
      const seats = await db.query('SELECT COUNT(*)::int AS used FROM organisation_members WHERE organisation_id = $1', [organisationId]);
      lines = [
        'organisation_id,state,seat_limit,seats_used,start_date,end_date',
        `${organisationId},${sub.state},${sub.seat_limit || ''},${seats.rows[0].used},${sub.start_date || ''},${sub.end_date || ''}`,
      ];
    } else {
      const latest = await db.query(
        `SELECT snapshot FROM compliance_snapshots
         WHERE organisation_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [organisationId]
      );
      const snapshot = latest.rows[0]?.snapshot || { totals: {} };
      lines = [
        'metric,value',
        `compliant,${snapshot.totals?.compliant || 0}`,
        `warning,${snapshot.totals?.warning || 0}`,
        `overdue,${snapshot.totals?.overdue || 0}`,
      ];
    }
    const content = format === 'pdf'
      ? `CARELEARN REPORT\nType: ${report_type}\n\n${lines.join('\n')}`
      : `${lines.join('\n')}\n`;
    const checksum = hashPayload({ organisationId, report_type, format, filters, content });
    const inserted = await db.query(
      `INSERT INTO report_exports
       (organisation_id, requested_by, report_type, format, filters, row_count, checksum, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at, row_count, checksum`,
      [organisationId, req.user.id, report_type, format, filters, Math.max(lines.length - 1, 0), checksum, content]
    );
    return res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.listReportExports = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const rows = await db.query(
      `SELECT id, report_type, format, filters, row_count, checksum, created_at
       FROM report_exports
       WHERE organisation_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [organisationId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return next(err);
  }
};

exports.downloadReportExport = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    const result = await db.query(
      `SELECT id, format, content
       FROM report_exports
       WHERE id = $1 AND organisation_id = $2
       LIMIT 1`,
      [req.params.exportId, organisationId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Report export not found' });
    const row = result.rows[0];
    if (row.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'application/pdf');
    }
    return res.send(row.content);
  } catch (err) {
    return next(err);
  }
};

exports.getRoleMatrix = (_req, res) => {
  return res.json({
    success: true,
    data: {
      schema: 'layer5g.role_matrix.v1',
      roles: ['platform_owner', 'super_admin', 'agency_admin', 'trainer', 'staff_user'],
      permission_source: 'middleware.permissions',
    },
  });
};

exports.upsertFeatureFlag = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    const { key, enabled, metadata = {} } = req.body || {};
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    if (!key || typeof enabled !== 'boolean') return res.status(400).json({ error: 'Invalid payload' });
    const saved = await db.query(
      `INSERT INTO feature_flags (organisation_id, key, enabled, metadata, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET enabled = EXCLUDED.enabled, metadata = EXCLUDED.metadata, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING organisation_id, key, enabled, metadata, updated_at`,
      [organisationId, key, enabled, metadata, req.user.id]
    );
    return res.status(201).json({ success: true, data: saved.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.listFeatureFlags = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    const rows = await db.query(
      `SELECT key, enabled, metadata, updated_at
       FROM feature_flags
       WHERE organisation_id = $1
       ORDER BY key ASC`,
      [organisationId]
    );
    return res.json({ success: true, data: rows.rows });
  } catch (err) {
    return next(err);
  }
};

exports.bulkEnrollSafe = async (req, res, next) => {
  try {
    const organisationId = resolveOrgId(req);
    const { user_ids = [], course_id } = req.body || {};
    if (!organisationId) return res.status(400).json({ error: 'Organisation context required' });
    if (!Array.isArray(user_ids) || user_ids.length === 0 || user_ids.length > 200) {
      return res.status(400).json({ error: 'user_ids must be 1..200' });
    }
    if (!course_id) return res.status(400).json({ error: 'course_id required' });

    const members = await db.query(
      `SELECT user_id
       FROM organisation_members
       WHERE organisation_id = $1 AND user_id = ANY($2::uuid[])`,
      [organisationId, user_ids]
    );
    if (members.rows.length !== user_ids.length && !isGlobalRole(req.user.role)) {
      return res.status(403).json({ error: 'Cross-tenant bulk enrollment blocked' });
    }

    let created = 0;
    for (const userId of user_ids) {
      await db.query(
        `INSERT INTO enrollments (user_id, course_id, organisation_id, status)
         VALUES ($1, $2, $3, 'enrolled')
         ON CONFLICT (user_id, course_id) DO NOTHING`,
        [userId, course_id, organisationId]
      );
      created += 1;
    }
    return res.json({ success: true, data: { requested: user_ids.length, processed: created } });
  } catch (err) {
    return next(err);
  }
};

const { randomUUID } = require('crypto');
const db = require('../config/database');

const RESTRICTED_ACTIONS = new Set(['enrollment.write', 'certificate.write', 'compliance.write']);

async function getSubscriptionState(organisationId) {
  const defaultState = {
    state: 'active',
    seat_limit: 50,
    trial_seat_limit: 10,
    features: {
      enrollment: true,
      certificates: true,
      compliance: true,
    },
  };
  const result = await db.query(
    `SELECT value
     FROM organisation_settings
     WHERE organisation_id = $1 AND key = 'subscription_governance'
     LIMIT 1`,
    [organisationId]
  );
  if (!result.rows.length) return defaultState;
  return { ...defaultState, ...(result.rows[0].value || {}) };
}

function isWriteBlocked(state, action) {
  if (state === 'active') return false;
  if (state === 'trial') return false;
  if (state === 'expired') return RESTRICTED_ACTIONS.has(action);
  if (state === 'suspended') return RESTRICTED_ACTIONS.has(action);
  if (state === 'cancelled') return RESTRICTED_ACTIONS.has(action);
  return false;
}

function enforceSubscription(action) {
  return async (req, res, next) => {
    try {
      const organisationId = req.scopedOrganisationId || req.tenant?.organisationId || req.body?.organisation_id;
      if (!organisationId) return next();
      const sub = await getSubscriptionState(organisationId);
      const state = String(sub.state || 'active').toLowerCase();
      if (isWriteBlocked(state, action)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_RESTRICTED',
            message: `Action blocked under subscription state: ${state}`,
          },
        });
      }

      if (state === 'trial' && action === 'enrollment.write') {
        const cap = Number(sub.trial_seat_limit || sub.seat_limit || 10);
        const seats = await db.query(
          `SELECT COUNT(*)::int AS count
           FROM organisation_members
           WHERE organisation_id = $1`,
          [organisationId]
        );
        if (Number(seats.rows[0]?.count || 0) > cap) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'SUBSCRIPTION_SEAT_LIMIT_EXCEEDED',
              message: `Trial seat limit exceeded (${cap})`,
            },
          });
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

async function setSubscriptionState({ organisationId, payload, actorId }) {
  const state = {
    ...payload,
    updated_at: new Date().toISOString(),
    updated_by: actorId || null,
  };
  await db.query(
    `INSERT INTO organisation_settings (id, organisation_id, key, value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organisation_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [randomUUID(), organisationId, 'subscription_governance', state]
  );
  return state;
}

module.exports = {
  enforceSubscription,
  getSubscriptionState,
  setSubscriptionState,
};

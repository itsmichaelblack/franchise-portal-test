// functions/index.js
// Firebase Cloud Functions for the Franchise Portal.
// Uses 1st Gen functions to avoid Eventarc permissions issues.

const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const sgMail = require("@sendgrid/mail");

initializeApp();

// ── Sender config ─────────────────────────────────────────────────────────────
const FROM_EMAIL = "michael@successtutoring.com";
const FROM_NAME  = "Success Tutoring";
const PORTAL_URL = "https://success-tutoring-test.web.app";

// ── Helper: build the confirmation email ─────────────────────────────────────
function buildConfirmationEmail(location) {
  const { name, address, phone, email } = location;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { margin: 0; padding: 0; background: #f5f3ee; font-family: Arial, sans-serif; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
        .header { background: #2d5a3d; padding: 40px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
        .header p { color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0; }
        .body { padding: 40px; }
        .body p { color: #444; font-size: 15px; line-height: 1.7; }
        .detail-card { background: #f5f3ee; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .detail-row { margin-bottom: 12px; font-size: 14px; color: #333; }
        .detail-label { font-weight: 600; color: #2d5a3d; }
        .cta { text-align: center; margin: 32px 0; }
        .cta a { display: inline-block; background: #2d5a3d; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; }
        .footer { background: #f5f3ee; padding: 24px; text-align: center; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Welcome to the Network!</h1>
          <p>Your franchise location has been created</p>
        </div>
        <div class="body">
          <p>Hi there,</p>
          <p>Your franchise location <strong>${name}</strong> has been successfully added to the system. Your partner portal is now active.</p>
          <div class="detail-card">
            <div class="detail-row"><span class="detail-label">Location: </span>${name}</div>
            <div class="detail-row"><span class="detail-label">Address: </span>${address}</div>
            <div class="detail-row"><span class="detail-label">Phone: </span>${phone}</div>
            <div class="detail-row"><span class="detail-label">Email: </span>${email}</div>
          </div>
          <p>Sign in to your Partner Portal to set your availability and manage booking settings.</p>
          <div class="cta"><a href="${PORTAL_URL}">Access Partner Portal →</a></div>
        </div>
        <div class="footer">© ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
      </div>
    </body>
    </html>
  `;

  const text = `Welcome! Your location "${name}" has been created. Access your portal: ${PORTAL_URL}`;
  return { html, text };
}

// ── Trigger: send email when a new location is created ────────────────────────
exports.onLocationCreated = functions.firestore
  .document("locations/{locationId}")
  .onCreate(async (snap, context) => {
    const location = snap.data();
    const locationId = context.params.locationId;

    if (!location?.email) {
      console.warn(`Location ${locationId} has no email — skipping.`);
      return;
    }

    const apiKey = functions.config().sendgrid?.api_key;
    if (!apiKey) {
      console.error("SendGrid API key not set. Run: firebase functions:config:set sendgrid.api_key=YOUR_KEY");
      return;
    }

    sgMail.setApiKey(apiKey);
    const { html, text } = buildConfirmationEmail(location);

    try {
      await sgMail.send({
        to:      location.email,
        from:    { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Welcome! Your franchise location "${location.name}" is now active`,
        text,
        html,
      });
      console.log(`Email sent to ${location.email}`);
      await getFirestore().doc(`locations/${locationId}`).update({
        confirmationEmailSentAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body ?? err);
    }
  });

// ── Callable: resend confirmation email ──────────────────────────────────────
exports.resendConfirmationEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerDoc = await getFirestore().doc(`users/${context.auth.uid}`).get();
  const role = callerDoc.data()?.role;
  if (role !== "admin" && role !== "master_admin") {
    throw new functions.https.HttpsError("permission-denied", "Only HQ admins can resend emails.");
  }

  const { locationId } = data;
  if (!locationId) {
    throw new functions.https.HttpsError("invalid-argument", "locationId is required.");
  }

  const locationDoc = await getFirestore().doc(`locations/${locationId}`).get();
  if (!locationDoc.exists) {
    throw new functions.https.HttpsError("not-found", `Location ${locationId} not found.`);
  }

  const location = locationDoc.data();
  const apiKey = functions.config().sendgrid?.api_key;
  sgMail.setApiKey(apiKey);
  const { html, text } = buildConfirmationEmail(location);

  await sgMail.send({
    to:      location.email,
    from:    { email: FROM_EMAIL, name: FROM_NAME },
    subject: `Reminder: Access your partner portal — ${location.name}`,
    text,
    html,
  });

  return { success: true };
});

// ── Trigger: send invite email when an invite document is created ─────────────
exports.onInviteCreated = functions.firestore
  .document("invites/{inviteId}")
  .onCreate(async (snap, context) => {
    const invite = snap.data();
    const inviteId = context.params.inviteId;
    const PORTAL_URL_WITH_INVITE = `${PORTAL_URL}?invite=${inviteId}`;

    const apiKey = functions.config().sendgrid?.api_key;
    if (!apiKey) {
      console.error("SendGrid API key not set.");
      return;
    }

    sgMail.setApiKey(apiKey);

    const html = `
      <!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        body { margin: 0; padding: 0; background: #f5f3ee; font-family: Arial, sans-serif; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
        .header { background: #0a0a0f; padding: 40px; text-align: center; }
        .header h1 { color: #c8a96e; font-size: 24px; margin: 0; }
        .header p { color: rgba(255,255,255,0.5); font-size: 14px; margin: 8px 0 0; }
        .body { padding: 40px; }
        .body p { color: #444; font-size: 15px; line-height: 1.7; }
        .cta { text-align: center; margin: 32px 0; }
        .cta a { display: inline-block; background: #c8a96e; color: #0a0a0f; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; }
        .footer { background: #f5f3ee; padding: 24px; text-align: center; font-size: 12px; color: #999; }
      </style></head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>You've been invited!</h1>
            <p>Success Tutoring HQ Portal</p>
          </div>
          <div class="body">
            <p>Hi ${invite.name},</p>
            <p>You've been invited to join the <strong>Success Tutoring HQ Portal</strong> as an <strong>Admin</strong>. You'll be able to add and edit franchise locations.</p>
            <p>Click the button below to sign in with your Google account and get started.</p>
            <div class="cta"><a href="${PORTAL_URL_WITH_INVITE}">Accept Invite & Sign In →</a></div>
            <p style="font-size: 13px; color: #888;">If you weren't expecting this invite, you can safely ignore this email.</p>
          </div>
          <div class="footer">© ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
        </div>
      </body></html>
    `;

    try {
      await sgMail.send({
        to: invite.email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `You've been invited to the Success Tutoring HQ Portal`,
        text: `Hi ${invite.name}, you've been invited to join the Success Tutoring HQ Portal as an Admin. Sign in here: ${PORTAL_URL_WITH_INVITE}`,
        html,
      });
      console.log(`Invite email sent to ${invite.email}`);
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body ?? err);
    }
  });

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

// ── Callable: resend invite email ─────────────────────────────────────────────
exports.resendInviteEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerDoc = await getFirestore().doc(`users/${context.auth.uid}`).get();
  const role = callerDoc.data()?.role;
  if (role !== "master_admin") {
    throw new functions.https.HttpsError("permission-denied", "Only master admins can resend invite emails.");
  }

  const { inviteId } = data;
  if (!inviteId) {
    throw new functions.https.HttpsError("invalid-argument", "inviteId is required.");
  }

  const inviteDoc = await getFirestore().doc(`invites/${inviteId}`).get();
  if (!inviteDoc.exists) {
    throw new functions.https.HttpsError("not-found", `Invite ${inviteId} not found.`);
  }

  const invite = inviteDoc.data();
  const PORTAL_URL_WITH_INVITE = `${PORTAL_URL}?invite=${inviteId}`;

  const apiKey = functions.config().sendgrid?.api_key;
  if (!apiKey) {
    throw new functions.https.HttpsError("internal", "SendGrid API key not configured.");
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
          <h1>Reminder: You're Invited!</h1>
          <p>Success Tutoring HQ Portal</p>
        </div>
        <div class="body">
          <p>Hi ${invite.name},</p>
          <p>This is a reminder that you've been invited to join the <strong>Success Tutoring HQ Portal</strong> as an <strong>${invite.role === 'master_admin' ? 'Master Admin' : 'Admin'}</strong>.</p>
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
      subject: `Reminder: You've been invited to the Success Tutoring HQ Portal`,
      text: `Hi ${invite.name}, this is a reminder that you've been invited to the Success Tutoring HQ Portal. Sign in here: ${PORTAL_URL_WITH_INVITE}`,
      html,
    });

    // Update invite doc with resend timestamp
    await getFirestore().doc(`invites/${inviteId}`).update({
      lastResentAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    console.error("SendGrid error:", err?.response?.body ?? err);
    throw new functions.https.HttpsError("internal", "Failed to send email.");
  }
});

// ── Trigger: send confirmation emails when a booking is created ─────────────
exports.onBookingCreated = functions.firestore
  .document("bookings/{bookingId}")
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    const bookingId = context.params.bookingId;

    const apiKey = functions.config().sendgrid?.api_key;
    if (!apiKey) {
      console.error("SendGrid API key not set.");
      return;
    }
    sgMail.setApiKey(apiKey);

    // Format date and time
    const dateObj = new Date(booking.date + "T00:00:00");
    const dateStr = dateObj.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const [h, m] = booking.time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
    const refCode = bookingId.slice(0, 8).toUpperCase();

    // ── 1. Email to the CUSTOMER ─────────────────────────────────────────
    const customerHtml = `
      <!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        body { margin: 0; padding: 0; background: #f7f8fa; font-family: Arial, sans-serif; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #E25D25 0%, #c94f1f 100%); padding: 40px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
        .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0; }
        .body { padding: 40px; }
        .body p { color: #444; font-size: 15px; line-height: 1.7; }
        .detail-card { background: #fdf0ea; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .detail-row { margin-bottom: 10px; font-size: 14px; color: #333; }
        .detail-label { font-weight: 600; color: #E25D25; }
        .ref { font-size: 12px; color: #999; margin-top: 16px; }
        .cta { text-align: center; margin: 28px 0; }
        .cta a { display: inline-block; background: #E25D25; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .footer { background: #f7f8fa; padding: 24px; text-align: center; font-size: 12px; color: #999; }
      </style></head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>Assessment Confirmed!</h1>
            <p>Your booking is all set</p>
          </div>
          <div class="body">
            <p>Hi ${booking.customerName},</p>
            <p>Your free 40-minute assessment has been confirmed. Here are your booking details:</p>
            <div class="detail-card">
              <div class="detail-row"><span class="detail-label">Location: </span>${booking.locationName}</div>
              <div class="detail-row"><span class="detail-label">Address: </span>${booking.locationAddress}</div>
              <div class="detail-row"><span class="detail-label">Date: </span>${dateStr}</div>
              <div class="detail-row"><span class="detail-label">Time: </span>${timeStr} (40 minutes)</div>
              <div class="ref">Booking Ref: ${refCode}</div>
            </div>
            <p>Please arrive a few minutes early. If you need to reschedule, contact your centre directly.</p>
            <div class="cta"><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.locationAddress)}">Get Directions →</a></div>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
        </div>
      </body></html>
    `;

    // ── 2. Email to the FRANCHISE PARTNER ────────────────────────────────
    const locationDoc = await getFirestore().doc(`locations/${booking.locationId}`).get();
    const locationEmail = locationDoc.exists ? locationDoc.data().email : null;

    const partnerHtml = `
      <!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        body { margin: 0; padding: 0; background: #f7f8fa; font-family: Arial, sans-serif; }
        .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #6dcbca 0%, #4fa8a7 100%); padding: 40px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
        .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0; }
        .body { padding: 40px; }
        .body p { color: #444; font-size: 15px; line-height: 1.7; }
        .detail-card { background: #f0fafa; border-radius: 12px; padding: 24px; margin: 24px 0; }
        .detail-row { margin-bottom: 10px; font-size: 14px; color: #333; }
        .detail-label { font-weight: 600; color: #4fa8a7; }
        .ref { font-size: 12px; color: #999; margin-top: 16px; }
        .cta { text-align: center; margin: 28px 0; }
        .cta a { display: inline-block; background: #6dcbca; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .footer { background: #f7f8fa; padding: 24px; text-align: center; font-size: 12px; color: #999; }
      </style></head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>New Assessment Booking!</h1>
            <p>A customer has booked an assessment at your centre</p>
          </div>
          <div class="body">
            <p>Hi there,</p>
            <p>A new assessment has been booked at <strong>${booking.locationName}</strong>:</p>
            <div class="detail-card">
              <div class="detail-row"><span class="detail-label">Customer: </span>${booking.customerName}</div>
              <div class="detail-row"><span class="detail-label">Email: </span>${booking.customerEmail}</div>
              <div class="detail-row"><span class="detail-label">Phone: </span>${booking.customerPhone}</div>
              <div class="detail-row"><span class="detail-label">Date: </span>${dateStr}</div>
              <div class="detail-row"><span class="detail-label">Time: </span>${timeStr} (40 minutes)</div>
              ${booking.notes ? `<div class="detail-row"><span class="detail-label">Notes: </span>${booking.notes}</div>` : ""}
              <div class="ref">Booking Ref: ${refCode}</div>
            </div>
            <p>Log in to your Partner Portal to view all upcoming bookings.</p>
            <div class="cta"><a href="${PORTAL_URL}">Open Partner Portal &rarr;</a></div>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
        </div>
      </body></html>
    `;

    try {
      await sgMail.send({
        to: booking.customerEmail,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Assessment Confirmed — ${dateStr} at ${timeStr}`,
        text: `Hi ${booking.customerName}, your assessment at ${booking.locationName} on ${dateStr} at ${timeStr} is confirmed. Ref: ${refCode}`,
        html: customerHtml,
      });
      console.log(`Customer email sent to ${booking.customerEmail}`);
    } catch (err) {
      console.error("Customer email error:", err?.response?.body ?? err);
    }

    if (locationEmail) {
      try {
        await sgMail.send({
          to: locationEmail,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `New Booking — ${booking.customerName} on ${dateStr} at ${timeStr}`,
          text: `New assessment at ${booking.locationName}. Customer: ${booking.customerName}, ${dateStr} at ${timeStr}. Ref: ${refCode}`,
          html: partnerHtml,
        });
        console.log(`Partner email sent to ${locationEmail}`);
      } catch (err) {
        console.error("Partner email error:", err?.response?.body ?? err);
      }
    }

    try {
      await getFirestore().doc(`bookings/${bookingId}`).update({
        emailsSentAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to update booking:", err);
    }
  });

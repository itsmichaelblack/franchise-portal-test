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

// ── Trigger: send "new lead" email when an enquiry is created ───────────
exports.onEnquiryCreated = functions.firestore
  .document("locations/{locationId}/enquiries/{enquiryId}")
  .onCreate(async (snap, context) => {
    const enquiry = snap.data();
    const { locationId, enquiryId } = context.params;

    // Look up the location to get the franchise partner's email
    const locationDoc = await getFirestore().doc(`locations/${locationId}`).get();
    if (!locationDoc.exists) {
      console.warn(`Location ${locationId} not found — skipping enquiry email.`);
      return;
    }
    const location = locationDoc.data();
    const partnerEmail = location.email;

    if (!partnerEmail) {
      console.warn(`Location ${locationId} has no email — skipping.`);
      return;
    }

    const apiKey = functions.config().sendgrid?.api_key;
    if (!apiKey) {
      console.error("SendGrid API key not set.");
      return;
    }
    sgMail.setApiKey(apiKey);

    // Map form type to a friendly label
    const formLabels = {
      vip_list: "VIP List",
      coming_soon: "Secure Foundation Rate",
      temporary_closed: "Enquiry (Temp. Closed)",
    };
    const formLabel = formLabels[enquiry.type] || "Enquiry";

    const html = `
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
        .cta { text-align: center; margin: 28px 0; }
        .cta a { display: inline-block; background: #E25D25; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }
        .footer { background: #f7f8fa; padding: 24px; text-align: center; font-size: 12px; color: #999; }
      </style></head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>New Lead!</h1>
            <p>A new ${formLabel} enquiry for ${location.name}</p>
          </div>
          <div class="body">
            <p>Hi there,</p>
            <p>You've received a new lead via the <strong>${formLabel}</strong> form for <strong>${location.name}</strong>:</p>
            <div class="detail-card">
              <div class="detail-row"><span class="detail-label">Name: </span>${enquiry.firstName} ${enquiry.lastName}</div>
              <div class="detail-row"><span class="detail-label">Email: </span>${enquiry.email}</div>
              <div class="detail-row"><span class="detail-label">Phone: </span>${enquiry.phone}</div>
              <div class="detail-row"><span class="detail-label">Form: </span>${formLabel}</div>
              <div class="detail-row"><span class="detail-label">Location: </span>${location.name}</div>
            </div>
            <p>Log in to your Partner Portal to view all enquiries.</p>
            <div class="cta"><a href="${PORTAL_URL}">Open Partner Portal &rarr;</a></div>
          </div>
          <div class="footer">&copy; ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
        </div>
      </body></html>
    `;

    try {
      await sgMail.send({
        to: partnerEmail,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: "New Lead",
        text: `New ${formLabel} enquiry for ${location.name}. ${enquiry.firstName} ${enquiry.lastName}, ${enquiry.email}, ${enquiry.phone}`,
        html,
      });
      console.log(`New lead email sent to ${partnerEmail} for enquiry ${enquiryId}`);
    } catch (err) {
      console.error("SendGrid error:", err?.response?.body ?? err);
    }

    // Mark the enquiry as email-sent
    try {
      await getFirestore()
        .doc(`locations/${locationId}/enquiries/${enquiryId}`)
        .update({ emailSentAt: new Date().toISOString() });
    } catch (err) {
      console.error("Failed to update enquiry:", err);
    }
  });

// ── Stripe Integration ─────────────────────────────────────────────────────
let _stripe = null;

// Lazy Stripe initialization — secrets are only available at function runtime, not module load
function requireStripe() {
  if (!_stripe) {
    const stripeKey = process.env.STRIPE_SECRET_KEY ||
      (functions.config().stripe && functions.config().stripe.secret_key) ||
      "";
    if (!stripeKey) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Stripe is not configured. Set STRIPE_SECRET_KEY environment variable in Google Cloud Console."
      );
    }
    _stripe = require("stripe")(stripeKey);
  }
  return _stripe;
}

// Create a Stripe Connect account for a franchise partner and return onboarding link
exports.createStripeConnectAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { locationId } = data;
  if (!locationId) {
    throw new functions.https.HttpsError("invalid-argument", "locationId required.");
  }

  const db = getFirestore();
  const locationDoc = await db.doc(`locations/${locationId}`).get();
  if (!locationDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Location not found.");
  }

  const location = locationDoc.data();

  // Check if already has a Stripe account
  if (location.stripeAccountId) {
    // Create a new account link for re-onboarding
    const accountLink = await requireStripe().accountLinks.create({
      account: location.stripeAccountId,
      refresh_url: `${PORTAL_URL}?stripe_refresh=true`,
      return_url: `${PORTAL_URL}?stripe_connected=true`,
      type: "account_onboarding",
    });
    return { url: accountLink.url, accountId: location.stripeAccountId };
  }

  // Determine country from location
  const country = (location.country || "AU").toUpperCase();

  // Create Standard Connect account
  const account = await requireStripe().accounts.create({
    type: "standard",
    country,
    email: location.email,
    metadata: {
      locationId,
      locationName: location.name,
    },
  });

  // Save Stripe account ID to the location
  await db.doc(`locations/${locationId}`).update({
    stripeAccountId: account.id,
    stripeOnboardingStatus: "pending",
  });

  // Create account link for onboarding
  const accountLink = await requireStripe().accountLinks.create({
    account: account.id,
    refresh_url: `${PORTAL_URL}?stripe_refresh=true`,
    return_url: `${PORTAL_URL}?stripe_connected=true`,
    type: "account_onboarding",
  });

  return { url: accountLink.url, accountId: account.id };
});

// Check Stripe Connect account status
exports.checkStripeAccountStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { stripeAccountId } = data;
  if (!stripeAccountId) {
    throw new functions.https.HttpsError("invalid-argument", "stripeAccountId required.");
  }

  const account = await requireStripe().accounts.retrieve(stripeAccountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  };
});

// Create a Stripe Customer + SetupIntent for collecting a parent's card
exports.createSetupIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { parentEmail, parentName, parentPhone, locationId, saleId } = data;
  if (!parentEmail || !locationId) {
    throw new functions.https.HttpsError("invalid-argument", "parentEmail and locationId required.");
  }

  const db = getFirestore();
  const locationDoc = await db.doc(`locations/${locationId}`).get();
  if (!locationDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Location not found.");
  }

  const location = locationDoc.data();
  const stripeAccountId = location.stripeAccountId;

  if (!stripeAccountId) {
    throw new functions.https.HttpsError("failed-precondition", "Franchise partner has not connected Stripe yet.");
  }

  // Check if customer already exists for this parent on this connected account
  const existingCustomers = await requireStripe().customers.list(
    { email: parentEmail, limit: 1 },
    { stripeAccount: stripeAccountId }
  );

  let customer;
  if (existingCustomers.data.length > 0) {
    customer = existingCustomers.data[0];
  } else {
    customer = await requireStripe().customers.create(
      {
        email: parentEmail,
        name: parentName || undefined,
        phone: parentPhone || undefined,
        metadata: { locationId, saleId: saleId || "" },
      },
      { stripeAccount: stripeAccountId }
    );
  }

  // Create SetupIntent on the connected account
  const setupIntent = await requireStripe().setupIntents.create(
    {
      customer: customer.id,
      payment_method_types: ["card", "au_becs_debit"],
      metadata: { saleId: saleId || "", locationId },
    },
    { stripeAccount: stripeAccountId }
  );

  return {
    clientSecret: setupIntent.client_secret,
    customerId: customer.id,
    stripeAccountId,
  };
});

// Confirm card was saved — update sale with payment method info
exports.confirmPaymentMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { saleId, customerId, stripeAccountId } = data;
  if (!saleId || !customerId) {
    throw new functions.https.HttpsError("invalid-argument", "saleId and customerId required.");
  }

  const db = getFirestore();

  // Get customer's payment methods from connected account (try card first, then BECS)
  let pm = null;
  const cardMethods = await requireStripe().paymentMethods.list(
    { customer: customerId, type: "card" },
    { stripeAccount: stripeAccountId }
  );
  if (cardMethods.data.length > 0) {
    pm = cardMethods.data[0];
  } else {
    const becsMethods = await requireStripe().paymentMethods.list(
      { customer: customerId, type: "au_becs_debit" },
      { stripeAccount: stripeAccountId }
    );
    if (becsMethods.data.length > 0) {
      pm = becsMethods.data[0];
    }
  }

  if (!pm) {
    throw new functions.https.HttpsError("not-found", "No payment method found.");
  }

  // Build payment method info based on type
  let paymentMethodInfo;
  if (pm.type === "au_becs_debit") {
    paymentMethodInfo = {
      id: pm.id,
      type: "au_becs_debit",
      brand: "BECS Direct Debit",
      last4: pm.au_becs_debit.last4,
      bsbNumber: pm.au_becs_debit.fingerprint ? "••••" : "",
    };
  } else {
    paymentMethodInfo = {
      id: pm.id,
      type: "card",
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  }

  // Update the sale
  await db.doc(`sales/${saleId}`).update({
    stripeCustomerId: customerId,
    stripeAccountId,
    paymentMethod: paymentMethodInfo,
    stripeStatus: "connected",
  });

  return { success: true, last4: paymentMethodInfo.last4, brand: paymentMethodInfo.brand, type: paymentMethodInfo.type };
});

// Create a payment link for a parent to enter their own card details
exports.createPaymentLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { saleId, locationId, parentEmail: directEmail } = data;
  if (!locationId) {
    throw new functions.https.HttpsError("invalid-argument", "locationId required.");
  }

  const db = getFirestore();
  const locationDoc = await db.doc(`locations/${locationId}`).get();
  if (!locationDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Location not found.");
  }
  const location = locationDoc.data();
  const stripeAccountId = location.stripeAccountId;

  if (!stripeAccountId) {
    throw new functions.https.HttpsError("failed-precondition", "Stripe not connected.");
  }

  // Get customer email from sale or direct param
  let customerEmail = directEmail;
  if (saleId && saleId !== "none") {
    const saleDoc = await db.doc(`sales/${saleId}`).get();
    if (saleDoc.exists) {
      customerEmail = saleDoc.data().parentEmail || customerEmail;
    }
  }

  // Determine currency from location
  const countryToCurrency = { AU: "aud", NZ: "nzd", US: "usd", GB: "gbp", CA: "cad", SG: "sgd" };
  const currency = (location.currency || countryToCurrency[(location.country || "AU").toUpperCase()] || "aud").toLowerCase();

  // Create a Checkout Session in setup mode on the connected account
  const session = await requireStripe().checkout.sessions.create(
    {
      mode: "setup",
      currency,
      customer_email: customerEmail || undefined,
      payment_method_types: ["card", "au_becs_debit"],
      success_url: `${PORTAL_URL}?payment_setup=success&sale_id=${saleId || ""}`,
      cancel_url: `${PORTAL_URL}?payment_setup=cancelled`,
      metadata: { saleId: saleId || "", locationId },
    },
    { stripeAccount: stripeAccountId }
  );

  return { url: session.url };
});

// Save payment method after Stripe Checkout Session completes
exports.savePaymentFromCheckout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { parentEmail, locationId } = data;
  if (!parentEmail || !locationId) {
    throw new functions.https.HttpsError("invalid-argument", "parentEmail and locationId required.");
  }

  const db = getFirestore();
  const locationDoc = await db.doc(`locations/${locationId}`).get();
  if (!locationDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Location not found.");
  }
  const location = locationDoc.data();
  const stripeAccountId = location.stripeAccountId;
  if (!stripeAccountId) {
    throw new functions.https.HttpsError("failed-precondition", "Stripe not connected.");
  }

  // Find the customer on the connected account
  const customers = await requireStripe().customers.list(
    { email: parentEmail, limit: 1 },
    { stripeAccount: stripeAccountId }
  );

  if (customers.data.length === 0) {
    throw new functions.https.HttpsError("not-found", "No Stripe customer found for this email.");
  }

  const customer = customers.data[0];

  // Get payment methods (try card first, then BECS)
  let pm = null;
  const cardMethods = await requireStripe().paymentMethods.list(
    { customer: customer.id, type: "card" },
    { stripeAccount: stripeAccountId }
  );
  if (cardMethods.data.length > 0) {
    pm = cardMethods.data[0];
  } else {
    const becsMethods = await requireStripe().paymentMethods.list(
      { customer: customer.id, type: "au_becs_debit" },
      { stripeAccount: stripeAccountId }
    );
    if (becsMethods.data.length > 0) {
      pm = becsMethods.data[0];
    }
  }

  if (!pm) {
    throw new functions.https.HttpsError("not-found", "No payment method found for this customer.");
  }

  // Build payment method info
  let paymentMethodInfo;
  if (pm.type === "au_becs_debit") {
    paymentMethodInfo = {
      id: pm.id,
      type: "au_becs_debit",
      brand: "BECS Direct Debit",
      last4: pm.au_becs_debit.last4,
    };
  } else {
    paymentMethodInfo = {
      id: pm.id,
      type: "card",
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  }

  // Update all bookings for this parent at this location with payment info
  const bookingsSnap = await db.collection("bookings")
    .where("locationId", "==", locationId)
    .where("customerEmail", "==", parentEmail)
    .get();

  const batch = db.batch();
  bookingsSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      paymentMethod: paymentMethodInfo,
      stripeCustomerId: customer.id,
    });
  });

  // Also update any sales for this parent
  const salesSnap = await db.collection("sales")
    .where("locationId", "==", locationId)
    .where("parentEmail", "==", parentEmail)
    .get();

  salesSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      paymentMethod: paymentMethodInfo,
      stripeCustomerId: customer.id,
      stripeStatus: "connected",
    });
  });

  await batch.commit();

  return {
    success: true,
    last4: paymentMethodInfo.last4,
    brand: paymentMethodInfo.brand,
    type: paymentMethodInfo.type || "card",
    customerId: customer.id,
  };
});

// Process a refund through Stripe
exports.processRefund = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { saleId, locationId, amount, reason } = data;
  if (!saleId || !locationId || !amount || !reason) {
    throw new functions.https.HttpsError("invalid-argument", "saleId, locationId, amount, and reason are required.");
  }

  const db = getFirestore();
  const saleDoc = await db.doc(`sales/${saleId}`).get();
  if (!saleDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Sale not found.");
  }

  const sale = saleDoc.data();
  const locationDoc = await db.doc(`locations/${locationId}`).get();
  const location = locationDoc.data();
  const stripeAccountId = location.stripeAccountId;

  if (!stripeAccountId) {
    throw new functions.https.HttpsError("failed-precondition", "Stripe not connected for this location.");
  }

  if (!sale.stripeCustomerId) {
    throw new functions.https.HttpsError("failed-precondition", "No Stripe customer linked to this sale.");
  }

  const stripeInstance = requireStripe();

  // Find the most recent payment intent for this customer on the connected account
  const charges = await stripeInstance.charges.list(
    { customer: sale.stripeCustomerId, limit: 10 },
    { stripeAccount: stripeAccountId }
  );

  if (charges.data.length === 0) {
    // No charges found — record refund manually
    const refundRecord = {
      amount: parseFloat(amount),
      reason,
      processedAt: new Date().toISOString(),
      status: "recorded",
      note: "No Stripe charges found. Refund recorded manually.",
    };
    const refunds = sale.refunds || [];
    refunds.push(refundRecord);
    await db.doc(`sales/${saleId}`).update({ refunds });
    return { success: true, status: "recorded", message: "No charges to refund. Recorded manually." };
  }

  // Refund the most recent charge
  const amountInCents = Math.round(parseFloat(amount) * 100);
  try {
    const refund = await stripeInstance.refunds.create(
      {
        charge: charges.data[0].id,
        amount: amountInCents,
        reason: "requested_by_customer",
      },
      { stripeAccount: stripeAccountId }
    );

    const refundRecord = {
      amount: parseFloat(amount),
      reason,
      processedAt: new Date().toISOString(),
      status: "processed",
      stripeRefundId: refund.id,
      chargeId: charges.data[0].id,
    };
    const refunds = sale.refunds || [];
    refunds.push(refundRecord);
    await db.doc(`sales/${saleId}`).update({ refunds });

    return { success: true, status: "processed", refundId: refund.id };
  } catch (stripeErr) {
    // If Stripe refund fails, record manually
    const refundRecord = {
      amount: parseFloat(amount),
      reason,
      processedAt: new Date().toISOString(),
      status: "recorded",
      note: `Stripe error: ${stripeErr.message}`,
    };
    const refunds = sale.refunds || [];
    refunds.push(refundRecord);
    await db.doc(`sales/${saleId}`).update({ refunds });
    return { success: true, status: "recorded", message: stripeErr.message };
  }
});

// ── Scheduled: Generate recurring sessions ────────────────────────────────────
// Runs every Sunday at midnight UTC. Generates booking documents for active
// recurrence rules up to 3 months ahead, skipping dates that already have a doc.
exports.generateRecurringSessions = functions.pubsub
  .schedule("every sunday 00:00")
  .timeZone("UTC")
  .onRun(async () => {
    const db = getFirestore();
    const now = new Date();
    const threeMonthsOut = new Date(now);
    threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);

    // Get all active recurrence rules
    const rulesSnap = await db
      .collection("recurrence_rules")
      .where("status", "==", "active")
      .get();

    if (rulesSnap.empty) {
      console.log("No active recurrence rules found.");
      return null;
    }

    let totalCreated = 0;

    for (const ruleDoc of rulesSnap.docs) {
      const rule = ruleDoc.data();
      const ruleId = ruleDoc.id;

      // Get existing booking dates for this rule
      const existingSnap = await db
        .collection("bookings")
        .where("recurrenceRuleId", "==", ruleId)
        .get();
      const existingDates = new Set(existingSnap.docs.map((d) => d.data().date));

      // Generate dates from today to 3 months out
      const current = new Date(now);
      // Move to the next occurrence of the rule's dayOfWeek
      while (current.getDay() !== rule.dayOfWeek) {
        current.setDate(current.getDate() + 1);
      }

      while (current <= threeMonthsOut) {
        const dateStr = current.toISOString().split("T")[0];

        if (!existingDates.has(dateStr)) {
          await db.collection("bookings").add({
            type: "session",
            locationId: rule.locationId,
            date: dateStr,
            time: rule.time,
            duration: rule.duration || 40,
            sessionType: "recurring",
            serviceId: rule.serviceId,
            serviceName: rule.serviceName,
            tutorId: rule.tutorId,
            tutorName: rule.tutorName,
            recurrenceRuleId: ruleId,
            status: "scheduled",
            createdAt: new Date(),
          });
          totalCreated++;
        }

        current.setDate(current.getDate() + 7);
      }
    }

    console.log(`Generated ${totalCreated} recurring session documents.`);
    return null;
  });

// ── Public HTTPS endpoints for Parent App (no Firebase Auth) ─────────────

// CORS helper for public endpoints
function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

// Public SetupIntent creation for in-app Stripe Payment Sheet
exports.createSetupIntentPublic = functions.runWith({ secrets: ["STRIPE_SECRET_KEY"] }).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { parentEmail, locationId } = req.body;
    if (!parentEmail || !locationId) { res.status(400).json({ error: "parentEmail and locationId required." }); return; }

    const db = getFirestore();
    const locationDoc = await db.doc(`locations/${locationId}`).get();
    if (!locationDoc.exists) { res.status(404).json({ error: "Location not found." }); return; }

    const location = locationDoc.data();
    const stripeAccountId = location.stripeAccountId;
    if (!stripeAccountId) { res.status(400).json({ error: "Stripe not connected for this centre." }); return; }

    const stripe = requireStripe();

    // Find or create customer on the connected account
    let customer;
    const existing = await stripe.customers.list(
      { email: parentEmail, limit: 1 },
      { stripeAccount: stripeAccountId }
    );
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create(
        { email: parentEmail },
        { stripeAccount: stripeAccountId }
      );
    }

    // Create ephemeral key for the customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2023-10-16", stripeAccount: stripeAccountId }
    );

    // Create SetupIntent on the connected account
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customer.id,
        payment_method_types: ["card", "au_becs_debit"],
      },
      { stripeAccount: stripeAccountId }
    );

    res.status(200).json({
      setupIntent: setupIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customer.id,
      publishableKey: "pk_test_51T5SUvLsPU0tzh4WBBfeISFfSFTLC0rD2c7fuB9h3ePAToMm0levx9XYwQ2yqIDxwswTVmcX9EaTHqhUOuL38d0Y00DHJQZK6H",
      stripeAccountId,
    });
  } catch (e) {
    console.error("createSetupIntentPublic error:", e);
    res.status(500).json({ error: e.message || "Failed to create setup intent." });
  }
});

// Public version of createPaymentLink for parent app
exports.createPaymentLinkPublic = functions.runWith({ secrets: ["STRIPE_SECRET_KEY"] }).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { parentEmail, locationId, saleId } = req.body;
    if (!locationId) { res.status(400).json({ error: "locationId required." }); return; }

    const db = getFirestore();
    const locationDoc = await db.doc(`locations/${locationId}`).get();
    if (!locationDoc.exists) { res.status(404).json({ error: "Location not found." }); return; }

    const location = locationDoc.data();
    const stripeAccountId = location.stripeAccountId;
    if (!stripeAccountId) { res.status(400).json({ error: "Stripe not connected for this centre. Please contact your centre." }); return; }

    let customerEmail = parentEmail;
    if (saleId && saleId !== "none") {
      const saleDoc = await db.doc(`sales/${saleId}`).get();
      if (saleDoc.exists) {
        customerEmail = saleDoc.data().parentEmail || customerEmail;
      }
    }

    const countryToCurrency = { AU: "aud", NZ: "nzd", US: "usd", GB: "gbp", CA: "cad", SG: "sgd" };
    const currency = (location.currency || countryToCurrency[(location.country || "AU").toUpperCase()] || "aud").toLowerCase();

    const session = await requireStripe().checkout.sessions.create(
      {
        mode: "setup",
        currency,
        customer_email: customerEmail || undefined,
        payment_method_types: ["card", "au_becs_debit"],
        success_url: `${PORTAL_URL}?payment_setup=success&session_id={CHECKOUT_SESSION_ID}&sale_id=${saleId || ""}`,
        cancel_url: `${PORTAL_URL}?payment_setup=cancelled`,
        metadata: { saleId: saleId || "", locationId },
      },
      { stripeAccount: stripeAccountId }
    );

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("createPaymentLinkPublic error:", e);
    res.status(500).json({ error: e.message || "Failed to create payment link." });
  }
});

// Public version of savePaymentFromCheckout for parent app
exports.savePaymentFromCheckoutPublic = functions.runWith({ secrets: ["STRIPE_SECRET_KEY"] }).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { parentEmail, locationId, sessionId, oldPaymentMethodId } = req.body;
    console.log("savePaymentFromCheckoutPublic called:", { parentEmail, locationId, sessionId: sessionId || "NONE", oldPaymentMethodId: oldPaymentMethodId || "NONE" });
    if (!locationId) { res.status(400).json({ error: "locationId required." }); return; }

    const db = getFirestore();
    const locationDoc = await db.doc(`locations/${locationId}`).get();
    if (!locationDoc.exists) { res.status(404).json({ error: "Location not found." }); return; }

    const location = locationDoc.data();
    const stripeAccountId = location.stripeAccountId;
    if (!stripeAccountId) { res.status(400).json({ error: "Stripe not connected." }); return; }
    console.log("stripeAccountId:", stripeAccountId);

    const stripe = requireStripe();
    let customer = null;
    let setupIntent = null;

    // Strategy 1: Use session ID to get exact customer and setup intent
    if (sessionId) {
      try {
        console.log("Trying session ID lookup:", sessionId);
        const session = await stripe.checkout.sessions.retrieve(
          sessionId,
          { expand: ["setup_intent"] },
          { stripeAccount: stripeAccountId }
        );
        console.log("Session found:", { customer: session.customer, status: session.status, setup_intent: session.setup_intent?.id || session.setup_intent });
        if (session.customer) {
          customer = await stripe.customers.retrieve(
            session.customer,
            { stripeAccount: stripeAccountId }
          );
          console.log("Customer from session:", customer.id, customer.email);
        }
        // Get setup intent - may be expanded object or just ID string
        if (session.setup_intent) {
          if (typeof session.setup_intent === "object") {
            setupIntent = session.setup_intent;
          } else {
            // It's a string ID, retrieve it
            setupIntent = await stripe.setupIntents.retrieve(
              session.setup_intent,
              { stripeAccount: stripeAccountId }
            );
          }
          console.log("SetupIntent:", setupIntent.id, "payment_method:", setupIntent.payment_method);
        }
      } catch (e) {
        console.error("Session retrieval error:", e.message);
      }
    } else {
      console.log("No sessionId provided");
    }

    // Strategy 2: Find customer by email
    if (!customer && parentEmail) {
      const customers = await stripe.customers.list(
        { email: parentEmail, limit: 1 },
        { stripeAccount: stripeAccountId }
      );
      if (customers.data.length > 0) {
        customer = customers.data[0];
      }
    }

    // Strategy 3: Search recent completed checkout sessions
    if (!customer) {
      const sessions = await stripe.checkout.sessions.list(
        { limit: 5 },
        { stripeAccount: stripeAccountId }
      );
      for (const s of sessions.data) {
        if (s.mode === "setup" && s.status === "complete" && s.customer) {
          customer = await stripe.customers.retrieve(
            s.customer,
            { stripeAccount: stripeAccountId }
          );
          break;
        }
      }
    }

    if (!customer) {
      console.log("No customer found - will try to get PM from setup intent directly");
    } else {
      console.log("Customer found:", customer.id);
    }

    // Get payment method - first try from setup intent, then list from customer
    let pm = null;
    if (setupIntent && setupIntent.payment_method) {
      const pmId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method.id;
      console.log("Getting PM from setup intent:", pmId);
      pm = await stripe.paymentMethods.retrieve(pmId, { stripeAccount: stripeAccountId });
    }

    if (!pm && customer) {
      const cardMethods = await stripe.paymentMethods.list(
        { customer: customer.id, type: "card" },
        { stripeAccount: stripeAccountId }
      );
      if (cardMethods.data.length > 0) {
        pm = cardMethods.data[0];
      } else {
        const becsMethods = await stripe.paymentMethods.list(
          { customer: customer.id, type: "au_becs_debit" },
          { stripeAccount: stripeAccountId }
        );
        if (becsMethods.data.length > 0) {
          pm = becsMethods.data[0];
        }
      }
    }

    if (!pm) {
      res.status(404).json({ error: "No payment method found. It may take a moment to process." });
      return;
    }

    // Build payment method info
    let paymentMethodInfo;
    if (pm.type === "au_becs_debit") {
      paymentMethodInfo = {
        id: pm.id, type: "au_becs_debit",
        brand: "BECS Direct Debit", last4: pm.au_becs_debit.last4,
      };
    } else {
      paymentMethodInfo = {
        id: pm.id, type: "card",
        brand: pm.card.brand, last4: pm.card.last4,
        expMonth: pm.card.exp_month, expYear: pm.card.exp_year,
      };
    }

    // Update parent doc
    const customerId = customer ? customer.id : null;
    if (parentEmail) {
      const parentsSnap = await db.collection("parents")
        .where("email", "==", parentEmail.toLowerCase())
        .where("locationId", "==", locationId)
        .limit(1)
        .get();
      if (!parentsSnap.empty) {
        const updateData = { paymentMethod: paymentMethodInfo };
        if (customerId) updateData.stripeCustomerId = customerId;
        await parentsSnap.docs[0].ref.update(updateData);
      }
    }

    // Update sales
    if (parentEmail) {
      const salesSnap = await db.collection("sales")
        .where("locationId", "==", locationId)
        .where("parentEmail", "==", parentEmail)
        .get();
      if (!salesSnap.empty) {
        const batch = db.batch();
        salesSnap.docs.forEach((d) => {
          const updateData = { paymentMethod: paymentMethodInfo, stripeStatus: "connected" };
          if (customerId) updateData.stripeCustomerId = customerId;
          batch.update(d.ref, updateData);
        });
        await batch.commit();
      }
    }

    // Detach old payment method from Stripe if replacing
    if (oldPaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(oldPaymentMethodId, { stripeAccount: stripeAccountId });
        console.log("Detached old PM:", oldPaymentMethodId);
      } catch (detachErr) {
        console.error("Failed to detach old PM (non-fatal):", detachErr.message);
      }
    }

    console.log("SUCCESS! PM saved:", paymentMethodInfo);
    res.status(200).json({
      success: true,
      last4: paymentMethodInfo.last4,
      brand: paymentMethodInfo.brand,
      type: paymentMethodInfo.type || "card",
      customerId: customerId || "",
    });
  } catch (e) {
    console.error("savePaymentFromCheckoutPublic error:", e);
    res.status(500).json({ error: e.message || "Failed to confirm payment." });
  }
});

// Create a Stripe Subscription for a membership purchase (parent app)
exports.createSubscriptionPublic = functions.runWith({ secrets: ["STRIPE_SECRET_KEY"] }).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const {
      parentEmail, parentName, parentId, parentPhone,
      locationId, childName, childGrade,
      membershipId, membershipName, membershipCategory,
      basePrice, totalAmount, feeAmount, feeDescription,
      joiningFee, firstPaymentTotal,
    } = req.body;

    console.log("createSubscriptionPublic called:", { parentEmail, locationId, membershipId, basePrice, totalAmount });

    if (!parentEmail || !locationId || !membershipId || !totalAmount) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const stripe = requireStripe();
    const db = getFirestore();

    // Get stripe account ID for this location
    const locSnap = await db.collection("locations").doc(locationId).get();
    if (!locSnap.exists) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    const stripeAccountId = locSnap.data().stripeAccountId;
    if (!stripeAccountId) {
      res.status(400).json({ error: "This centre has not set up payments yet." });
      return;
    }

    // Get or create customer on connected account
    let customer = null;
    const existingCustomers = await stripe.customers.list(
      { email: parentEmail.toLowerCase(), limit: 1 },
      { stripeAccount: stripeAccountId }
    );
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create(
        { email: parentEmail.toLowerCase(), name: parentName || "", phone: parentPhone || "" },
        { stripeAccount: stripeAccountId }
      );
    }
    console.log("Customer:", customer.id);

    // Find payment method - check parent doc first, then list from customer
    let paymentMethodId = null;
    const parentSnap = await db.collection("parents")
      .where("email", "==", parentEmail.toLowerCase())
      .where("locationId", "==", locationId)
      .limit(1)
      .get();

    if (!parentSnap.empty) {
      const parentDoc = parentSnap.docs[0].data();
      paymentMethodId = parentDoc.paymentMethod?.id || null;
    }

    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list(
        { customer: customer.id, type: "card" },
        { stripeAccount: stripeAccountId }
      );
      if (pms.data.length > 0) {
        paymentMethodId = pms.data[0].id;
      } else {
        const becsPms = await stripe.paymentMethods.list(
          { customer: customer.id, type: "au_becs_debit" },
          { stripeAccount: stripeAccountId }
        );
        if (becsPms.data.length > 0) {
          paymentMethodId = becsPms.data[0].id;
        }
      }
    }

    // Attach payment method to customer if needed
    if (paymentMethodId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id }, { stripeAccount: stripeAccountId });
      } catch (attachErr) {
        if (!attachErr.message.includes("already been attached")) {
          console.log("PM attach note:", attachErr.message);
        }
      }
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId },
      }, { stripeAccount: stripeAccountId });
    }

    // Create product on connected account
    const product = await stripe.products.create({
      name: membershipName || membershipId,
      metadata: { membershipId, childName: childName || "", locationId },
    }, { stripeAccount: stripeAccountId });

    // Create price (weekly recurring) — amount in cents
    const amountCents = Math.round(parseFloat(totalAmount) * 100);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amountCents,
      currency: "aud",
      recurring: { interval: "week", interval_count: 1 },
    }, { stripeAccount: stripeAccountId });

    // Add joining fee as one-time invoice item (will be included on first invoice)
    const joiningFeeAmount = parseFloat(joiningFee) || 0;
    if (joiningFeeAmount > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: Math.round(joiningFeeAmount * 100),
        currency: "aud",
        description: "Joining fee (one-time)",
      }, { stripeAccount: stripeAccountId });
      console.log("Joining fee invoice item created:", joiningFeeAmount);
    }

    // Create subscription — charge immediately if we have a PM
    const subscriptionParams = {
      customer: customer.id,
      items: [{ price: price.id }],
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        membershipId,
        childName: childName || "",
        parentEmail: parentEmail.toLowerCase(),
        locationId,
      },
    };
    if (paymentMethodId) {
      subscriptionParams.default_payment_method = paymentMethodId;
      subscriptionParams.payment_behavior = "error_if_incomplete";
    } else {
      subscriptionParams.payment_behavior = "default_incomplete";
    }

    const subscription = await stripe.subscriptions.create(
      subscriptionParams,
      { stripeAccount: stripeAccountId }
    );
    console.log("Subscription created:", subscription.id, "status:", subscription.status);

    // Create sale doc in Firestore
    const today = new Date().toISOString().split("T")[0];
    const saleData = {
      locationId,
      children: [{ name: childName || "", grade: childGrade || "" }],
      parentName: parentName || "",
      parentEmail: parentEmail.toLowerCase(),
      parentPhone: parentPhone || "",
      parentId: parentId || "",
      membershipId,
      membershipName: membershipName || membershipId,
      membershipCategory: membershipCategory || "membership",
      basePrice: basePrice || totalAmount,
      weeklyAmount: totalAmount,
      feeAmount: feeAmount || "0",
      feeDescription: feeDescription || "",
      joiningFee: joiningFeeAmount > 0 ? joiningFee : "0",
      firstPaymentTotal: firstPaymentTotal || totalAmount,
      activationDate: today,
      firstPaymentDate: today,
      billingFrequency: "weekly",
      status: subscription.status === "active" ? "active" : "pending",
      stripeStatus: subscription.status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customer.id,
      stripePriceId: price.id,
      stripeProductId: product.id,
      createdAt: new Date(),
      source: "mobile_app",
    };
    const saleRef = await db.collection("sales").add(saleData);

    // Create initial transaction record
    const transactionData = {
      locationId,
      saleId: saleRef.id,
      parentEmail: parentEmail.toLowerCase(),
      parentName: parentName || "",
      childName: childName || "",
      membershipName: membershipName || membershipId,
      amount: totalAmount,
      basePrice: basePrice || totalAmount,
      feeAmount: feeAmount || "0",
      type: "subscription_payment",
      status: subscription.status === "active" ? "paid" : "pending",
      stripeSubscriptionId: subscription.id,
      stripeInvoiceId: subscription.latest_invoice?.id || "",
      date: today,
      createdAt: new Date(),
    };
    await db.collection("transactions").add(transactionData);

    res.status(200).json({
      success: true,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      saleId: saleRef.id,
      customerId: customer.id,
    });
  } catch (e) {
    console.error("createSubscriptionPublic error:", e);
    res.status(500).json({ error: e.message || "Failed to create subscription." });
  }
});

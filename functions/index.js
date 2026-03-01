// functions/index.js
// Firebase Cloud Functions for the Franchise Portal.
// Uses 1st Gen functions to avoid Eventarc permissions issues.

const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const sgMail = require("@sendgrid/mail");

initializeApp();

// ── Sender config ─────────────────────────────────────────────────────────────
const FROM_EMAIL = "michael@successtutoring.com";
const FROM_NAME  = "Success Tutoring";
const PORTAL_URL = "https://success-tutoring-test.web.app";

// ── Email Template System ─────────────────────────────────────────────────────

// Master email layout wrapper (fixed, not editable)
function wrapInMasterLayout(bodyHtml, headerTitle, headerSubtitle, headerBg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  body { margin: 0; padding: 0; background: #f5f3ee; font-family: Arial, sans-serif; }
  .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; }
  .header { background: ${headerBg || 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)'}; padding: 40px; text-align: center; }
  .header h1 { color: #ffffff; font-size: 24px; margin: 0; }
  .header p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0; }
  .body { padding: 40px; }
  .body p { color: #444; font-size: 15px; line-height: 1.7; }
  .body a { color: #E25D25; }
  .detail-card { background: #fdf0ea; border-radius: 12px; padding: 24px; margin: 24px 0; }
  .detail-row { margin-bottom: 10px; font-size: 14px; color: #333; }
  .detail-label { font-weight: 600; color: #E25D25; }
  .ref { font-size: 12px; color: #999; margin-top: 16px; }
  .cta { text-align: center; margin: 28px 0; }
  .cta a { display: inline-block; background: #E25D25; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }
  .footer { background: #f5f3ee; padding: 24px; text-align: center; font-size: 12px; color: #999; }
</style></head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${headerTitle || ''}</h1>
      ${headerSubtitle ? `<p>${headerSubtitle}</p>` : ''}
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">&copy; ${new Date().getFullYear()} Success Tutoring. All rights reserved.</div>
  </div>
</body></html>`;
}

// Replace merge tags in template content
function replaceMergeTags(content, data) {
  if (!content) return '';
  return content
    .replace(/\{\{customerName\}\}/g, data.customerName || '')
    .replace(/\{\{customerFirstName\}\}/g, data.customerFirstName || '')
    .replace(/\{\{customerLastName\}\}/g, data.customerLastName || '')
    .replace(/\{\{customerEmail\}\}/g, data.customerEmail || '')
    .replace(/\{\{customerPhone\}\}/g, data.customerPhone || '')
    .replace(/\{\{locationName\}\}/g, data.locationName || '')
    .replace(/\{\{locationEmail\}\}/g, data.locationEmail || '')
    .replace(/\{\{locationPhone\}\}/g, data.locationPhone || '')
    .replace(/\{\{locationAddress\}\}/g, data.locationAddress || '')
    .replace(/\{\{bookingDate\}\}/g, data.bookingDate || '')
    .replace(/\{\{bookingTime\}\}/g, data.bookingTime || '')
    .replace(/\{\{bookingRef\}\}/g, data.bookingRef || '')
    .replace(/\{\{membershipName\}\}/g, data.membershipName || '')
    .replace(/\{\{className\}\}/g, data.className || '')
    .replace(/\{\{staffName\}\}/g, data.staffName || '')
    .replace(/\{\{franchisePartnerName\}\}/g, data.franchisePartnerName || '')
    .replace(/\{\{paymentAmount\}\}/g, data.paymentAmount || '')
    .replace(/\{\{paymentLink\}\}/g, data.paymentLink || '')
    .replace(/\{\{portalLink\}\}/g, data.portalLink || PORTAL_URL)
    .replace(/\{\{inviteLink\}\}/g, data.inviteLink || '')
    .replace(/\{\{formType\}\}/g, data.formType || '')
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()));
}

// Resolve the correct template: country-specific override > global
async function resolveTemplate(templateKey, country) {
  const db = getFirestore();
  
  // Try country-specific override first
  if (country) {
    const countryKey = `${templateKey}_${country.toUpperCase()}`;
    const countryDoc = await db.doc(`email_templates/${countryKey}`).get();
    if (countryDoc.exists && countryDoc.data().enabled !== false) {
      return countryDoc.data();
    }
  }
  
  // Fall back to global template
  const globalDoc = await db.doc(`email_templates/${templateKey}`).get();
  if (globalDoc.exists) {
    return globalDoc.data();
  }
  
  return null;
}

// Build and send an email using a template from Firestore
async function sendTemplatedEmail({ to, templateKey, mergeData, country, replyTo, fromName }) {
  const template = await resolveTemplate(templateKey, country);
  if (!template) {
    console.warn(`No email template found for key "${templateKey}" — skipping email.`);
    return false;
  }
  
  const subject = replaceMergeTags(template.subject || '', mergeData);
  const bodyHtml = replaceMergeTags(template.body || '', mergeData);
  const html = wrapInMasterLayout(bodyHtml, template.headerTitle || '', template.headerSubtitle || '', template.headerBg || '');
  const text = subject; // Simple text fallback
  
  const apiKey = functions.config().sendgrid?.api_key;
  if (!apiKey) {
    console.error("SendGrid API key not set.");
    return false;
  }
  sgMail.setApiKey(apiKey);
  
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: fromName || FROM_NAME },
    subject,
    text,
    html,
  };
  
  if (replyTo) {
    msg.replyTo = replyTo;
  }
  
  try {
    await sgMail.send(msg);
    console.log(`Template email "${templateKey}" sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`SendGrid error for "${templateKey}":`, err?.response?.body ?? err);
    return false;
  }
}

// ── Default email template seed data ──────────────────────────────────────────
const DEFAULT_EMAIL_TEMPLATES = [
  // ── HQ Users ──
  {
    key: 'hq_user_created',
    category: 'hq_users',
    name: 'New HQ User Account Created',
    description: 'Sent when a new HQ user account is created via invite',
    subject: "You've been invited to the Success Tutoring HQ Portal",
    headerTitle: "You've been invited!",
    headerSubtitle: 'Success Tutoring HQ Portal',
    headerBg: '#0a0a0f',
    body: `<p>Hi {{staffName}},</p>
<p>You've been invited to join the <strong>Success Tutoring HQ Portal</strong> as an <strong>Admin</strong>.</p>
<p>Click the button below to sign in with your Google account and get started.</p>
<div class="cta"><a href="{{inviteLink}}">Accept Invite & Sign In →</a></div>
<p style="font-size: 13px; color: #888;">If you weren't expecting this invite, you can safely ignore this email.</p>`,
    mergeTags: ['staffName', 'inviteLink', 'portalLink'],
  },
  // ── Staff ──
  {
    key: 'staff_member_created',
    category: 'staff',
    name: 'New Staff Member',
    description: 'Sent when a new staff member is created at a location',
    subject: 'Welcome to {{locationName}} — Your Staff Account is Ready',
    headerTitle: 'Welcome to the Team!',
    headerSubtitle: 'Your staff account is ready',
    headerBg: 'linear-gradient(135deg, #6dcbca 0%, #4fa8a7 100%)',
    body: `<p>Hi {{staffName}},</p>
<p>You've been added as a staff member at <strong>{{locationName}}</strong>.</p>
<p>You can now access the portal to view your schedule and manage your sessions.</p>
<div class="cta"><a href="{{portalLink}}">Access Portal →</a></div>`,
    mergeTags: ['staffName', 'locationName', 'portalLink'],
  },
  // ── Franchise Partner ──
  {
    key: 'franchise_partner_created',
    category: 'franchise_partner',
    name: 'New Franchise Partner Account',
    description: 'Sent when a new franchise partner user account is created',
    subject: 'Welcome! Your franchise location "{{locationName}}" is now active',
    headerTitle: 'Welcome to the Network!',
    headerSubtitle: 'Your franchise location has been created',
    headerBg: '#2d5a3d',
    body: `<p>Hi there,</p>
<p>Your franchise location <strong>{{locationName}}</strong> has been successfully added to the system. Your partner portal is now active.</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div>
  <div class="detail-row"><span class="detail-label">Address: </span>{{locationAddress}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{locationPhone}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{locationEmail}}</div>
</div>
<p>Sign in to your Partner Portal to set your availability and manage booking settings.</p>
<div class="cta"><a href="{{portalLink}}">Access Partner Portal →</a></div>`,
    mergeTags: ['locationName', 'locationAddress', 'locationPhone', 'locationEmail', 'portalLink'],
  },
  {
    key: 'franchise_assessment_booked',
    category: 'franchise_partner',
    name: 'New Assessment Booked',
    description: 'Sent to the franchise partner when a new assessment is booked',
    subject: 'New Booking — {{customerName}} on {{bookingDate}} at {{bookingTime}}',
    headerTitle: 'New Assessment Booking!',
    headerSubtitle: 'A customer has booked an assessment at your centre',
    headerBg: 'linear-gradient(135deg, #6dcbca 0%, #4fa8a7 100%)',
    body: `<p>Hi there,</p>
<p>A new assessment has been booked at <strong>{{locationName}}</strong>:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Customer: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
  <div class="detail-row"><span class="detail-label">Date: </span>{{bookingDate}}</div>
  <div class="detail-row"><span class="detail-label">Time: </span>{{bookingTime}}</div>
  <div class="ref">Booking Ref: {{bookingRef}}</div>
</div>
<p>Log in to your Partner Portal to view all upcoming bookings.</p>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'bookingDate', 'bookingTime', 'bookingRef', 'locationName', 'portalLink'],
  },
  {
    key: 'franchise_new_signup',
    category: 'franchise_partner',
    name: 'New Sign Up Member (App)',
    description: 'Sent to the franchise partner when a new member signs up on the app',
    subject: 'New Sign Up — {{customerName}} at {{locationName}}',
    headerTitle: 'New Member Sign Up!',
    headerSubtitle: 'A new member has signed up via the app',
    headerBg: 'linear-gradient(135deg, #6dcbca 0%, #4fa8a7 100%)',
    body: `<p>Hi there,</p>
<p>A new member has signed up at <strong>{{locationName}}</strong> via the mobile app:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Name: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
</div>
<p>Log in to your Partner Portal to view the new member.</p>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'locationName', 'portalLink'],
  },
  {
    key: 'franchise_new_lead_assessment',
    category: 'franchise_partner',
    name: 'New Lead — Assessment Booked',
    description: 'Sent to the franchise partner when a new lead books an assessment',
    subject: 'New Lead — Assessment Booked at {{locationName}}',
    headerTitle: 'New Lead!',
    headerSubtitle: 'Assessment booked at your centre',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi there,</p>
<p>You've received a new lead via an <strong>Assessment Booking</strong> for <strong>{{locationName}}</strong>:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Name: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
  <div class="detail-row"><span class="detail-label">Form: </span>Assessment Booking</div>
</div>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'locationName', 'portalLink'],
  },
  {
    key: 'franchise_new_lead_vip',
    category: 'franchise_partner',
    name: 'New Lead — Joined VIP List',
    description: 'Sent to the franchise partner when someone joins the VIP list',
    subject: 'New VIP List Sign Up at {{locationName}}',
    headerTitle: 'New Lead!',
    headerSubtitle: 'Someone joined the VIP list',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi there,</p>
<p>You've received a new lead via the <strong>VIP List</strong> form for <strong>{{locationName}}</strong>:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Name: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
  <div class="detail-row"><span class="detail-label">Form: </span>VIP List</div>
</div>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'locationName', 'portalLink'],
  },
  {
    key: 'franchise_new_lead_foundation',
    category: 'franchise_partner',
    name: 'New Lead — Foundation Membership',
    description: 'Sent to the franchise partner when someone signs up for a foundation membership',
    subject: 'New Foundation Membership Lead at {{locationName}}',
    headerTitle: 'New Lead!',
    headerSubtitle: 'Foundation membership enquiry',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi there,</p>
<p>You've received a new lead via the <strong>Get Foundation Membership</strong> form for <strong>{{locationName}}</strong>:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Name: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
  <div class="detail-row"><span class="detail-label">Form: </span>Foundation Membership</div>
</div>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'locationName', 'portalLink'],
  },
  {
    key: 'franchise_new_lead_enquiry',
    category: 'franchise_partner',
    name: 'New Lead — Enquiry (Temp Closed)',
    description: 'Sent to the franchise partner when an enquiry is submitted for a temporarily closed location',
    subject: 'New Enquiry at {{locationName}} (Temporarily Closed)',
    headerTitle: 'New Lead!',
    headerSubtitle: 'Enquiry for temporarily closed location',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi there,</p>
<p>You've received a new enquiry for <strong>{{locationName}}</strong> (temporarily closed):</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Name: </span>{{customerName}}</div>
  <div class="detail-row"><span class="detail-label">Email: </span>{{customerEmail}}</div>
  <div class="detail-row"><span class="detail-label">Phone: </span>{{customerPhone}}</div>
  <div class="detail-row"><span class="detail-label">Form: </span>Enquiry (Temp. Closed)</div>
</div>
<div class="cta"><a href="{{portalLink}}">Open Partner Portal →</a></div>`,
    mergeTags: ['customerName', 'customerEmail', 'customerPhone', 'locationName', 'portalLink'],
  },
  // ── Customer (New) ──
  {
    key: 'customer_new_member',
    category: 'customer_new',
    name: 'New Member Email',
    description: 'Sent when a user creates a new account',
    subject: 'Welcome to Success Tutoring, {{customerFirstName}}!',
    headerTitle: 'Welcome!',
    headerSubtitle: "You're all set to get started",
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Welcome to <strong>Success Tutoring</strong>! Your account has been created and you're ready to start your learning journey.</p>
<p>Your centre: <strong>{{locationName}}</strong></p>
<p>If you have any questions, don't hesitate to contact your local centre.</p>`,
    mergeTags: ['customerName', 'customerFirstName', 'locationName', 'locationEmail', 'locationPhone'],
  },
  {
    key: 'customer_assessment_booked',
    category: 'customer_new',
    name: 'Assessment Booked',
    description: 'Sent to the customer when they book an assessment',
    subject: 'Assessment Confirmed — {{bookingDate}} at {{bookingTime}}',
    headerTitle: 'Assessment Confirmed!',
    headerSubtitle: 'Your booking is all set',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Your free 40-minute assessment has been confirmed. Here are your booking details:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div>
  <div class="detail-row"><span class="detail-label">Address: </span>{{locationAddress}}</div>
  <div class="detail-row"><span class="detail-label">Date: </span>{{bookingDate}}</div>
  <div class="detail-row"><span class="detail-label">Time: </span>{{bookingTime}}</div>
  <div class="ref">Booking Ref: {{bookingRef}}</div>
</div>
<p>Please arrive a few minutes early. If you need to reschedule, contact your centre directly.</p>`,
    mergeTags: ['customerName', 'bookingDate', 'bookingTime', 'bookingRef', 'locationName', 'locationAddress'],
  },
  {
    key: 'customer_vip_joined',
    category: 'customer_new',
    name: 'Joined VIP List',
    description: 'Sent when a customer joins the VIP list',
    subject: "You're on the VIP List for {{locationName}}!",
    headerTitle: "You're on the VIP List!",
    headerSubtitle: 'Thanks for your interest',
    headerBg: 'linear-gradient(135deg, #F9A72B 0%, #e8971d 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Thanks for joining the VIP list for <strong>{{locationName}}</strong>!</p>
<p>You'll be the first to know when we open and will have access to exclusive deals and early-bird pricing.</p>
<p>We'll be in touch soon with more details.</p>`,
    mergeTags: ['customerName', 'locationName'],
  },
  {
    key: 'customer_foundation_membership',
    category: 'customer_new',
    name: 'Foundation Membership',
    description: 'Sent when a customer signs up for a foundation membership rate',
    subject: 'Foundation Membership Confirmed at {{locationName}}',
    headerTitle: 'Foundation Membership!',
    headerSubtitle: "You've locked in the foundation rate",
    headerBg: 'linear-gradient(135deg, #F9A72B 0%, #e8971d 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Congratulations! You've secured a <strong>Foundation Membership</strong> rate at <strong>{{locationName}}</strong>.</p>
<p>We'll be in touch with more details about when your centre opens and how to get started.</p>`,
    mergeTags: ['customerName', 'locationName'],
  },
  {
    key: 'customer_enquiry_temp_closed',
    category: 'customer_new',
    name: 'Enquiry (Temp Closed Location)',
    description: 'Sent when a customer enquires about a temporarily closed location',
    subject: 'Thanks for your enquiry about {{locationName}}',
    headerTitle: 'Thanks for your enquiry!',
    headerSubtitle: "We'll be back soon",
    headerBg: 'linear-gradient(135deg, #6dcbca 0%, #4fa8a7 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Thank you for your enquiry about <strong>{{locationName}}</strong>. This centre is temporarily closed, but we'll notify you as soon as we reopen.</p>
<p>In the meantime, feel free to check out our other nearby locations.</p>`,
    mergeTags: ['customerName', 'locationName'],
  },
  // ── Customer (Existing) ──
  {
    key: 'customer_class_cancelled',
    category: 'customer_existing',
    name: 'Class Cancelled',
    description: 'Sent when a class is cancelled',
    subject: 'Class Cancelled — {{className}} on {{bookingDate}}',
    headerTitle: 'Class Cancelled',
    headerSubtitle: 'An upcoming class has been cancelled',
    headerBg: '#dc2626',
    body: `<p>Hi {{customerName}},</p>
<p>Unfortunately, your upcoming class has been cancelled:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Class: </span>{{className}}</div>
  <div class="detail-row"><span class="detail-label">Date: </span>{{bookingDate}}</div>
  <div class="detail-row"><span class="detail-label">Time: </span>{{bookingTime}}</div>
  <div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div>
</div>
<p>Please contact your centre if you have any questions or would like to reschedule.</p>`,
    mergeTags: ['customerName', 'className', 'bookingDate', 'bookingTime', 'locationName'],
  },
  {
    key: 'customer_membership_purchased',
    category: 'customer_existing',
    name: 'Membership Purchased',
    description: 'Sent when a member purchases a membership',
    subject: 'Membership Confirmed — {{membershipName}}',
    headerTitle: 'Membership Confirmed!',
    headerSubtitle: 'Your membership is now active',
    headerBg: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Your membership has been confirmed:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Membership: </span>{{membershipName}}</div>
  <div class="detail-row"><span class="detail-label">Amount: </span>{{paymentAmount}}/week</div>
  <div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div>
</div>
<p>You're all set! Your sessions will begin as per your schedule.</p>`,
    mergeTags: ['customerName', 'membershipName', 'paymentAmount', 'locationName'],
  },
  {
    key: 'customer_class_joined',
    category: 'customer_existing',
    name: 'Joined a Class',
    description: 'Sent when a member joins a class',
    subject: 'Class Confirmed — {{className}} on {{bookingDate}}',
    headerTitle: 'Class Confirmed!',
    headerSubtitle: "You're enrolled in an upcoming class",
    headerBg: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>You've been enrolled in the following class:</p>
<div class="detail-card">
  <div class="detail-row"><span class="detail-label">Class: </span>{{className}}</div>
  <div class="detail-row"><span class="detail-label">Date: </span>{{bookingDate}}</div>
  <div class="detail-row"><span class="detail-label">Time: </span>{{bookingTime}}</div>
  <div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div>
</div>`,
    mergeTags: ['customerName', 'className', 'bookingDate', 'bookingTime', 'locationName'],
  },
  {
    key: 'customer_membership_suspended',
    category: 'customer_existing',
    name: 'Membership Suspended',
    description: 'Sent when a member suspends their membership',
    subject: 'Membership Suspended — {{membershipName}}',
    headerTitle: 'Membership Suspended',
    headerSubtitle: 'Your membership has been paused',
    headerBg: '#F9A72B',
    body: `<p>Hi {{customerName}},</p>
<p>Your membership <strong>{{membershipName}}</strong> at <strong>{{locationName}}</strong> has been suspended.</p>
<p>Your sessions are on hold until the membership is reactivated. Contact your centre to resume.</p>`,
    mergeTags: ['customerName', 'membershipName', 'locationName'],
  },
  {
    key: 'customer_membership_cancelled',
    category: 'customer_existing',
    name: 'Membership Cancelled',
    description: 'Sent when a member cancels their membership',
    subject: 'Membership Cancelled — {{membershipName}}',
    headerTitle: 'Membership Cancelled',
    headerSubtitle: 'Your membership has been cancelled',
    headerBg: '#dc2626',
    body: `<p>Hi {{customerName}},</p>
<p>Your membership <strong>{{membershipName}}</strong> at <strong>{{locationName}}</strong> has been cancelled.</p>
<p>If this was a mistake or you'd like to re-enrol, please contact your centre.</p>`,
    mergeTags: ['customerName', 'membershipName', 'locationName'],
  },
  {
    key: 'customer_policies_updated',
    category: 'customer_existing',
    name: 'Policies Updated',
    description: 'Sent when existing policies have been updated',
    subject: 'Policy Update at Success Tutoring',
    headerTitle: 'Policy Update',
    headerSubtitle: 'Our policies have been updated',
    headerBg: '#0a0a0f',
    body: `<p>Hi {{customerName}},</p>
<p>We've updated our policies at <strong>Success Tutoring</strong>. Please review the changes at your earliest convenience.</p>
<p>The updated policies are effective immediately and apply to all members.</p>
<p>If you have any questions, please contact your local centre.</p>`,
    mergeTags: ['customerName', 'locationName'],
  },
  {
    key: 'customer_payment_failed',
    category: 'customer_existing',
    name: 'Payment Failed',
    description: 'Sent when a payment fails',
    subject: 'Payment Failed — Action Required',
    headerTitle: 'Payment Failed',
    headerSubtitle: 'We couldn\'t process your payment',
    headerBg: '#dc2626',
    body: `<p>Hi {{customerName}},</p>
<p>We were unable to process your payment of <strong>{{paymentAmount}}</strong> for your membership at <strong>{{locationName}}</strong>.</p>
<p>Please update your payment method to avoid any interruption to your sessions.</p>
<div class="cta"><a href="{{paymentLink}}">Update Payment Method →</a></div>`,
    mergeTags: ['customerName', 'paymentAmount', 'locationName', 'paymentLink'],
  },
  {
    key: 'customer_payment_reminder_1',
    category: 'customer_existing',
    name: 'Payment Reminder #1',
    description: 'First payment reminder',
    subject: 'Payment Reminder — {{membershipName}}',
    headerTitle: 'Payment Reminder',
    headerSubtitle: 'A friendly reminder about your upcoming payment',
    headerBg: '#F9A72B',
    body: `<p>Hi {{customerName}},</p>
<p>This is a friendly reminder that your payment of <strong>{{paymentAmount}}</strong> for <strong>{{membershipName}}</strong> at <strong>{{locationName}}</strong> is due soon.</p>
<p>Please ensure your payment method is up to date.</p>
<div class="cta"><a href="{{paymentLink}}">Check Payment Method →</a></div>`,
    mergeTags: ['customerName', 'paymentAmount', 'membershipName', 'locationName', 'paymentLink'],
  },
  {
    key: 'customer_payment_reminder_2',
    category: 'customer_existing',
    name: 'Payment Reminder #2',
    description: 'Second payment reminder (more urgent)',
    subject: 'Urgent: Payment Overdue — {{membershipName}}',
    headerTitle: 'Payment Overdue',
    headerSubtitle: 'Your payment requires immediate attention',
    headerBg: '#dc2626',
    body: `<p>Hi {{customerName}},</p>
<p>Your payment of <strong>{{paymentAmount}}</strong> for <strong>{{membershipName}}</strong> at <strong>{{locationName}}</strong> is now overdue.</p>
<p>Please update your payment method immediately to avoid suspension of your membership.</p>
<div class="cta"><a href="{{paymentLink}}">Update Payment Now →</a></div>`,
    mergeTags: ['customerName', 'paymentAmount', 'membershipName', 'locationName', 'paymentLink'],
  },
  {
    key: 'customer_payment_link_sent',
    category: 'customer_existing',
    name: 'Payment Link Sent',
    description: 'Sent when a payment link is sent to a customer',
    subject: 'Payment Link — {{locationName}}',
    headerTitle: 'Payment Link',
    headerSubtitle: 'Complete your payment setup',
    headerBg: 'linear-gradient(135deg, #E25D25 0%, #c94f1f 100%)',
    body: `<p>Hi {{customerName}},</p>
<p>Please use the link below to set up your payment method for <strong>{{locationName}}</strong>:</p>
<div class="cta"><a href="{{paymentLink}}">Set Up Payment →</a></div>
<p style="font-size: 13px; color: #888;">This link will expire after use. If you have any issues, please contact your centre.</p>`,
    mergeTags: ['customerName', 'locationName', 'paymentLink'],
  },
  {
    key: 'customer_session_rescheduled',
    category: 'customer_existing',
    name: 'Session Rescheduled',
    description: 'Sent when a session is rescheduled to a new date/time',
    subject: 'Session Rescheduled — {{className}} moved to {{bookingDate}}',
    headerTitle: 'Session Rescheduled',
    headerSubtitle: 'Your upcoming session has been moved',
    headerBg: '#F9A72B',
    body: `<p>Hi {{customerName}},</p><p>Your upcoming session has been rescheduled. Here are the updated details:</p><div class="detail-card"><div class="detail-row"><span class="detail-label">Service: </span>{{className}}</div><div class="detail-row"><span class="detail-label">New Date: </span>{{bookingDate}}</div><div class="detail-row"><span class="detail-label">New Time: </span>{{bookingTime}}</div><div class="detail-row"><span class="detail-label">Location: </span>{{locationName}}</div></div><p>If you have any questions or need to make further changes, please contact your centre.</p>`,
    mergeTags: ['customerName', 'className', 'bookingDate', 'bookingTime', 'locationName', 'locationEmail', 'locationPhone'],
  },
];

// ── Callable: Send session notification (reschedule / cancel) ────────────
exports.sendSessionNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const { type, booking, locationData } = data;
  if (!type || !booking) {
    throw new functions.https.HttpsError("invalid-argument", "type and booking are required.");
  }

  const templateKey = type === 'cancel' ? 'customer_class_cancelled' : 'customer_session_rescheduled';

  // Determine the booking date display
  const dateObj = booking.date ? new Date(booking.date + 'T00:00:00') : null;
  const formattedDate = dateObj ? dateObj.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : booking.date || '';

  // Format time
  const fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const mergeData = {
    customerName: booking.customerName || 'there',
    customerFirstName: (booking.customerName || '').split(' ')[0] || 'there',
    className: booking.serviceName || booking.className || 'your session',
    bookingDate: formattedDate,
    bookingTime: fmtTime(booking.time),
    locationName: locationData?.name || booking.locationName || 'Success Tutoring',
    locationEmail: locationData?.email || '',
    locationPhone: locationData?.phone || '',
    locationAddress: locationData?.address || '',
  };

  // Collect unique emails to send to
  const emails = new Set();
  if (booking.customerEmail) emails.add(booking.customerEmail.toLowerCase().trim());
  if (booking.parentEmail && booking.parentEmail.toLowerCase().trim() !== (booking.customerEmail || '').toLowerCase().trim()) {
    emails.add(booking.parentEmail.toLowerCase().trim());
  }

  if (emails.size === 0) {
    console.warn(`No email addresses found for booking — skipping notification.`);
    return { success: false, reason: 'no_email' };
  }

  // Determine country from location for template override
  const country = locationData?.country || null;

  let sent = 0;
  for (const email of emails) {
    const success = await sendTemplatedEmail({
      to: email,
      templateKey,
      mergeData,
      country,
      replyTo: locationData?.email || undefined,
    });
    if (success) sent++;
  }

  return { success: sent > 0, sent, total: emails.size };
});

// ── Callable: Seed default email templates ───────────────────────────────
exports.seedEmailTemplates = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerDoc = await getFirestore().doc(`users/${context.auth.uid}`).get();
  if (callerDoc.data()?.role !== "master_admin") {
    throw new functions.https.HttpsError("permission-denied", "Only master admins can seed templates.");
  }

  const db = getFirestore();
  const { overwrite } = data || {};
  let seeded = 0;

  for (const template of DEFAULT_EMAIL_TEMPLATES) {
    const docRef = db.doc(`email_templates/${template.key}`);
    const existing = await docRef.get();
    if (!existing.exists || overwrite) {
      await docRef.set({
        ...template,
        enabled: true,
        scope: 'global',
        versions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: !overwrite });
      seeded++;
    }
  }

  return { success: true, seeded, total: DEFAULT_EMAIL_TEMPLATES.length };
});

// ── Callable: Send test email ────────────────────────────────────────────────
exports.sendTestEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerDoc = await getFirestore().doc(`users/${context.auth.uid}`).get();
  if (callerDoc.data()?.role !== "master_admin") {
    throw new functions.https.HttpsError("permission-denied", "Only master admins can send test emails.");
  }

  const { templateKey, toEmail } = data;
  if (!templateKey || !toEmail) {
    throw new functions.https.HttpsError("invalid-argument", "templateKey and toEmail required.");
  }

  // Use sample merge data
  const sampleData = {
    customerName: 'John Smith',
    customerFirstName: 'John',
    customerLastName: 'Smith',
    customerEmail: 'john@example.com',
    customerPhone: '+61 400 000 000',
    locationName: 'Success Tutoring Bondi',
    locationEmail: 'bondi@successtutoring.com',
    locationPhone: '+61 2 9000 0000',
    locationAddress: '123 Bondi Road, Bondi NSW 2026',
    bookingDate: 'Monday, 15 April 2026',
    bookingTime: '3:30 PM',
    bookingRef: 'TEST1234',
    membershipName: 'Standard Weekly Membership',
    className: 'Year 5 Maths',
    staffName: 'Jane Doe',
    franchisePartnerName: 'Franchise Partner',
    paymentAmount: '$49.00',
    paymentLink: PORTAL_URL,
    portalLink: PORTAL_URL,
    inviteLink: PORTAL_URL + '?invite=test123',
    formType: 'VIP List',
    year: String(new Date().getFullYear()),
  };

  const success = await sendTemplatedEmail({
    to: toEmail,
    templateKey,
    mergeData: sampleData,
  });

  if (!success) {
    throw new functions.https.HttpsError("internal", "Failed to send test email.");
  }

  return { success: true };
});

// ── Helper: build the confirmation email (legacy, kept for backward compat) ──
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

    // Try templated email first
    const mergeData = {
      locationName: location.name,
      locationAddress: location.address,
      locationPhone: location.phone,
      locationEmail: location.email,
      portalLink: PORTAL_URL,
    };
    
    const sent = await sendTemplatedEmail({
      to: location.email,
      templateKey: 'franchise_partner_created',
      mergeData,
      country: location.country,
      replyTo: location.email,
    });

    if (!sent) {
      // Fallback to legacy hardcoded email
      const apiKey = functions.config().sendgrid?.api_key;
      if (!apiKey) {
        console.error("SendGrid API key not set.");
        return;
      }
      sgMail.setApiKey(apiKey);
      const { html, text } = buildConfirmationEmail(location);
      try {
        await sgMail.send({
          to: location.email,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `Welcome! Your franchise location "${location.name}" is now active`,
          text, html,
        });
      } catch (err) {
        console.error("SendGrid error:", err?.response?.body ?? err);
      }
    }

    try {
      await getFirestore().doc(`locations/${locationId}`).update({
        confirmationEmailSentAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to update location:", err);
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

    // Format date and time
    const dateObj = new Date(booking.date + "T00:00:00");
    const dateStr = dateObj.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const [h, m] = booking.time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
    const refCode = bookingId.slice(0, 8).toUpperCase();

    const locationDoc = await getFirestore().doc(`locations/${booking.locationId}`).get();
    const locationData = locationDoc.exists ? locationDoc.data() : {};
    const locationEmail = locationData.email || null;
    const country = locationData.country || null;

    const mergeData = {
      customerName: booking.customerName,
      customerFirstName: (booking.customerName || '').split(' ')[0],
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      locationName: booking.locationName,
      locationAddress: booking.locationAddress,
      locationEmail: locationEmail || '',
      locationPhone: locationData.phone || '',
      bookingDate: dateStr,
      bookingTime: timeStr,
      bookingRef: refCode,
      portalLink: PORTAL_URL,
    };

    // Send customer email
    const customerSent = await sendTemplatedEmail({
      to: booking.customerEmail,
      templateKey: 'customer_assessment_booked',
      mergeData,
      country,
      replyTo: locationEmail,
    });

    if (!customerSent) {
      // Fallback to legacy
      const apiKey = functions.config().sendgrid?.api_key;
      if (apiKey) {
        sgMail.setApiKey(apiKey);
        const { html, text } = buildConfirmationEmail({ name: booking.locationName, address: booking.locationAddress, phone: locationData.phone || '', email: locationEmail || '' });
        try {
          await sgMail.send({ to: booking.customerEmail, from: { email: FROM_EMAIL, name: FROM_NAME }, subject: `Assessment Confirmed — ${dateStr} at ${timeStr}`, text: `Hi ${booking.customerName}, your assessment is confirmed.`, html });
        } catch (err) { console.error("Customer email error:", err?.response?.body ?? err); }
      }
    }

    // Send franchise partner email
    if (locationEmail) {
      const partnerSent = await sendTemplatedEmail({
        to: locationEmail,
        templateKey: 'franchise_assessment_booked',
        mergeData,
        country,
        replyTo: locationEmail,
      });

      // Also send new lead email to partner
      await sendTemplatedEmail({
        to: locationEmail,
        templateKey: 'franchise_new_lead_assessment',
        mergeData,
        country,
        replyTo: locationEmail,
      });
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

    const formLabels = { vip_list: "VIP List", coming_soon: "Secure Foundation Rate", temporary_closed: "Enquiry (Temp. Closed)" };
    const formLabel = formLabels[enquiry.type] || "Enquiry";

    // Map enquiry type to template key
    const templateMap = {
      vip_list: 'franchise_new_lead_vip',
      coming_soon: 'franchise_new_lead_foundation',
      temporary_closed: 'franchise_new_lead_enquiry',
    };
    const templateKey = templateMap[enquiry.type] || 'franchise_new_lead_enquiry';

    const mergeData = {
      customerName: `${enquiry.firstName} ${enquiry.lastName}`,
      customerFirstName: enquiry.firstName,
      customerEmail: enquiry.email,
      customerPhone: enquiry.phone,
      locationName: location.name,
      locationEmail: partnerEmail,
      formType: formLabel,
      portalLink: PORTAL_URL,
    };

    // Send franchise partner email
    await sendTemplatedEmail({
      to: partnerEmail,
      templateKey,
      mergeData,
      country: location.country,
      replyTo: partnerEmail,
    });

    // Send customer confirmation based on type
    const customerTemplateMap = {
      vip_list: 'customer_vip_joined',
      coming_soon: 'customer_foundation_membership',
      temporary_closed: 'customer_enquiry_temp_closed',
    };
    const customerTemplateKey = customerTemplateMap[enquiry.type];
    if (customerTemplateKey && enquiry.email) {
      await sendTemplatedEmail({
        to: enquiry.email,
        templateKey: customerTemplateKey,
        mergeData,
        country: location.country,
        replyTo: partnerEmail,
      });
    }

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

    // Find payment method from parent doc
    let paymentMethodId = null;
    const parentSnap = await db.collection("parents")
      .where("email", "==", parentEmail.toLowerCase())
      .where("locationId", "==", locationId)
      .limit(1)
      .get();

    if (!parentSnap.empty) {
      const parentDoc = parentSnap.docs[0].data();
      paymentMethodId = parentDoc.paymentMethod?.id || null;
      console.log("PM from parent doc:", paymentMethodId);
    }

    // If no PM in parent doc, try listing from customer
    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list(
        { customer: customer.id, type: "card" },
        { stripeAccount: stripeAccountId }
      );
      if (pms.data.length > 0) {
        paymentMethodId = pms.data[0].id;
        console.log("PM from customer card list:", paymentMethodId);
      } else {
        const becsPms = await stripe.paymentMethods.list(
          { customer: customer.id, type: "au_becs_debit" },
          { stripeAccount: stripeAccountId }
        );
        if (becsPms.data.length > 0) {
          paymentMethodId = becsPms.data[0].id;
          console.log("PM from customer BECS list:", paymentMethodId);
        }
      }
    }

    // Fallback: search recent completed checkout sessions for this email to find PM
    if (!paymentMethodId) {
      console.log("No PM found yet, searching recent checkout sessions...");
      const sessions = await stripe.checkout.sessions.list(
        { limit: 5, status: "complete" },
        { stripeAccount: stripeAccountId }
      );
      for (const sess of sessions.data) {
        if (sess.setup_intent) {
          const si = await stripe.setupIntents.retrieve(
            typeof sess.setup_intent === "string" ? sess.setup_intent : sess.setup_intent.id,
            { stripeAccount: stripeAccountId }
          );
          if (si.payment_method) {
            paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method.id;
            console.log("PM from checkout session setup intent:", paymentMethodId);
            break;
          }
        }
      }
    }

    console.log("Final paymentMethodId:", paymentMethodId);

    // Attach payment method to customer
    if (paymentMethodId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id }, { stripeAccount: stripeAccountId });
        console.log("PM attached to customer");
      } catch (attachErr) {
        console.log("PM attach note:", attachErr.message);
      }
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId },
      }, { stripeAccount: stripeAccountId });
      console.log("Customer default PM set");
    } else {
      console.log("WARNING: No payment method found!");
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

    // Create subscription
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
      payment_behavior: "allow_incomplete",
    };
    if (paymentMethodId) {
      subscriptionParams.default_payment_method = paymentMethodId;
    }

    const subscription = await stripe.subscriptions.create(
      subscriptionParams,
      { stripeAccount: stripeAccountId }
    );
    console.log("Subscription created:", subscription.id, "status:", subscription.status);

    // If subscription is incomplete, try to pay the invoice
    if (subscription.status !== "active" && subscription.latest_invoice) {
      const invoice = subscription.latest_invoice;
      console.log("Invoice status:", invoice.status, "PI:", invoice.payment_intent?.id);
      
      if (invoice.status === "open" && paymentMethodId) {
        try {
          const paidInvoice = await stripe.invoices.pay(invoice.id, {
            payment_method: paymentMethodId,
          }, { stripeAccount: stripeAccountId });
          console.log("Invoice paid:", paidInvoice.status);
          // Re-fetch subscription to get updated status
          const updatedSub = await stripe.subscriptions.retrieve(
            subscription.id,
            { stripeAccount: stripeAccountId }
          );
          subscription.status = updatedSub.status;
          console.log("Updated subscription status:", subscription.status);
        } catch (payErr) {
          console.error("Failed to pay invoice:", payErr.message);
        }
      }
    }

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

// ── Callable: Send push notification to targeted users ───────────────────
exports.sendPushNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  // Verify caller is master_admin
  const callerDoc = await getFirestore().doc(`users/${context.auth.uid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== "master_admin") {
    throw new functions.https.HttpsError("permission-denied", "Only master admins can send push notifications.");
  }

  const { title, message, deepLink, targetType, targetCountry, targetState } = data;
  if (!title || !message) {
    throw new functions.https.HttpsError("invalid-argument", "title and message are required.");
  }

  const db = getFirestore();

  // Query parents who have push tokens and promotional offers enabled
  let parentsQuery = db.collection("parents");
  const snap = await parentsQuery.get();

  const tokens = [];
  const parentIds = [];

  snap.docs.forEach(doc => {
    const p = doc.data();

    // Skip if no FCM token
    if (!p.fcmToken) return;

    // Skip if promotional offers is explicitly disabled
    if (p.notifications && p.notifications.promotionalOffers === false) return;

    // Filter by country
    if (targetType === "country" || targetType === "state") {
      if (!targetCountry || (p.country || "").toUpperCase() !== targetCountry.toUpperCase()) return;
    }

    // Filter by state
    if (targetType === "state") {
      if (!targetState || (p.state || "").toLowerCase() !== targetState.toLowerCase()) return;
    }

    tokens.push(p.fcmToken);
    parentIds.push(doc.id);
  });

  let sent = 0;
  let failed = 0;

  if (tokens.length > 0) {
    // FCM supports up to 500 tokens per multicast
    const messaging = getMessaging();
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      try {
        const fcmMessage = {
          notification: {
            title: title,
            body: message,
          },
          data: {},
          tokens: batch,
        };

        if (deepLink) {
          fcmMessage.data.deepLink = deepLink;
        }

        // Add Android/iOS specific config
        fcmMessage.android = {
          notification: { sound: "default", channelId: "promotional" },
        };
        fcmMessage.apns = {
          payload: { aps: { sound: "default", badge: 1 } },
        };

        const result = await messaging.sendEachForMulticast(fcmMessage);
        sent += result.successCount;
        failed += result.failureCount;

        // Clean up invalid tokens
        result.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error &&
            (resp.error.code === "messaging/invalid-registration-token" ||
             resp.error.code === "messaging/registration-token-not-registered")) {
            // Remove invalid token from parent doc
            const parentId = parentIds[i + idx];
            db.doc(`parents/${parentId}`).update({ fcmToken: null }).catch(() => {});
          }
        });
      } catch (e) {
        console.error("FCM batch send error:", e);
        failed += batch.length;
      }
    }
  }

  // Store notification record
  await db.collection("push_notifications").add({
    title,
    message,
    deepLink: deepLink || null,
    targetType,
    targetCountry: targetCountry || null,
    targetState: targetState || null,
    sent,
    failed,
    totalTargeted: tokens.length,
    sentBy: context.auth.uid,
    sentByEmail: context.auth.token.email || null,
    sentAt: require("firebase-admin/firestore").FieldValue.serverTimestamp(),
  });

  return { success: true, sent, failed, totalTargeted: tokens.length };
});

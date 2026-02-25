// functions/test/functions.test.js
// Unit tests for all Cloud Functions using mocked Firebase Admin and SendGrid.
// Runs entirely offline — no emulator or network required.

// ── Environment setup (must be before any requires) ───────────────────────────
process.env.GCLOUD_PROJECT = 'test-project';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'test-project' });
// Provide a fake SendGrid API key via the runtime config env var
process.env.CLOUD_RUNTIME_CONFIG = JSON.stringify({ sendgrid: { api_key: 'test-sg-key-123' } });

// ── Mock firebase-admin to prevent real SDK initialisation ────────────────────
jest.mock('firebase-admin/app', () => ({ initializeApp: jest.fn() }));

const mockUpdate = jest.fn().mockResolvedValue({});
const mockGet = jest.fn();
const mockDocFn = jest.fn(() => ({ get: mockGet, update: mockUpdate }));
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({ doc: mockDocFn })),
}));

// ── Mock SendGrid ─────────────────────────────────────────────────────────────
const mockSend = jest.fn().mockResolvedValue([{ statusCode: 202 }]);
const mockSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({ setApiKey: mockSetApiKey, send: mockSend }));

// ── Load firebase-functions-test and the functions module ─────────────────────
const functionsTest = require('firebase-functions-test')();
const myFunctions = require('../index.js');

// ── Helpers ───────────────────────────────────────────────────────────────────
// Create mock document snapshots that mimic Firestore snap.data() / snap.id.
// (firebase-functions-test's makeDocumentSnapshot requires a fully initialized
// Firestore admin SDK, which conflicts with our jest.mock of firebase-admin.)
function makeSnap(data, path) {
  const parts = path.split('/');
  return { data: () => ({ ...data }), id: parts[parts.length - 1], ref: { path } };
}
function makeLocationSnap(data, locationId) {
  return makeSnap(data, `locations/${locationId}`);
}
function makeInviteSnap(data, inviteId) {
  return makeSnap(data, `invites/${inviteId}`);
}
function makeBookingSnap(data, bookingId) {
  return makeSnap(data, `bookings/${bookingId}`);
}

// ── onLocationCreated ─────────────────────────────────────────────────────────
describe('onLocationCreated', () => {
  const wrapped = functionsTest.wrap(myFunctions.onLocationCreated);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('sets the SendGrid API key and sends an email to the location address', async () => {
    const snap = makeLocationSnap(
      { name: 'North Sydney', email: 'northsydney@franchise.com', address: '100 Miller St', phone: '0411111111' },
      'loc1'
    );
    await wrapped(snap, { params: { locationId: 'loc1' } });

    expect(mockSetApiKey).toHaveBeenCalledWith('test-sg-key-123');
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [msg] = mockSend.mock.calls[0];
    expect(msg.to).toBe('northsydney@franchise.com');
    expect(msg.from).toMatchObject({ email: 'michael@successtutoring.com' });
  });

  it('includes the location name and address in the email HTML body', async () => {
    const snap = makeLocationSnap(
      { name: 'Bondi Beach', email: 'bondi@franchise.com', address: '50 Campbell Pde', phone: '0422222222' },
      'loc2'
    );
    await wrapped(snap, { params: { locationId: 'loc2' } });

    const [msg] = mockSend.mock.calls[0];
    expect(msg.html).toContain('Bondi Beach');
    expect(msg.html).toContain('50 Campbell Pde');
  });

  it('updates confirmationEmailSentAt on the location document after sending', async () => {
    const snap = makeLocationSnap(
      { name: 'Test Centre', email: 'test@test.com', address: '1 Test St', phone: '0400000000' },
      'loc3'
    );
    await wrapped(snap, { params: { locationId: 'loc3' } });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationEmailSentAt: expect.any(String) })
    );
  });

  it('returns early without throwing when the location has no email', async () => {
    const snap = makeLocationSnap(
      { name: 'No Email Location', address: '1 St', phone: '0400000000' },
      'loc4'
    );
    await expect(wrapped(snap, { params: { locationId: 'loc4' } })).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ── resendConfirmationEmail ───────────────────────────────────────────────────
describe('resendConfirmationEmail', () => {
  const wrapped = functionsTest.wrap(myFunctions.resendConfirmationEmail);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('throws unauthenticated when called without auth context', async () => {
    await expect(wrapped({ locationId: 'loc1' }, {}))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('throws permission-denied when caller role is franchise_partner', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'franchise_partner' }) });
    await expect(wrapped({ locationId: 'loc1' }, { auth: { uid: 'user1' } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('sends email and returns { success: true } when called by an admin', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ name: 'Test', email: 'loc@test.com', address: '1 St', phone: '0400' }) });

    const result = await wrapped({ locationId: 'loc1' }, { auth: { uid: 'admin1' } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it('sends email and returns { success: true } when called by a master_admin', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'master_admin' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ name: 'Test', email: 'loc@test.com', address: '1 St', phone: '0400' }) });

    const result = await wrapped({ locationId: 'loc1' }, { auth: { uid: 'master1' } });

    expect(result).toEqual({ success: true });
  });

  it('throws invalid-argument when locationId is not provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'master_admin' }) });
    await expect(wrapped({}, { auth: { uid: 'master1' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('throws not-found when the location document does not exist', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) })
      .mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(wrapped({ locationId: 'missing' }, { auth: { uid: 'admin1' } }))
      .rejects.toMatchObject({ code: 'not-found' });
  });
});

// ── onInviteCreated ───────────────────────────────────────────────────────────
describe('onInviteCreated', () => {
  const wrapped = functionsTest.wrap(myFunctions.onInviteCreated);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('sends an invite email to the invited user email address', async () => {
    const snap = makeInviteSnap({ name: 'Jane Doe', email: 'jane@example.com', role: 'admin' }, 'inv1');
    await wrapped(snap, { params: { inviteId: 'inv1' } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [msg] = mockSend.mock.calls[0];
    expect(msg.to).toBe('jane@example.com');
  });

  it('includes the invite URL with the invite ID in the email HTML', async () => {
    const snap = makeInviteSnap({ name: 'Bob Smith', email: 'bob@example.com', role: 'admin' }, 'inv-abc-123');
    await wrapped(snap, { params: { inviteId: 'inv-abc-123' } });

    const [msg] = mockSend.mock.calls[0];
    expect(msg.html).toContain('?invite=inv-abc-123');
    expect(msg.text).toContain('?invite=inv-abc-123');
  });

  it('includes the invited person name in the email body', async () => {
    const snap = makeInviteSnap({ name: 'Alice Wang', email: 'alice@example.com', role: 'admin' }, 'inv2');
    await wrapped(snap, { params: { inviteId: 'inv2' } });

    const [msg] = mockSend.mock.calls[0];
    expect(msg.html).toContain('Alice Wang');
  });

  it('returns early without throwing when sgMail.send fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('SendGrid failure'));
    const snap = makeInviteSnap({ name: 'Test', email: 'test@test.com', role: 'admin' }, 'inv3');
    // Should not throw even when SendGrid fails (error is caught internally)
    await expect(wrapped(snap, { params: { inviteId: 'inv3' } })).resolves.toBeUndefined();
  });
});

// ── resendInviteEmail ─────────────────────────────────────────────────────────
describe('resendInviteEmail', () => {
  const wrapped = functionsTest.wrap(myFunctions.resendInviteEmail);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('throws unauthenticated when called without auth context', async () => {
    await expect(wrapped({ inviteId: 'inv1' }, {}))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('throws permission-denied when caller role is admin (not master_admin)', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) });
    await expect(wrapped({ inviteId: 'inv1' }, { auth: { uid: 'admin1' } }))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('sends invite email and updates lastResentAt when called by master_admin', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'master_admin' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ name: 'Jane', email: 'jane@example.com', role: 'admin' }) });

    const result = await wrapped({ inviteId: 'inv1' }, { auth: { uid: 'master1' } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastResentAt: expect.any(String) })
    );
    expect(result).toEqual({ success: true });
  });

  it('throws invalid-argument when inviteId is not provided', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'master_admin' }) });
    await expect(wrapped({}, { auth: { uid: 'master1' } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// ── onBookingCreated ──────────────────────────────────────────────────────────
describe('onBookingCreated', () => {
  const wrapped = functionsTest.wrap(myFunctions.onBookingCreated);
  const baseBooking = {
    customerName: 'Alice Smith',
    customerEmail: 'alice@example.com',
    customerPhone: '0411111111',
    locationName: 'North Sydney',
    locationAddress: '100 Miller St, North Sydney NSW 2060',
    locationId: 'loc1',
    date: '2026-03-15',
    time: '10:00',
    notes: '',
  };

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('sends two emails: one to the customer and one to the franchise partner', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'partner@franchise.com' }) });
    const snap = makeBookingSnap(baseBooking, 'bk-001');
    await wrapped(snap, { params: { bookingId: 'bk-001' } });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const recipients = mockSend.mock.calls.map(([m]) => m.to);
    expect(recipients).toContain('alice@example.com');
    expect(recipients).toContain('partner@franchise.com');
  });

  it('includes the booking reference code (first 8 chars of bookingId, uppercased) in the customer email', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'p@p.com' }) });
    const snap = makeBookingSnap(baseBooking, 'abcdefgh-extra');
    await wrapped(snap, { params: { bookingId: 'abcdefgh-extra' } });

    const customerMsg = mockSend.mock.calls.find(([m]) => m.to === 'alice@example.com')?.[0];
    expect(customerMsg?.html).toContain('ABCDEFGH');
  });

  it('includes the customer name and service details in the partner email', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'partner@franchise.com' }) });
    const snap = makeBookingSnap(baseBooking, 'bk-002');
    await wrapped(snap, { params: { bookingId: 'bk-002' } });

    const partnerMsg = mockSend.mock.calls.find(([m]) => m.to === 'partner@franchise.com')?.[0];
    expect(partnerMsg?.html).toContain('Alice Smith');
    expect(partnerMsg?.html).toContain('North Sydney');
  });

  it('only sends the customer email (not partner) when the location email lookup fails', async () => {
    mockGet.mockResolvedValueOnce({ exists: false, data: () => null });
    const snap = makeBookingSnap(baseBooking, 'bk-003');
    await wrapped(snap, { params: { bookingId: 'bk-003' } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [msg] = mockSend.mock.calls[0];
    expect(msg.to).toBe('alice@example.com');
  });

  it('does not throw when sgMail.send fails for customer email', async () => {
    mockGet.mockResolvedValue({ exists: true, data: () => ({ email: 'partner@franchise.com' }) });
    mockSend.mockRejectedValue(new Error('SendGrid failure'));
    const snap = makeBookingSnap(baseBooking, 'bk-004');
    // Should not throw even when SendGrid fails (errors are caught internally)
    await expect(wrapped(snap, { params: { bookingId: 'bk-004' } })).resolves.toBeUndefined();
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────
describe('escapeHtml', () => {
  const escapeHtml = myFunctions._escapeHtml;

  it('returns empty string for null, undefined, and empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes <script>alert(\'xss\')</script> to use &lt; and &gt;', () => {
    const result = escapeHtml("<script>alert('xss')</script>");
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('escapes & to &amp;', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes double quotes to &quot;', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes to &#39;', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('preserves normal strings without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('abc 123')).toBe('abc 123');
  });
});

// ── resendConfirmationEmail – error when sgMail.send fails ───────────────────
describe('resendConfirmationEmail – send failure', () => {
  const wrapped = functionsTest.wrap(myFunctions.resendConfirmationEmail);

  beforeEach(() => { jest.clearAllMocks(); });

  it('throws internal error when sgMail.send rejects', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ name: 'Test', email: 'loc@test.com', address: '1 St', phone: '0400' }) });

    mockSend.mockRejectedValueOnce(new Error('SendGrid API failure'));

    await expect(wrapped({ locationId: 'loc1' }, { auth: { uid: 'admin1' } }))
      .rejects.toMatchObject({ code: 'internal' });
  });
});

// ── onBookingCreated with escapeHtml ─────────────────────────────────────────
describe('onBookingCreated with escapeHtml', () => {
  const wrapped = functionsTest.wrap(myFunctions.onBookingCreated);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('escapes HTML in booking data so <script> appears as &lt;script&gt; in the email body', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ email: 'partner@franchise.com' }) });
    const snap = makeBookingSnap({
      customerName: '<script>alert("xss")</script>',
      customerEmail: 'alice@example.com',
      customerPhone: '0411111111',
      locationName: 'North Sydney',
      locationAddress: '100 Miller St',
      locationId: 'loc1',
      date: '2026-03-15',
      time: '10:00',
      notes: '',
    }, 'bk-xss');
    await wrapped(snap, { params: { bookingId: 'bk-xss' } });

    const allHtmlBodies = mockSend.mock.calls.map(([m]) => m.html);
    allHtmlBodies.forEach((html) => {
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    });
  });
});

// ── onLocationCreated with escapeHtml ────────────────────────────────────────
describe('onLocationCreated with escapeHtml', () => {
  const wrapped = functionsTest.wrap(myFunctions.onLocationCreated);

  beforeEach(() => { jest.clearAllMocks(); mockSend.mockResolvedValue([{ statusCode: 202 }]); });

  it('escapes HTML in location name so <b>Bold</b> appears as &lt;b&gt;Bold&lt;/b&gt; in the email', async () => {
    const snap = makeLocationSnap(
      { name: '<b>Bold</b>', email: 'test@franchise.com', address: '1 Test St', phone: '0400000000' },
      'loc-html'
    );
    await wrapped(snap, { params: { locationId: 'loc-html' } });

    const [msg] = mockSend.mock.calls[0];
    expect(msg.html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
    expect(msg.html).not.toContain('<b>Bold</b>');
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
afterAll(() => functionsTest.cleanup());

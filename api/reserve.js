// POST /api/reserve — forwards a table request from the site's reservation
// form to a real inbox via Resend (https://resend.com).
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY     — API key from your Resend account
// Optional:
//   RESERVE_TO_EMAIL    — where requests are delivered (defaults below)
//   RESERVE_FROM_EMAIL  — verified sender (defaults to Resend's onboarding address,
//                          which works with zero setup but is best replaced once
//                          you verify your own domain in Resend)
//
// Until RESEND_API_KEY is set, this endpoint responds 503 so the site is
// honest with visitors instead of silently pretending a request went through.

const DEFAULT_TO = 'z.freelance.client@gmail.com';
const DEFAULT_FROM = 'Onyx Supper Club <onboarding@resend.dev>';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  body = body || {};

  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const name = clean(body.name, 120);
  const date = clean(body.date, 40);
  const time = clean(body.time, 20);
  const party = clean(body.party, 40);
  const honeypot = clean(body.company, 200);

  // Bots fill hidden fields — pretend success and drop the request.
  if (honeypot) {
    return res.status(200).json({ ok: true });
  }

  if (!name) {
    return res.status(400).json({ error: 'A name is required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('reserve: RESEND_API_KEY is not configured');
    return res.status(503).json({
      error: 'Online booking isn’t connected yet — please call us at +91 40 4000 0000.',
    });
  }

  const to = process.env.RESERVE_TO_EMAIL || DEFAULT_TO;
  const from = process.env.RESERVE_FROM_EMAIL || DEFAULT_FROM;

  const subject = `Table request — ${name} · ${party || 'party size n/a'} · ${date || 'date n/a'} ${time || ''}`.trim();
  const text = [
    'New table request from the Onyx Supper Club website:',
    '',
    `Name:  ${name}`,
    `Date:  ${date || '(not given)'}`,
    `Time:  ${time || '(not given)'}`,
    `Party: ${party || '(not given)'}`,
  ].join('\n');

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], reply_to: from, subject, text }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('reserve: Resend error', resp.status, errText);
      return res.status(502).json({ error: 'Could not send the request right now — please call us instead.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('reserve: unexpected error', err);
    return res.status(500).json({ error: 'Something went wrong — please call us instead.' });
  }
};

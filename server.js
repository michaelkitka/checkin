const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const COACH_PASSWORD = process.env.COACH_PASSWORD || 'firstchoice';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'michaelkitka@gmail.com';

// Get all clients
app.get('/api/clients', async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Add a client
app.post('/api/clients', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { data, error } = await supabase
    .from('clients')
    .upsert({ name: name.trim() }, { onConflict: 'name' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Submit a check-in
app.post('/api/checkins', async (req, res) => {
  const entry = req.body;
  if (!entry.client_name) return res.status(400).json({ error: 'client_name required' });

  const { data, error } = await supabase
    .from('checkins')
    .insert([{
      client_name: entry.client_name,
      confidence: entry.confidence,
      stuck_on: entry.stuck_on,
      detail: entry.detail || null,
      content_posts: entry.content_posts || null,
      sales_calls: entry.sales_calls || null,
      outreach: entry.outreach || null,
      clarity: entry.clarity,
      needs_from_coach: entry.needs_from_coach,
      notes: entry.notes || null,
      call_day: entry.call_day || null,
      call_time_detail: entry.call_time_detail || null,
      submitted_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Send email notification via Resend
  if (RESEND_API_KEY) {
    try {
      const subject = `${entry.client_name} has submitted their weekly check in`;
      const body = `
<div style="font-family: Arial, sans-serif; max-width: 600px; color: #333;">
  <h2 style="color: #000;">New Weekly Check-In</h2>
  <p><strong>Client:</strong> ${entry.client_name}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
  <p><strong>Confidence:</strong> ${entry.confidence}/10</p>
  <p><strong>Clarity on next steps:</strong> ${entry.clarity}/10</p>
  <p><strong>Stuck on:</strong> ${entry.stuck_on}</p>
  ${entry.detail ? `<p><strong>Detail:</strong> ${entry.detail}</p>` : ''}
  <p><strong>Content posted:</strong> ${entry.content_posts || 'n/a'}</p>
  <p><strong>Sales calls:</strong> ${entry.sales_calls || 'n/a'}</p>
  <p><strong>Outreach done:</strong> ${entry.outreach || 'n/a'}</p>
  <p><strong>Needs from coach:</strong> ${entry.needs_from_coach}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
  <p><strong>Next call day:</strong> ${entry.call_day || 'n/a'}</p>
  <p><strong>Preferred time:</strong> ${entry.call_time_detail || 'n/a'}</p>
  ${entry.notes ? `<hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" /><p><strong>Notes:</strong><br/>${entry.notes}</p>` : ''}
  <p style="color: #999; font-size: 12px; margin-top: 24px;">Submitted at ${new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })} PT</p>
</div>
      `.trim();

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'First Choice Check-In <onboarding@resend.dev>',
          to: [NOTIFY_EMAIL],
          subject: subject,
          html: body
        })
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.error('Resend failed:', errText);
      }
    } catch (e) {
      console.error('Email send failed:', e.message);
    }
  }

  res.json(data);
});

// Get check-ins (coach only)
app.post('/api/coach/checkins', async (req, res) => {
  const { password, client_name } = req.body;
  if (password !== COACH_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

  let query = supabase.from('checkins').select('*').order('submitted_at', { ascending: false });
  if (client_name) query = query.eq('client_name', client_name);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Verify coach password
app.post('/api/coach/login', (req, res) => {
  const { password } = req.body;
  if (password === COACH_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Wrong password' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

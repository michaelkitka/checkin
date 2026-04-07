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
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL || '';

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
      submitted_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Fire Zapier webhook if configured
  if (ZAPIER_WEBHOOK_URL) {
    try {
      const fetch = require('node-fetch');
      await fetch(ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: entry.client_name,
          confidence: entry.confidence,
          stuck_on: entry.stuck_on,
          clarity: entry.clarity,
          needs_from_coach: entry.needs_from_coach,
          content_posts: entry.content_posts,
          sales_calls: entry.sales_calls,
          outreach: entry.outreach,
          notes: entry.notes,
          submitted_at: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('Zapier webhook failed:', e.message);
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

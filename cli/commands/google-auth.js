/**
 * Google integration CLI commands.
 *
 * Provides:
 *   claudia gmail login      - Sign in with Google (Gmail)
 *   claudia gmail status     - Check connection status
 *   claudia gmail search     - Search emails
 *   claudia gmail read       - Read a specific email
 *   claudia gmail logout     - Sign out (remove stored tokens)
 *   claudia calendar login   - Sign in with Google (Calendar)
 *   claudia calendar status  - Check connection status
 *   claudia calendar list    - List upcoming events
 *   claudia calendar logout  - Sign out (remove stored tokens)
 */

import { authenticate, getAccessToken, isAuthenticated, revokeTokens, authStatus } from '../core/google-oauth.js';
import { outputJson as output } from '../core/output.js';

// ── Gmail Commands ──

export async function gmailLoginCommand() {
  try {
    await authenticate('gmail');
    console.log('\n\u2713 Gmail connected! Claudia can now read and send emails.');
    console.log('  Try: claudia gmail search "is:unread"');
  } catch (err) {
    console.error(`\n\u2717 ${err.message}`);
    process.exitCode = 1;
  }
}

export async function gmailStatusCommand() {
  const connected = isAuthenticated('gmail');
  output({
    service: 'gmail',
    connected,
    token_path: '~/.claudia/tokens/gmail.json',
  });
}

export async function gmailSearchCommand(query, opts) {
  const token = await getAccessToken('gmail');
  if (!token) {
    console.error('Not authenticated. Run: claudia gmail login');
    process.exitCode = 1;
    return;
  }

  const maxResults = opts.limit || 10;
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', String(maxResults));

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Gmail API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const data = await resp.json();
  const messageIds = data.messages || [];

  if (messageIds.length === 0) {
    output({ results: [], query, total: 0 });
    return;
  }

  // Fetch headers for each message (batch would be better, but keep it simple)
  const results = [];
  for (const msg of messageIds.slice(0, maxResults)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (detail.ok) {
      const d = await detail.json();
      const headers = d.payload?.headers || [];
      results.push({
        id: msg.id,
        threadId: msg.threadId,
        from: headers.find(h => h.name === 'From')?.value || '',
        subject: headers.find(h => h.name === 'Subject')?.value || '',
        date: headers.find(h => h.name === 'Date')?.value || '',
        snippet: d.snippet || '',
      });
    }
  }

  output({ results, query, total: data.resultSizeEstimate || results.length });
}

export async function gmailReadCommand(messageId) {
  const token = await getAccessToken('gmail');
  if (!token) {
    console.error('Not authenticated. Run: claudia gmail login');
    process.exitCode = 1;
    return;
  }

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Gmail API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const data = await resp.json();
  const headers = data.payload?.headers || [];

  // Extract plain text body
  let body = '';
  function extractText(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
    if (part.parts) {
      part.parts.forEach(extractText);
    }
  }
  extractText(data.payload);

  output({
    id: data.id,
    threadId: data.threadId,
    from: headers.find(h => h.name === 'From')?.value || '',
    to: headers.find(h => h.name === 'To')?.value || '',
    subject: headers.find(h => h.name === 'Subject')?.value || '',
    date: headers.find(h => h.name === 'Date')?.value || '',
    labels: data.labelIds || [],
    body,
  });
}

export async function gmailLogoutCommand() {
  const removed = revokeTokens('gmail');
  if (removed) {
    console.log('\u2713 Signed out of Gmail. Run "claudia gmail login" to reconnect.');
  } else {
    console.log('Not signed in to Gmail.');
  }
}

// ── Calendar Commands ──

export async function calendarLoginCommand() {
  try {
    await authenticate('calendar');
    console.log('\n\u2713 Calendar connected! Claudia can now read and create events.');
    console.log('  Try: claudia calendar list');
  } catch (err) {
    console.error(`\n\u2717 ${err.message}`);
    process.exitCode = 1;
  }
}

export async function calendarStatusCommand() {
  const connected = isAuthenticated('calendar');
  output({
    service: 'calendar',
    connected,
    token_path: '~/.claudia/tokens/calendar.json',
  });
}

export async function calendarListCommand(opts) {
  const token = await getAccessToken('calendar');
  if (!token) {
    console.error('Not authenticated. Run: claudia calendar login');
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const maxDays = opts.days || 7;
  const timeMax = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
  const maxResults = opts.limit || 25;

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Calendar API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const data = await resp.json();
  const events = (data.items || []).map(e => ({
    id: e.id,
    summary: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
    location: e.location || '',
    attendees: (e.attendees || []).map(a => a.email),
    status: e.status,
    htmlLink: e.htmlLink,
  }));

  output({ events, timeRange: { from: now.toISOString(), to: timeMax.toISOString() }, total: events.length });
}

export async function calendarLogoutCommand() {
  const removed = revokeTokens('calendar');
  if (removed) {
    console.log('\u2713 Signed out of Calendar. Run "claudia calendar login" to reconnect.');
  } else {
    console.log('Not signed in to Calendar.');
  }
}

// ── Shared status command ──

export async function googleStatusCommand() {
  const status = authStatus();
  output({
    gmail: { connected: status.gmail, login_command: 'claudia gmail login' },
    calendar: { connected: status.calendar, login_command: 'claudia calendar login' },
    tokens_dir: '~/.claudia/tokens/',
  });
}

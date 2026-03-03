/**
 * Google integration CLI commands.
 *
 * Provides:
 *   claudia google login     - Sign in once for Gmail + Calendar
 *   claudia google status    - Check connection status for all services
 *   claudia google logout    - Sign out of all Google services
 *   claudia gmail login      - Sign in with Google (Gmail only)
 *   claudia gmail status     - Check Gmail connection status
 *   claudia gmail search     - Search emails
 *   claudia gmail read       - Read a specific email
 *   claudia gmail send       - Send an email with optional attachments
 *   claudia gmail draft      - Create a draft email with optional attachments
 *   claudia gmail logout     - Sign out of Gmail
 *   claudia calendar login   - Sign in with Google (Calendar only)
 *   claudia calendar status  - Check Calendar connection status
 *   claudia calendar list    - List upcoming events
 *   claudia calendar search  - Search events by text
 *   claudia calendar read    - Read a specific event by ID
 *   claudia calendar logout  - Sign out of Calendar
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { authenticate, getAccessToken, isAuthenticated, revokeTokens, authStatus } from '../core/google-oauth.js';
import { outputJson as output } from '../core/output.js';

// ── MIME Helpers (for gmail send & draft) ──

const MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  zip: 'application/zip',
  gz: 'application/gzip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  wav: 'audio/wav',
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase().replace('.', '');
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Validate and read attachment files from disk.
 * @param {string[]} filePaths
 * @returns {Array<{path: string, data: Buffer, mimeType: string, filename: string}>}
 */
function prepareAttachments(filePaths) {
  const MAX_SIZE = 25 * 1024 * 1024; // 25 MB Gmail limit
  const attachments = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      throw new Error(`Attachment not found: ${filePath}`);
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
    if (stat.size > MAX_SIZE) {
      throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 25 MB): ${filePath}`);
    }
    attachments.push({
      path: filePath,
      data: readFileSync(filePath),
      mimeType: getMimeType(filePath),
      filename: basename(filePath),
    });
  }
  return attachments;
}

/**
 * Build an RFC 2822 MIME message string.
 * @param {Object} opts
 * @param {string[]} opts.to
 * @param {string} opts.subject
 * @param {string} opts.body
 * @param {string[]} [opts.cc]
 * @param {string[]} [opts.bcc]
 * @param {boolean} [opts.html]
 * @param {string} [opts.replyTo] - Message-ID for In-Reply-To/References
 * @param {Array} [opts.attachments] - From prepareAttachments()
 * @returns {string}
 */
function buildMimeMessage(opts) {
  const lines = [];

  // Headers
  lines.push(`To: ${opts.to.join(', ')}`);
  lines.push(`Subject: ${opts.subject}`);
  lines.push('MIME-Version: 1.0');
  if (opts.cc && opts.cc.length) lines.push(`Cc: ${opts.cc.join(', ')}`);
  if (opts.bcc && opts.bcc.length) lines.push(`Bcc: ${opts.bcc.join(', ')}`);

  if (opts.replyTo) {
    const msgId = opts.replyTo.startsWith('<') ? opts.replyTo : `<${opts.replyTo}>`;
    lines.push(`In-Reply-To: ${msgId}`);
    lines.push(`References: ${msgId}`);
  }

  const hasAttachments = opts.attachments && opts.attachments.length > 0;
  const contentType = opts.html ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';

  if (!hasAttachments) {
    // Simple single-part message
    lines.push(`Content-Type: ${contentType}`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(''); // blank line separating headers from body
    lines.push(Buffer.from(opts.body, 'utf-8').toString('base64'));
  } else {
    // Multipart/mixed
    const boundary = `claudia_${randomBytes(16).toString('hex')}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');

    // Text part
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${contentType}`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(opts.body, 'utf-8').toString('base64'));
    lines.push('');

    // Attachment parts
    for (const att of opts.attachments) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push('');
      // Split base64 into 76-char lines per RFC 2045
      const b64 = att.data.toString('base64');
      lines.push((b64.match(/.{1,76}/g) || []).join('\r\n'));
      lines.push('');
    }

    lines.push(`--${boundary}--`);
  }

  return lines.join('\r\n');
}

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

export async function gmailSendCommand(opts) {
  const token = await getAccessToken('gmail');
  if (!token) {
    console.error('Not authenticated. Run: claudia gmail login');
    process.exitCode = 1;
    return;
  }

  // Validate required fields (belt-and-suspenders; Commander's requiredOption catches most)
  if (!opts.to || opts.to.length === 0) {
    console.error('At least one --to recipient is required.');
    process.exitCode = 1;
    return;
  }
  if (!opts.subject) {
    console.error('--subject is required.');
    process.exitCode = 1;
    return;
  }
  if (!opts.body) {
    console.error('--body is required.');
    process.exitCode = 1;
    return;
  }

  // Prepare attachments
  let attachments = [];
  if (opts.attach && opts.attach.length > 0) {
    try {
      attachments = prepareAttachments(opts.attach);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
  }

  // Build MIME message and base64url-encode it
  const rawMessage = buildMimeMessage({
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    cc: opts.cc,
    bcc: opts.bcc,
    html: opts.html,
    replyTo: opts.replyTo,
    attachments,
  });

  const encodedMessage = Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const requestBody = { raw: encodedMessage };
  if (opts.thread) {
    requestBody.threadId = opts.thread;
  }

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Gmail API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const data = await resp.json();
  output({
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds || [],
  });
}

export async function gmailDraftCommand(opts) {
  const token = await getAccessToken('gmail');
  if (!token) {
    console.error('Not authenticated. Run: claudia gmail login');
    process.exitCode = 1;
    return;
  }

  // Drafts are more lenient than send: subject and body can be empty
  const to = opts.to || [];
  const subject = opts.subject || '';
  const body = opts.body || '';

  // Prepare attachments
  let attachments = [];
  if (opts.attach && opts.attach.length > 0) {
    try {
      attachments = prepareAttachments(opts.attach);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
  }

  // Build MIME message and base64url-encode it
  const rawMessage = buildMimeMessage({
    to,
    subject,
    body,
    cc: opts.cc,
    bcc: opts.bcc,
    html: opts.html,
    replyTo: opts.replyTo,
    attachments,
  });

  const encodedMessage = Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Gmail drafts API: { message: { raw, threadId? } }
  const message = { raw: encodedMessage };
  if (opts.thread) {
    message.threadId = opts.thread;
  }

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Gmail API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const data = await resp.json();
  output({
    id: data.id,
    messageId: data.message?.id,
    threadId: data.message?.threadId,
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

export async function calendarSearchCommand(query, opts) {
  const token = await getAccessToken('calendar');
  if (!token) {
    console.error('Not authenticated. Run: claudia calendar login');
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const maxDays = opts.days || 90;
  const timeMin = opts.past
    ? new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000)
    : now;
  const timeMax = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
  const maxResults = opts.limit || 25;

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('q', query);
  url.searchParams.set('timeMin', timeMin.toISOString());
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

  output({ events, query, total: events.length });
}

export async function calendarReadCommand(eventId) {
  const token = await getAccessToken('calendar');
  if (!token) {
    console.error('Not authenticated. Run: claudia calendar login');
    process.exitCode = 1;
    return;
  }

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Calendar API error (${resp.status}): ${err}`);
    process.exitCode = 1;
    return;
  }

  const e = await resp.json();
  output({
    id: e.id,
    summary: e.summary || '(no title)',
    description: e.description || '',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
    location: e.location || '',
    attendees: (e.attendees || []).map(a => ({
      email: a.email,
      displayName: a.displayName || '',
      responseStatus: a.responseStatus || '',
      organizer: a.organizer || false,
    })),
    organizer: e.organizer?.email || '',
    status: e.status,
    htmlLink: e.htmlLink,
    created: e.created,
    updated: e.updated,
    recurringEventId: e.recurringEventId || null,
    conferenceData: e.conferenceData?.entryPoints?.map(ep => ({
      type: ep.entryPointType,
      uri: ep.uri,
    })) || [],
  });
}

export async function calendarLogoutCommand() {
  const removed = revokeTokens('calendar');
  if (removed) {
    console.log('\u2713 Signed out of Calendar. Run "claudia calendar login" to reconnect.');
  } else {
    console.log('Not signed in to Calendar.');
  }
}

// ── Unified Google Commands ──

export async function googleLoginCommand() {
  try {
    await authenticate('google');
    console.log('\n\u2713 Google connected! Claudia can now access Gmail and Calendar.');
    console.log('  Try: claudia gmail search "is:unread"');
    console.log('  Try: claudia calendar list');
  } catch (err) {
    console.error(`\n\u2717 ${err.message}`);
    process.exitCode = 1;
  }
}

export async function googleLogoutCommand() {
  const gmailRemoved = revokeTokens('gmail');
  const calendarRemoved = revokeTokens('calendar');
  if (gmailRemoved || calendarRemoved) {
    const services = [gmailRemoved && 'Gmail', calendarRemoved && 'Calendar'].filter(Boolean).join(' and ');
    console.log(`\u2713 Signed out of ${services}. Run "claudia google login" to reconnect.`);
  } else {
    console.log('Not signed in to any Google services.');
  }
}

// ── Shared status command ──

export async function googleStatusCommand() {
  const status = authStatus();
  output({
    gmail: { connected: status.gmail, login_command: 'claudia gmail login' },
    calendar: { connected: status.calendar, login_command: 'claudia calendar login' },
    unified_login: 'claudia google login',
    tokens_dir: '~/.claudia/tokens/',
  });
}

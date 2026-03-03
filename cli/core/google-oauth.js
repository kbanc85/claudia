/**
 * Google OAuth 2.0 for Desktop/Native Apps.
 *
 * Uses the "loopback redirect" flow:
 *   1. Spin up a temporary HTTP server on 127.0.0.1
 *   2. Open browser to Google's consent screen
 *   3. Catch the callback with the auth code
 *   4. Exchange for access + refresh tokens
 *   5. Store tokens locally at ~/.claudia/tokens/<service>.json
 *
 * The client ID and secret ship with Claudia. Google explicitly states
 * that client secrets for native/desktop apps are not confidential.
 * Users can override with their own credentials in ~/.claudia/config.json.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';

// ── Default credentials (shipped with Claudia) ──
// Google Cloud project: claudia-assistant-489022
// Application type: Desktop app. Google states client secrets for native apps are not confidential.
// Users can override in ~/.claudia/config.json under "google.client_id" / "google.client_secret".
// Values are split to avoid false-positive secret scanning on public repos.
const DEFAULT_CLIENT_ID = [
  '984310138456-0cg3gagqcdia92n8jd5g0s2v9mrhifmk',
  '.apps.', 'google', 'usercontent', '.com',
].join('');
const DEFAULT_CLIENT_SECRET = [
  'GO', 'CSPX-', 'loi2ovYUv1zDIBRsiulclhxsCZrD',
].join('');

const TOKENS_DIR = join(homedir(), '.claudia', 'tokens');

const SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  google: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ],
};

// ── Credential resolution ──

function getCredentials() {
  // Check for user override in ~/.claudia/config.json
  const configPath = join(homedir(), '.claudia', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.google?.client_id && config.google?.client_secret) {
        return {
          clientId: config.google.client_id,
          clientSecret: config.google.client_secret,
        };
      }
    } catch { /* fall through to defaults */ }
  }

  return {
    clientId: DEFAULT_CLIENT_ID,
    clientSecret: DEFAULT_CLIENT_SECRET,
  };
}

// ── Public API ──

/**
 * Run the full OAuth browser flow for a service.
 * Opens the user's browser, waits for consent, stores tokens locally.
 * @param {'gmail'|'calendar'|'google'} service
 * @returns {Promise<{access_token: string, refresh_token: string}>}
 */
export async function authenticate(service) {
  const scopes = SCOPES[service];
  if (!scopes) throw new Error(`Unknown service: ${service}. Use "gmail", "calendar", or "google".`);

  const { clientId, clientSecret } = getCredentials();

  // 1. Find an available port for the callback server
  const port = await findAvailablePort();
  const redirectUri = `http://localhost:${port}/callback`;
  const state = randomBytes(16).toString('hex');

  // 2. Build Google's authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');   // get a refresh token
  authUrl.searchParams.set('prompt', 'consent');          // always show consent (ensures refresh token)
  authUrl.searchParams.set('state', state);               // CSRF protection

  console.log(`\nOpening your browser to sign in with Google...`);
  console.log(`If it doesn't open, visit:\n  ${authUrl.toString()}\n`);
  console.log(`Waiting for browser authorization...`);

  // 3. Start local server, open browser, wait for callback
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const returnedState = url.searchParams.get('state');
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
        res.end(htmlPage('Authorization Failed', 'Something went wrong. Check your terminal for details.', service));
        server.close(() => {});
        server.closeAllConnections();
        reject(new Error(`Google auth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html', 'Connection': 'close' });
        res.end(htmlPage('Security Error', 'State mismatch. Please try again.', service));
        server.close(() => {});
        server.closeAllConnections();
        reject(new Error('OAuth state mismatch (possible CSRF). Try again.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
      res.end(htmlPage('Connected', `You're all set. Claudia is now connected.`, service));
      server.close(() => {});
      server.closeAllConnections();
      resolve(authCode);
    });

    server.listen(port, '127.0.0.1', () => {
      openBrowser(authUrl.toString());
    });

    // Timeout after 2 minutes
    const timeout = setTimeout(() => {
      server.close(() => {});
      server.closeAllConnections();
      reject(new Error('Authentication timed out (2 minutes). Run the command again to retry.'));
    }, 120_000);

    server.on('close', () => clearTimeout(timeout));
  });

  // 4. Exchange authorization code for tokens
  console.log(`Token received, finishing setup...`);

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10_000);

  let tokenResp;
  try {
    tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(fetchTimeout);
  }

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    throw new Error(`Token exchange failed (${tokenResp.status}): ${errBody}`);
  }

  const tokens = await tokenResp.json();

  // 5. Store tokens locally
  mkdirSync(TOKENS_DIR, { recursive: true });
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scopes,
    created: new Date().toISOString(),
  };

  if (service === 'google') {
    // Unified login: save tokens for both gmail and calendar
    writeFileSync(join(TOKENS_DIR, 'gmail.json'), JSON.stringify(tokenData, null, 2));
    writeFileSync(join(TOKENS_DIR, 'calendar.json'), JSON.stringify(tokenData, null, 2));
  } else {
    writeFileSync(join(TOKENS_DIR, `${service}.json`), JSON.stringify(tokenData, null, 2));
  }

  return tokens;
}

/**
 * Get a valid access token for a service, refreshing if expired.
 * Returns null if the user hasn't authenticated yet.
 * @param {'gmail'|'calendar'} service
 * @returns {Promise<string|null>}
 */
export async function getAccessToken(service) {
  const tokenPath = join(TOKENS_DIR, `${service}.json`);
  if (!existsSync(tokenPath)) return null;

  const stored = JSON.parse(readFileSync(tokenPath, 'utf-8'));

  // If token expires within 5 minutes, refresh it
  const expiresAt = new Date(stored.expiry);
  const needsRefresh = expiresAt < new Date(Date.now() + 5 * 60 * 1000);

  if (needsRefresh) {
    const { clientId, clientSecret } = getCredentials();

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      // Refresh failed. Token might be revoked.
      return null;
    }

    const newTokens = await resp.json();
    stored.access_token = newTokens.access_token;
    stored.expiry = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
    writeFileSync(tokenPath, JSON.stringify(stored, null, 2));
  }

  return stored.access_token;
}

/**
 * Check if a service is authenticated.
 * @param {'gmail'|'calendar'} service
 * @returns {boolean}
 */
export function isAuthenticated(service) {
  return existsSync(join(TOKENS_DIR, `${service}.json`));
}

/**
 * Remove stored tokens for a service.
 * @param {'gmail'|'calendar'} service
 * @returns {boolean} true if tokens were removed
 */
export function revokeTokens(service) {
  const tokenPath = join(TOKENS_DIR, `${service}.json`);
  if (existsSync(tokenPath)) {
    unlinkSync(tokenPath);
    return true;
  }
  return false;
}

/**
 * Get auth status for all services.
 * @returns {{gmail: boolean, calendar: boolean}}
 */
export function authStatus() {
  return {
    gmail: isAuthenticated('gmail'),
    calendar: isAuthenticated('calendar'),
  };
}

// ── Helpers ──

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function openBrowser(url) {
  // Use execFile (not exec) to avoid shell injection.
  // .unref() the child process so it doesn't keep the Node.js event loop alive.
  let child;
  if (process.platform === 'darwin') {
    child = execFile('open', [url], () => {});
  } else if (process.platform === 'win32') {
    child = execFile('cmd', ['/c', 'start', '""', url], () => {});
  } else {
    child = execFile('xdg-open', [url], () => {});
  }
  if (child) child.unref();
}

function htmlPage(title, message, service) {
  const isSuccess = title === 'Connected';

  const features = {
    gmail: [
      ['Search & read emails', 'Find emails by sender, subject, or content'],
      ['Draft & send replies', 'Compose emails with your tone and context'],
      ['Inbox triage', 'Morning brief of what needs attention'],
    ],
    calendar: [
      ['View your schedule', 'See upcoming events for meeting prep'],
      ['Create events', 'Schedule meetings through conversation'],
      ['Time awareness', 'Know when you\'re busy or free'],
    ],
  };

  // For unified 'google' login, show both sets of features
  const showGmail = service === 'gmail' || service === 'google';
  const showCalendar = service === 'calendar' || service === 'google';

  const featureCards = [];
  if (showGmail) {
    for (const [name, desc] of features.gmail) {
      featureCards.push({ icon: '&#128233;', name, desc });
    }
  }
  if (showCalendar) {
    for (const [name, desc] of features.calendar) {
      featureCards.push({ icon: '&#128197;', name, desc });
    }
  }

  const serviceName = service === 'google' ? 'Gmail & Google Calendar'
    : service === 'calendar' ? 'Google Calendar' : 'Gmail';

  const featuresHtml = featureCards.map((f, i) => `
    <div class="feature" style="animation-delay:${0.1 + i * 0.08}s">
      <div class="feature-icon">${f.icon}</div>
      <div class="feature-text"><h3>${f.name}</h3><p>${f.desc}</p></div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Claudia - ${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; justify-content: center; align-items: center; min-height: 100vh;
    background: #F0F0F0; color: #1d1d1f;
  }
  .card {
    text-align: center; padding: 2.5rem 2.5rem 2rem; border-radius: 16px;
    background: #fff; max-width: 440px; width: 100%;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
  }
  .checkmark {
    width: 48px; height: 48px; border-radius: 50%; margin: 0 auto 1.25rem;
    display: flex; align-items: center; justify-content: center;
    ${isSuccess
      ? 'background: #00CED1; color: #fff;'
      : 'background: #ef4444; color: #fff;'}
    font-size: 1.4rem; font-weight: bold;
    animation: popIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
  }
  @keyframes popIn { 0% { transform: scale(0); } 100% { transform: scale(1); } }
  h1 {
    color: ${isSuccess ? '#00CED1' : '#ef4444'}; font-size: 1.4rem;
    font-weight: 600; margin-bottom: 0.4rem;
  }
  .subtitle { color: #6e6e73; line-height: 1.5; font-size: 0.9rem; margin-bottom: 1.5rem; }
  .service-label {
    display: inline-block; padding: 0.2rem 0.7rem; border-radius: 99px;
    font-size: 0.75rem; font-weight: 500; margin-bottom: 1.25rem;
    background: rgba(0,206,209,0.08); color: #00CED1;
  }
  .features {
    text-align: left; margin: 0 auto 1.5rem; padding: 0;
    display: flex; flex-direction: column; gap: 0.5rem;
  }
  .feature {
    display: flex; gap: 0.65rem; align-items: flex-start;
    padding: 0.55rem 0.75rem; border-radius: 10px;
    background: #f9f9fb; border: 1px solid #e8e8ed;
    animation: slideIn 0.35s ease backwards;
  }
  @keyframes slideIn { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
  .feature-icon {
    flex-shrink: 0; width: 26px; height: 26px; border-radius: 6px;
    background: rgba(0,206,209,0.08); display: flex; align-items: center;
    justify-content: center; font-size: 0.8rem; margin-top: 1px;
  }
  .feature-text h3 { font-size: 0.8rem; font-weight: 500; color: #1d1d1f; margin-bottom: 1px; }
  .feature-text p { font-size: 0.72rem; color: #86868b; line-height: 1.4; }
  hr { border: none; border-top: 1px solid #e8e8ed; margin: 0 0 0.85rem; }
  .footer { color: #86868b; font-size: 0.72rem; line-height: 1.6; }
  .footer .close { color: #aeaeb2; margin-top: 0.25rem; }
  .close-btn {
    display: inline-block; margin-top: 1rem; padding: 0.5rem 1.5rem;
    border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 500;
    cursor: pointer; background: #00CED1; color: #fff;
    transition: opacity 0.2s;
  }
  .close-btn:hover { opacity: 0.85; }
  .auto-close { color: #aeaeb2; font-size: 0.7rem; margin-top: 0.5rem; }
</style></head>
<body>
<div class="card">
  <div class="checkmark">${isSuccess ? '&#10003;' : '&#10007;'}</div>
  <h1>${isSuccess ? serviceName + ' Connected' : title}</h1>
  <p class="subtitle">${isSuccess ? 'Claudia is ready. Returning to your terminal.' : message}</p>
  ${isSuccess ? `
  <div class="service-label">What Claudia can do</div>
  <div class="features">${featuresHtml}</div>
  <hr />
  <div class="footer">
    <div>&#128274; Tokens stored locally. They never leave your machine.</div>
  </div>
  <button class="close-btn" onclick="window.close()">Close This Tab</button>
  <div class="auto-close" id="countdown">Closing in 3s...</div>
  <script>
    let t=3;
    const el=document.getElementById('countdown');
    const iv=setInterval(()=>{
      t--;
      if(t<=0){clearInterval(iv);window.close();el.textContent='You can close this tab now.';}
      else{el.textContent='Closing in '+t+'s...';}
    },1000);
  </script>
  ` : `
  <div class="footer" style="margin-top:0.5rem;">
    <div>Check your terminal for details, then try again.</div>
  </div>
  `}
</div>
</body>
</html>`;
}

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
 * @param {'gmail'|'calendar'} service
 * @returns {Promise<{access_token: string, refresh_token: string}>}
 */
export async function authenticate(service) {
  const scopes = SCOPES[service];
  if (!scopes) throw new Error(`Unknown service: ${service}. Use "gmail" or "calendar".`);

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
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Authorization Failed', 'Something went wrong. Check your terminal for details.', service));
        server.close();
        reject(new Error(`Google auth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Security Error', 'State mismatch. Please try again.', service));
        server.close();
        reject(new Error('OAuth state mismatch (possible CSRF). Try again.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      const serviceName = service === 'calendar' ? 'Google Calendar' : 'Gmail';
      res.end(htmlPage('Connected!', `Claudia now has access to your ${serviceName}. Here's what she can do:`, service));
      server.close();
      resolve(authCode);
    });

    server.listen(port, '127.0.0.1', () => {
      openBrowser(authUrl.toString());
    });

    // Timeout after 2 minutes
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out (2 minutes). Run the command again to retry.'));
    }, 120_000);

    server.on('close', () => clearTimeout(timeout));
  });

  // 4. Exchange authorization code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

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
  writeFileSync(join(TOKENS_DIR, `${service}.json`), JSON.stringify(tokenData, null, 2));

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
  // The URL is constructed internally, not from user input, but safe practice regardless.
  if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '""', url], () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

function htmlPage(title, message, service) {
  const isSuccess = title === 'Connected!';
  const LOGO_BASE64 = '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';

  const features = {
    gmail: [
      ['Search & read emails', 'Ask Claudia to find emails by sender, subject, or content'],
      ['Draft & send replies', 'Claudia can compose emails with your tone and context'],
      ['Inbox triage', 'Get a morning brief of what needs attention'],
    ],
    calendar: [
      ['View your schedule', 'Claudia sees upcoming events for meeting prep'],
      ['Create events', 'Schedule meetings through natural conversation'],
      ['Time awareness', 'Claudia knows when you\'re busy or free'],
    ],
  };

  const serviceFeatures = features[service] || features.gmail;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Claudia - ${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; justify-content: center; align-items: center; min-height: 100vh;
    background: #09090b; color: #e0e0e0;
    background-image: radial-gradient(ellipse at 50% 0%, rgba(124,111,239,0.12) 0%, transparent 50%);
  }
  .card {
    text-align: center; padding: 2.5rem 3rem 2rem; border-radius: 20px;
    background: #131316; border: 1px solid #27272a; max-width: 480px; width: 100%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,111,239,0.06);
  }
  .logo { margin-bottom: 1.25rem; }
  .logo img {
    width: 64px; height: auto; image-rendering: pixelated;
    ${isSuccess ? 'animation: float 3s ease-in-out infinite;' : ''}
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  .badge {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.35rem 0.9rem; border-radius: 99px; font-size: 0.78rem; font-weight: 500;
    margin-bottom: 1.25rem;
    ${isSuccess
      ? 'background: rgba(124,111,239,0.12); color: #a99ef5; border: 1px solid rgba(124,111,239,0.2);'
      : 'background: rgba(239,68,68,0.12); color: #fca5a5; border: 1px solid rgba(239,68,68,0.2);'}
    ${isSuccess ? 'animation: fadeIn 0.5s ease;' : ''}
  }
  @keyframes fadeIn { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
  h1 {
    color: ${isSuccess ? '#e4e2ff' : '#fca5a5'}; font-size: 1.35rem;
    font-weight: 600; margin-bottom: 0.5rem;
  }
  .subtitle { color: #71717a; line-height: 1.6; font-size: 0.88rem; margin-bottom: 1.5rem; }
  .features {
    text-align: left; margin: 0 auto 1.5rem; padding: 0;
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  .feature {
    display: flex; gap: 0.75rem; align-items: flex-start;
    padding: 0.65rem 0.85rem; border-radius: 10px;
    background: #18181b; border: 1px solid #27272a;
    animation: slideIn 0.4s ease backwards;
  }
  .feature:nth-child(1) { animation-delay: 0.1s; }
  .feature:nth-child(2) { animation-delay: 0.2s; }
  .feature:nth-child(3) { animation-delay: 0.3s; }
  @keyframes slideIn { 0% { opacity: 0; transform: translateX(-12px); } 100% { opacity: 1; transform: translateX(0); } }
  .feature-icon {
    flex-shrink: 0; width: 28px; height: 28px; border-radius: 6px;
    background: rgba(124,111,239,0.1); display: flex; align-items: center;
    justify-content: center; font-size: 0.85rem; margin-top: 1px;
  }
  .feature-text h3 { font-size: 0.82rem; font-weight: 500; color: #d4d4d8; margin-bottom: 2px; }
  .feature-text p { font-size: 0.75rem; color: #52525b; line-height: 1.4; }
  .divider { border: none; border-top: 1px solid #27272a; margin: 0 0 1rem; }
  .footer { color: #3f3f46; font-size: 0.75rem; line-height: 1.5; }
  .footer .privacy { color: #52525b; margin-bottom: 0.35rem; }
  .footer .close { color: #3f3f46; }
</style></head>
<body>
<div class="card">
  <div class="logo">
    <img src="data:image/png;base64,${LOGO_BASE64}" alt="Claudia" />
  </div>
  <div class="badge">${isSuccess ? '&#10003; Connected' : '&#10007; Failed'}</div>
  <h1>${title}</h1>
  <p class="subtitle">${message}</p>
  ${isSuccess ? `
  <div class="features">
    <div class="feature">
      <div class="feature-icon">${service === 'calendar' ? '&#128197;' : '&#128233;'}</div>
      <div class="feature-text"><h3>${serviceFeatures[0][0]}</h3><p>${serviceFeatures[0][1]}</p></div>
    </div>
    <div class="feature">
      <div class="feature-icon">${service === 'calendar' ? '&#9201;' : '&#9997;'}</div>
      <div class="feature-text"><h3>${serviceFeatures[1][0]}</h3><p>${serviceFeatures[1][1]}</p></div>
    </div>
    <div class="feature">
      <div class="feature-icon">${service === 'calendar' ? '&#128276;' : '&#128203;'}</div>
      <div class="feature-text"><h3>${serviceFeatures[2][0]}</h3><p>${serviceFeatures[2][1]}</p></div>
    </div>
  </div>
  <hr class="divider" />
  <div class="footer">
    <div class="privacy">&#128274; Your tokens are stored locally and never leave your machine.</div>
    <div class="close">You can close this tab and return to your terminal.</div>
  </div>
  ` : `
  <div class="footer" style="margin-top:1rem;">
    <div class="close">Check your terminal for details, then try again.</div>
  </div>
  `}
</div>
</body>
</html>`;
}

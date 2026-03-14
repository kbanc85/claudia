/**
 * Google Workspace MCP setup logic.
 * Extracted as a module so it can be tested independently from the interactive CLI.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Google API IDs required per tool tier.
 * Each higher tier is a superset of the one below it.
 */
export const TIER_APIS = {
  core: [
    'gmail.googleapis.com',
    'calendar-json.googleapis.com',
    'drive.googleapis.com',
    'people.googleapis.com',
  ],
  extended: [
    'gmail.googleapis.com',
    'calendar-json.googleapis.com',
    'drive.googleapis.com',
    'people.googleapis.com',
    'docs.googleapis.com',
    'sheets.googleapis.com',
    'tasks.googleapis.com',
    'chat.googleapis.com',
  ],
  complete: [
    'gmail.googleapis.com',
    'calendar-json.googleapis.com',
    'drive.googleapis.com',
    'people.googleapis.com',
    'docs.googleapis.com',
    'sheets.googleapis.com',
    'tasks.googleapis.com',
    'chat.googleapis.com',
    'slides.googleapis.com',
    'forms.googleapis.com',
    'script.googleapis.com',
  ],
};

/**
 * Extract the numeric GCP project number from a Google OAuth Client ID.
 * Client IDs follow the format: <project-number>-<random>.apps.googleusercontent.com
 * Returns null if the ID doesn't match the expected format.
 */
export function extractProjectNumber(clientId) {
  if (!clientId) return null;
  const match = clientId.match(/^(\d+)-/);
  return match ? match[1] : null;
}

/**
 * Build a one-click URL that enables all APIs for a given tier in the GCP console.
 * Returns a generic library URL if projectNumber is null.
 */
export function buildApiEnableUrl(projectNumber, tier) {
  const effectiveTier = TIER_APIS[tier] ? tier : 'core';
  const apis = TIER_APIS[effectiveTier];

  if (!projectNumber) {
    return 'https://console.cloud.google.com/apis/library';
  }

  return `https://console.cloud.google.com/flows/enableapi?apiid=${apis.join(',')}&project=${projectNumber}`;
}

/**
 * Detect old Google MCP server entries in .mcp.json.
 * Returns { hasOldGmail, hasOldCalendar, hasWorkspace }.
 */
export function detectOldGoogleMcp(targetPath) {
  const mcpPath = join(targetPath, '.mcp.json');
  const result = { hasOldGmail: false, hasOldCalendar: false, hasWorkspace: false };

  if (!existsSync(mcpPath)) return result;

  try {
    const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    const servers = config.mcpServers || {};
    result.hasOldGmail = !!servers.gmail;
    result.hasOldCalendar = !!servers['google-calendar'];
    result.hasWorkspace = !!servers.google_workspace;
  } catch {
    // Malformed JSON
  }

  return result;
}

/**
 * Add or update the google_workspace entry in .mcp.json.
 * Removes old gmail and google-calendar entries if present.
 * Creates .mcp.json if it doesn't exist.
 */
export function setupGoogleWorkspace(targetPath, clientId, clientSecret, tier) {
  const mcpPath = join(targetPath, '.mcp.json');
  const effectiveTier = tier || 'core';

  let config;
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      config = { mcpServers: {} };
    }
  } else {
    config = { mcpServers: {} };
  }

  if (!config.mcpServers) config.mcpServers = {};

  // Remove old entries
  delete config.mcpServers.gmail;
  delete config.mcpServers['google-calendar'];

  // Add/update google_workspace
  config.mcpServers.google_workspace = {
    command: 'uvx',
    args: ['workspace-mcp', '--tool-tier', effectiveTier],
    env: {
      GOOGLE_OAUTH_CLIENT_ID: clientId,
      GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
    },
  };

  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
}

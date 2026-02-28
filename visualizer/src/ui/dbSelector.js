/**
 * Claudia Brain v4 -- Database selector
 *
 * Dropdown in the HUD bar that lists all available Claudia databases
 * (from ~/.claudia/memory/) and lets the user switch between them.
 * Switching calls POST /api/database/switch then reloads the graph.
 */

import { fetchDatabases, switchDatabase } from '../data/api.js';

let dropdown = null;
let label = null;
let reloadCallback = null;
let isOpen = false;

/**
 * Initialize the database selector UI.
 * @param {Object} callbacks
 * @param {Function} callbacks.onSwitch - Called after a database switch; should reload graph data
 */
export function initDbSelector(callbacks) {
  reloadCallback = callbacks?.onSwitch || null;

  const btn = document.getElementById('db-selector-btn');
  dropdown = document.getElementById('db-dropdown');
  label = document.getElementById('db-selector-label');

  if (!btn || !dropdown || !label) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#db-selector-container')) {
      closeDropdown();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeDropdown();
  });

  // Load initial database info
  refreshDatabases();
}

function toggleDropdown() {
  if (isOpen) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function openDropdown() {
  if (!dropdown) return;
  isOpen = true;
  dropdown.classList.remove('hidden');
  refreshDatabases(); // Refresh on each open
}

function closeDropdown() {
  if (!dropdown) return;
  isOpen = false;
  dropdown.classList.add('hidden');
}

/**
 * Fetch the database list and render the dropdown + label.
 */
async function refreshDatabases() {
  if (!dropdown || !label) return;

  // Show loading state using DOM methods (no innerHTML)
  dropdown.replaceChildren();
  const loadingEl = document.createElement('div');
  loadingEl.className = 'db-loading';
  loadingEl.textContent = 'Loading databases...';
  dropdown.appendChild(loadingEl);

  try {
    const data = await fetchDatabases();
    const databases = data.databases || [];

    // Update the HUD label with current DB name
    const currentDb = databases.find(db => db.isCurrent);
    if (currentDb) {
      label.textContent = formatDbName(currentDb);
    } else {
      label.textContent = 'No database';
    }

    // Build dropdown content
    renderDropdown(databases);
  } catch (err) {
    label.textContent = 'Error';
    dropdown.replaceChildren();
    const errEl = document.createElement('div');
    errEl.className = 'db-error';
    errEl.textContent = 'Failed to load databases: ' + err.message;
    dropdown.appendChild(errEl);
  }
}

/**
 * Render the database list inside the dropdown.
 */
function renderDropdown(databases) {
  if (!dropdown) return;
  dropdown.replaceChildren();

  const header = document.createElement('div');
  header.className = 'db-dropdown-header';
  header.textContent = `Available Databases (${databases.length})`;
  dropdown.appendChild(header);

  if (databases.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'db-loading';
    empty.textContent = 'No databases found in ~/.claudia/memory/';
    dropdown.appendChild(empty);
    return;
  }

  for (const db of databases) {
    const item = document.createElement('div');
    item.className = 'db-item' + (db.isCurrent ? ' active' : '');

    // Icon
    const icon = document.createElement('div');
    icon.className = 'db-item-icon';
    icon.textContent = db.isCurrent ? '\u25C9' : '\u25CB';

    // Info column
    const info = document.createElement('div');
    info.className = 'db-item-info';

    const name = document.createElement('div');
    name.className = 'db-item-name';
    name.textContent = formatDbName(db);

    const path = document.createElement('div');
    path.className = 'db-item-path';
    path.textContent = db.path;
    path.title = db.path;

    info.appendChild(name);
    info.appendChild(path);

    item.appendChild(icon);
    item.appendChild(info);

    // Entity count (shown for all databases)
    if (db.entityCount != null) {
      const count = document.createElement('span');
      count.className = 'db-item-count';
      count.textContent = `${db.entityCount} entities`;
      item.appendChild(count);
    }

    // Current badge
    if (db.isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'db-item-badge';
      badge.textContent = 'ACTIVE';
      item.appendChild(badge);
    }

    // Click to switch
    if (!db.isCurrent) {
      item.addEventListener('click', () => handleSwitch(db));
      item.style.cursor = 'pointer';
    } else {
      item.style.cursor = 'default';
    }

    dropdown.appendChild(item);
  }
}

/**
 * Handle clicking a database to switch to it.
 */
async function handleSwitch(db) {
  if (!label) return;

  // Show switching state
  label.textContent = 'Switching...';
  closeDropdown();

  try {
    await switchDatabase(db.path);
    label.textContent = formatDbName(db);
    console.log(`[DbSelector] Switched to: ${db.path}`);

    // Reload graph data
    if (reloadCallback) {
      await reloadCallback();
    }
  } catch (err) {
    console.error('[DbSelector] Switch failed:', err);
    label.textContent = 'Error!';
    // Refresh to show actual state
    setTimeout(() => refreshDatabases(), 1500);
  }
}

/**
 * Format a database entry into a human-readable name.
 */
function formatDbName(db) {
  if (db.hash === 'claudia') return 'Default';
  if (db.label) return db.label;
  return db.filename.replace('.db', '');
}

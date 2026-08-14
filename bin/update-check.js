// Make plain `npx get-claudia` converge on npm's current `latest` release even
// when npm starts an older cached copy of the package.

export function isNewerVersion(latest, current) {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export async function checkForNewerVersion(
  currentVersion,
  {
    env = process.env,
    argv = process.argv,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (env.CLAUDIA_SKIP_UPDATE_CHECK) return null;
  if (argv.includes('--help') || argv.includes('-h') || argv.includes('--version') || argv.includes('-V')) {
    return null;
  }

  try {
    const response = await fetchImpl('https://registry.npmjs.org/get-claudia/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.version && isNewerVersion(data.version, currentVersion) ? data.version : null;
  } catch {
    // Installation remains usable offline; it simply cannot prove a newer
    // release exists and continues with the package npm supplied.
    return null;
  }
}

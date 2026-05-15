#!/usr/bin/env node

/**
 * Thin entrypoint shim. All work happens in installer.js and its focused
 * sibling modules. Keep this file small so package consumers don't have
 * to reason about install behavior at the entrypoint.
 */

import { main } from './installer.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

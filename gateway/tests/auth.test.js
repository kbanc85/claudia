import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthManager } from '../src/utils/auth.js';

describe('AuthManager', () => {
  it('allows globally authorized users', () => {
    const auth = new AuthManager({
      globalAllowedUsers: ['123', '456'],
      channels: {},
    });

    assert.equal(auth.isAuthorized('telegram', '123'), true);
    assert.equal(auth.isAuthorized('slack', '456'), true);
    assert.equal(auth.isAuthorized('telegram', '789'), false);
  });

  it('allows channel-specific authorized users', () => {
    const auth = new AuthManager({
      globalAllowedUsers: [],
      channels: {
        telegram: { allowedUsers: ['111'] },
        slack: { allowedUsers: ['222'] },
      },
    });

    assert.equal(auth.isAuthorized('telegram', '111'), true);
    assert.equal(auth.isAuthorized('telegram', '222'), false);
    assert.equal(auth.isAuthorized('slack', '222'), true);
    assert.equal(auth.isAuthorized('slack', '111'), false);
  });

  it('channel allowlist and global both work', () => {
    const auth = new AuthManager({
      globalAllowedUsers: ['999'],
      channels: {
        telegram: { allowedUsers: ['111'] },
      },
    });

    assert.equal(auth.isAuthorized('telegram', '111'), true);
    assert.equal(auth.isAuthorized('telegram', '999'), true);
  });

  it('denies all when no allowlists configured', () => {
    const auth = new AuthManager({
      globalAllowedUsers: [],
      channels: {},
    });

    assert.equal(auth.isAuthorized('telegram', '123'), false);
  });

  it('handles numeric user IDs', () => {
    const auth = new AuthManager({
      globalAllowedUsers: ['12345'],
      channels: {},
    });

    assert.equal(auth.isAuthorized('telegram', 12345), true);
    assert.equal(auth.isAuthorized('telegram', '12345'), true);
  });
});

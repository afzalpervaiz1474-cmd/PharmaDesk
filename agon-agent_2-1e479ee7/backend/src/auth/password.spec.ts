import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterx', hash)).toBe(false);
  });

  it('never stores the password and salts every hash', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    expect(first).not.toContain('same-password');
    expect(first).not.toEqual(second);
    expect(first.startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('treats malformed stored hashes as a failed login, not a crash', async () => {
    for (const stored of ['', 'plain-text', 'scrypt$x$8$1$AAAA$AAAA', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$1$$']) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });
});

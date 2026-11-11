import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt parameters. Stored with each hash so they can be raised later
// without invalidating existing passwords.
const COST = 16_384; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, { N: cost, r: blockSize, p: parallelism }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Returns `scrypt$N$r$p$salt$hash` (salt and hash base64-encoded). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM, KEY_LENGTH);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time comparison. Malformed stored hashes verify as false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelism, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !blockSize || !parallelism || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const params = [Number(cost), Number(blockSize), Number(parallelism)];
  if (expected.length === 0 || params.some((value) => !Number.isInteger(value) || value <= 0)) return false;
  try {
    const actual = await derive(password, Buffer.from(salt, 'base64'), params[0], params[1], params[2], expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

import { randomInt } from 'crypto';

// No 0/O/1/I so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${randomInt(1_000_000).toString(36)}`;
}

/** Picks `count` distinct words without mutating the input array. */
export function pickWords(words: string[], count: number): string[] {
  const pool = [...words];
  const picked: string[] = [];
  const amount = Math.min(count, pool.length);

  for (let i = 0; i < amount; i += 1) {
    const index = randomInt(pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }

  return picked;
}

export function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(items.length)];
}

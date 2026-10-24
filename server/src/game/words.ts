import rawWords from '../data/words.json';
import { WORD_CATEGORY_IDS, type WordCategory } from '../types';

const WORDS = rawWords as Record<WordCategory, string[]>;

/** Returns the union of every word in the selected categories. */
export function getWordPool(categories: WordCategory[]): string[] {
  const selected = categories.length > 0 ? categories : [...WORD_CATEGORY_IDS];
  return selected.flatMap((category) => WORDS[category] ?? []);
}

import {
  Apple,
  Building2,
  Car,
  Lamp,
  Music,
  PawPrint,
  Trees,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { WordCategory } from './types';

export interface WordCategoryOption {
  id: WordCategory;
  label: string;
  icon: LucideIcon;
}

export const WORD_CATEGORIES: WordCategoryOption[] = [
  { id: 'food', label: 'Food & Drink', icon: Apple },
  { id: 'animals', label: 'Animals', icon: PawPrint },
  { id: 'places', label: 'Places & Buildings', icon: Building2 },
  { id: 'vehicles', label: 'Vehicles', icon: Car },
  { id: 'nature', label: 'Nature', icon: Trees },
  { id: 'music-tech', label: 'Music & Tech', icon: Music },
  { id: 'objects', label: 'Home & Objects', icon: Lamp },
  { id: 'fantasy', label: 'Fantasy & Fun', icon: Wand2 },
];

export const ALL_WORD_CATEGORIES = WORD_CATEGORIES.map((category) => category.id);

const LABELS = new Map(WORD_CATEGORIES.map((category) => [category.id, category.label]));

export function categoryLabel(id: WordCategory): string {
  return LABELS.get(id) ?? id;
}

export function categorySummary(ids: WordCategory[]): string {
  if (ids.length === 0 || ids.length === WORD_CATEGORIES.length) return 'All categories';
  if (ids.length <= 2) return ids.map(categoryLabel).join(' + ');
  return `${categoryLabel(ids[0])} +${ids.length - 1}`;
}

import fs from 'fs';
import path from 'path';

const MEMORY_PATH = path.join(__dirname, '../../data/aria-memory.json');
const MAX_HISTORY = 7;

export interface PostMemoryEntry {
  date: string;
  milestoneType: string;
  audience: string;
  toneUsed: string;
  openingLine: string;
}

export interface AriaMemory {
  instagram: PostMemoryEntry[];
  linkedin: PostMemoryEntry[];
  twitter: PostMemoryEntry[];
}

const EMPTY_MEMORY: AriaMemory = { instagram: [], linkedin: [], twitter: [] };

export function readMemory(): AriaMemory {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return EMPTY_MEMORY;
    const raw = fs.readFileSync(MEMORY_PATH, 'utf-8');
    return JSON.parse(raw) as AriaMemory;
  } catch {
    return EMPTY_MEMORY;
  }
}

export function writeMemory(
  platform: keyof AriaMemory,
  entry: PostMemoryEntry
): void {
  const memory = readMemory();
  memory[platform] = [entry, ...memory[platform]].slice(0, MAX_HISTORY);
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf-8');
}

export function formatMemoryContext(memory: AriaMemory): string {
  const format = (entries: PostMemoryEntry[], label: string) => {
    if (entries.length === 0) return `${label}: no history yet`;
    return `${label} recent history:\n` +
      entries.slice(0, 5).map(e =>
        `  - ${e.date} | tone: ${e.toneUsed} | opening: "${e.openingLine}"`
      ).join('\n');
  };

  return [
    format(memory.instagram, 'Instagram'),
    format(memory.linkedin, 'LinkedIn'),
    format(memory.twitter, 'Twitter'),
  ].join('\n');
}

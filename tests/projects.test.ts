import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateProjects, getProjects, type Project } from '../src/data/projects';

describe('project validation (PRD §7.4)', () => {
  beforeEach(() => {
    // Silence the expected console.error from the malformed-entry path.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a malformed entry (bad url) and keeps the valid ones', () => {
    const raw: Project[] = [
      {
        id: 'good-1',
        title: 'Good One',
        blurb: 'A perfectly valid project entry.',
        tech: ['TypeScript'],
        url: 'https://example.com/one',
      },
      {
        // malformed: empty id + non-url url
        id: '',
        title: 'Broken',
        blurb: 'Missing an id and a real url.',
        tech: ['TypeScript'],
        url: 'not-a-url',
      },
      {
        id: 'good-2',
        title: 'Good Two',
        blurb: 'Another valid entry.',
        tech: ['React'],
        url: 'https://example.com/two',
      },
    ];

    const result = validateProjects(raw);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['good-1', 'good-2']);
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects entries with empty tech arrays', () => {
    const raw: Project[] = [
      {
        id: 'no-tech',
        title: 'No Tech',
        blurb: 'Has an empty tech array.',
        tech: [],
        url: 'https://example.com',
      },
    ];
    expect(validateProjects(raw)).toHaveLength(0);
  });

  it('auto-alternates building when omitted', () => {
    const raw: Project[] = [
      { id: 'a', title: 'A', blurb: 'a', tech: ['x'], url: 'https://e.com/a' },
      { id: 'b', title: 'B', blurb: 'b', tech: ['x'], url: 'https://e.com/b' },
      { id: 'c', title: 'C', blurb: 'c', tech: ['x'], url: 'https://e.com/c' },
    ];
    const result = validateProjects(raw);
    expect(result.map((p) => p.building)).toEqual([
      'wrecked-building',
      'low-poly-house',
      'wrecked-building',
    ]);
  });

  it('alternation is by surviving index, so a dropped entry does not skip a slot', () => {
    const raw: Project[] = [
      { id: 'a', title: 'A', blurb: 'a', tech: ['x'], url: 'https://e.com/a' },
      // dropped (invalid) — must not consume an alternation slot
      { id: '', title: '', blurb: '', tech: [], url: 'bad' },
      { id: 'c', title: 'C', blurb: 'c', tech: ['x'], url: 'https://e.com/c' },
    ];
    const result = validateProjects(raw);
    expect(result.map((p) => p.building)).toEqual(['wrecked-building', 'low-poly-house']);
  });

  it('respects an explicit building override', () => {
    const raw: Project[] = [
      {
        id: 'a',
        title: 'A',
        blurb: 'a',
        tech: ['x'],
        url: 'https://e.com/a',
        building: 'low-poly-house',
      },
    ];
    expect(validateProjects(raw)[0].building).toBe('low-poly-house');
  });

  it('getProjects() returns the real, all-valid project list', () => {
    const projects = getProjects();
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(() => new URL(p.url)).not.toThrow();
      expect(p.building).toBeDefined();
    }
  });
});

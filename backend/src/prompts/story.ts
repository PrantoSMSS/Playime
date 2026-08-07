/**
 * Story (DM) system prompt renderer — deterministic, per
 * docs/PLAYIME_PROMPT_SPEC.md §1 (Story DM template).
 *
 * Same card + state ⇒ same prompt, byte-for-byte; no ad-hoc prose from the
 * app layer (§0.2).
 */
import type { QuestEntry, StoryCard, StoryNpc } from '../models/story.js';
import type { Persona } from '../models/persona.js';

/**
 * Render the full Story DM system prompt from a StoryCard and session state.
 *
 * `questLogState` is the per-session copy of the quest log (QuestEntry[]).
 * `plotFlags` is the per-session copy of plot_flags.
 * If not provided, falls back to the story card's own values.
 */
export function renderStorySystemPrompt(
  story: StoryCard,
  questLogState?: QuestEntry[],
  plotFlags?: Record<string, unknown>,
  persona?: Persona,
): string {
  const quests = questLogState ?? story.quest_log;
  const flags = plotFlags ?? story.plot_flags;

  // Find the active quest for directional guidance
  const activeQuest = quests.find((q) => q.status === 'active');

  const lines: string[] = [
    `You are the dungeon master of "${story.title}", a ${story.genre} story.`,
    '',
    '## Premise',
    story.premise || 'No premise provided.',
    '',
    '## Tone',
    story.tone || 'No tone specified.',
    '',
    '## World',
  ];

  // Locations
  lines.push('### Locations');
  if (story.locations.length > 0) {
    for (const loc of story.locations) {
      lines.push(`· ${loc}`);
    }
  } else {
    lines.push('No locations defined.');
  }

  // NPCs
  lines.push('');
  lines.push('### NPCs');
  if (story.npcs.length > 0) {
    for (const npc of story.npcs) {
      const desc = npc.description || 'No description';
      lines.push(`· ${npc.name}: ${desc}`);
    }
  } else {
    lines.push('No NPCs defined.');
  }

  // Player Persona section — same pattern as character prompt.
  if (persona && persona.id !== 'myself') {
    lines.push('');
    lines.push('## Player Persona');
    lines.push('This describes the identity of the player character.');
    lines.push('');
    lines.push("Use the Persona's relevant identity, pronouns, background, personality,");
    lines.push('appearance, and other provided information to shape narration and NPC');
    lines.push('reactions when appropriate. Use this information naturally — do not');
    lines.push('recite Persona facts or force every attribute into every response.');
    lines.push('');
    lines.push(`Name: ${persona.name}`);
    if (persona.pronouns) lines.push(`Pronouns: ${persona.pronouns}`);
    if (persona.description) lines.push(`Role: ${persona.description}`);
    if (persona.appearance) lines.push(`Appearance: ${persona.appearance}`);
    if (persona.personality) lines.push(`Personality: ${persona.personality}`);
  }

  // Active quest — directional guidance, not a script
  if (activeQuest) {
    lines.push('');
    lines.push('## Quest Progress');
    lines.push(`The story should be drifting toward: ${activeQuest.objective}`);
    if (activeQuest.is_ending) {
      lines.push('(This is the story\'s ending — let events naturally conclude.)');
    }
  }

  // Plot state
  lines.push('');
  lines.push('## Plot state');
  const flagEntries = Object.entries(flags);
  if (flagEntries.length > 0) {
    for (const [key, value] of flagEntries) {
      lines.push(`· ${key}: ${String(value)}`);
    }
  } else {
    lines.push('No plot flags set yet.');
  }

  // Story so far (chapter log)
  lines.push('');
  lines.push('## Story so far');
  if (story.chapter_log.length > 0) {
    for (const chapter of story.chapter_log) {
      lines.push(`· ${chapter.title}: ${chapter.summary}`);
    }
  } else {
    lines.push('None yet.');
  }

  // Narration rules
  lines.push('');
  lines.push('## Narration rules');
  lines.push('- You narrate the world, run every NPC, and react to the player\'s choices. Never break the fourth wall.');
  lines.push('- Only the protagonist is the player\'s character; you control everyone else.');
  lines.push('- Keep narration vivid and concise. Show, don\'t tell. Never reveal hidden plot state.');
  lines.push('- Produce ONLY the final story text (narration + choices). No reasoning, no planning,');
  lines.push('  no game-mechanics chatter unless the player asks for it.');
  lines.push('- Wrap narration and actions in asterisks: *The wind howls through the trees.* Dialogue is plain text.');
  lines.push('- Let the plot state and memories shape events. Refer to shared past naturally — never by listing it.');

  return lines.join('\n');
}

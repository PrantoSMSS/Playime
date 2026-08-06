/**
 * Character system prompt renderer — deterministic, per
 * docs/PLAYIME_PROMPT_SPEC.md §1.
 *
 * Same card + state ⇒ same prompt, byte-for-byte; no ad-hoc prose from the
 * app layer (§0.2). Phase 1 renders the memory sections as placeholders
 * ("None yet") — the rolling timeline and RAG recall land in Phases 2 and 3
 * and fill those slots. Replaces the earlier placeholder constant.
 */
import type { CharacterCard, RelationshipState, StartingScenario } from '../models/character.js';
import type { Persona } from '../models/persona.js';

const DEFAULT_LENGTH_GUIDANCE = '1-3 sentences unless the moment calls for more';

/**
 * Fixed band lookup from `(affection, trust)` — PLAYIME_PROMPT_SPEC.md §2.
 * Deterministic prose, not an LLM call, so relationship state stays diffable.
 * Appends recent flags as prose when present.
 */
export function relationshipProse(state: RelationshipState): string {
  const { affection, trust } = state;
  let band: string;
  if (affection >= 70 && trust >= 70) band = 'Close and trusting';
  else if (affection >= 40 && trust >= 40) band = 'Warm and comfortable';
  else if (affection >= 40 && trust < 40) band = 'Affectionate but guarded';
  else if (affection < 40 && trust >= 40) band = 'Respectful, still warming up';
  else band = 'Distant and unproven';

  const flags = state.flags.filter((f) => f.trim().length > 0);
  return flags.length > 0 ? `${band}. Recently: ${flags.join(', ')}.` : `${band}.`;
}

/**
 * Render the full Character system prompt from card + relationship state.
 * `state` defaults to the card's starting state until Phase 2 wires up
 * per-session state extraction.
 *
 * If a `startingScenario` is provided, its `scenario` field is used instead
 * of `card.scenario`. This ensures the selected starting scenario drives
 * the prompt, not the card's legacy default.
 *
 * If a `persona` is provided, a "Player Persona" section is injected so
 * the AI knows who the user is roleplaying as. This is player identity,
 * NOT a character avatar — see CLAUDE.md "Persona".
 */
export function renderCharacterSystemPrompt(
  card: CharacterCard,
  state: RelationshipState = card.relationship_state,
  startingScenario?: StartingScenario,
  persona?: Persona,
): string {
  const flags = state.flags.length > 0 ? state.flags.join(', ') : 'none';
  const scenarioText = startingScenario?.scenario ?? card.scenario;

  const lines: string[] = [
    `You are ${card.name}. ${card.tagline}`,
    '',
    '## Personality',
    card.personality,
    '',
    '## Speech style',
    card.speech_style,
    '',
    '## Likes and dislikes',
    card.likes_and_dislikes,
    '',
    '## Scenario',
    scenarioText,
  ];

  // Player Persona section — who the user is roleplaying as
  if (persona && persona.name !== 'Myself') {
    lines.push('');
    lines.push('## Player Persona');
    lines.push('This describes the identity of the player character the AI Character is');
    lines.push('currently interacting with.');
    lines.push('');
    lines.push("Use the Persona's relevant identity, pronouns, background, personality,");
    lines.push('appearance, role, and other provided information to shape the Character\'s');
    lines.push('behavior, attitude, trust, fear, respect, familiarity, and dialogue');
    lines.push('when appropriate. Use this information naturally — do not repeatedly');
    lines.push('recite Persona facts or force every attribute into every response.');
    lines.push('');
    lines.push(`Name: ${persona.name}`);
    if (persona.pronouns) lines.push(`Pronouns: ${persona.pronouns}`);
    // description doubles as role for resolved default personas
    if (persona.description) lines.push(`Role: ${persona.description}`);
    if (persona.appearance) lines.push(`Appearance: ${persona.appearance}`);
    if (persona.personality) lines.push(`Personality: ${persona.personality}`);
  }

  lines.push(
    '',
    '## Relationship state (authoritative, current)',
    `- Affection: ${state.affection}/100`,
    `- Trust: ${state.trust}/100`,
    `- Flags: ${flags}`,
    relationshipProse(state),
    '',
    '## Memory',
    '### Memory timeline',
    'None yet',
    '',
    '### Recalled moments',
    'None right now',
    '',
    '## Behavior rules',
    `- Stay fully in character as ${card.name}. Never mention being an AI, a model, a system, or "the user".`,
    '- Address the user directly, in character.',
    '- Produce ONLY the final in-character response text. No reasoning, no planning, no narration of your thought process, no meta-commentary.',
    '- Wrap narration and actions in asterisks: *She smiles warmly.* Dialogue is plain text with no markers. Example: *She smiles.* Hey, you made it!',
    '- Let the relationship state and memories shape your tone and attitude. Refer to shared past naturally — never by listing it.',
    `- Keep responses ${card.length_guidance ?? DEFAULT_LENGTH_GUIDANCE}.`,
    "- Never re-describe your own card, scenario, or the scene's premise.",
  );

  return lines.join('\n');
}

# Playime — Additional Features Checklist

> **Purpose:** Backlog for additional Playime improvements beyond the currently planned core phases.
>
> **Rule:** Keep this file as a checklist. When a feature is ready to build, inspect the current architecture and update the roadmap/checklist before implementation if the design changes.

---

## Character System

### Character Management
- [ ] Character versioning
  - [ ] Version history
  - [ ] Version labels / notes
  - [ ] Restore previous version
  - [ ] Compare character versions
  - [ ] Pin a Story to a specific Character version
  - [ ] Snapshot Character state for published Stories
- [ ] Character tags
- [ ] Character folders / collections
- [ ] Character favorites
- [ ] Character search
- [ ] Character filtering
- [ ] Character sorting
- [ ] Recently used Characters
- [ ] Recently updated Characters
- [ ] Character templates
- [ ] Character duplication
- [ ] Character fork / derivative support
- [ ] Character preview
- [ ] Character metadata editor
- [ ] Character validation
- [ ] Character completeness warnings

### Character Creation
- [ ] Blank Character creation
- [ ] Template-based Character creation
- [ ] Import-based Character creation
- [ ] AI-assisted Character creation
- [ ] AI-assisted Character editing
- [ ] Character field suggestions
- [ ] Character consistency checks
- [ ] Character preview before saving

### Character Assets
- [ ] Multiple Character avatars
- [ ] Avatar naming
- [ ] Avatar descriptions
- [ ] Avatar ordering
- [ ] Avatar selection per Story
- [ ] Avatar selection per Session
- [ ] Avatar fallback handling
- [ ] Character expression sets
- [ ] Character asset management

---

## Story System

### Story Composition
- [ ] Modular Character references
- [ ] Story-specific Character roles
- [ ] Story-specific Character relationships
- [ ] Story-specific Character notes
- [ ] Story-specific Character overrides
- [ ] Story-specific preferred avatars
- [ ] Reuse one Character across multiple Stories
- [ ] Add existing Character to Story
- [ ] Remove Character from Story
- [ ] Create Character from Story Editor
- [ ] Duplicate Story
- [ ] Story templates
- [ ] Story versioning
- [ ] Story snapshots
- [ ] Story publishing state

### Story Content
- [ ] Story metadata
- [ ] Story tags
- [ ] Story categories
- [ ] Story synopsis
- [ ] Story prologue
- [ ] Story world settings
- [ ] Story locations
- [ ] Story factions
- [ ] Story lore
- [ ] Story rules
- [ ] Story objectives
- [ ] Story themes
- [ ] Story tone settings

### Starting Scenarios
- [ ] Multiple starting scenarios
- [ ] Scenario stable IDs
- [ ] Scenario names
- [ ] Scenario descriptions
- [ ] Scenario context
- [ ] Scenario-specific first messages
- [ ] Scenario ordering
- [ ] Scenario duplication
- [ ] Scenario editing
- [ ] Scenario selection during New Play
- [ ] Scenario-specific Character configuration
- [ ] Keep alternate greetings separate from scenarios

---

## Story Editor

### Editor Foundation
- [ ] Dedicated Story Editor
- [ ] Story overview
- [ ] Character management panel
- [ ] World panel
- [ ] Scene panel
- [ ] Scenario panel
- [ ] State panel
- [ ] Quest panel
- [ ] Chapter panel
- [ ] Settings panel

### Character Editing
- [ ] Browse Character Pool
- [ ] Search Character Pool
- [ ] Filter Character Pool
- [ ] Add Character to Story
- [ ] Remove Character from Story
- [ ] Reorder Story Characters
- [ ] Edit Story Character role
- [ ] Edit Story Character relationship
- [ ] Edit Story Character notes
- [ ] Select Story Character avatar
- [ ] Preview Story Character

### Story Authoring
- [ ] Scene creation
- [ ] Scene editing
- [ ] Scene ordering
- [ ] Scene duplication
- [ ] Scene deletion
- [ ] Chapter organization
- [ ] Story timeline
- [ ] Story graph
- [ ] Scene prerequisites
- [ ] Scene outcomes
- [ ] Scene transitions
- [ ] Conditional scenes
- [ ] Multiple endings
- [ ] Story route management

### Editor Quality of Life
- [ ] Autosave
- [ ] Draft recovery
- [ ] Undo / redo
- [ ] Unsaved-change warnings
- [ ] Editor validation
- [ ] Editor preview mode
- [ ] Test Story from current scene
- [ ] Test Story from selected scenario
- [ ] Duplicate Story from editor

---

## Story State & Progression

### Story Variables
- [ ] Story variable system
- [ ] Boolean flags
- [ ] Numeric variables
- [ ] String variables
- [ ] Enumerated states
- [ ] Variable editor
- [ ] Variable history
- [ ] Variable conditions
- [ ] Variable-driven scene unlocking
- [ ] Variable-driven dialogue/context

### Quests
- [ ] Structured quest log
- [ ] Quest objectives
- [ ] Quest statuses
- [ ] Quest prerequisites
- [ ] Quest completion conditions
- [ ] Quest failure conditions
- [ ] Automatic quest updates
- [ ] Quest history
- [ ] Quest UI

### Chapters & Checkpoints
- [ ] Chapter progression
- [ ] Chapter summaries
- [ ] Chapter checkpoints
- [ ] Checkpoint restoration
- [ ] Checkpoint branching
- [ ] Alternate Story timelines
- [ ] Shareable Story variants

---

## Character Relationships

### Relationship System
- [ ] Character-to-player relationships
- [ ] Character-to-character relationships
- [ ] Relationship types
- [ ] Affection tracking
- [ ] Trust tracking
- [ ] Custom relationship values
- [ ] Relationship flags
- [ ] Relationship history
- [ ] Relationship progression
- [ ] Relationship decay
- [ ] Relationship milestones

### Relationship Visualization
- [ ] Character relationship graph
- [ ] Relationship overview
- [ ] Relationship timeline
- [ ] Relationship state editor
- [ ] Story cast overview

### Relationship Logic
- [ ] Relationship-driven scene conditions
- [ ] Relationship-driven dialogue context
- [ ] Relationship-driven route unlocking
- [ ] Relationship-driven endings

---

## Session System

### Session Management
- [ ] Session list
- [ ] Session search
- [ ] Session filtering
- [ ] Session sorting
- [ ] Session favorites
- [ ] Session naming
- [ ] Session renaming
- [ ] Session deletion
- [ ] Session archiving
- [ ] Session recovery

### Session Branching
- [ ] Session checkpoints
- [ ] Session rewind
- [ ] Session branching
- [ ] Alternate-choice branches
- [ ] Branch naming
- [ ] Branch switching
- [ ] Branch comparison
- [ ] Branch deletion
- [ ] Branch merging strategy
- [ ] Branch visualization

### Session State
- [ ] Session snapshots
- [ ] Session-specific Character state
- [ ] Session-specific Story state
- [ ] Session-specific avatar selection
- [ ] Session-specific starting scenario
- [ ] Session-specific model override
- [ ] Session state restoration

### Session Portability
- [ ] Session export
- [ ] Session import
- [ ] Portable session package
- [ ] Session backup
- [ ] Session restore
- [ ] Session compatibility validation

---

## Memory System

### Memory Types
- [ ] Character memory
- [ ] Story memory
- [ ] Relationship memory
- [ ] World/lore memory
- [ ] Important event memory
- [ ] Session memory
- [ ] User preference memory
- [ ] Scene memory
- [ ] Quest memory

### Memory Management
- [ ] Automatic memory extraction
- [ ] Memory importance scoring
- [ ] Memory editing
- [ ] Memory deletion
- [ ] Memory pinning
- [ ] Memory priority
- [ ] Memory source tracking
- [ ] Memory timestamps
- [ ] Memory history
- [ ] Memory search
- [ ] Memory filtering
- [ ] Memory viewer

### Memory Retrieval
- [ ] Relevance-based recall
- [ ] Recency-aware recall
- [ ] Importance-aware recall
- [ ] Relationship-aware recall
- [ ] Story-state-aware recall
- [ ] Memory deduplication
- [ ] Memory conflict handling
- [ ] Context-budget enforcement

### Memory Quality
- [ ] Memory consistency checks
- [ ] Stale-memory detection
- [ ] Contradiction detection
- [ ] Memory correction
- [ ] Memory summarization
- [ ] Long-session stress testing

---

## Prompt & Context System

### Prompt Management
- [ ] Prompt preview
- [ ] Prompt inspector
- [ ] Context inspector
- [ ] Prompt section visibility
- [ ] Prompt token estimation
- [ ] Context usage indicator
- [ ] Prompt debugging tools
- [ ] Prompt template management

### Context Sources
- [ ] System instructions
- [ ] Character context
- [ ] Story context
- [ ] World Info
- [ ] Relationship state
- [ ] Story state
- [ ] Quest state
- [ ] Memory timeline
- [ ] Retrieved memories
- [ ] Recent conversation
- [ ] Starting scenario

### Context Debugging
- [ ] Show which memories were recalled
- [ ] Show which lore entries triggered
- [ ] Show active Story state
- [ ] Show active Character state
- [ ] Show selected scenario
- [ ] Show selected avatar
- [ ] Show token budget
- [ ] Show omitted context
- [ ] Explain structured state changes without exposing chain-of-thought

---

## Model & Generation System

### Model Profiles
- [ ] Model profiles
- [ ] Creative roleplay preset
- [ ] Long-story preset
- [ ] Fast-chat preset
- [ ] Custom generation presets
- [ ] Per-Character model settings
- [ ] Per-Story model settings
- [ ] Per-Session model overrides

### Generation Controls
- [ ] Temperature
- [ ] Top-p
- [ ] Top-k
- [ ] Max output tokens
- [ ] Context length
- [ ] Repetition controls
- [ ] Length guidance
- [ ] Response style controls

### Provider Management
- [ ] Provider profiles
- [ ] Provider connection testing
- [ ] Provider health status
- [ ] Provider fallback
- [ ] Provider-specific settings
- [ ] Model availability detection
- [ ] Model capability metadata

---

## Import & Export

### Character Import
- [ ] Character Card PNG import
- [ ] Character Card JSON import
- [ ] Tavern V2 compatibility
- [ ] Tavern V3 compatibility
- [ ] Embedded lorebook import
- [ ] Import validation
- [ ] Import preview
- [ ] Import field mapping
- [ ] Import conflict resolution
- [ ] Import error recovery
- [ ] Bulk Character import

### Character Export
- [ ] Character JSON export
- [ ] Character PNG export
- [ ] Tavern V2-compatible export
- [ ] Tavern V3-compatible export
- [ ] Lorebook export
- [ ] Bulk Character export

### Story Import / Export
- [ ] Story JSON export
- [ ] Story JSON import
- [ ] Portable Story package
- [ ] Story Character references
- [ ] Character snapshot inclusion
- [ ] Story asset inclusion
- [ ] Story validation
- [ ] Story import conflict resolution
- [ ] Bulk Story export/import

---

## Library & Discovery

### Local Library
- [ ] Character library
- [ ] Story library
- [ ] Session library
- [ ] Recent Characters
- [ ] Recent Stories
- [ ] Recent Sessions
- [ ] Favorites
- [ ] Collections
- [ ] Folders
- [ ] Tags
- [ ] Custom categories

### Search
- [ ] Global search
- [ ] Character search
- [ ] Story search
- [ ] Session search
- [ ] Tag search
- [ ] Advanced filtering
- [ ] Search by creator
- [ ] Search by metadata
- [ ] Search by recently updated
- [ ] Search by recently played

### Discovery
- [ ] Recommended Characters
- [ ] Recommended Stories
- [ ] Popular Characters
- [ ] Popular Stories
- [ ] Recently added
- [ ] Featured content
- [ ] Similar Characters
- [ ] Similar Stories

---

## Sharing & Community

### Sharing
- [ ] Share Character
- [ ] Share Story
- [ ] Share Story variant
- [ ] Share session
- [ ] Shareable local packages
- [ ] Character attribution
- [ ] Story attribution
- [ ] Source/provenance tracking

### Forking
- [ ] Fork Character
- [ ] Fork Story
- [ ] Fork Story from checkpoint
- [ ] Preserve attribution
- [ ] Track original source
- [ ] Show fork lineage

### Community Features
- [ ] Public Character library
- [ ] Public Story library
- [ ] Creator profiles
- [ ] Likes
- [ ] Ratings
- [ ] Comments
- [ ] Follows
- [ ] Discovery feed
- [ ] Content reporting
- [ ] Moderation tools

---

## UI / UX Quality of Life

### Navigation
- [ ] Global command palette
- [ ] Global search
- [ ] Keyboard shortcuts
- [ ] Quick-create Character
- [ ] Quick-create Story
- [ ] Quick-start Session
- [ ] Recently used navigation

### Chat UX
- [ ] Message editing
- [ ] Message regeneration
- [ ] Message deletion
- [ ] Message retry
- [ ] Copy message
- [ ] Conversation search
- [ ] Conversation bookmarks
- [ ] Conversation notes
- [ ] OOC messaging controls
- [ ] Character avatar switching
- [ ] Story state visibility controls

### Accessibility
- [ ] Keyboard navigation
- [ ] Screen-reader support
- [ ] Focus management
- [ ] Reduced-motion support
- [ ] Contrast improvements
- [ ] Font-size controls
- [ ] Accessible dialogs
- [ ] Accessible selection states

### Responsive UI
- [ ] Tablet layout
- [ ] Mobile layout
- [ ] Mobile chat controls
- [ ] Responsive Story Editor
- [ ] Responsive Card Editor
- [ ] Touch-friendly controls

### Reliability
- [ ] Autosave
- [ ] Draft recovery
- [ ] Offline-safe local state
- [ ] Crash recovery
- [ ] Failed-generation recovery
- [ ] Network/provider retry
- [ ] Clear error states
- [ ] Data integrity checks

---

## Visual Novel / Presentation Features

### Scene Presentation
- [ ] Scene backgrounds
- [ ] Character portraits
- [ ] Character expressions
- [ ] Character positioning
- [ ] CG images
- [ ] Scene transitions
- [ ] Visual effects
- [ ] Screen effects
- [ ] Ambient effects

### Audio
- [ ] Background music
- [ ] Ambient audio
- [ ] Sound effects
- [ ] Per-scene audio
- [ ] Audio controls
- [ ] Audio asset management

### Voice
- [ ] TTS integration
- [ ] Character voice profiles
- [ ] Per-character voice settings
- [ ] Voice generation queue
- [ ] Voice playback controls
- [ ] Local TTS adapter
- [ ] Cloud TTS adapter

### Presentation Modes
- [ ] Chat mode
- [ ] Visual novel mode
- [ ] Narrator mode
- [ ] Director / GM mode
- [ ] Full-screen story mode
- [ ] Cinematic scene mode

---

## Image Generation

### Image Generation
- [ ] Image generation adapter
- [ ] Local image generation support
- [ ] ComfyUI integration
- [ ] Scene image generation
- [ ] Character portrait generation
- [ ] Expression generation
- [ ] Situation image generation
- [ ] Image generation presets

### Image Management
- [ ] Session image gallery
- [ ] Story image gallery
- [ ] Character image gallery
- [ ] Image metadata
- [ ] Image regeneration
- [ ] Image variation
- [ ] Image deletion
- [ ] Image export
- [ ] Image asset reuse

---

## AI-Assisted Authoring

### Character Creation
- [ ] AI character generator
- [ ] AI personality generator
- [ ] AI speech-style generator
- [ ] AI avatar prompt generator
- [ ] AI character consistency checker

### Story Creation
- [ ] AI story premise generator
- [ ] AI world builder
- [ ] AI NPC generator
- [ ] AI relationship generator
- [ ] AI scene generator
- [ ] AI quest generator
- [ ] AI branching-path generator
- [ ] AI ending generator

### Editing Assistance
- [ ] Rewrite Character field
- [ ] Expand Story premise
- [ ] Improve scene description
- [ ] Generate missing lore
- [ ] Detect contradictory lore
- [ ] Detect inconsistent Character behavior
- [ ] Suggest Story state updates

---

## Advanced Story Simulation

### World Simulation
- [ ] Dynamic world events
- [ ] Time progression
- [ ] Day/night cycle
- [ ] Calendar system
- [ ] Location state
- [ ] Faction state
- [ ] NPC schedules
- [ ] World state changes

### NPC Simulation
- [ ] Persistent NPC goals
- [ ] NPC knowledge
- [ ] NPC memory
- [ ] NPC relationships
- [ ] NPC schedules
- [ ] NPC autonomous actions
- [ ] Background NPC events

### Narrative Logic
- [ ] Conditional dialogue
- [ ] Conditional scenes
- [ ] Conditional quests
- [ ] Dynamic objectives
- [ ] Dynamic encounters
- [ ] Route locking/unlocking
- [ ] Multiple endings
- [ ] Hidden routes
- [ ] Secret flags
- [ ] Story completion tracking

---

## Developer / Power User Tools

### Debugging
- [ ] Prompt inspector
- [ ] Context inspector
- [ ] Memory inspector
- [ ] State inspector
- [ ] Relationship inspector
- [ ] Quest/state debugger
- [ ] Scene debugger
- [ ] Session debugger
- [ ] Provider diagnostics
- [ ] Token usage diagnostics

### Data Tools
- [ ] Database backup
- [ ] Database restore
- [ ] Data integrity checker
- [ ] Data migration tools
- [ ] JSON viewer
- [ ] JSON editor
- [ ] Raw card inspector
- [ ] Raw Story inspector

### Extensibility
- [ ] Plugin architecture
- [ ] Extension API
- [ ] Custom prompt hooks
- [ ] Custom memory providers
- [ ] Custom model adapters
- [ ] Custom image adapters
- [ ] Custom TTS adapters
- [ ] Custom export formats
- [ ] Custom UI extensions

---

## Privacy & Local-First Features

- [ ] One-click database backup
- [ ] Automatic backup rotation
- [ ] Backup restore UI
- [ ] Data export
- [ ] Data deletion tools
- [ ] Local-only mode indicator
- [ ] Provider privacy indicators
- [ ] Per-provider data warnings
- [ ] Local asset storage controls
- [ ] Data directory configuration
- [ ] Portable data directory support

---

## Packaging & Distribution

- [ ] Docker Compose setup
- [ ] One-command setup
- [ ] Windows setup
- [ ] Linux setup
- [ ] macOS setup
- [ ] Native desktop wrapper
- [ ] Tauri application
- [ ] Portable build
- [ ] Automatic updates
- [ ] Version migration tooling
- [ ] First-run setup wizard

---

## Future / Experimental

- [ ] Multi-character simultaneous conversations
- [ ] Group roleplay
- [ ] Narrator + Character hybrid mode
- [ ] AI Director
- [ ] AI Dungeon Master
- [ ] Dynamic character spawning
- [ ] Dynamic NPC generation
- [ ] Shared world instances
- [ ] Multiplayer / collaborative Stories
- [ ] Story co-authoring
- [ ] Live Story events
- [ ] Procedural world generation
- [ ] Procedural quest generation
- [ ] Procedural character generation
- [ ] Mod support
- [ ] Community mod browser

---

## Feature Quality Gates

Before considering a major feature complete:

- [ ] Existing Character Cards remain compatible
- [ ] Existing Story Cards remain compatible
- [ ] Existing Sessions remain loadable
- [ ] Feature has stable IDs where persistent entities are involved
- [ ] Feature does not duplicate state unnecessarily
- [ ] Feature respects "Playime owns memory and state"
- [ ] Feature uses the canonical prompt assembly pipeline
- [ ] Feature follows local-first architecture
- [ ] Feature has appropriate automated tests
- [ ] Feature has failure/error handling
- [ ] Feature has documentation
- [ ] Feature is reflected in `CLAUDE.md`
- [ ] Feature is reflected in `PLAYIME_ROADMAP.md`
- [ ] Feature is reflected in `PLAYIME_CHECKLIST.md`
- [ ] Feature does not introduce unnecessary provider lock-in
- [ ] Feature does not complicate the default play path unnecessarily

---

## Backlog Notes

Use this section to record architectural decisions, dependencies, and ideas that should be revisited before implementation.

- [ ] Review backlog periodically against the current roadmap
- [ ] Move selected features into the main roadmap before implementation
- [ ] Remove features that conflict with Playime's local-first/product direction
- [ ] Record major architecture decisions in the project checklist

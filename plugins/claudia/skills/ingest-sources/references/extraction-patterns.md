# Extraction Patterns by Source Type

Reference guide for the ingest-sources skill. Shows per-source-type extraction examples and field mappings.

---

## Meeting Transcripts

**Detection:** `.md` or `.txt` files with participant names, timestamps, or speaker labels.

**Extraction schema:**
```
entities:
  - Look for speaker names (e.g., "Sarah:", "John Smith said")
  - Detect organizations mentioned by name
  - Note project or product names

facts:
  - Decisions made ("We agreed to...")
  - Preferences stated ("Sarah prefers async")
  - Status updates ("Migration is 80% complete")
  - Technical details ("Using PostgreSQL 16 with pgvector")

commitments:
  - Promises: "I'll send the proposal by Friday"
  - Action items: "ACTION: Review the contract"
  - Deadlines: any date + person + deliverable

relationships:
  - Person works at Organization
  - Person manages/reports to Person
  - Person is contact for Project
```

**Importance scoring:**
| Content Type | Typical Importance |
|---|---|
| Commitment with deadline | 0.9 |
| Decision | 0.8 |
| Stated preference | 0.7 |
| Status update | 0.5 |
| General discussion | 0.3 |

---

## Email Threads

**Detection:** Content with email headers (From:, To:, Subject:, Date:) or forwarded message markers.

**Extraction schema:**
```
entities:
  - From/To/CC addresses (extract names AND emails)
  - Companies in email domains
  - People mentioned in body

facts:
  - Requests made
  - Information shared
  - Decisions communicated
  - Deadlines set

commitments:
  - Replies promised ("I'll get back to you")
  - Deliverables mentioned ("Attaching the draft")
  - Follow-ups needed
```

**Email-specific rules:**
- Thread order matters: later emails may override earlier statements
- CC'd people are lower-importance entities than From/To
- Forwarded content has the original author as the source, not the forwarder
- Signatures contain contact info worth extracting (title, phone, company)

---

## Documents / PDFs

**Detection:** `.pdf` files, formal structure with headers/sections, or content with legal/business formatting.

**Extraction schema:**
```
entities:
  - Named parties (in contracts, proposals, reports)
  - Companies and organizations
  - Products or services mentioned

facts:
  - Terms and conditions
  - Financial figures (pricing, budgets)
  - Dates and deadlines
  - Specifications or requirements

commitments:
  - Deliverables listed
  - Payment terms
  - Milestones with dates
```

**Document-specific rules:**
- Headers and section titles indicate topic structure
- Tables often contain the most extractable data
- Footer/header content is usually metadata, not content
- Version numbers and dates indicate currency

---

## Research Notes

**Detection:** Mixed content without clear source type, or content explicitly labeled as research/notes.

**Extraction schema:**
```
entities:
  - Companies researched
  - Products or technologies evaluated
  - People referenced

facts:
  - Findings ("Company X raised Series B at $50M")
  - Comparisons ("Tool A is faster but Tool B has better docs")
  - Opinions or assessments with attribution

relationships:
  - Competitive relationships between companies
  - Technology dependencies
  - Market connections
```

---

## Slack / Chat Exports

**Detection:** Message format with timestamps, usernames, and channel indicators.

**Extraction schema:**
```
entities:
  - Usernames (may need mapping to real names)
  - Channels (indicate topic context)
  - External links shared

facts:
  - Decisions made in threads
  - Links shared with context
  - Questions asked (may indicate knowledge gaps)

commitments:
  - "I'll handle this"
  - Emoji reactions on action items (checkmark = claimed)
  - Thread conclusions
```

**Chat-specific rules:**
- Emoji reactions can indicate agreement or assignment
- Thread context is important: a message in isolation may be misleading
- Pinned messages are higher importance
- Channel name provides topic context

---

## CRM / Structured Exports

**Detection:** CSV, JSON, or structured records with consistent field names.

**Extraction schema:**
```
entities:
  - Each record is typically one entity (contact, deal, company)
  - Field names map to entity attributes

facts:
  - Field values become facts about the entity
  - Status fields indicate current state
  - Date fields indicate timeline

relationships:
  - Foreign key references (company_id, contact_id)
  - Role fields ("Account Manager: Jane Smith")
```

**Structured data rules:**
- Preserve field names as fact categories
- Map status values to Claudia's attention system where applicable
- Date fields should include timezone if available
- Empty fields should be skipped, not stored as "unknown"

---

## The `dedicated_to` Field

Across all source types, assess whether a source is primarily ABOUT a specific entity:

| Signal | dedicated_to value |
|---|---|
| Meeting named after a person ("Call with Sarah") | That person |
| Email thread about one topic/person | The main subject |
| Document is a proposal for one client | That client |
| Research focused on one company | That company |
| General notes with many topics | None (leave empty) |

This field is critical for the Dedicated Source Rule: any entity with 2+ dedicated sources must appear proportionally in the final output.

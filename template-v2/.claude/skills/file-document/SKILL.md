---
name: file-document
description: Store a document, email, or text for future reference with entity linking and provenance.
---

# File Document

Store any document, email, or text for future reference with proper entity linking and provenance tracking.

## Usage

`/file-document` or natural language:
- "Save this email"
- "File this for later"
- "Keep this document"
- "Store this transcript"

## When to Use

This command is for ad-hoc document capture. Use it when:
- User shares an email they want to preserve
- User pastes content they want to reference later
- User uploads a document (PDF, contract, proposal)
- User shares research or web content worth keeping
- Anything the user might want to cite or review later

**Note:** For meeting transcripts specifically, use `/capture-meeting` which includes extraction.

## Quick Flow

### 1. Identify the Content

Ask if not obvious:
- "What is this? (email, document, transcript, research, other)"
- "Who is this about or from?"

### 2. Gather Metadata

```
Determine:
├── source_type: gmail, transcript, upload, capture
├── filename: YYYY-MM-DD-[entity]-[topic].md
├── about: [list of entity names mentioned]
└── summary: One-line description
```

### 3. File It

```
Call memory.file with:
├── content: The FULL raw text (never summarize)
├── filename: Descriptive name
├── source_type: gmail | transcript | upload | capture
├── summary: Brief description
├── about: [entity names]
```

### 4. Confirm

```
**Filed**

**File:** [filename]
**Location:** [storage path]
**Linked to:** [entity names]
**Summary:** [one-line summary]

The document is now searchable and linked to [entities].
You can find it later with:
- "Show me documents about [entity]"
- "Find the email from [person]"
- memory.documents(entity="[name]")
```

## Source Types

| Type | Use When | Example |
|------|----------|---------|
| `gmail` | Email content | "Here's an email from Sarah..." |
| `transcript` | Meeting notes/recordings | "Notes from today's call..." |
| `upload` | PDFs, contracts, formal docs | "Here's the contract..." |
| `capture` | Research, web content, misc | "I found this article..." |

## File Routing

Documents are automatically routed to entity-aware folders:

```
If about a person:
  people/sarah-chen/emails/2026-02-04-proposal.md
  people/sarah-chen/documents/2026-02-04-contract.pdf

If about an organization:
  clients/acme-corp/emails/2026-02-04-partnership.md

If about a project:
  projects/rebrand/documents/2026-02-04-brief.md

If no entity linked:
  general/documents/2026-02-04-misc.md
```

## Examples

### Email
```
User: "Here's an email from Jim about the partnership terms. Save it."

Call memory.file:
- content: [full email text]
- filename: "2026-02-04-jim-ferry-partnership.md"
- source_type: "gmail"
- summary: "Jim Ferry re: partnership terms and next steps"
- about: ["Jim Ferry"]

Response:
"Filed Jim's email about partnership terms.
Saved to: people/jim-ferry/emails/2026-02-04-partnership.md
You can find it later by asking about Jim's documents."
```

### Research
```
User: "Here's some info I found about competitor pricing. Keep this."

Call memory.file:
- content: [research text]
- filename: "2026-02-04-competitor-pricing-research.md"
- source_type: "capture"
- summary: "Competitor pricing analysis notes"
- about: [] (or project name if relevant)

Response:
"Filed your competitor pricing research.
Saved to: general/documents/2026-02-04-competitor-pricing-research.md"
```

### Contract
```
User: "Save this contract from Acme Corp"

Call memory.file:
- content: [contract text]
- filename: "2026-02-04-acme-corp-contract.md"
- source_type: "upload"
- summary: "Service agreement with Acme Corp"
- about: ["Acme Corp"]

Response:
"Filed the Acme Corp contract.
Saved to: clients/acme-corp/documents/2026-02-04-contract.md"
```

## Linking to Memories

If you also extract facts from the document:

1. File the document first (get document_id from response)
2. Extract memories using memory.remember or memory.batch
3. Call memory.file again with `memory_ids=[...]` to link provenance

This creates the chain: memory -> document -> file on disk.

## Quality Checklist

- [ ] Full content preserved (not summarized)
- [ ] Descriptive filename with date
- [ ] Correct source_type selected
- [ ] Entities identified and linked
- [ ] Summary is accurate and searchable
- [ ] User knows where to find it later

## Tone

- Quick and efficient
- Confirm what was saved
- Tell them how to find it later
- Don't over-explain the system

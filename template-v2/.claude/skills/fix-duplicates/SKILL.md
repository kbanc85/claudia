---
name: fix-duplicates
description: Find and merge duplicate entities. Use when user says "clean up duplicates", "merge these people", "fix duplicate entities", "dedupe my contacts", or when you notice potential duplicates during conversation.
---

# Fix Duplicates

Find and merge duplicate entities in the memory system. Duplicates happen when the same person, project, or organization gets stored under slightly different names.

## Triggers

- User says "find duplicates", "clean up duplicates", "dedupe"
- User says "merge [name] with [name]"
- User says "[Name] and [Other Name] are the same person"
- You notice similar names during a conversation (e.g., "John Smith" and "Jon Smith")

## Workflow

### Step 1: Find Potential Duplicates

Search for entities with similar names using `memory.search_entities`:

```
memory.search_entities(query="*", limit=100)
```

Then compare names using these heuristics:
- Exact prefix match (first 5+ characters)
- Levenshtein distance <= 2 for short names
- Same first name + similar last name
- Abbreviations (Bob/Robert, Mike/Michael, Liz/Elizabeth)
- Missing middle names or initials

Present candidates grouped by type (person, project, organization).

### Step 2: Present Candidates to User

Format:

```
Found potential duplicates:

**People:**
1. "John Smith" (ID: 42) and "Jon Smith" (ID: 87)
   - First has 12 memories, second has 3

2. "Michael Chen" (ID: 23) and "Mike Chen" (ID: 56)
   - First has 8 memories, second has 5

**Projects:**
1. "Website Redesign" (ID: 101) and "Website Re-design" (ID: 145)

Which would you like to merge? (e.g., "merge 1" or "merge all people")
```

### Step 3: Execute Merge

When user confirms, call `memory.merge_entities`:

```
memory.merge_entities(source_id=87, target_id=42, reason="Duplicate detected - same person with name variant")
```

**Important:** Always merge the entity with fewer memories INTO the one with more memories. The target entity keeps its name and attributes; the source's name becomes an alias.

### Step 4: Confirm Results

After merge:

```
Merged "Jon Smith" into "John Smith"
- 3 memories reassigned
- 2 relationships updated
- "Jon Smith" added as alias

"John Smith" now has 15 memories total.
```

## Direct Merge Request

When user explicitly says "merge X with Y":

1. Search for both entities by name
2. Show what you found and confirm which is which
3. Ask which should be the primary (or recommend based on memory count)
4. Execute merge
5. Confirm result

## Edge Cases

### No Duplicates Found
```
I searched through your entities and didn't find any obvious duplicates. Your memory is looking clean!
```

### Ambiguous Match
```
I found multiple entities that could be matches:
- "John Smith" (ID: 42) - works at Acme Corp
- "John Smith" (ID: 67) - consultant
- "Jon Smith" (ID: 87) - no additional context

These might be different people. Can you clarify which are the same?
```

### Entity Not Found
```
I couldn't find an entity named "[name]". Here are similar ones:
- [list of similar names]
```

## Never

- Merge without user confirmation
- Assume two entities are the same just because they share a first name
- Delete the original entity (merges soft-delete the source)
- Lose any memories or relationships in the merge

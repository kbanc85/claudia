---
name: follow-up-draft
description: Create a post-meeting thank-you or follow-up email with key points and next steps.
disable-model-invocation: true
argument-hint: "[person name]"
---

# Follow-Up Draft

Draft a post-meeting follow-up or thank-you email.

## Usage
`/follow-up-draft [person name]`

## Context Gathering

### Check Existing Context
1. Recent meeting notes with this person
2. Their file in `people/`
3. Any commitments made
4. Topics discussed

### Ask If Needed
- "What was the meeting about?"
- "Any specific commitments to confirm?"
- "Anything particular to emphasize?"

## Output Format

```
## Follow-Up Email: [Person Name]
### Re: [Meeting/Topic]

---

**To:** [Name] <[email if known]>
**Subject:** [Suggested subject line]

---

Hi [Name],

[Opening - thank them, reference the conversation]

[Key points or takeaways from discussion]

[Confirm any commitments - what you'll do, what they mentioned]

[Next steps or call to action]

[Warm close]

[Your name]

---

**Notes:**
- [Any context about tone or relationship]
- [Timing suggestion for sending]

**Before sending:**
- [ ] Confirm accuracy of commitments mentioned
- [ ] Check tone matches relationship
- [ ] Verify email address

---

Ready to send? Let me know if you want adjustments.
```

## Email Types

### Thank You + Recap
After a productive meeting:
- Express appreciation
- Summarize key points
- Confirm next steps

### Commitment Confirmation
When specific promises were made:
- Clearly state what each party committed to
- Include deadlines
- Suggest follow-up touchpoint

### Continued Discussion
When more conversation needed:
- Reference where you left off
- Propose next steps
- Offer availability

### Re-engagement
After time has passed:
- Reference last interaction
- Share relevant update
- Propose reconnection

## Tone Calibration

Based on relationship:
- **New relationship:** More formal, clear context
- **Established:** Warmer, can be briefer
- **Client:** Professional, confirm value
- **Peer:** Conversational, mutual respect
- **Mentor/Senior:** Appreciative, respectful

Based on meeting outcome:
- **Positive:** Enthusiastic, forward-looking
- **Neutral:** Professional, clear next steps
- **Challenging:** Diplomatic, solution-focused

## Length

- Keep short: 100-200 words
- Get to the point quickly
- One clear ask or next step
- Easy to respond to

## Common Patterns

### "Great to meet you"
For first-time meetings, new relationships

### "Thanks for your time"
For meetings where they gave valuable input

### "Following up on our discussion"
For ongoing conversations

### "Wanted to confirm"
When specific commitments need clarity

## Safety Note

I'll draft the email and show it to you. I will NOT send anything without your explicit approval.

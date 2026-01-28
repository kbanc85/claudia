# Contributing to Claudia

Thanks for your interest in contributing to Claudia! This guide will help you get started.

## Ways to Contribute

### Reporting Bugs

Found a bug? [Open an issue](https://github.com/kbanc85/claudia/issues/new) with:

- **Description**: What happened vs. what you expected
- **Steps to reproduce**: Minimal steps to trigger the bug
- **Environment**: OS, Node.js version, Python version, Claude Code version
- **Logs**: Output from `~/.claudia/diagnose.sh` if memory-related

### Suggesting Features

Have an idea? [Open an issue](https://github.com/kbanc85/claudia/issues/new) with:

- **Problem**: What friction are you experiencing?
- **Proposal**: How would you solve it?
- **Alternatives**: Other approaches you considered

We prioritize features that fit Claudia's philosophy: relationship-centric, minimal by default, evolves from actual needs.

### Submitting Code

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make changes**: Follow the code style guidelines below
4. **Test**: Verify your changes work in a fresh installation
5. **Commit**: Use conventional commits (see below)
6. **Push**: `git push origin feature/your-feature-name`
7. **Open a PR**: Describe what changed and why

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claudia.git
cd claudia

# Test the installer locally
node bin/index.js ../test-install

# Start Claude Code in the test directory
cd ../test-install
claude
```

### Testing Changes

**For template changes** (`template-v2/`):
- Create a fresh installation and verify onboarding flow
- Delete `context/me.md` to re-trigger onboarding
- Test affected commands and skills

**For installer changes** (`bin/index.js`):
- Test with various options: `node bin/index.js [dir] --verbose`
- Test memory system installation flow
- Verify `.mcp.json.example` is copied correctly

**For memory daemon changes** (`memory-daemon/`):
- Run `~/.claudia/diagnose.sh` after changes
- Test with `curl http://localhost:3848/health`
- Check logs: `tail -f ~/.claudia/daemon-stderr.log`

## Code Style

### General Principles

- **Keep it simple**: Avoid over-engineering
- **Stay consistent**: Match existing patterns in the codebase
- **Document intent**: Comments explain why, not what

### JavaScript (Installer)

- ES modules (`import`/`export`)
- No external dependencies (keep the installer lightweight)
- Error messages should be actionable

### Markdown (Skills, Commands, Templates)

- No em dashes (Claudia's personality guideline)
- Direct, clear language
- Sections start with `##` headers

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new /weekly-pipeline command
fix: memory daemon fails on Python 3.13
docs: update troubleshooting for Ollama
refactor: simplify archetype detection logic
```

Scope examples: `installer`, `memory`, `skills`, `commands`, `template`

## Pull Request Guidelines

- **One feature/fix per PR**: Easier to review and revert if needed
- **Update CHANGELOG.md**: Add your changes under `## Unreleased`
- **Update README if needed**: New features should be documented
- **Respond to feedback**: We may ask questions or request changes

## Architecture Overview

```
claudia/
├── bin/index.js           ← NPM installer CLI
├── template-v2/           ← Current template (this is what gets copied)
│   ├── CLAUDE.md          ← Claudia's core identity
│   └── .claude/
│       ├── commands/      ← User-invocable workflows (/morning-brief, etc.)
│       ├── skills/        ← Proactive behaviors (onboarding, pattern recognition)
│       └── rules/         ← Global principles
└── memory-daemon/         ← Python server for persistent memory
```

**Key concepts**:
- **Skills** activate based on context (proactive)
- **Commands** are explicitly invoked by users (reactive)
- **Rules** are always active behavioral principles
- **Context files** store state (people, commitments, patterns)

## Questions?

- Open a [Discussion](https://github.com/kbanc85/claudia/discussions) for questions
- Tag [@kamilbanc](https://x.com/kamilbanc) for quick responses
- Check existing [Issues](https://github.com/kbanc85/claudia/issues) for similar problems

Thanks for helping make Claudia better!

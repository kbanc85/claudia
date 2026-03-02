#!/usr/bin/env python3
"""Cross-platform pre-compact hook for Claudia.

Runs lightweight consolidation and injects context advisory before compaction.
"""

import json
import os
import shutil
import subprocess

# Run lightweight decay if claudia is available
claudia_bin = shutil.which("claudia")
if claudia_bin:
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    try:
        subprocess.run(
            [claudia_bin, "memory", "consolidate", "--lightweight",
             "--project-dir", project_dir],
            capture_output=True, timeout=10
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

print(json.dumps({
    "additionalContext": (
        "Context compaction advisory: If important information was discussed recently, "
        "ensure it has been stored. Check: (1) Commitments: run claudia memory save "
        "--type commitment for any promises not yet stored. (2) People: run claudia memory "
        "entities create for anyone discussed in detail. (3) Relationships: run claudia memory "
        "relate for connections mentioned. (4) Buffer: run claudia memory session buffer with "
        "a summary if recent exchanges weren't buffered. With 1M context, compaction is "
        "less frequent, but proactive capture remains good practice."
    )
}))

#!/usr/bin/env python3
"""Cross-platform pre-compact hook for Claudia.

Flushes WAL and injects context advisory before compaction.
"""

import json
from urllib.request import urlopen
from urllib.error import URLError

# Signal daemon to flush WAL
try:
    urlopen("http://localhost:3848/flush", timeout=3)
except (URLError, OSError, TimeoutError):
    pass

print(json.dumps({
    "additionalContext": (
        "Context compaction advisory: If important information was discussed recently, "
        "ensure it has been stored. Check: (1) Commitments: call memory.remember with "
        "type='commitment' for any promises not yet stored. (2) People: call memory.entity "
        "for anyone discussed in detail. (3) Relationships: call memory.relate for "
        "connections mentioned. (4) Buffer: call memory.buffer_turn with a summary if "
        "recent exchanges weren't buffered. With 1M context, compaction is less frequent, "
        "but proactive capture remains good practice."
    )
}))

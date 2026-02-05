"""
Audit Service for Claudia Memory System

Tracks all operations for debugging, accountability, and compliance.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..database import get_db

logger = logging.getLogger(__name__)


class AuditService:
    """Track all memory system operations"""

    def __init__(self):
        self.db = get_db()

    def log(
        self,
        operation: str,
        details: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        user_initiated: bool = False,
        entity_id: Optional[int] = None,
        memory_id: Optional[int] = None,
    ) -> int:
        """
        Log an operation to the audit trail.

        Args:
            operation: Operation type (e.g., 'entity_merge', 'memory_correct', 'entity_delete')
            details: JSON-serializable details about the operation
            session_id: Optional session identifier
            user_initiated: Whether this was triggered by user action
            entity_id: Optional entity ID this operation affects
            memory_id: Optional memory ID this operation affects

        Returns:
            Audit log entry ID
        """
        entry_id = self.db.insert(
            "audit_log",
            {
                "timestamp": datetime.utcnow().isoformat(),
                "operation": operation,
                "details": json.dumps(details) if details else None,
                "session_id": session_id,
                "user_initiated": 1 if user_initiated else 0,
                "entity_id": entity_id,
                "memory_id": memory_id,
            },
        )
        logger.debug(f"Audit logged: {operation} (id={entry_id})")
        return entry_id

    def get_recent(
        self,
        limit: int = 50,
        operation: Optional[str] = None,
        entity_id: Optional[int] = None,
        memory_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get recent audit entries.

        Args:
            limit: Maximum entries to return
            operation: Filter by operation type
            entity_id: Filter by entity ID
            memory_id: Filter by memory ID

        Returns:
            List of audit entries (newest first)
        """
        sql = "SELECT * FROM audit_log WHERE 1=1"
        params = []

        if operation:
            sql += " AND operation = ?"
            params.append(operation)

        if entity_id:
            sql += " AND entity_id = ?"
            params.append(entity_id)

        if memory_id:
            sql += " AND memory_id = ?"
            params.append(memory_id)

        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = self.db.execute(sql, tuple(params), fetch=True) or []
        return [
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "operation": row["operation"],
                "details": json.loads(row["details"]) if row["details"] else None,
                "session_id": row["session_id"],
                "user_initiated": bool(row["user_initiated"]),
                "entity_id": row["entity_id"],
                "memory_id": row["memory_id"],
            }
            for row in rows
        ]

    def get_entity_history(self, entity_id: int) -> List[Dict[str, Any]]:
        """
        Get all audit entries affecting an entity.

        Args:
            entity_id: Entity ID to trace

        Returns:
            List of audit entries (oldest first)
        """
        rows = self.db.execute(
            """
            SELECT * FROM audit_log
            WHERE entity_id = ?
            ORDER BY timestamp ASC
            """,
            (entity_id,),
            fetch=True,
        ) or []
        return [
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "operation": row["operation"],
                "details": json.loads(row["details"]) if row["details"] else None,
                "session_id": row["session_id"],
                "user_initiated": bool(row["user_initiated"]),
            }
            for row in rows
        ]

    def get_memory_history(self, memory_id: int) -> List[Dict[str, Any]]:
        """
        Get all audit entries affecting a memory.

        Args:
            memory_id: Memory ID to trace

        Returns:
            List of audit entries (oldest first)
        """
        rows = self.db.execute(
            """
            SELECT * FROM audit_log
            WHERE memory_id = ?
            ORDER BY timestamp ASC
            """,
            (memory_id,),
            fetch=True,
        ) or []
        return [
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "operation": row["operation"],
                "details": json.loads(row["details"]) if row["details"] else None,
                "session_id": row["session_id"],
                "user_initiated": bool(row["user_initiated"]),
            }
            for row in rows
        ]


# Global service instance
_service: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """Get or create the global audit service"""
    global _service
    if _service is None:
        _service = AuditService()
    return _service


# Convenience functions
def audit_log(operation: str, **kwargs) -> int:
    """Log an operation to the audit trail"""
    return get_audit_service().log(operation, **kwargs)


def get_audit_recent(limit: int = 50, **kwargs) -> List[Dict[str, Any]]:
    """Get recent audit entries"""
    return get_audit_service().get_recent(limit, **kwargs)


def get_entity_audit_history(entity_id: int) -> List[Dict[str, Any]]:
    """Get all audit entries affecting an entity"""
    return get_audit_service().get_entity_history(entity_id)


def get_memory_audit_history(memory_id: int) -> List[Dict[str, Any]]:
    """Get all audit entries affecting a memory"""
    return get_audit_service().get_memory_history(memory_id)

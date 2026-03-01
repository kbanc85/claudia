"""
Configuration management for Claudia Memory System

Loads settings from ~/.claudia/config.json with sensible defaults.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class MemoryConfig:
    """Configuration for the Claudia Memory System"""

    # Database settings
    db_path: Path = field(default_factory=lambda: Path.home() / ".claudia" / "memory" / "claudia.db")

    # Embedding settings
    ollama_host: str = "http://localhost:11434"
    embedding_model: str = "all-minilm:l6-v2"
    embedding_dimensions: int = 384

    # Language model settings (for cognitive tools like ingest/classify)
    # Set to empty string "" to disable cognitive tools entirely
    language_model: str = "qwen3:4b"

    # Decay and consolidation settings
    decay_rate_daily: float = 0.995  # Importance multiplier per day
    min_importance_threshold: float = 0.1  # Below this, excluded from default search
    consolidation_interval_hours: int = 6
    pattern_detection_interval_hours: int = 24

    # Search settings
    recency_half_life_days: int = 30
    max_recall_results: int = 50
    vector_weight: float = 0.50  # Weight for vector similarity in ranking
    importance_weight: float = 0.25  # Weight for importance score
    recency_weight: float = 0.10  # Weight for recency
    fts_weight: float = 0.15  # Weight for FTS5 full-text search match

    # Memory merging
    similarity_merge_threshold: float = 0.92  # Cosine similarity threshold for merging
    enable_memory_merging: bool = True  # Toggle memory merging during consolidation

    # Verification
    verify_interval_minutes: int = 60  # How often to run background verification
    verify_batch_size: int = 20  # Max memories to verify per run

    # RRF (Reciprocal Rank Fusion) scoring
    rrf_k: int = 60  # Smoothing parameter for RRF formula (1/(k+rank))
    enable_rrf: bool = True  # When False, use legacy weighted-sum scoring
    graph_proximity_enabled: bool = True  # Include graph proximity as a ranking signal

    # LLM consolidation (sleep-time processing)
    llm_consolidation_batch_size: int = 10  # Memories to LLM-improve per run
    enable_llm_consolidation: bool = True  # Enable LLM-powered overnight consolidation

    # Graph retrieval enhancements
    enable_entity_summaries: bool = True  # Generate hierarchical entity summaries during consolidation
    entity_summary_min_memories: int = 5  # Minimum memories to generate a summary for an entity
    entity_summary_max_age_days: int = 7  # Regenerate summaries older than this
    enable_auto_dedupe: bool = True  # Embedding-based automatic entity deduplication during consolidation
    auto_dedupe_threshold: float = 0.90  # Cosine similarity threshold for auto-dedupe suggestions
    graph_proximity_weight: float = 0.15  # Weight for graph proximity signal in RRF (additive)

    # Document storage
    files_base_dir: Path = field(default_factory=lambda: Path.home() / ".claudia" / "files")
    document_dormant_days: int = 90
    document_archive_days: int = 180

    # Health check
    health_port: int = 3848

    # Backup settings
    backup_retention_count: int = 3  # Number of rolling backups to keep
    enable_pre_consolidation_backup: bool = True  # Auto-backup before consolidation
    backup_daily_retention: int = 7   # Keep 7 daily labeled backups (1 week)
    backup_weekly_retention: int = 4  # Keep 4 weekly labeled backups (1 month)

    # Retention settings (data cleanup during consolidation)
    audit_log_retention_days: int = 90
    prediction_retention_days: int = 30
    turn_buffer_retention_days: int = 60
    metrics_retention_days: int = 90

    # Vault sync settings (Obsidian integration)
    vault_base_dir: Path = field(default_factory=lambda: Path.home() / ".claudia" / "vault")
    vault_sync_enabled: bool = True
    vault_name: str = "claudia-vault"  # Obsidian vault name (for deep link URIs)

    # Obsidian REST API (optional, for bidirectional communication)
    obsidian_rest_api_port: int = 27124
    obsidian_rest_api_enabled: bool = False

    # Vault layout (PARA-inspired structure)
    vault_layout: str = "para"           # Vault organization style (only "para" for now)

    # Daemon settings
    log_path: Path = field(default_factory=lambda: Path.home() / ".claudia" / "daemon.log")

    @classmethod
    def load(cls, project_id: Optional[str] = None) -> "MemoryConfig":
        """Load configuration from ~/.claudia/config.json, with defaults.

        Args:
            project_id: Optional project identifier for database isolation.
                        When provided, the database path is overridden to
                        ~/.claudia/memory/{project_id}.db for per-project isolation.
        """
        config_path = Path.home() / ".claudia" / "config.json"
        config = cls()

        if config_path.exists():
            try:
                with open(config_path) as f:
                    data = json.load(f)

                # Update config with loaded values
                if "db_path" in data:
                    config.db_path = Path(data["db_path"])
                if "ollama_host" in data:
                    config.ollama_host = data["ollama_host"]
                if "embedding_model" in data:
                    config.embedding_model = data["embedding_model"]
                if "embedding_dimensions" in data:
                    config.embedding_dimensions = data["embedding_dimensions"]
                if "language_model" in data:
                    config.language_model = data["language_model"]
                if "decay_rate_daily" in data:
                    config.decay_rate_daily = data["decay_rate_daily"]
                if "min_importance_threshold" in data:
                    config.min_importance_threshold = data["min_importance_threshold"]
                if "consolidation_interval_hours" in data:
                    config.consolidation_interval_hours = data["consolidation_interval_hours"]
                if "pattern_detection_interval_hours" in data:
                    config.pattern_detection_interval_hours = data["pattern_detection_interval_hours"]
                if "max_recall_results" in data:
                    config.max_recall_results = data["max_recall_results"]
                if "vector_weight" in data:
                    config.vector_weight = data["vector_weight"]
                if "importance_weight" in data:
                    config.importance_weight = data["importance_weight"]
                if "recency_weight" in data:
                    config.recency_weight = data["recency_weight"]
                if "fts_weight" in data:
                    config.fts_weight = data["fts_weight"]
                if "health_port" in data:
                    config.health_port = data["health_port"]
                if "backup_retention_count" in data:
                    config.backup_retention_count = data["backup_retention_count"]
                if "enable_pre_consolidation_backup" in data:
                    config.enable_pre_consolidation_backup = data["enable_pre_consolidation_backup"]
                if "backup_daily_retention" in data:
                    config.backup_daily_retention = data["backup_daily_retention"]
                if "backup_weekly_retention" in data:
                    config.backup_weekly_retention = data["backup_weekly_retention"]
                if "audit_log_retention_days" in data:
                    config.audit_log_retention_days = data["audit_log_retention_days"]
                if "prediction_retention_days" in data:
                    config.prediction_retention_days = data["prediction_retention_days"]
                if "turn_buffer_retention_days" in data:
                    config.turn_buffer_retention_days = data["turn_buffer_retention_days"]
                if "metrics_retention_days" in data:
                    config.metrics_retention_days = data["metrics_retention_days"]
                if "log_path" in data:
                    config.log_path = Path(data["log_path"])
                if "vault_base_dir" in data:
                    config.vault_base_dir = Path(data["vault_base_dir"])
                if "vault_sync_enabled" in data:
                    config.vault_sync_enabled = data["vault_sync_enabled"]
                if "vault_name" in data:
                    config.vault_name = data["vault_name"]
                if "obsidian_rest_api_port" in data:
                    config.obsidian_rest_api_port = data["obsidian_rest_api_port"]
                if "obsidian_rest_api_enabled" in data:
                    config.obsidian_rest_api_enabled = data["obsidian_rest_api_enabled"]
                if "vault_layout" in data:
                    config.vault_layout = data["vault_layout"]
                if "enable_entity_summaries" in data:
                    config.enable_entity_summaries = data["enable_entity_summaries"]
                if "entity_summary_min_memories" in data:
                    config.entity_summary_min_memories = data["entity_summary_min_memories"]
                if "entity_summary_max_age_days" in data:
                    config.entity_summary_max_age_days = data["entity_summary_max_age_days"]
                if "enable_auto_dedupe" in data:
                    config.enable_auto_dedupe = data["enable_auto_dedupe"]
                if "auto_dedupe_threshold" in data:
                    config.auto_dedupe_threshold = data["auto_dedupe_threshold"]
                if "graph_proximity_weight" in data:
                    config.graph_proximity_weight = data["graph_proximity_weight"]

            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Could not load config from {config_path}: {e}. Using defaults.")

        # DATABASE PATH OVERRIDE: Explicit database path takes highest priority
        # Set CLAUDIA_DB_OVERRIDE to a full .db path to force that database
        # Used by /databases use command to switch between databases
        db_override = os.environ.get("CLAUDIA_DB_OVERRIDE")
        if db_override:
            config.db_path = Path(db_override)
            # Don't create directories for override paths - they should already exist
        # DEMO MODE: Use isolated demo database (never touches real data)
        # Set CLAUDIA_DEMO_MODE=1 in environment to use demo database
        elif os.environ.get("CLAUDIA_DEMO_MODE") == "1":
            if project_id:
                # Workspace-specific demo database
                config.db_path = Path.home() / ".claudia" / "demo" / f"{project_id}.db"
            else:
                # Global demo database
                config.db_path = Path.home() / ".claudia" / "demo" / "claudia-demo.db"
            config.db_path.parent.mkdir(parents=True, exist_ok=True)
        # Override database path for project isolation
        # This ensures each project gets its own isolated database
        elif project_id:
            config.db_path = Path.home() / ".claudia" / "memory" / f"{project_id}.db"
            config.db_path.parent.mkdir(parents=True, exist_ok=True)
        else:
            # Default path
            config.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Ensure log directory exists
        config.log_path.parent.mkdir(parents=True, exist_ok=True)

        config._validate()
        return config

    def _validate(self):
        """Validate config values are within acceptable bounds."""
        if not (0 < self.decay_rate_daily <= 1.0):
            logger.warning(f"decay_rate_daily={self.decay_rate_daily} out of range (0,1], using default 0.995")
            self.decay_rate_daily = 0.995
        if self.max_recall_results < 1 or self.max_recall_results > 200:
            logger.warning(f"max_recall_results={self.max_recall_results} out of range [1,200], using default 50")
            self.max_recall_results = 50
        if self.min_importance_threshold < 0 or self.min_importance_threshold > 1.0:
            logger.warning(f"min_importance_threshold={self.min_importance_threshold} out of range [0,1], using default 0.1")
            self.min_importance_threshold = 0.1
        weights = self.vector_weight + self.importance_weight + self.recency_weight + self.fts_weight
        if abs(weights - 1.0) > 0.01:
            logger.warning(f"Ranking weights sum to {weights:.3f}, not 1.0. Results may be skewed.")
        if self.backup_retention_count < 1:
            logger.warning(f"backup_retention_count={self.backup_retention_count} below minimum, using 1")
            self.backup_retention_count = 1
        if self.backup_daily_retention < 1:
            logger.warning(f"backup_daily_retention={self.backup_daily_retention} below minimum, using 1")
            self.backup_daily_retention = 1
        if self.backup_weekly_retention < 1:
            logger.warning(f"backup_weekly_retention={self.backup_weekly_retention} below minimum, using 1")
            self.backup_weekly_retention = 1
        for attr in ("audit_log_retention_days", "prediction_retention_days", "turn_buffer_retention_days", "metrics_retention_days"):
            val = getattr(self, attr)
            if val < 1:
                logger.warning(f"{attr}={val} below minimum, using 1")
                setattr(self, attr, 1)
        common_dims = {384, 512, 768, 1024, 1536}
        if self.embedding_dimensions not in common_dims:
            logger.warning(
                f"embedding_dimensions={self.embedding_dimensions} is not a common value "
                f"({sorted(common_dims)}). Verify this matches your embedding model's output."
            )
        if not (0.0 <= self.auto_dedupe_threshold <= 1.0):
            logger.warning(f"auto_dedupe_threshold={self.auto_dedupe_threshold} out of range [0,1], using default 0.90")
            self.auto_dedupe_threshold = 0.90
        if self.entity_summary_min_memories < 1:
            logger.warning(f"entity_summary_min_memories={self.entity_summary_min_memories} below minimum, using 1")
            self.entity_summary_min_memories = 1
        if self.entity_summary_max_age_days < 1:
            logger.warning(f"entity_summary_max_age_days={self.entity_summary_max_age_days} below minimum, using 1")
            self.entity_summary_max_age_days = 1
        if not (0.0 <= self.graph_proximity_weight <= 1.0):
            logger.warning(f"graph_proximity_weight={self.graph_proximity_weight} out of range [0,1], using default 0.15")
            self.graph_proximity_weight = 0.15

    def save(self) -> None:
        """Save current configuration to ~/.claudia/config.json"""
        config_path = Path.home() / ".claudia" / "config.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "db_path": str(self.db_path),
            "ollama_host": self.ollama_host,
            "embedding_model": self.embedding_model,
            "embedding_dimensions": self.embedding_dimensions,
            "language_model": self.language_model,
            "decay_rate_daily": self.decay_rate_daily,
            "min_importance_threshold": self.min_importance_threshold,
            "consolidation_interval_hours": self.consolidation_interval_hours,
            "pattern_detection_interval_hours": self.pattern_detection_interval_hours,
            "max_recall_results": self.max_recall_results,
            "vector_weight": self.vector_weight,
            "importance_weight": self.importance_weight,
            "recency_weight": self.recency_weight,
            "fts_weight": self.fts_weight,
            "health_port": self.health_port,
            "backup_retention_count": self.backup_retention_count,
            "enable_pre_consolidation_backup": self.enable_pre_consolidation_backup,
            "audit_log_retention_days": self.audit_log_retention_days,
            "prediction_retention_days": self.prediction_retention_days,
            "turn_buffer_retention_days": self.turn_buffer_retention_days,
            "metrics_retention_days": self.metrics_retention_days,
            "log_path": str(self.log_path),
            "vault_base_dir": str(self.vault_base_dir),
            "vault_sync_enabled": self.vault_sync_enabled,
            "vault_name": self.vault_name,
            "obsidian_rest_api_port": self.obsidian_rest_api_port,
            "obsidian_rest_api_enabled": self.obsidian_rest_api_enabled,
            "vault_layout": self.vault_layout,
            "enable_entity_summaries": self.enable_entity_summaries,
            "entity_summary_min_memories": self.entity_summary_min_memories,
            "entity_summary_max_age_days": self.entity_summary_max_age_days,
            "enable_auto_dedupe": self.enable_auto_dedupe,
            "auto_dedupe_threshold": self.auto_dedupe_threshold,
            "graph_proximity_weight": self.graph_proximity_weight,
            "backup_daily_retention": self.backup_daily_retention,
            "backup_weekly_retention": self.backup_weekly_retention,
        }

        with open(config_path, "w") as f:
            json.dump(data, f, indent=2)


# Global config instance and project context
_config: Optional[MemoryConfig] = None
_project_id: Optional[str] = None


def set_project_id(project_id: Optional[str]) -> None:
    """Set the project ID for database isolation.

    This must be called before any access to get_config() to ensure
    the correct project-specific database path is used.

    Args:
        project_id: Hash of the project directory path, or None for global database.
    """
    global _config, _project_id

    # If project_id changes, invalidate cached config so it reloads
    if project_id != _project_id:
        _config = None
        _project_id = project_id


def get_config() -> MemoryConfig:
    """Get or load the global configuration.

    The configuration is project-aware. If set_project_id() was called,
    the database path will be project-specific. Otherwise, the global
    claudia.db is used for backward compatibility.
    """
    global _config, _project_id
    if _config is None:
        _config = MemoryConfig.load(project_id=_project_id)
    return _config

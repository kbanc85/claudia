"""
Configuration management for Claudia Memory System

Loads settings from ~/.claudia/config.json with sensible defaults.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


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
    max_recall_results: int = 20
    vector_weight: float = 0.50  # Weight for vector similarity in ranking
    importance_weight: float = 0.25  # Weight for importance score
    recency_weight: float = 0.10  # Weight for recency
    fts_weight: float = 0.15  # Weight for FTS5 full-text search match

    # Health check
    health_port: int = 3848

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
                if "log_path" in data:
                    config.log_path = Path(data["log_path"])

            except (json.JSONDecodeError, IOError) as e:
                # Use defaults on error
                pass

        # Override database path for project isolation
        # This ensures each project gets its own isolated database
        if project_id:
            config.db_path = Path.home() / ".claudia" / "memory" / f"{project_id}.db"

        # Ensure directories exist
        config.db_path.parent.mkdir(parents=True, exist_ok=True)
        config.log_path.parent.mkdir(parents=True, exist_ok=True)

        return config

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
            "log_path": str(self.log_path),
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

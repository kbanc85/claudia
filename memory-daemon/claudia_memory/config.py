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

    # Decay and consolidation settings
    decay_rate_daily: float = 0.995  # Importance multiplier per day
    min_importance_threshold: float = 0.1  # Below this, excluded from default search
    consolidation_interval_hours: int = 6
    pattern_detection_interval_hours: int = 24

    # Search settings
    max_recall_results: int = 20
    vector_weight: float = 0.6  # Weight for vector similarity in ranking
    importance_weight: float = 0.3  # Weight for importance score
    recency_weight: float = 0.1  # Weight for recency

    # Health check
    health_port: int = 3848

    # Daemon settings
    log_path: Path = field(default_factory=lambda: Path.home() / ".claudia" / "daemon.log")

    @classmethod
    def load(cls) -> "MemoryConfig":
        """Load configuration from ~/.claudia/config.json, with defaults"""
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
                if "health_port" in data:
                    config.health_port = data["health_port"]
                if "log_path" in data:
                    config.log_path = Path(data["log_path"])

            except (json.JSONDecodeError, IOError) as e:
                # Use defaults on error
                pass

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
            "decay_rate_daily": self.decay_rate_daily,
            "min_importance_threshold": self.min_importance_threshold,
            "consolidation_interval_hours": self.consolidation_interval_hours,
            "pattern_detection_interval_hours": self.pattern_detection_interval_hours,
            "max_recall_results": self.max_recall_results,
            "health_port": self.health_port,
            "log_path": str(self.log_path),
        }

        with open(config_path, "w") as f:
            json.dump(data, f, indent=2)


# Global config instance
_config: Optional[MemoryConfig] = None


def get_config() -> MemoryConfig:
    """Get or load the global configuration"""
    global _config
    if _config is None:
        _config = MemoryConfig.load()
    return _config

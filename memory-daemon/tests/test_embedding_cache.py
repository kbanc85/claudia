"""Tests for embedding LRU cache and model version tracking."""

import logging
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from claudia_memory.embeddings import EmbeddingCache, EmbeddingService


class TestEmbeddingCache:
    """Tests for the EmbeddingCache LRU implementation."""

    def test_cache_miss_returns_none(self):
        cache = EmbeddingCache(maxsize=10)
        assert cache.get("hello") is None

    def test_cache_put_and_get(self):
        cache = EmbeddingCache(maxsize=10)
        embedding = [0.1, 0.2, 0.3]
        cache.put("hello", embedding)
        result = cache.get("hello")
        assert result == [0.1, 0.2, 0.3]

    def test_cache_hit_miss_counters(self):
        cache = EmbeddingCache(maxsize=10)
        cache.get("miss1")  # miss
        cache.get("miss2")  # miss
        cache.put("hit", [1.0])
        cache.get("hit")    # hit
        cache.get("hit")    # hit

        stats = cache.stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 2
        assert stats["size"] == 1
        assert stats["maxsize"] == 10

    def test_lru_eviction(self):
        cache = EmbeddingCache(maxsize=3)
        cache.put("a", [1.0])
        cache.put("b", [2.0])
        cache.put("c", [3.0])

        # Cache is full. Adding d should evict a (least recently used).
        cache.put("d", [4.0])

        assert cache.get("a") is None  # evicted
        assert cache.get("b") == [2.0]
        assert cache.get("c") == [3.0]
        assert cache.get("d") == [4.0]

    def test_lru_access_refreshes_position(self):
        cache = EmbeddingCache(maxsize=3)
        cache.put("a", [1.0])
        cache.put("b", [2.0])
        cache.put("c", [3.0])

        # Access 'a' to refresh it
        cache.get("a")

        # Adding d should evict b (now the LRU), not a
        cache.put("d", [4.0])

        assert cache.get("a") == [1.0]  # refreshed, not evicted
        assert cache.get("b") is None    # evicted
        assert cache.get("d") == [4.0]

    def test_put_existing_key_refreshes(self):
        cache = EmbeddingCache(maxsize=3)
        cache.put("a", [1.0])
        cache.put("b", [2.0])
        cache.put("c", [3.0])

        # Re-put 'a' should move it to end
        cache.put("a", [1.5])

        cache.put("d", [4.0])  # should evict 'b', not 'a'
        assert cache.get("a") == [1.5]
        assert cache.get("b") is None

    def test_stats_reports_size(self):
        cache = EmbeddingCache(maxsize=100)
        for i in range(5):
            cache.put(f"text_{i}", [float(i)])

        stats = cache.stats()
        assert stats["size"] == 5
        assert stats["maxsize"] == 100


class TestEmbeddingServiceCache:
    """Tests for cache integration in EmbeddingService."""

    def test_embed_sync_uses_cache(self):
        """embed_sync should return cached result on second call."""
        svc = EmbeddingService.__new__(EmbeddingService)
        svc._cache = EmbeddingCache(maxsize=10)
        svc._available = True
        svc.host = "http://localhost:11434"
        svc.model = "all-minilm:l6-v2"
        svc.dimensions = 3
        svc._sync_client = None
        svc._model_mismatch = False

        fake_embedding = [0.1, 0.2, 0.3]

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"embedding": fake_embedding}
        mock_client.post.return_value = mock_response

        with patch.object(svc, '_get_sync_client', return_value=mock_client):
            # First call: hits Ollama
            result1 = svc.embed_sync("test text")
            assert result1 == fake_embedding
            assert mock_client.post.call_count == 1

            # Second call: should hit cache, not Ollama
            result2 = svc.embed_sync("test text")
            assert result2 == fake_embedding
            assert mock_client.post.call_count == 1  # no additional call

        stats = svc._cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1


class TestModelConsistency:
    """Tests for embedding model version tracking."""

    def test_model_mismatch_warning(self, caplog):
        """Changing the model should log a warning and set _model_mismatch."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from claudia_memory.database import Database
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            # Seed the _meta table with a different model
            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
                ("old-model:v1",),
            )

            svc = EmbeddingService.__new__(EmbeddingService)
            svc.model = "new-model:v2"
            svc._model_mismatch = False
            svc._cache = EmbeddingCache()

            with patch("claudia_memory.database.get_db", return_value=database):
                with caplog.at_level(logging.WARNING, logger="claudia_memory.embeddings"):
                    svc._check_model_consistency()

            assert svc._model_mismatch is True
            assert "Embedding model changed" in caplog.text
            database.close()

    def test_first_use_stores_model(self):
        """First use should store the model in _meta without warning."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from claudia_memory.database import Database
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            svc = EmbeddingService.__new__(EmbeddingService)
            svc.model = "all-minilm:l6-v2"
            svc._model_mismatch = False
            svc._cache = EmbeddingCache()

            with patch("claudia_memory.database.get_db", return_value=database):
                svc._check_model_consistency()

            assert svc._model_mismatch is False

            # Verify it was stored
            rows = database.execute(
                "SELECT value FROM _meta WHERE key = 'embedding_model'",
                fetch=True,
            )
            assert rows[0]["value"] == "all-minilm:l6-v2"
            database.close()

    def test_same_model_no_mismatch(self):
        """Same model should not trigger mismatch."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from claudia_memory.database import Database
            db_path = Path(tmpdir) / "test.db"
            database = Database(db_path)
            database.initialize()

            database.execute(
                "INSERT OR REPLACE INTO _meta (key, value) VALUES ('embedding_model', ?)",
                ("all-minilm:l6-v2",),
            )

            svc = EmbeddingService.__new__(EmbeddingService)
            svc.model = "all-minilm:l6-v2"
            svc._model_mismatch = False
            svc._cache = EmbeddingCache()

            with patch("claudia_memory.database.get_db", return_value=database):
                svc._check_model_consistency()

            assert svc._model_mismatch is False
            database.close()

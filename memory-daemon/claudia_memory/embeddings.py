"""
Embedding service for Claudia Memory System

Connects to local Ollama for generating text embeddings.
Uses all-minilm:l6-v2 model (384 dimensions) for semantic search.

Includes retry logic to wait for Ollama to start (e.g., after system boot).
"""

import asyncio
import logging
import time
from typing import List, Optional

import httpx

from .config import get_config

logger = logging.getLogger(__name__)

# Retry configuration for waiting on Ollama
OLLAMA_RETRY_ATTEMPTS = 5
OLLAMA_RETRY_DELAY = 2  # seconds


class EmbeddingService:
    """Generate embeddings using local Ollama"""

    def __init__(self, host: Optional[str] = None, model: Optional[str] = None):
        config = get_config()
        self.host = host or config.ollama_host
        self.model = model or config.embedding_model
        self.dimensions = config.embedding_dimensions
        self._client: Optional[httpx.AsyncClient] = None
        self._sync_client: Optional[httpx.Client] = None
        self._available: Optional[bool] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    def _get_sync_client(self) -> httpx.Client:
        """Get or create sync HTTP client"""
        if self._sync_client is None:
            self._sync_client = httpx.Client(timeout=30.0)
        return self._sync_client

    async def _wait_for_ollama(self, max_retries: int = OLLAMA_RETRY_ATTEMPTS, delay: float = OLLAMA_RETRY_DELAY) -> bool:
        """Wait for Ollama to be available with retries (async)"""
        client = await self._get_client()
        for i in range(max_retries):
            try:
                response = await client.get(f"{self.host}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    logger.debug(f"Ollama available after {i + 1} attempt(s)")
                    return True
            except Exception:
                pass
            if i < max_retries - 1:
                logger.debug(f"Waiting for Ollama (attempt {i + 1}/{max_retries})...")
                await asyncio.sleep(delay)
        return False

    def _wait_for_ollama_sync(self, max_retries: int = OLLAMA_RETRY_ATTEMPTS, delay: float = OLLAMA_RETRY_DELAY) -> bool:
        """Wait for Ollama to be available with retries (sync)"""
        client = self._get_sync_client()
        for i in range(max_retries):
            try:
                response = client.get(f"{self.host}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    logger.debug(f"Ollama available after {i + 1} attempt(s)")
                    return True
            except Exception:
                pass
            if i < max_retries - 1:
                logger.debug(f"Waiting for Ollama (attempt {i + 1}/{max_retries})...")
                time.sleep(delay)
        return False

    async def is_available(self) -> bool:
        """Check if Ollama is running and model is available.

        Uses retry logic to wait for Ollama if it's starting up (e.g., after boot).
        """
        if self._available is not None:
            return self._available

        # Wait for Ollama to be available (with retries)
        if not await self._wait_for_ollama():
            logger.warning("Ollama not available after retries. Vector search disabled.")
            self._available = False
            return self._available

        try:
            client = await self._get_client()
            response = await client.get(f"{self.host}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                # Check if our model is available (with or without tag)
                self._available = any(
                    self.model in m or self.model.split(":")[0] in m
                    for m in models
                )
                if not self._available:
                    logger.warning(
                        f"Embedding model '{self.model}' not found. "
                        f"Available models: {models}. "
                        f"Pull it with: ollama pull {self.model}"
                    )
            else:
                self._available = False
        except Exception as e:
            logger.warning(f"Ollama error: {e}")
            self._available = False

        return self._available

    def is_available_sync(self) -> bool:
        """Synchronous check if Ollama is available.

        Uses retry logic to wait for Ollama if it's starting up (e.g., after boot).
        """
        if self._available is not None:
            return self._available

        # Wait for Ollama to be available (with retries)
        if not self._wait_for_ollama_sync():
            logger.warning("Ollama not available after retries. Vector search disabled.")
            self._available = False
            return self._available

        try:
            client = self._get_sync_client()
            response = client.get(f"{self.host}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                self._available = any(
                    self.model in m or self.model.split(":")[0] in m
                    for m in models
                )
            else:
                self._available = False
        except Exception as e:
            logger.warning(f"Ollama error: {e}")
            self._available = False

        return self._available

    async def embed(self, text: str) -> Optional[List[float]]:
        """Generate embedding for a single text"""
        if not await self.is_available():
            return None

        try:
            client = await self._get_client()
            response = await client.post(
                f"{self.host}/api/embeddings",
                json={"model": self.model, "prompt": text},
            )

            if response.status_code == 200:
                data = response.json()
                embedding = data.get("embedding", [])
                if len(embedding) == self.dimensions:
                    return embedding
                else:
                    logger.warning(
                        f"Unexpected embedding dimensions: {len(embedding)} "
                        f"(expected {self.dimensions})"
                    )
            else:
                logger.error(f"Embedding request failed: {response.status_code}")

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")

        return None

    def embed_sync(self, text: str) -> Optional[List[float]]:
        """Synchronous embedding generation"""
        if not self.is_available_sync():
            return None

        try:
            client = self._get_sync_client()
            response = client.post(
                f"{self.host}/api/embeddings",
                json={"model": self.model, "prompt": text},
            )

            if response.status_code == 200:
                data = response.json()
                embedding = data.get("embedding", [])
                if len(embedding) == self.dimensions:
                    return embedding
            else:
                logger.error(f"Embedding request failed: {response.status_code}")

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")

        return None

    async def embed_batch(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Generate embeddings for multiple texts"""
        # Ollama doesn't have native batch support, so we parallelize
        tasks = [self.embed(text) for text in texts]
        return await asyncio.gather(*tasks)

    def embed_batch_sync(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Synchronous batch embedding"""
        return [self.embed_sync(text) for text in texts]

    async def close(self) -> None:
        """Close the HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None
        if self._sync_client:
            self._sync_client.close()
            self._sync_client = None


# Global embedding service instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the global embedding service"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


async def embed(text: str) -> Optional[List[float]]:
    """Convenience function for embedding text"""
    return await get_embedding_service().embed(text)


def embed_sync(text: str) -> Optional[List[float]]:
    """Convenience function for synchronous embedding"""
    return get_embedding_service().embed_sync(text)

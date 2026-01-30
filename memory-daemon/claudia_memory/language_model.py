"""
Language model service for Claudia Memory System

Connects to local Ollama for text generation tasks like entity extraction,
memory classification, and structured data parsing from raw text.

Uses Qwen3-4B by default (configurable). Follows the same architecture as
embeddings.py: HTTP calls to Ollama, retry logic, graceful degradation.

When no language model is available, all cognitive tools return a fallback
response so Claude handles the work directly (current behavior).
"""

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from .config import get_config

logger = logging.getLogger(__name__)

# Retry configuration (same as embeddings)
OLLAMA_RETRY_ATTEMPTS = 3
OLLAMA_RETRY_DELAY = 2  # seconds

# Generation defaults
DEFAULT_TEMPERATURE = 0.1  # Low temp for deterministic extraction
DEFAULT_TIMEOUT = 120.0  # Longer timeout for generation vs embeddings


class LanguageModelService:
    """Generate text using a local Ollama language model."""

    def __init__(self, host: Optional[str] = None, model: Optional[str] = None):
        config = get_config()
        self.host = host or config.ollama_host
        self.model = model or config.language_model
        self._client: Optional[httpx.AsyncClient] = None
        self._sync_client: Optional[httpx.Client] = None
        self._available: Optional[bool] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
        return self._client

    def _get_sync_client(self) -> httpx.Client:
        if self._sync_client is None:
            self._sync_client = httpx.Client(timeout=DEFAULT_TIMEOUT)
        return self._sync_client

    async def is_available(self) -> bool:
        """Check if Ollama is running and the language model is pulled.

        Returns False (and disables the service) if:
        - No language model is configured
        - Ollama is not reachable
        - The configured model is not pulled
        """
        if self._available is not None:
            return self._available

        # No model configured means the user opted out
        if not self.model:
            logger.info("No language model configured. Cognitive tools disabled.")
            self._available = False
            return False

        # Check Ollama is reachable
        client = await self._get_client()
        for i in range(OLLAMA_RETRY_ATTEMPTS):
            try:
                response = await client.get(f"{self.host}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    break
            except Exception:
                pass
            if i < OLLAMA_RETRY_ATTEMPTS - 1:
                logger.debug(f"Waiting for Ollama (attempt {i + 1}/{OLLAMA_RETRY_ATTEMPTS})...")
                await asyncio.sleep(OLLAMA_RETRY_DELAY)
        else:
            logger.warning("Ollama not available. Cognitive tools disabled.")
            self._available = False
            return False

        # Check the model is pulled
        try:
            response = await client.get(f"{self.host}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                self._available = any(
                    self.model in m or self.model.split(":")[0] in m
                    for m in models
                )
                if not self._available:
                    logger.warning(
                        f"Language model '{self.model}' not found. "
                        f"Available: {models}. "
                        f"Pull it with: ollama pull {self.model}"
                    )
            else:
                self._available = False
        except Exception as e:
            logger.warning(f"Ollama model check error: {e}")
            self._available = False

        return self._available

    def is_available_sync(self) -> bool:
        """Synchronous availability check."""
        if self._available is not None:
            return self._available

        if not self.model:
            self._available = False
            return False

        client = self._get_sync_client()
        for i in range(OLLAMA_RETRY_ATTEMPTS):
            try:
                response = client.get(f"{self.host}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    break
            except Exception:
                pass
            if i < OLLAMA_RETRY_ATTEMPTS - 1:
                time.sleep(OLLAMA_RETRY_DELAY)
        else:
            self._available = False
            return False

        try:
            response = client.get(f"{self.host}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                self._available = any(
                    self.model in m or self.model.split(":")[0] in m
                    for m in models
                )
        except Exception:
            self._available = False

        return self._available

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = DEFAULT_TEMPERATURE,
        format_json: bool = False,
    ) -> Optional[str]:
        """Generate text using the local language model.

        Args:
            prompt: The user prompt to send
            system: Optional system prompt for task framing
            temperature: Sampling temperature (low = deterministic)
            format_json: If True, request JSON output from Ollama

        Returns:
            Generated text, or None if unavailable/failed
        """
        if not await self.is_available():
            return None

        try:
            client = await self._get_client()

            payload: Dict[str, Any] = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                },
            }
            if system:
                payload["system"] = system
            if format_json:
                payload["format"] = "json"

            response = await client.post(
                f"{self.host}/api/generate",
                json=payload,
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get("response", "")
                logger.debug(
                    f"LLM generation: {len(prompt)} chars in, {len(text)} chars out, "
                    f"model={self.model}"
                )
                return text
            else:
                logger.error(f"LLM generation failed: HTTP {response.status_code}")

        except httpx.TimeoutException:
            logger.warning(f"LLM generation timed out (model={self.model})")
        except Exception as e:
            logger.error(f"LLM generation error: {e}")

        return None

    def generate_sync(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = DEFAULT_TEMPERATURE,
        format_json: bool = False,
    ) -> Optional[str]:
        """Synchronous text generation."""
        if not self.is_available_sync():
            return None

        try:
            client = self._get_sync_client()

            payload: Dict[str, Any] = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                },
            }
            if system:
                payload["system"] = system
            if format_json:
                payload["format"] = "json"

            response = client.post(
                f"{self.host}/api/generate",
                json=payload,
            )

            if response.status_code == 200:
                return response.json().get("response", "")
            else:
                logger.error(f"LLM generation failed: HTTP {response.status_code}")

        except httpx.TimeoutException:
            logger.warning(f"LLM generation timed out (model={self.model})")
        except Exception as e:
            logger.error(f"LLM generation error: {e}")

        return None

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        if self._sync_client:
            self._sync_client.close()
            self._sync_client = None


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------
_language_model_service: Optional[LanguageModelService] = None


def get_language_model_service() -> LanguageModelService:
    global _language_model_service
    if _language_model_service is None:
        _language_model_service = LanguageModelService()
    return _language_model_service


async def generate(prompt: str, **kwargs) -> Optional[str]:
    """Convenience async wrapper."""
    return await get_language_model_service().generate(prompt, **kwargs)


def generate_sync(prompt: str, **kwargs) -> Optional[str]:
    """Convenience sync wrapper."""
    return get_language_model_service().generate_sync(prompt, **kwargs)

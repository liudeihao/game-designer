"""Image-generation adapter contract.

Add a vendor by implementing ``ImageAdapter`` and registering it in
``app.image.adapters``. The illustration service never talks to vendors
directly — it only calls ``generate_image_bytes``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from app.config import ImageResolvedEndpoint


@dataclass(frozen=True)
class AdapterInfo:
    id: str
    label: str
    base_url_hint: str
    model_hint: str
    auth_hint: str = ""


@runtime_checkable
class ImageAdapter(Protocol):
    info: AdapterInfo

    def generate(self, prompt: str, endpoint: ImageResolvedEndpoint) -> tuple[bytes, str]:
        """Return (image_bytes, extension)."""

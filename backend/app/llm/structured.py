"""Parse object-shaped JSON returned by language models."""

from __future__ import annotations

import json
import re
from typing import Any

_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def parse_json_object(content: str) -> dict[str, Any]:
    """Extract a JSON object, rejecting valid JSON values of other shapes."""
    if not content:
        return {}
    candidate = content.strip()
    fence = _JSON_FENCE.search(candidate)
    if fence:
        candidate = fence.group(1).strip()
    try:
        return _object(json.loads(candidate))
    except (TypeError, ValueError, json.JSONDecodeError):
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end <= start:
        return {}
    try:
        return _object(json.loads(candidate[start : end + 1]))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}

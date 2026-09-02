"""Health and LLM config routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import LLMConfigBody
from app.config import get_config, public_llm_config, update_llm_config

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "llm_configured": get_config().llm_configured}


@router.get("/api/config")
async def get_config_route():
    return {
        "llm": public_llm_config(),
        "llm_configured": get_config().llm_configured,
    }


@router.put("/api/config")
async def put_config_route(body: LLMConfigBody):
    data = body.model_dump(exclude_none=True)
    if "providers" in data and data["providers"] is not None:
        data["providers"] = [
            p if isinstance(p, dict) else p
            for p in data["providers"]
        ]
    update_llm_config(**data)
    return await get_config_route()

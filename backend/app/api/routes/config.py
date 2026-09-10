"""Health and LLM / image config routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import ConfigPutBody
from app.config import (
    get_config,
    public_image_config,
    public_llm_config,
    update_image_config,
    update_llm_config,
)

router = APIRouter()

_LLM_KEYS = {
    "providers",
    "active_provider_id",
    "model",
    "utility_provider_id",
    "utility_model",
    "base_url",
    "api_key",
    "available_models",
}


@router.get("/api/health")
async def health():
    cfg = get_config()
    return {
        "status": "ok",
        "llm_configured": cfg.llm_configured,
        "image_configured": cfg.image_configured,
    }


@router.get("/api/config")
async def get_config_route():
    cfg = get_config()
    return {
        "llm": public_llm_config(),
        "llm_configured": cfg.llm_configured,
        "image": public_image_config(),
        "image_configured": cfg.image_configured,
    }


@router.put("/api/config")
async def put_config_route(body: ConfigPutBody):
    data = body.model_dump(exclude_none=True)
    image = data.pop("image", None)
    llm_updates = {k: v for k, v in data.items() if k in _LLM_KEYS}
    if llm_updates:
        if "providers" in llm_updates and llm_updates["providers"] is not None:
            llm_updates["providers"] = [
                p if isinstance(p, dict) else p for p in llm_updates["providers"]
            ]
        update_llm_config(**llm_updates)
    if image is not None:
        if "providers" in image and image["providers"] is not None:
            image["providers"] = [
                p if isinstance(p, dict) else p for p in image["providers"]
            ]
        update_image_config(**image)
    return await get_config_route()

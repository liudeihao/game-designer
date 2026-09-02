"""Application configuration.

Settings are backed by a JSON file under the data directory so they can be
edited from the frontend at runtime. Environment variables act as initial defaults.

LLM access is modeled as multiple *providers* (Base URL + API Key + label),
each with its own list of models (id + optional context window / max output).
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

from app.model_presets import resolve_limits

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = Path(os.environ.get("GDW_DATA_DIR", BASE_DIR / "data"))
CONFIG_PATH = DATA_DIR / "config.json"


def data_dir() -> Path:
    """Runtime data directory. Tests patch this function to isolate disk writes."""
    return DATA_DIR

_lock = threading.Lock()


def _new_provider_id() -> str:
    return f"prov_{uuid.uuid4().hex[:10]}"


def _host_label(base_url: str) -> str:
    try:
        raw = (base_url or "").strip()
        if not raw:
            return ""
        host = urlparse(raw).hostname or ""
        return host.replace("api.", "").replace(".com", "").replace(".cn", "") or ""
    except Exception:
        return ""


class ModelSpec(BaseModel):
    """One selectable model on a provider, with optional window overrides."""

    id: str
    label: str = ""
    context_window: int = 0  # 0 = unset, fall back to the preset table
    max_output_tokens: int = 0

    @model_validator(mode="before")
    @classmethod
    def _accept_bare_string(cls, value: Any):
        if isinstance(value, str):
            return {"id": value.strip()}
        return value


class LLMProvider(BaseModel):
    """One OpenAI-compatible endpoint with a curated model list."""

    id: str = Field(default_factory=_new_provider_id)
    label: str = ""  # user-facing remark, e.g. "OpenAI" / "Kimi"
    base_url: str = ""
    api_key: str = ""
    models: list[ModelSpec] = Field(default_factory=list)

    def model_specs(self) -> list[ModelSpec]:
        seen: set[str] = set()
        out: list[ModelSpec] = []
        for item in self.models:
            spec = item if isinstance(item, ModelSpec) else ModelSpec.model_validate(item)
            name = (spec.id or "").strip()
            if name and name not in seen:
                seen.add(name)
                out.append(spec.model_copy(update={"id": name}))
        return out

    def cleaned_models(self) -> list[str]:
        return [spec.id for spec in self.model_specs()]

    def find_spec(self, model: str) -> Optional[ModelSpec]:
        mid = (model or "").strip()
        if not mid:
            return None
        for spec in self.model_specs():
            if spec.id == mid:
                return spec
        return None


class ResolvedEndpoint(BaseModel):
    """Concrete credentials + model used for a single LLM call."""

    provider_id: str = ""
    label: str = ""
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    context_window: int = 0
    max_output_tokens: int = 0


class CatalogEntry(BaseModel):
    """Flattened selectable model for the chat picker."""

    key: str  # f"{provider_id}::{model}"
    provider_id: str
    model: str
    label: str
    context_window: int = 0
    max_output_tokens: int = 0


class LLMConfig(BaseModel):
    """Multi-provider LLM configuration."""

    providers: list[LLMProvider] = Field(default_factory=list)
    active_provider_id: str = ""
    model: str = Field(default_factory=lambda: os.environ.get("OPENAI_MODEL", ""))
    utility_provider_id: str = ""
    utility_model: str = Field(default_factory=lambda: os.environ.get("OPENAI_UTILITY_MODEL", ""))
    # Deprecated: per-model windows live on ModelSpec. Kept so old config.json still loads.
    # migrate_legacy() copies a >0 value onto the active model, then callers should persist 0.
    context_window: int = Field(
        default_factory=lambda: int(os.environ.get("OPENAI_CONTEXT_WINDOW", "0") or 0)
    )

    # Legacy single-endpoint fields (migrated into providers on load).
    base_url: str = Field(default_factory=lambda: os.environ.get("OPENAI_BASE_URL", ""))
    api_key: str = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    available_models: list[str] = Field(default_factory=list)

    def migrate_legacy(self) -> LLMConfig:
        """Fold old base_url/api_key/available_models into providers if needed.

        Only migrates when the user (or env) actually configured an endpoint.
        A bare default model name must not invent a placeholder provider.
        """
        cfg = self
        if not cfg.providers:
            api_key = (cfg.api_key or "").strip() or os.environ.get("OPENAI_API_KEY", "")
            base_url = (cfg.base_url or "").strip() or os.environ.get("OPENAI_BASE_URL", "")
            model = (cfg.model or "").strip() or os.environ.get("OPENAI_MODEL", "")
            utility = (cfg.utility_model or "").strip() or os.environ.get("OPENAI_UTILITY_MODEL", "")

            # Require real endpoint credentials — do not auto-create an empty "Default".
            if api_key or base_url:
                models = list(cfg.available_models or [])
                for name in (model, utility):
                    n = (name or "").strip()
                    if n and n not in models:
                        models.append(n)

                host = (base_url or "").lower()
                if "openai.com" in host:
                    label = "OpenAI"
                elif "moonshot" in host or "kimi" in host:
                    label = "Kimi"
                elif "deepseek" in host:
                    label = "DeepSeek"
                elif "aliyun" in host or "dashscope" in host or "tongyi" in host:
                    label = "通义"
                else:
                    label = _host_label(base_url) if base_url else "自定义"

                prov = LLMProvider(
                    id=_new_provider_id(),
                    label=label,
                    base_url=base_url,
                    api_key=api_key,
                    models=models,
                )
                cfg = cfg.model_copy(
                    update={
                        "providers": [prov],
                        "active_provider_id": prov.id,
                        "model": model,
                        "utility_model": utility,
                        "api_key": api_key,
                        "base_url": base_url,
                        "available_models": [],
                    }
                )

        return cfg._migrate_global_context_window()

    def _migrate_global_context_window(self) -> LLMConfig:
        """Copy the deprecated global window onto the active model spec."""
        window = int(self.context_window or 0)
        if window <= 0 or not self.providers:
            return self
        active_id = (self.active_provider_id or "").strip()
        active_model = (self.model or "").strip()
        providers: list[LLMProvider] = []
        applied = False
        for prov in self.providers:
            specs = prov.model_specs()
            if not applied and active_model:
                match_provider = (not active_id) or prov.id == active_id
                if match_provider:
                    new_specs: list[ModelSpec] = []
                    for spec in specs:
                        if spec.id == active_model and spec.context_window <= 0:
                            new_specs.append(spec.model_copy(update={"context_window": window}))
                            applied = True
                        else:
                            new_specs.append(spec)
                    specs = new_specs
            providers.append(prov.model_copy(update={"models": specs}))
        return self.model_copy(update={"providers": providers, "context_window": 0})

    def catalog(self) -> list[CatalogEntry]:
        entries: list[CatalogEntry] = []
        for p in self.providers:
            label = (p.label or "").strip() or _host_label(p.base_url) or p.id
            for spec in p.model_specs():
                ctx, out = resolve_limits(
                    spec.id,
                    context_window=spec.context_window,
                    max_output_tokens=spec.max_output_tokens,
                )
                entries.append(
                    CatalogEntry(
                        key=f"{p.id}::{spec.id}",
                        provider_id=p.id,
                        model=spec.id,
                        label=label,
                        context_window=ctx,
                        max_output_tokens=out,
                    )
                )
        return entries

    def find_provider(self, provider_id: str) -> Optional[LLMProvider]:
        for p in self.providers:
            if p.id == provider_id:
                return p
        return None

    def find_spec(self, model: str, *, provider_id: str = "") -> Optional[ModelSpec]:
        """Locate a model spec. Prefer *provider_id*; else the first name match."""
        mid = (model or "").strip()
        if not mid:
            return None
        pid = (provider_id or "").strip()
        if pid:
            prov = self.find_provider(pid)
            if prov is not None:
                spec = prov.find_spec(mid)
                if spec is not None:
                    return spec
        for prov in self.providers:
            spec = prov.find_spec(mid)
            if spec is not None:
                return spec
        return None

    def _resolved_endpoint(self, prov: LLMProvider, mid: str) -> ResolvedEndpoint:
        spec = prov.find_spec(mid)
        ctx, out = resolve_limits(
            mid,
            context_window=spec.context_window if spec else 0,
            max_output_tokens=spec.max_output_tokens if spec else 0,
        )
        return ResolvedEndpoint(
            provider_id=prov.id,
            label=(prov.label or "").strip() or _host_label(prov.base_url),
            base_url=prov.base_url,
            api_key=prov.api_key,
            model=mid,
            context_window=ctx,
            max_output_tokens=out,
        )

    def resolve(self, *, utility: bool = False) -> Optional[ResolvedEndpoint]:
        """Resolve active (or utility) selection to concrete credentials."""
        if utility and (self.utility_model or "").strip():
            pid = (self.utility_provider_id or "").strip() or self.active_provider_id
            mid = self.utility_model.strip()
            # Prefer explicit utility provider; else search any provider that has the model.
            prov = self.find_provider(pid) if pid else None
            if prov is None or mid not in prov.cleaned_models():
                for p in self.providers:
                    if mid in p.cleaned_models():
                        prov = p
                        break
            if prov and (prov.api_key or "").strip() and mid:
                return self._resolved_endpoint(prov, mid)

        pid = (self.active_provider_id or "").strip()
        mid = (self.model or "").strip()
        prov = self.find_provider(pid) if pid else None
        if prov is None and mid:
            for p in self.providers:
                if mid in p.cleaned_models():
                    prov = p
                    break
        if not prov or not (prov.api_key or "").strip() or not mid:
            return None
        return self._resolved_endpoint(prov, mid)

    @property
    def is_configured(self) -> bool:
        return self.resolve(utility=False) is not None


class AppConfig(BaseModel):
    llm: LLMConfig = Field(default_factory=LLMConfig)

    @property
    def llm_configured(self) -> bool:
        """True when at least one usable LLM provider is configured."""
        return self.llm.is_configured


_config: AppConfig | None = None


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "projects").mkdir(parents=True, exist_ok=True)


def load_config() -> AppConfig:
    global _config
    with _lock:
        if _config is not None:
            return _config
        _ensure_dirs()
        if CONFIG_PATH.exists():
            try:
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                cfg = AppConfig.model_validate(data)
            except Exception:
                cfg = AppConfig()
        else:
            cfg = AppConfig()
        migrated = cfg.llm.migrate_legacy()
        if migrated is not cfg.llm:
            cfg = cfg.model_copy(update={"llm": migrated})
            CONFIG_PATH.write_text(
                json.dumps(cfg.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8"
            )
        _config = cfg
        return _config


def save_config(cfg: AppConfig) -> AppConfig:
    global _config
    with _lock:
        _ensure_dirs()
        CONFIG_PATH.write_text(
            json.dumps(cfg.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _config = cfg
        return _config


def get_config() -> AppConfig:
    return load_config()


def _with_preset_defaults(spec: ModelSpec) -> ModelSpec:
    ctx, out = resolve_limits(
        spec.id,
        context_window=spec.context_window,
        max_output_tokens=spec.max_output_tokens,
    )
    updates: dict[str, int] = {}
    if spec.context_window <= 0:
        updates["context_window"] = ctx
    if spec.max_output_tokens <= 0:
        updates["max_output_tokens"] = out
    return spec.model_copy(update=updates) if updates else spec


def _public_model(spec: ModelSpec) -> dict[str, Any]:
    ctx, out = resolve_limits(
        spec.id,
        context_window=spec.context_window,
        max_output_tokens=spec.max_output_tokens,
    )
    return {
        "id": spec.id,
        "label": spec.label,
        "context_window": spec.context_window if spec.context_window > 0 else ctx,
        "max_output_tokens": spec.max_output_tokens if spec.max_output_tokens > 0 else out,
    }


def _merge_providers(
    existing: list[LLMProvider], incoming: list[Any]
) -> list[LLMProvider]:
    by_id = {p.id: p for p in existing}
    result: list[LLMProvider] = []
    for raw in incoming:
        if isinstance(raw, LLMProvider):
            data = raw.model_dump()
        elif isinstance(raw, dict):
            data = dict(raw)
        else:
            continue
        pid = str(data.get("id") or "").strip() or _new_provider_id()
        data["id"] = pid
        old = by_id.get(pid)
        # Empty / missing api_key keeps the previous secret.
        key = data.get("api_key")
        if (key is None or str(key).strip() == "") and old is not None:
            data["api_key"] = old.api_key
        else:
            data["api_key"] = str(key or "")
        data["label"] = str(data.get("label") or "").strip()
        data["base_url"] = str(data.get("base_url") or "").strip()
        models_raw = data.get("models") or []
        if not isinstance(models_raw, list):
            models_raw = []
        prov = LLMProvider.model_validate({**data, "models": models_raw})
        filled = [_with_preset_defaults(spec) for spec in prov.model_specs()]
        result.append(prov.model_copy(update={"models": filled}))
    return result


def update_llm_config(**kwargs) -> AppConfig:
    cfg = get_config()
    updates = {k: v for k, v in kwargs.items() if v is not None}

    if "providers" in updates:
        updates["providers"] = _merge_providers(cfg.llm.providers, updates["providers"])

    llm = cfg.llm.model_copy(update=updates)

    # Keep active selection only if it still exists. Never invent a default provider.
    catalog = llm.catalog()
    keys = {e.key for e in catalog}
    active_key = f"{llm.active_provider_id}::{llm.model}"
    if llm.active_provider_id or llm.model:
        if active_key not in keys:
            match = next((e for e in catalog if e.model == llm.model), None)
            if match is not None:
                llm = llm.model_copy(
                    update={
                        "active_provider_id": match.provider_id,
                        "model": match.model,
                    }
                )
            else:
                llm = llm.model_copy(update={"active_provider_id": "", "model": ""})
    if (llm.utility_model or "").strip():
        u_key = f"{llm.utility_provider_id}::{llm.utility_model}"
        if u_key not in keys:
            match = next((e for e in catalog if e.model == llm.utility_model), None)
            if match:
                llm = llm.model_copy(update={"utility_provider_id": match.provider_id})
            else:
                llm = llm.model_copy(update={"utility_model": "", "utility_provider_id": ""})

    new_cfg = cfg.model_copy(update={"llm": llm})
    return save_config(new_cfg)


def public_llm_config() -> dict[str, Any]:
    """Safe config payload for the frontend (no raw API keys)."""
    cfg = get_config()
    llm = cfg.llm
    providers = []
    for p in llm.providers:
        providers.append(
            {
                "id": p.id,
                "label": p.label,
                "base_url": p.base_url,
                "api_key_set": bool((p.api_key or "").strip()),
                "models": [_public_model(spec) for spec in p.model_specs()],
            }
        )
    catalog = [
        {
            "key": e.key,
            "provider_id": e.provider_id,
            "model": e.model,
            "label": e.label,
            "context_window": e.context_window,
            "max_output_tokens": e.max_output_tokens,
        }
        for e in llm.catalog()
    ]
    return {
        "providers": providers,
        "catalog": catalog,
        "active_provider_id": llm.active_provider_id,
        "model": llm.model,
        "utility_provider_id": llm.utility_provider_id,
        "utility_model": llm.utility_model,
        # Backward-compatible aliases for older UI bits
        "base_url": "",
        "api_key_set": any(bool((p.api_key or "").strip()) for p in llm.providers),
        "available_models": [e.model for e in llm.catalog()],
    }

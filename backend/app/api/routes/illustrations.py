"""Illustration REST: settings, compile, generate, place, image bytes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.api.schemas import (
    IllustrationCompileBody,
    IllustrationGenerateBody,
    IllustrationPlaceBody,
    IllustrationSettingsBody,
)
from app.illustrations.service import (
    IllustrationError,
    compile_prompt,
    generate_illustration,
    get_image,
    get_record,
    get_settings,
    list_illustrations,
    place_illustration,
    save_settings,
)
from app.store import db

router = APIRouter()


def _require_project(project_id: str) -> None:
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")


def _http(exc: IllustrationError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/api/projects/{project_id}/illustrations/settings")
async def get_illustration_settings_route(project_id: str):
    _require_project(project_id)
    return get_settings(project_id)


@router.put("/api/projects/{project_id}/illustrations/settings")
async def put_illustration_settings_route(project_id: str, body: IllustrationSettingsBody):
    _require_project(project_id)
    return save_settings(
        project_id,
        style_text=body.style_text,
        use_style_default=body.use_style_default,
    )


@router.post("/api/projects/{project_id}/illustrations/compile")
async def compile_illustration_route(project_id: str, body: IllustrationCompileBody):
    _require_project(project_id)
    try:
        return await compile_prompt(
            project_id,
            extras=body.extras,
            use_style=body.use_style,
            linked_doc=body.linked_doc,
        )
    except IllustrationError as exc:
        raise _http(exc) from exc


@router.get("/api/projects/{project_id}/illustrations")
async def list_illustrations_route(
    project_id: str,
    linked_doc: str | None = None,
    include_drafts: bool = True,
):
    _require_project(project_id)
    return {
        "illustrations": list_illustrations(
            project_id,
            linked_doc=linked_doc,
            include_drafts=include_drafts,
        )
    }


@router.post("/api/projects/{project_id}/illustrations")
async def generate_illustration_route(project_id: str, body: IllustrationGenerateBody):
    _require_project(project_id)
    try:
        return await generate_illustration(
            project_id,
            prompt=body.prompt,
            extras=body.extras,
            use_style=body.use_style,
            home=body.home,
            linked_doc=body.linked_doc,
            conversation_id=body.conversation_id,
        )
    except IllustrationError as exc:
        raise _http(exc) from exc


@router.get("/api/projects/{project_id}/illustrations/{illustration_id}/image")
async def get_illustration_image_route(project_id: str, illustration_id: str):
    _require_project(project_id)
    path = get_image(project_id, illustration_id)
    if path is None:
        raise HTTPException(status_code=404, detail="illustration not found")
    media = "image/png"
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    elif suffix == ".webp":
        media = "image/webp"
    return FileResponse(path, media_type=media)


@router.patch("/api/projects/{project_id}/illustrations/{illustration_id}")
async def place_illustration_route(
    project_id: str,
    illustration_id: str,
    body: IllustrationPlaceBody,
):
    _require_project(project_id)
    if get_record(project_id, illustration_id) is None:
        raise HTTPException(status_code=404, detail="illustration not found")
    try:
        return place_illustration(
            project_id,
            illustration_id,
            home=body.home,
            linked_doc=body.linked_doc,
        )
    except IllustrationError as exc:
        raise _http(exc) from exc

"""Project CRUD and Markdown docs workspace routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.schemas import CreateProjectBody, DocsFileWriteBody, RenameProjectBody
from app.store import db
from app.docs import (
    ensure_seeded,
    list_files,
    load_project_workspace,
    normalize_rel_path,
    read_file,
    write_files,
)

router = APIRouter()


@router.get("/api/projects")
async def list_projects_route():
    return {"projects": db.list_projects()}


@router.post("/api/projects")
async def create_project_route(body: CreateProjectBody):
    project = db.create_project(body.name)
    ensure_seeded(project["id"])
    return project


@router.get("/api/projects/{project_id}")
async def get_project_route(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="project not found")
    db.ensure_initial_plan_done_flag(project_id)
    project = db.get_project(project_id)

    workspace = load_project_workspace(project_id)

    return {
        "project": project,
        "workspace": workspace,
        "conversations": db.list_conversations(project_id),
        "usage": db.usage_scopes(project_id=project_id),
    }


@router.patch("/api/projects/{project_id}")
async def rename_project_route(project_id: str, body: RenameProjectBody):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    if body.name is None and body.label is None:
        raise HTTPException(status_code=400, detail="name or label required")
    updated = db.update_project(
        project_id,
        name=body.name,
        label=body.label,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="project not found")
    return updated


@router.delete("/api/projects/{project_id}")
async def delete_project_route(request: Request, project_id: str):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    await request.app.state.conversations.delete_project(project_id)
    return {"deleted": project_id}


@router.get("/api/projects/{project_id}/docs/files")
async def list_docs_files_route(project_id: str, path: str = ""):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    load_project_workspace(project_id)
    try:
        entries = list_files(project_id, path=path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"path": path or "", "entries": entries}


@router.get("/api/projects/{project_id}/docs/files/{file_path:path}")
async def read_docs_file_route(project_id: str, file_path: str):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    load_project_workspace(project_id)
    try:
        result = read_file(project_id, file_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error") or "file not found")
    return result


@router.put("/api/projects/{project_id}/docs/files/{file_path:path}")
async def write_docs_file_route(project_id: str, file_path: str, body: DocsFileWriteBody):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="project not found")
    load_project_workspace(project_id)
    try:
        rel = normalize_rel_path(file_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rel or not rel.lower().endswith(".md"):
        raise HTTPException(status_code=400, detail="path must be a .md file")

    content = body.content
    based_on_rev = body.based_on_rev
    try:
        workspace = write_files(
            project_id,
            {rel: content},
            based_on={rel: based_on_rev},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "path": rel,
        "rev": (workspace.get("revs") or {}).get(rel),
        "workspace": workspace,
    }

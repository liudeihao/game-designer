"""FastAPI application: REST + SSE streaming for the game design workbench."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from .api.routes import (
    config_router,
    conversations_router,
    projects_router,
    rules_router,
    usage_router,
)
from .config import BASE_DIR, DATA_DIR
from .conversations import ConversationRuntime, ConversationService
from .graph import build_graph
from .store import db
from .docs import DocsWriteConflict

CHECKPOINTS_PATH = DATA_DIR / "checkpoints.sqlite"


@asynccontextmanager
async def lifespan(app: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db.init_db()

    async with AsyncSqliteSaver.from_conn_string(str(CHECKPOINTS_PATH)) as checkpointer:
        graph = build_graph(checkpointer)
        app.state.conversations = ConversationService(ConversationRuntime(graph))
        yield


app = FastAPI(title="Game Designer Agent Workbench", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(DocsWriteConflict)
async def docs_write_conflict_handler(_request: Request, exc: Exception):
    conflicts = getattr(exc, "conflicts", [])
    return JSONResponse(
        status_code=409,
        content={
            "detail": {
                "code": "docs_write_conflict",
                "message": "文档已被其他写入更新，请重新读取后再改。",
                "conflicts": conflicts,
            }
        },
    )


app.include_router(config_router)
app.include_router(projects_router)
app.include_router(conversations_router)
app.include_router(rules_router)
app.include_router(usage_router)

# Optionally serve the built frontend (production single-machine bundle).
_frontend_dist = BASE_DIR.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")


def main() -> None:
    import uvicorn

    # reload=True so Plan/Build code changes take effect without a manual restart.
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()

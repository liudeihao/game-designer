"""In-process registry of the graph run currently streaming for a conversation."""

from __future__ import annotations

from app.agent.cancel import RunCancel


class RunRegistry:
    """One active ``RunCancel`` per conversation id.

    ``begin`` replaces any previous token for that conversation. ``end`` only
    drops the token it was given, so a newer run is not cleared by an older
    stream's ``finally``.
    """

    def __init__(self) -> None:
        self._active: dict[str, RunCancel] = {}

    def begin(self, conversation_id: str) -> RunCancel:
        token = RunCancel()
        self._active[conversation_id] = token
        return token

    def end(self, conversation_id: str, token: RunCancel | None = None) -> None:
        current = self._active.get(conversation_id)
        if token is None or current is token:
            self._active.pop(conversation_id, None)

    def request_stop(self, conversation_id: str) -> bool:
        token = self._active.get(conversation_id)
        if token is None:
            return False
        token.request()
        return True

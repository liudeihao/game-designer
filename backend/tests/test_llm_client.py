from types import SimpleNamespace
from unittest.mock import patch

from app.api.stream import _error_message
from app.llm.client import get_llm


def _endpoint() -> SimpleNamespace:
    return SimpleNamespace(
        model="deepseek-v4-pro",
        api_key="sk-test",
        base_url="https://api.deepseek.com",
    )


def test_get_llm_skips_httpx_keepalive_transport():
    with (
        patch("app.llm.client.get_config") as cfg,
        patch("langchain_openai.ChatOpenAI") as chat,
    ):
        cfg.return_value.llm.resolve.return_value = _endpoint()
        get_llm()
    kwargs = chat.call_args.kwargs
    assert kwargs["http_socket_options"] == ()
    assert kwargs["stream_usage"] is True
    assert kwargs["model"] == "deepseek-v4-pro"
    assert kwargs["base_url"] == "https://api.deepseek.com"


def test_get_llm_keeps_socket_opt_out_if_stream_usage_unsupported():
    with (
        patch("app.llm.client.get_config") as cfg,
        patch("langchain_openai.ChatOpenAI") as chat,
    ):
        cfg.return_value.llm.resolve.return_value = _endpoint()
        chat.side_effect = [TypeError("stream_usage"), chat.return_value]
        get_llm()
    assert chat.call_count == 2
    assert chat.call_args.kwargs["http_socket_options"] == ()
    assert "stream_usage" not in chat.call_args.kwargs


def test_error_message_includes_assertion_cause():
    try:
        try:
            raise AssertionError
        except AssertionError as err:
            raise ConnectionError("Connection error.") from err
    except ConnectionError as exc:
        assert _error_message(exc) == "Connection error. (AssertionError)"

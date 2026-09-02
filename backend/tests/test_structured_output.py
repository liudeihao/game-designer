from app.llm.structured import parse_json_object


def test_parse_json_object_accepts_only_objects() -> None:
    assert parse_json_object('{"ok": true}') == {"ok": True}
    assert parse_json_object('```json\n{"ok": true}\n```') == {"ok": True}
    assert parse_json_object('prefix {"ok": true} suffix') == {"ok": True}
    assert parse_json_object('["valid", "but", "wrong shape"]') == {}
    assert parse_json_object("") == {}

import pytest


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Isolate disk writes from the developer's real DATA_DIR."""
    import app.config as cfg

    monkeypatch.setattr(cfg, "data_dir", lambda: tmp_path)
    return tmp_path

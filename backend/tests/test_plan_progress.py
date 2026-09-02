from app.agent.plan.progress import plan_progress_from_markdown


def test_same_markdown_projects_stable_ids() -> None:
    md = """# 计划

## 待敲定的设计点

- [x] 确定核心玩法（塔防）
- [ ] 设计经济系统
- [ ] 输出范围
"""
    first = plan_progress_from_markdown(md)
    second = plan_progress_from_markdown(md)
    assert first == second
    titles = [s["title"] for s in first["steps"]]
    assert titles == ["确定核心玩法（塔防）", "设计经济系统", "输出范围"]
    assert [s["status"] for s in first["steps"]] == ["done", "active", "pending"]
    assert len({s["id"] for s in first["steps"]}) == 3


def test_repeated_questions_get_distinct_ids() -> None:
    steps = plan_progress_from_markdown("- [ ] 难度\n- [ ] 难度\n")["steps"]
    assert len({s["id"] for s in steps}) == 2


def test_headings_alone_have_no_steps() -> None:
    """Section titles describe the document, not the questions left to settle."""
    md = "# 计划\n\n## 目标\n\n## 非目标\n"
    assert plan_progress_from_markdown(md) == {"steps": []}


def test_empty_markdown_has_no_steps() -> None:
    assert plan_progress_from_markdown("") == {"steps": []}
    assert plan_progress_from_markdown("没有标题的一段。") == {"steps": []}

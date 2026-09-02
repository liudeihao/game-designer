from app.memory.hooks import (
    clear_compaction_hooks,
    register_post_compact_hook,
    register_pre_compact_hook,
    run_post_compact_hooks,
    run_pre_compact_hooks,
)


async def test_compaction_hooks_run_in_registration_order():
    events = []
    clear_compaction_hooks()
    register_pre_compact_hook(lambda event: events.append(("pre", event["trigger"])))

    async def post(event):
        events.append(("post", event["status"]))

    register_post_compact_hook(post)
    await run_pre_compact_hooks({"trigger": "manual"})
    await run_post_compact_hooks({"status": "completed"})
    clear_compaction_hooks()

    assert events == [("pre", "manual"), ("post", "completed")]

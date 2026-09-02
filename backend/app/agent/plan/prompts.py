"""Prompt builder for Plan mode (the plan document is not design-doc prose)."""

from __future__ import annotations

# Static system prefix — keep byte-stable across turns to maximize provider
# prompt-cache hits. Dynamic fields (instruction / plan / workspace) go in a
# separate user message; dialogue history is appended as real chat turns.
PLAN_SYSTEM_PROMPT = """你是这条对话里处于 Plan 模式的 Agent。产品是 AI Game Studio。

## 产品定位（必须遵守）
本 Studio **只做游戏设计文档与创意规划**，不涉及工程实现：
- 关注：愿景、受众、核心循环、机制、叙事节奏、数值框架、体验目标、内容结构、风险与开放问题。
- **不要**询问或规划：具体目标平台/引擎/技术栈、商店上架流程、代码架构、性能优化、SDK 接入等实现细节。
- 「发布」相关仅可谈设计层面的体验定位与内容里程碑，不要谈上架渠道配置。

## Plan 模式规则
- 你通过工具循环工作：需要时读取工作区、向用户提问、把 Markdown **plan** 写入右侧面板。
- plan 是给后续 Execute Plan（界面按钮「执行计划」）用的施工说明，**禁止**写成完整设计正文。
- 一份 plan 对应一件要规划的事，有自己的名称，执行后即归档。本对话之前执行过的 plan 与当前这份无关，不要去改它们。
- Plan **不负责决定游戏设计方案**，只负责拆解后续需要完成的设计工作：规划「怎么设计」，不是「设计成什么」。具体方案由 Execute Plan 写入 `docs/` 时决定。
- 你 **不能** 修改工作区文档；写入文档由用户执行 Execute Plan 后进行。
- 当前 plan 与工作区概览附在**最新一条用户消息**中，不在 system 里。细节不够时用工具去读，不要问用户「文档里已经有什么」。
- 若消息中包含「对话摘要」，那是较早轮次的压缩记忆；请与其后的完整近轮对话一并理解。
- **必须回应用户最新一条消息**；禁止复述或稍作改写你上一轮已经说过的内容。

## 空工作区（必须遵守）
- 若工作区标注为 empty / README only：明确告知用户目前几乎是空项目。
- **禁止**无意义地列出目录来「先看看有什么」——已知只有种子 README。
- plan 应规划要覆盖的**设计文档类型**（如愿景与核心体验、核心循环、主要系统），不要提前拆出完整文件树或空目录，也不要先探索再写。

## 工具循环
- 设计方向不足时向用户提问（体验基调、核心玩法、受众、内容侧重等）。题干和选项只放在工具参数里，不要写进聊天。用户的选择会作为工具观察返回，同一轮继续。
- 信息足够时把**完整** plan 写入右侧。成功后用一句话提示用户可继续讨论或点击「执行计划」。
- 用户答复澄清问题后更新 plan 时，把「待敲定的设计点」里已确定的条目勾成 `- [x]`，不要删掉条目重排。
- 不要用一段 JSON 代替工具调用。不要在聊天里写出完整 plan 正文。

## 语言与命名
- plan 正文用中文；RPG、NPC 等业界通用英文术语可保留。
- 每次写 plan 都要给 `title`：一句短中文，概括这份 plan 要规划什么（如「核心战斗循环」「开局 10 分钟体验」「装备与掉落框架」）。不要用「计划」「设计文档」这类看不出内容的空名。改的还是同一件事就沿用原 title，题目变了才换。
- 不要为了「看起来可执行」而编造完整文件树或空目录。空项目只写文档类型即可。
- 工作区已有目录时，新文档优先放进对应目录；同一主题将有多篇时，可以点出目录倾向（如 `系统/`），不必列出每一份路径。
- 仅当已有明确结构、用户点名路径、或本轮分组已经清楚时，再列出具体 `*.md` 路径。
- 路径相对设计文档根目录，不要带 `docs/` 前缀。若列出路径：新建用中文文件名（如 `愿景.md`、`系统/核心循环.md`），不要用 vision.md / core-loop.md；已存在的文件写原路径，不要为了中文化而复制一份。

## plan 结构（写入右侧的正文必须包含）
用清晰中文 Markdown，至少包含以下章节（标题可微调，语义不可缺）：
1. **目标** — 本轮执行要完成哪些设计工作
2. **非目标** — 明确不做的范围
3. **拟处理文档范围** — 需要创建或修改的设计文档**类型**；有现成目录或本轮会写多篇同类文档时，可顺手标明目录倾向。仅当已有明确结构、用户点名路径、或分组已经清楚时，再列出具体 `*.md` 路径（不带 `docs/` 前缀；更新写原路径，新建用中文文件名）
4. **待敲定的设计点** — 每个范围需要确定的问题，用 Markdown 任务清单逐条列出：未确认写 `- [ ] 问题`；用户已明确答复的改写为 `- [x] 问题（用户结论一句话）`。右侧面板会把这份清单投影成进度条，禁止在别的章节里再写任务清单。
5. **开放问题** — 仍未决、执行时可合理默认或跳过的问题（只列问题，不填默认值，不用任务清单格式）

**禁止**：把 plan 写成完整设计散文（长篇愿景、机制说明、关卡文案等）；那些属于写入 `docs/` 的内容。
**禁止**：在 plan 里写平台清单、引擎选型、技术里程碑。
**禁止**：未经用户确认，在 plan 里写入具体设计参数或默认取舍（数值、数量、比例、时长、系统规模、某个玩法是否独立成篇等）。只能描述需要确定的问题。用户已明确给出的约束可以原样写入。

## Rule
User Rule / Project Rule 若已注入，是行为约束，不是权限：Plan 仍不能写设计文档。
当用户表达了跨对话仍应遵守的工作习惯、且尚未写成 Rule 时，可调用 propose_rule 出示一张提案。提案必须带名称与详情；一条习惯一条 Rule，不要把多条揉成一段。不要静默修改 Rule。同一轮只提一条。不要把游戏设定写成 Rule。
"""


def build_plan_workspace_prompt(
    plan_markdown: str,
    workspace_summary: str = "",
    *,
    workspace_empty: bool | None = None,
) -> str:
    """Semi-stable workspace context (no current user utterance — that lives in chat turns)."""
    plan_block = plan_markdown.strip() if plan_markdown.strip() else "（尚无 plan）"
    summary = (workspace_summary or "").strip() or "（工作区尚无设计内容）"

    empty_note = ""
    if workspace_empty is True or (
        workspace_empty is None
        and (
            "empty" in summary.lower()
            or "README only" in summary
            or "尚无" in summary
            or "空白" in summary
        )
    ):
        empty_note = (
            "\n\n## 空工作区提示（强制）\n"
            "当前工作区基本为空（仅种子 README 或尚无实质文档）。"
            "禁止无意义地列出目录；plan 应描述要覆盖的设计文档类型与待完成的设计工作，"
            "不要提前拆出完整文件树或空目录。\n"
        )

    return f"""## 当前工作区概览（只读）
{summary}
{empty_note}
## 已有 plan
{plan_block}
"""


def build_plan_state_prompt(
    instruction: str,
    plan_markdown: str,
    workspace_summary: str = "",
    *,
    workspace_empty: bool | None = None,
) -> str:
    """Legacy combined block (instruction + workspace). Prefer workspace + chat turns."""
    return f"""## 当前用户指令
{instruction.strip() or "（无）"}

{build_plan_workspace_prompt(
    plan_markdown,
    workspace_summary=workspace_summary,
    workspace_empty=workspace_empty,
)}
"""


def build_plan_prompt(
    instruction: str,
    plan_markdown: str,
    messages=None,
    workspace_summary: str = "",
    conversation_summary: str = "",
    *,
    workspace_empty: bool | None = None,
) -> str:
    """Legacy single-string prompt (tests). Prefer multi-message builder."""
    from app.memory.formatting import format_messages_for_summary

    history_block = format_messages_for_summary(messages or []) or "（尚无对话）"
    summary_block = ""
    if (conversation_summary or "").strip():
        summary_block = f"\n## 对话摘要\n{conversation_summary.strip()}\n"

    return (
        PLAN_SYSTEM_PROMPT
        + "\n"
        + build_plan_state_prompt(
            instruction,
            plan_markdown,
            workspace_summary=workspace_summary,
            workspace_empty=workspace_empty,
        )
        + summary_block
        + f"\n## 对话历史\n{history_block}\n"
    )

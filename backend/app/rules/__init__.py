"""User Rule / Project Rule: standing work conventions, not memory."""

from ._prompt import compose_system_prompt, format_rule_sections, split_system_and_rules
from ._proposal import (
    DUPLICATE_PROPOSAL,
    PROPOSE_RULE_TOOL,
    already_proposed_this_turn,
    normalize_proposal_args,
)
from ._store import (
    LEGACY_MIGRATED_NAME,
    OPS,
    RULE_TOKEN_WARN,
    SCOPES,
    apply_rule_op,
    parse_rules_for_save,
    read_project_rules,
    read_user_rules,
    rule_payload,
    user_rules_path,
    write_project_rules,
    write_user_rules,
)

__all__ = [
    "DUPLICATE_PROPOSAL",
    "LEGACY_MIGRATED_NAME",
    "OPS",
    "PROPOSE_RULE_TOOL",
    "RULE_TOKEN_WARN",
    "SCOPES",
    "already_proposed_this_turn",
    "apply_rule_op",
    "compose_system_prompt",
    "format_rule_sections",
    "normalize_proposal_args",
    "parse_rules_for_save",
    "read_project_rules",
    "read_user_rules",
    "rule_payload",
    "split_system_and_rules",
    "user_rules_path",
    "write_project_rules",
    "write_user_rules",
]

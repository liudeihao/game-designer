package ai

import (
	"strings"
)

const maxDesignDocumentRunes = 30_000

// BuildChatSystemPrompt assembles product rules and optional project context for the LLM.
func BuildChatSystemPrompt(linkedProjectAssets, designDocument string) string {
	var b strings.Builder
	b.WriteString("You are a helpful assistant for an indie game design and asset ideation product.\n")
	b.WriteString("Rules:\n")
	b.WriteString("- Session staging drafts are user-authored only: never invent draft rows; users add name/description in the UI and export to their library.\n")
	b.WriteString("- Prefer concise, actionable answers. Use the user's language when they write in Chinese.\n")
	if trim := strings.TrimSpace(linkedProjectAssets); trim != "" {
		b.WriteString("\nLinked project library assets (name: description), for design context:\n")
		b.WriteString(trim)
		b.WriteString("\n")
	}
	if trim := strings.TrimSpace(designDocument); trim != "" {
		b.WriteString("\nProject game design document (Markdown):\n")
		b.WriteString(truncateRunes(trim, maxDesignDocumentRunes))
		b.WriteString("\n")
	}
	return b.String()
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "\n\n…(truncated)"
}

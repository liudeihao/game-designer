package api

import (
	"context"

	"game-designer/backend/internal/ai"

	"github.com/google/uuid"
)

const maxChatHistoryMessages = 80

func (s *Server) projectDesignDocument(ctx context.Context, sessionID uuid.UUID) (string, error) {
	var pid *uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT project_id FROM chat_sessions WHERE id = $1`, sessionID).Scan(&pid)
	if err != nil {
		return "", err
	}
	if pid == nil {
		return "", nil
	}
	var doc string
	err = s.pool.QueryRow(ctx, `SELECT COALESCE(design_document, '') FROM projects WHERE id = $1`, *pid).Scan(&doc)
	return doc, err
}

type chatMsgRow struct {
	role, content string
}

func (s *Server) chatMessagesForModel(ctx context.Context, sessionID uuid.UUID, systemPrompt string) ([]ai.ChatMessage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []chatMsgRow
	for rows.Next() {
		var r chatMsgRow
		if err := rows.Scan(&r.role, &r.content); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(list) > maxChatHistoryMessages {
		list = list[len(list)-maxChatHistoryMessages:]
	}
	out := []ai.ChatMessage{{Role: "system", Content: systemPrompt}}
	for _, r := range list {
		switch r.role {
		case "user":
			out = append(out, ai.ChatMessage{Role: "user", Content: r.content})
		case "assistant":
			out = append(out, ai.ChatMessage{Role: "assistant", Content: r.content})
		case "system":
			out = append(out, ai.ChatMessage{Role: "system", Content: r.content})
		default:
			out = append(out, ai.ChatMessage{Role: "user", Content: r.content})
		}
	}
	return out, nil
}

// buildStreamChatParams prepares model messages after the latest user message was persisted.
func (s *Server) buildStreamChatParams(ctx context.Context, sid uuid.UUID, uid uuid.UUID, userMessage, draftTemp, linkedAssets string) (ai.StreamChatParams, error) {
	designDoc, err := s.projectDesignDocument(ctx, sid)
	if err != nil {
		return ai.StreamChatParams{}, err
	}
	system := ai.BuildChatSystemPrompt(linkedAssets, designDoc)
	msgs, err := s.chatMessagesForModel(ctx, sid, system)
	if err != nil {
		return ai.StreamChatParams{}, err
	}
	return ai.StreamChatParams{
		SessionID:           sid,
		UserID:              uid,
		UserMessage:         userMessage,
		DraftTempID:         draftTemp,
		LinkedProjectAssets: linkedAssets,
		Messages:            msgs,
	}, nil
}

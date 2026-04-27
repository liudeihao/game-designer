package ai

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

// MockChat streams JSONL events matching front protocol (底層技術契約).
type MockChat struct{}

func (m *MockChat) StreamChat(ctx context.Context, w io.Writer, sessionID, userID uuid.UUID, userMessage, draftTempID string) error {
	_ = sessionID
	_ = userID
	_ = userMessage
	tid := draftTempID
	if tid == "" {
		tid = "temp_m_" + uuid.NewString()[:8]
	}
	events := []string{
		`{"type":"text","delta":"[mock] "}`,
		`{"type":"text","delta":"這條回覆由 Go MockChat 生成。\n"}`,
		fmt.Sprintf(`{"type":"asset_start","id":%q}`, tid),
		fmt.Sprintf(`{"type":"asset_field","id":%q,"field":"name","delta":"MOCK "}`, tid),
		fmt.Sprintf(`{"type":"asset_field","id":%q,"field":"name","delta":"ASSET"}`, tid),
		fmt.Sprintf(`{"type":"asset_field","id":%q,"field":"description","delta":"由後端 mock AI 產生，可替換為真實 Provider。"}`, tid),
		fmt.Sprintf(`{"type":"asset_end","id":%q}`, tid),
	}
	for _, line := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		_, err := fmt.Fprintf(w, "data: %s\n\n", line)
		if err != nil {
			return err
		}
		if flusher, ok := w.(httpFlusher); ok {
			flusher.Flush()
		}
		time.Sleep(25 * time.Millisecond)
	}
	return nil
}

type httpFlusher interface{ Flush() }

// MockImage returns a placeholder URL (picsum); generation is instant.
type MockImage struct{}

func (m *MockImage) GenerateImage(ctx context.Context, assetID, authorID uuid.UUID, extraPrompt *string) (uuid.UUID, string, error) {
	_ = ctx
	_ = authorID
	_ = extraPrompt
	id := uuid.New()
	url := fmt.Sprintf("https://picsum.photos/seed/%s/800/800", id.String())
	_ = assetID
	return id, url, nil
}

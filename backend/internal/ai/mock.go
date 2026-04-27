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
	// text-only: staging is user-driven via POST /drafts, not the stream
	_ = draftTempID
	events := []string{
		`{"type":"text","delta":"[mock] "}`,
		`{"type":"text","delta":"這條回覆由 Go MockChat 生成。若你已有清晰的素材名稱與說明，可在右側「暫存」手動填寫後加入，再一鍵導出到我的庫。\n"}`,
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

package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

// MockChat streams JSONL events matching front protocol (底層技術契約).
type MockChat struct{}

func (m *MockChat) StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) (string, error) {
	_ = p.SessionID
	_ = p.UserID
	_ = p.UserMessage
	// text-only: staging is user-driven via POST /drafts, not the stream
	_ = p.DraftTempID
	_ = p.Messages
	ctxNote := ""
	if trim := strings.TrimSpace(p.LinkedProjectAssets); trim != "" {
		n := strings.Count(trim, "\n") + 1
		ctxNote = fmt.Sprintf("（Mock：後端已組裝 %d 條引用素材條目供真實模型作 system 上下文。）", n)
	}
	line2 := "這條回覆由 Go MockChat 生成。"
	if ctxNote != "" {
		line2 += ctxNote
	}
	line2 += "素材向會話可在右側「暫存」手動填寫後導出到我的庫；項目設計會話無暫存欄。\n"
	full := "[mock] " + line2
	events := []string{
		`{"type":"text","delta":"[mock] "}`,
		string(mustJSONLine(map[string]string{"type": "text", "delta": line2})),
	}
	for _, line := range events {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		default:
		}
		_, err := fmt.Fprintf(w, "data: %s\n\n", line)
		if err != nil {
			return "", err
		}
		if flusher, ok := w.(httpFlusher); ok {
			flusher.Flush()
		}
		time.Sleep(25 * time.Millisecond)
	}
	return full, nil
}

func mustJSONLine(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte(`{"type":"text","delta":"[mock] json error"}`)
	}
	return b
}

type httpFlusher interface{ Flush() }

// MockImage returns a placeholder URL (picsum); generation is instant.
type MockImage struct{}

func (m *MockImage) GenerateImage(ctx context.Context, p ImageGenParams) (uuid.UUID, string, error) {
	_ = ctx
	_ = p.AuthorID
	_ = p.Name
	_ = p.Description
	_ = p.ExtraPrompt
	id := uuid.New()
	url := fmt.Sprintf("https://picsum.photos/seed/%s/800/800", id.String())
	_ = p.AssetID
	return id, url, nil
}

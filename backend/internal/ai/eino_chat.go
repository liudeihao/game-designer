package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	openai "github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/schema"
)

// EinoChat streams assistant tokens via CloudWeGo Eino OpenAI-compatible ChatModel.
type EinoChat struct {
	cm *openai.ChatModel
}

// NewEinoChat builds a chat model client. baseURL may be empty to use the default OpenAI endpoint.
func NewEinoChat(ctx context.Context, apiKey, baseURL, model string, timeout time.Duration) (*EinoChat, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("eino chat: API key required")
	}
	if strings.TrimSpace(model) == "" {
		return nil, fmt.Errorf("eino chat: model required")
	}
	cfg := &openai.ChatModelConfig{
		APIKey:  strings.TrimSpace(apiKey),
		Model:   strings.TrimSpace(model),
		Timeout: timeout,
	}
	if b := strings.TrimSpace(baseURL); b != "" {
		cfg.BaseURL = b
	}
	cm, err := openai.NewChatModel(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &EinoChat{cm: cm}, nil
}

func assistantVisibleDelta(m *schema.Message) string {
	if m == nil {
		return ""
	}
	var b strings.Builder
	b.WriteString(m.Content)
	for _, p := range m.AssistantGenMultiContent {
		if p.Type == schema.ChatMessagePartTypeText {
			b.WriteString(p.Text)
		}
	}
	return b.String()
}

func (e *EinoChat) StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) (string, error) {
	if len(p.Messages) == 0 {
		return "", fmt.Errorf("eino chat: Messages must be non-empty")
	}
	sr, err := e.cm.Stream(ctx, p.Messages)
	if err != nil {
		return "", err
	}
	defer sr.Close()

	var full strings.Builder
	flusher, _ := w.(httpFlusher)
	for {
		msg, err := sr.Recv()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return full.String(), err
		}
		delta := assistantVisibleDelta(msg)
		if delta == "" {
			continue
		}
		full.WriteString(delta)
		line, jerr := json.Marshal(map[string]string{"type": "text", "delta": delta})
		if jerr != nil {
			continue
		}
		_, werr := fmt.Fprintf(w, "data: %s\n\n", line)
		if werr != nil {
			return full.String(), werr
		}
		if flusher != nil {
			flusher.Flush()
		}
	}
	return full.String(), nil
}

package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/shared"
)

// OpenAIChat streams assistant text via official openai-go Chat Completions (streaming).
type OpenAIChat struct {
	client openai.Client
	model  string
}

// NewOpenAIChat builds a chat streamer; baseURL may be empty for default api.openai.com/v1.
func NewOpenAIChat(apiKey, baseURL, model string, timeout time.Duration) (*OpenAIChat, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("openai chat: API key required")
	}
	if strings.TrimSpace(model) == "" {
		return nil, fmt.Errorf("openai chat: model required")
	}
	return &OpenAIChat{
		client: openai.NewClient(openAIClientOptions(apiKey, baseURL, timeout)...),
		model:  strings.TrimSpace(model),
	}, nil
}

func toOpenAICompletionMessages(msgs []ChatMessage) []openai.ChatCompletionMessageParamUnion {
	out := make([]openai.ChatCompletionMessageParamUnion, 0, len(msgs))
	for _, m := range msgs {
		switch m.Role {
		case "system":
			out = append(out, openai.ChatCompletionMessageParamUnion{
				OfSystem: &openai.ChatCompletionSystemMessageParam{
					Content: openai.ChatCompletionSystemMessageParamContentUnion{
						OfString: openai.String(m.Content),
					},
				},
			})
		case "assistant":
			out = append(out, openai.ChatCompletionMessageParamUnion{
				OfAssistant: &openai.ChatCompletionAssistantMessageParam{
					Content: openai.ChatCompletionAssistantMessageParamContentUnion{
						OfString: openai.String(m.Content),
					},
				},
			})
		default:
			out = append(out, openai.ChatCompletionMessageParamUnion{
				OfUser: &openai.ChatCompletionUserMessageParam{
					Content: openai.ChatCompletionUserMessageParamContentUnion{
						OfString: openai.String(m.Content),
					},
				},
			})
		}
	}
	return out
}

func (c *OpenAIChat) StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) (string, error) {
	if len(p.Messages) == 0 {
		return "", fmt.Errorf("openai chat: Messages must be non-empty")
	}
	stream := c.client.Chat.Completions.NewStreaming(ctx, openai.ChatCompletionNewParams{
		Messages: toOpenAICompletionMessages(p.Messages),
		Model:    shared.ChatModel(c.model),
	})
	defer stream.Close()

	var full strings.Builder
	flusher, _ := w.(httpFlusher)
	for stream.Next() {
		chunk := stream.Current()
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta.Content
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
	if err := stream.Err(); err != nil {
		return full.String(), err
	}
	return full.String(), nil
}

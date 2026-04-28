package ai

import (
	"net/http"
	"strings"
	"time"

	"github.com/openai/openai-go/option"
)

// openAIClientOptions builds shared client options for chat and images (official openai-go).
func openAIClientOptions(apiKey, baseURL string, timeout time.Duration) []option.RequestOption {
	opts := []option.RequestOption{option.WithAPIKey(strings.TrimSpace(apiKey))}
	if timeout > 0 {
		opts = append(opts, option.WithHTTPClient(&http.Client{Timeout: timeout}))
	}
	if b := strings.TrimSpace(baseURL); b != "" {
		opts = append(opts, option.WithBaseURL(b))
	}
	return opts
}

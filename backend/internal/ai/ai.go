package ai

import (
	"context"
	"io"

	"github.com/google/uuid"
)

// ChatStreamer produces JSONL lines (without SSE prefix) for session chat; implementation writes SSE "data: ...\n\n" in handlers.
type ChatStreamer interface {
	StreamChat(ctx context.Context, w io.Writer, sessionID, userID uuid.UUID, userMessage, draftTempID string) error
}

// ImageGenerator returns mock image job result (extend later for real providers).
type ImageGenerator interface {
	GenerateImage(ctx context.Context, assetID, authorID uuid.UUID, extraPrompt *string) (imageID uuid.UUID, url string, err error)
}

// Registry groups swappable providers (mock now; inject real later).
type Registry struct {
	Chat  ChatStreamer
	Image ImageGenerator
}

func NewMockRegistry() *Registry {
	return &Registry{Chat: &MockChat{}, Image: &MockImage{}}
}

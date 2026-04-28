package ai

import (
	"context"
	"io"

	"github.com/google/uuid"
)

// StreamChatParams carries everything needed to stream one assistant reply (session + optional project library context).
type StreamChatParams struct {
	SessionID   uuid.UUID
	UserID      uuid.UUID
	UserMessage string
	DraftTempID string
	// LinkedProjectAssets is human-readable name/description lines for assets linked to the project (game design context).
	LinkedProjectAssets string
}

// ChatStreamer produces JSONL lines (without SSE prefix) for session chat; implementation writes SSE "data: ...\n\n" in handlers.
type ChatStreamer interface {
	StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) error
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

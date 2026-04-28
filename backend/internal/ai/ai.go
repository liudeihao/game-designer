package ai

import (
	"context"
	"io"

	"github.com/cloudwego/eino/schema"
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
	// Messages is the full model turn list (system + history + user). Required for EinoChat; MockChat ignores it.
	Messages []*schema.Message
}

// ChatStreamer produces JSONL events as SSE "data: ...\n\n" and returns the full assistant text for persistence.
type ChatStreamer interface {
	StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) (assistantContent string, err error)
}

// ImageGenerator returns mock image job result.
// Phase B: no EinoExt component matched our asset_images pipeline; add a concrete provider implementation when chosen.
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

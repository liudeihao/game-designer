package ai

import (
	"context"
	"io"

	"github.com/google/uuid"
)

// ChatMessage is one turn for the chat completion API (roles: system, user, assistant).
type ChatMessage struct {
	Role    string
	Content string
}

// StreamChatParams carries everything needed to stream one assistant reply (session + optional project library context).
type StreamChatParams struct {
	SessionID   uuid.UUID
	UserID      uuid.UUID
	UserMessage string
	DraftTempID string
	// LinkedProjectAssets is human-readable name/description lines for assets linked to the project (game design context).
	LinkedProjectAssets string
	// Messages is the full model turn list (system + history + user). Required for OpenAIChat; MockChat ignores it.
	Messages []ChatMessage
}

// ChatStreamer produces JSONL events as SSE "data: ...\n\n" and returns the full assistant text for persistence.
type ChatStreamer interface {
	StreamChat(ctx context.Context, w io.Writer, p StreamChatParams) (assistantContent string, err error)
}

// ImageGenParams is passed to image providers; name/description ground the visual prompt.
type ImageGenParams struct {
	AssetID     uuid.UUID
	AuthorID    uuid.UUID
	Name        string
	Description string
	ExtraPrompt *string
}

// ImageGenerator produces a persistent image URL (HTTPS, data: URL, etc.) for asset_images.url.
type ImageGenerator interface {
	GenerateImage(ctx context.Context, p ImageGenParams) (imageID uuid.UUID, url string, err error)
}

// Registry groups swappable providers (mock now; inject real later).
type Registry struct {
	Chat  ChatStreamer
	Image ImageGenerator
}

func NewMockRegistry() *Registry {
	return &Registry{Chat: &MockChat{}, Image: &MockImage{}}
}

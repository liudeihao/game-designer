package ai

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
)

// OpenAIImageGen uses the official OpenAI Go SDK (openai/openai-go) for Images.Generate.
// Stores results as data: URLs (b64) so asset_images.url does not rely on expiring links.
type OpenAIImageGen struct {
	client openai.Client
	model  string
	size   string
}

// NewOpenAIImageGen builds a generator; baseURL may be empty for api.openai.com/v1.
func NewOpenAIImageGen(apiKey, baseURL, model, size string, timeout time.Duration) (*OpenAIImageGen, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("openai image: API key required")
	}
	if strings.TrimSpace(model) == "" {
		return nil, fmt.Errorf("openai image: model required")
	}
	if strings.TrimSpace(size) == "" {
		size = string(openai.ImageGenerateParamsSize1024x1024)
	}
	return &OpenAIImageGen{
		client: openai.NewClient(openAIClientOptions(apiKey, baseURL, timeout)...),
		model:  strings.TrimSpace(model),
		size:   strings.TrimSpace(size),
	}, nil
}

const maxImagePromptRunes = 3800 // under DALL·E 3 limit; GPT image models allow more

func buildImagePrompt(p ImageGenParams) string {
	var parts []string
	if n := strings.TrimSpace(p.Name); n != "" {
		parts = append(parts, n)
	}
	if d := strings.TrimSpace(p.Description); d != "" {
		parts = append(parts, d)
	}
	if p.ExtraPrompt != nil {
		if e := strings.TrimSpace(*p.ExtraPrompt); e != "" {
			parts = append(parts, e)
		}
	}
	prompt := strings.Join(parts, ". ")
	if prompt == "" {
		prompt = "Game asset concept art, clean illustration, suitable for a design library"
	}
	if utf8.RuneCountInString(prompt) > maxImagePromptRunes {
		r := []rune(prompt)
		prompt = string(r[:maxImagePromptRunes])
	}
	return prompt
}

func dataURLMime(resp *openai.ImagesResponse) string {
	switch resp.OutputFormat {
	case openai.ImagesResponseOutputFormatJPEG:
		return "image/jpeg"
	case openai.ImagesResponseOutputFormatWebP:
		return "image/webp"
	default:
		return "image/png"
	}
}

func (g *OpenAIImageGen) GenerateImage(ctx context.Context, p ImageGenParams) (uuid.UUID, string, error) {
	prompt := buildImagePrompt(p)
	params := openai.ImageGenerateParams{
		Prompt: prompt,
		Model:  openai.ImageModel(g.model),
		N:      param.NewOpt(int64(1)),
		Size:   openai.ImageGenerateParamsSize(g.size),
	}
	// gpt-image-* always returns b64; dall-e-2/3 need explicit b64_json for stable storage.
	if !strings.HasPrefix(strings.ToLower(g.model), "gpt-image") {
		params.ResponseFormat = openai.ImageGenerateParamsResponseFormatB64JSON
	}
	resp, err := g.client.Images.Generate(ctx, params)
	if err != nil {
		return uuid.UUID{}, "", err
	}
	if resp == nil || len(resp.Data) == 0 {
		return uuid.UUID{}, "", fmt.Errorf("openai image: empty response")
	}
	b64 := strings.TrimSpace(resp.Data[0].B64JSON)
	if b64 == "" {
		return uuid.UUID{}, "", fmt.Errorf("openai image: missing b64_json in response")
	}
	id := uuid.New()
	mime := dataURLMime(resp)
	url := fmt.Sprintf("data:%s;base64,%s", mime, b64)
	return id, url, nil
}

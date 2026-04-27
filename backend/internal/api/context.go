package api

import (
	"context"

	"github.com/google/uuid"
)

type ctxKeyUser struct{}

func withUserID(ctx context.Context, id uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKeyUser{}, id)
}

func userID(ctx context.Context) (uuid.UUID, bool) {
	v, ok := ctx.Value(ctxKeyUser{}).(uuid.UUID)
	return v, ok
}

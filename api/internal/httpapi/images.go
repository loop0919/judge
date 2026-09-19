package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"judge/api/internal/problems"
)

const maxContentImage = 512 << 10

// Decode the real format and re-encode to remove metadata and trailing payloads.
func cleanContentImage(data []byte) ([]byte, string, error) {
	invalid := errors.New("invalid image")
	if len(data) == 0 || len(data) > maxContentImage {
		return nil, "", invalid
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg") || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 2048 || cfg.Height > 2048 {
		return nil, "", invalid
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", invalid
	}
	var out bytes.Buffer
	if format == "png" {
		err = png.Encode(&out, img)
	} else {
		err = jpeg.Encode(&out, img, &jpeg.Options{Quality: 85})
	}
	if err != nil || out.Len() > maxContentImage {
		return nil, "", invalid
	}
	return out.Bytes(), "image/" + format, nil
}

type contentImageInfo struct {
	ID   string `json:"id"`
	Size int    `json:"size"`
	Used bool   `json:"used"`
}

func (p PrivateProblems) publicImage(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	p.contentImage(w, r.WithContext(ctx), "")
}

func (p PrivateProblems) contentImage(w http.ResponseWriter, r *http.Request, owner string) {
	w.Header().Set("Cache-Control", "no-store")
	store, ok := p.Store.(*problems.Store)
	if !ok {
		authError(w, 503, "database_unavailable")
		return
	}
	pool, ctx, id := store.Pool(), r.Context(), r.PathValue("id")
	if id != "" && !problemID.MatchString(id) {
		authError(w, 404, "image_not_found")
		return
	}
	if r.Method == http.MethodGet && id != "" {
		var data []byte
		var media string
		err := pool.QueryRow(ctx, `SELECT data,media_type FROM content_images
 WHERE id=$1 AND (owner_id=$2 OR content_image_access(id,owner_id,$2,false))`, id, owner).Scan(&data, &media)
		if errors.Is(err, pgx.ErrNoRows) {
			authError(w, 404, "image_not_found")
		} else if err != nil {
			authError(w, 503, "database_unavailable")
		} else {
			w.Header().Set("Content-Type", media)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Content-Length", strconv.Itoa(len(data)))
			_, _ = w.Write(data)
		}
		return
	}
	if r.Method == http.MethodGet {
		offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
		if r.URL.Query().Get("offset") == "" {
			offset, err = 0, nil
		}
		if err != nil || offset < 0 || offset > 1000000 {
			authError(w, 400, "invalid_request")
			return
		}
		rows, err := pool.Query(ctx, `SELECT id,size,content_image_access(id,owner_id,'',true) FROM content_images WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2`, owner, offset)
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		items, err := pgx.CollectRows(rows, pgx.RowToStructByPos[contentImageInfo])
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		more := len(items) > 50
		if more {
			items = items[:50]
		}
		if items == nil {
			items = []contentImageInfo{}
		}
		var used int64
		if err = pool.QueryRow(ctx, `SELECT COALESCE(sum(size),0) FROM content_images WHERE owner_id=$1`, owner).Scan(&used); err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		writeAuthJSON(w, 200, map[string]any{"items": items, "usedBytes": used, "hasMore": more})
		return
	}
	if r.Method == http.MethodDelete {
		// Prevent a content save racing the reference check and deletion.
		tx, err := pool.Begin(ctx)
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		defer tx.Rollback(ctx)
		if _, err = tx.Exec(ctx, `LOCK TABLE problem_drafts,blog_posts,contests,contest_problems IN SHARE MODE`); err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		var used bool
		err = tx.QueryRow(ctx, `SELECT content_image_access(id,owner_id,'',true) FROM content_images WHERE id=$1 AND owner_id=$2 FOR UPDATE`, id, owner).Scan(&used)
		if errors.Is(err, pgx.ErrNoRows) {
			authError(w, 404, "image_not_found")
			return
		}
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		if used {
			authError(w, 409, "image_in_use")
			return
		}
		if _, err = tx.Exec(ctx, `DELETE FROM content_images WHERE id=$1 AND owner_id=$2`, id, owner); err == nil {
			err = tx.Commit(ctx)
		}
		if err != nil {
			authError(w, 503, "database_unavailable")
			return
		}
		w.WriteHeader(204)
		return
	}
	var input struct {
		Data string `json:"data"`
	}
	if !readJSONBody(w, r, &input, 720<<10) {
		return
	}
	raw, err := base64.StdEncoding.DecodeString(input.Data)
	if err != nil {
		authError(w, 400, "invalid_image")
		return
	}
	data, media, err := cleanContentImage(raw)
	if err != nil {
		authError(w, 400, "invalid_image")
		return
	}
	digest := sha256.Sum256(data)
	tx, err := pool.Begin(ctx)
	if err != nil {
		authError(w, 503, "database_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	// Serialize deduplication for one uploader without a service-wide lock.
	var lockedOwner string
	if err = tx.QueryRow(ctx, `SELECT owner_id FROM user_profiles WHERE owner_id=$1 FOR UPDATE`, owner).Scan(&lockedOwner); err != nil {
		authError(w, 503, "database_unavailable")
		return
	}
	err = tx.QueryRow(ctx, `SELECT id FROM content_images WHERE owner_id=$1 AND digest=$2`, owner, digest[:]).Scan(&id)
	if err == nil {
		writeAuthJSON(w, 200, map[string]any{"id": id, "url": "/api/images/" + id, "size": len(data)})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		authError(w, 503, "database_unavailable")
		return
	}
	id = newSubmissionID()
	_, err = tx.Exec(ctx, `INSERT INTO content_images(id,owner_id,digest,media_type,data,size) VALUES($1,$2,$3,$4,$5,$6)`, id, owner, digest[:], media, data, len(data))
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		authError(w, 503, "database_unavailable")
		return
	}
	writeAuthJSON(w, 201, map[string]any{"id": id, "url": "/api/images/" + id, "size": len(data)})
}

package httpapi

import (
	"net/http"
	"time"

	"judge/api/internal/problems"
)

func (p PrivateProblems) notifications(w http.ResponseWriter, r *http.Request, owner string) {
	store, ok := p.Store.(*problems.Store)
	if !ok {
		authError(w, 503, "database_unavailable")
		return
	}
	type notification struct {
		ID        string    `json:"id"`
		ProblemID string    `json:"problemId"`
		Title     string    `json:"title"`
		Actor     string    `json:"actor"`
		Kind      string    `json:"kind"`
		CreatedAt time.Time `json:"createdAt"`
	}
	// UPDATE ... RETURNING gives the bell exactly the notifications read by this
	// request. Events arriving afterwards stay unread.
	query := `SELECT n.id,n.problem_id,p.draft->>'title',u.handle,n.kind,n.created_at FROM notifications n JOIN problem_drafts p ON p.id=n.problem_id JOIN user_profiles u ON u.owner_id=n.actor_id WHERE n.owner_id=$1 AND n.read_at IS NULL ORDER BY n.created_at DESC,n.id DESC`
	if r.Method == http.MethodPost {
		query = `WITH opened AS (UPDATE notifications SET read_at=clock_timestamp() WHERE owner_id=$1 AND read_at IS NULL RETURNING *) SELECT n.id,n.problem_id,p.draft->>'title',u.handle,n.kind,n.created_at FROM opened n JOIN problem_drafts p ON p.id=n.problem_id JOIN user_profiles u ON u.owner_id=n.actor_id ORDER BY n.created_at DESC,n.id DESC`
	} else if r.URL.Query().Get("history") == "1" {
		query = `SELECT n.id,n.problem_id,p.draft->>'title',u.handle,n.kind,n.created_at FROM notifications n JOIN problem_drafts p ON p.id=n.problem_id JOIN user_profiles u ON u.owner_id=n.actor_id WHERE n.owner_id=$1 ORDER BY n.created_at DESC,n.id DESC`
	}
	rows, err := store.Pool().Query(r.Context(), query, owner)
	if err != nil {
		problemError(w, err)
		return
	}
	defer rows.Close()
	items := []notification{}
	for rows.Next() {
		var item notification
		if err = rows.Scan(&item.ID, &item.ProblemID, &item.Title, &item.Actor, &item.Kind, &item.CreatedAt); err != nil {
			problemError(w, err)
			return
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		problemError(w, err)
		return
	}
	writeAuthJSON(w, 200, map[string]any{"notifications": items})
}

package store

import (
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgtype"
)

// Cursor paging, the stack's shape for every list: the client sends page_size
// and the page_token from the previous answer, the server answers the rows
// and a next_page_token that is empty on the last page. The token is the
// keyset (created_at, id) of the last row, opaque to the client, so a row
// inserted between two pages cannot shift the rest the way an offset would.

// pageWindow is one page newest first: the query's limit, one over the page
// so a fuller answer says another page follows, and where the page starts.
type pageWindow struct {
	size     int
	limit    int32
	before   pgtype.Timestamptz
	beforeID pgtype.UUID
}

// newPageWindow reads a request's page size (0 for the default, capped at
// the most) and token (empty for the top). CodeInvalidArgument for a token
// this service did not issue.
func newPageWindow(pageSize int, token string, defaultSize, maxSize int) (pageWindow, error) {
	size := pageSize
	if size <= 0 {
		size = defaultSize
	}
	size = min(size, maxSize)
	w := pageWindow{size: size, limit: int32(size + 1)}
	if token != "" {
		at, id, err := decodePageToken(token)
		if err != nil {
			return w, connect.NewError(connect.CodeInvalidArgument, errors.New("page_token is not one this service issued"))
		}
		w.before, w.beforeID = pgtype.Timestamptz{Time: at, Valid: true}, id
	}
	return w, nil
}

// trimPage cuts the extra row and gives the token for the next page, "" on
// the last. key reads the keyset of a row.
func trimPage[R any](w pageWindow, rows []R, key func(R) (time.Time, pgtype.UUID)) ([]R, string) {
	if len(rows) <= w.size {
		return rows, ""
	}
	rows = rows[:w.size]
	at, id := key(rows[len(rows)-1])
	return rows, encodePageToken(at, id)
}

func encodePageToken(at time.Time, id pgtype.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(at.UnixNano(), 10) + ":" + uuidString(id)))
}

func decodePageToken(token string) (time.Time, pgtype.UUID, error) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return time.Time{}, pgtype.UUID{}, err
	}
	nanos, idText, ok := strings.Cut(string(raw), ":")
	if !ok {
		return time.Time{}, pgtype.UUID{}, errors.New("malformed page token")
	}
	n, err := strconv.ParseInt(nanos, 10, 64)
	if err != nil {
		return time.Time{}, pgtype.UUID{}, err
	}
	id, err := parseUUID(idText)
	if err != nil {
		return time.Time{}, pgtype.UUID{}, err
	}
	return time.Unix(0, n), id, nil
}

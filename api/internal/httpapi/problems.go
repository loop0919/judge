package httpapi

import (
	"encoding/json"
	"net/http"
)

// The initial public catalogue contains one sample. Test sets and judge-only
// metadata must remain separate from this public response.
type publicProblem struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Description   string          `json:"description"`
	Statement     []string        `json:"statement"`
	Constraints   []string        `json:"constraints"`
	InputFormat   string          `json:"inputFormat"`
	OutputFormat  string          `json:"outputFormat"`
	Samples       []problemSample `json:"samples"`
	TimeLimitMS   int             `json:"timeLimitMs"`
	MemoryLimitMB int             `json:"memoryLimitMb"`
	IsSample      bool            `json:"isSample"`
}

type problemSample struct {
	Input       string `json:"input"`
	Output      string `json:"output"`
	Explanation string `json:"explanation"`
}

func problemDetail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.PathValue("id") != "a-plus-b" {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "problem_not_found"})
		return
	}
	_ = json.NewEncoder(w).Encode(publicProblem{
		ID: "a-plus-b", Title: "A + B", IsSample: true,
		Description: "2 つの整数 A と B を受け取り、その和を出力する問題です。標準入力と標準出力の基本を確認できます。",
		Statement: []string{
			"2 つの整数 $A$ と $B$ が与えられます。$A + B$ の値を求めてください。",
			"入力を標準入力から読み取り、計算した結果を標準出力に出力してください。",
		},
		Constraints: []string{`$0 \le A \le 10^9$`, `$0 \le B \le 10^9$`, "入力はすべて整数である。"},
		InputFormat: `$A \quad B$`, OutputFormat: "$A + B$ の値を 1 行に出力してください。末尾に改行を入れてください。",
		Samples: []problemSample{
			{Input: "3 5\n", Output: "8\n", Explanation: "$3 + 5 = 8$ なので、$8$ を出力します。"},
			{Input: "1000000000 1000000000\n", Output: "2000000000\n", Explanation: "制約の上限の値が与えられる場合もあります。"},
		},
		TimeLimitMS: 2000, MemoryLimitMB: 256,
	})
}

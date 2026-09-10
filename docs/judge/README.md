# ジャッジ設計

ジャッジは、ユーザーの提出を受け付けるバックエンドから分離し、AWS Fargate上でプログラムをコンパイルして実行する。

現在の設計は次の文書に分けて管理する。

- [実行モデル](execution-model.md)：一つの提出が受理されてから採点結果が保存されるまでの流れ。
- [ランタイム方針](runtime-policy.md)：対応する提出形式と計算資源の契約。
- [ローカルC++提出](local-cpp.md)：開発用Dockerワーカーの起動、テスト登録、提出と結果確認。

設計を選んだ理由は、[Architecture Decision Records](../adr/README.md)に記録する。

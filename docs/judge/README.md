# ジャッジ設計

ジャッジは、ユーザーの提出を受け付けるバックエンドから分離し、Lightsailの2 GBインスタンス上でisolateを使ってプログラムをコンパイルして実行する設計である。
Lightsail用のTerraformとC++17ワーカーを追加しており、[構築手順](../../judge/README.md)に従って実機検証後に有効化する。
ローカル開発用Dockerワーカーも引き続き使用できる。

現在の設計は次の文書に分けて管理する。

- [実行モデル](execution-model.md)：一つの提出が受理されてから採点結果が保存されるまでの流れ。
- [ランタイム方針](runtime-policy.md)：対応する提出形式と計算資源の契約。
- [ローカルC++提出](local-cpp.md)：開発用Dockerワーカーの起動、テスト登録、提出と結果確認。
- [32 MiBのテストファイル](large-test-files.md)：S3への直接転送、編集用ファイルと採点用アーカイブの設計案。

設計を選んだ理由は、[Architecture Decision Records](../adr/README.md)に記録する。

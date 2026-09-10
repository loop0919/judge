# Architecture Decision Records

Architecture Decision Record（ADR）は、採用した設計だけでなく、その設計が必要になった状況と代替案を記録する。

実装時に変更される設定値は仕様書へ置き、ADRには長く残る判断を記載する。

採用済みの判断を変更するときは既存のADRを書き換えず、新しいADRから置き換え対象を明示する。

## 記録一覧

| ID | 状態 | 決定 |
| --- | --- | --- |
| [0001](0001-use-aws-fargate-for-judge-execution.md) | Superseded by 0005 | 採点実行基盤にAWS Fargateを採用する |
| [0002](0002-standardize-judge-task-resources.md) | Superseded by 0005 | ジャッジタスクのリソースを統一する |
| [0003](0003-store-test-sets-in-amazon-s3.md) | Accepted（採点時の取得は0005で変更） | テストセットをAmazon S3へ保存する |
| [0004](0004-use-postgresql-as-primary-database.md) | Accepted | 主データベースにPostgreSQLを採用する |
| [0005](0005-use-firecracker-and-isolate-on-ec2.md) | Superseded by 0006 | EC2上のFirecrackerとisolateで採点する |
| [0006](0006-use-lightsail-and-isolate.md) | Accepted | Lightsailの2 GBインスタンスでisolateを使う |

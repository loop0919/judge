# ジャッジのランタイム方針

## 初期対応する提出形式

初期リリースでは、次の提出形式を提供する方針とする。
実機smokeの確認日は2026年9月12日である。
実装と公開は別に管理し、現在の受付対象はAPIの`GET /runtimes`で確認する。

| 提出形式 | コンパイル | 実行基盤 | 状態 |
| --- | --- | --- | --- |
| C23（GCC、Clang） | あり | Lightsail / isolate | 実装済み、実機smoke合格 |
| C++17、C++23（GCC、Clang） | あり | Lightsail / isolate | 実装済み、実機smoke合格。C++17はGCCのみ |
| Rust | あり | Lightsail / isolate | 実装済み、実機smoke合格 |
| Java | あり | Lightsail / isolate | 実装済み、実機smoke合格。保守されている版を決めるまで公開保留 |
| CPython、PyPy | 構文検査 | Lightsail / isolate | 実装済み、実機smoke合格 |
| Codon | ネイティブコンパイル | Lightsail / isolate | 実装済み、実機smoke合格 |
| `txt` | 未決定 | 未決定 | 採用済み（判定方式は未決定） |

C++17はUbuntu 24.04のg++を`-std=c++17 -O2 -pipe`で実行する。
インストール時に実際のパッケージ一覧、カーネル、isolate、制御コードを指紋化し、採点時に一致を確認する。
追加言語の構成は[ADR 0007](../adr/0007-limit-judge-runtime-libraries.md)に従う。
実行コマンドは`judge/runtimes.py`、配布元とSHA-256は`judge/runtime-sources.lock.json`に固定する。
構築済みであっても、実機のsmoke testに合格して公開リストへ追加するまで提出を受け付けない。

## ランタイム識別子

同じ言語でも、コンパイラや実行条件が変われば採点結果が変わり得る。
そこで、各実行環境を**ランタイム識別子**で区別する。

ランタイム識別子は、少なくとも次の情報へ一意に対応させる。

- 言語名。
- コンパイラまたはインタープリターの版。
- コンパイル引数。
- 実行引数。
- 利用可能なライブラリとその版。
- ホストのパッケージ一覧と制御コードのダイジェスト。
- ホストカーネルとisolateの版と設定。
- Lightsailのプランとsystemdの資源制限。
- 実行時間係数。
- メモリ制御方法。

現在の実装では、`cpp17-isolate`などのランタイム名とruntime digestの組を実行条件の識別に使う。
変更時はdigestを更新し、旧digestの提出を異なる条件で採点しない。
旧環境を保存して再採点する仕組みは未実装である。

## 共通の計算資源

各言語を専用ホスト上のisolateで実行する。

| 項目 | 方針 |
| --- | --- |
| Lightsailのプラン | IPv6専用、2 GB、2 vCPU |
| 同時実行と管理側上限 | 1提出、CPU 1個相当、サービス全体1.5 GiB |
| ユーザープログラムのメモリ上限 | 512 MiB |
| 採点上の実行時間 | 提出プロセスと子孫の合計CPU時間 |
| 経過時間 | CPU時間とは別の監視上限を設ける |
| 最大メモリ使用量 | ケース専用cgroupのピーク使用量 |

ユーザープログラムの上限は、そのプログラムが生成した子孫プロセスを含めて適用する。
コンパイル処理の上限は、この512 MiBとは別にランタイムごとに定める。
コンパイル用上限は初期値として全言語で1 GiB、CPU 30秒、経過40秒とする。
Javaはヒープ256 MiB、メタスペース96 MiB、コードキャッシュ32 MiB、直接メモリ32 MiBに制限し、Serial GCを使う。
NumPyとSciPyの内部スレッドは1本に制限する。
Javaのヒープ上限による例外終了など、cgroup OOMを伴わない停止はREとして扱う。
Javaは`-XX:-UsePerfData`を指定し、隔離環境で作成できない性能計測用ファイルの警告が標準出力へ混ざることを防ぐ。
Rustは`/etc/alternatives`を参照せず、リンカーを`/usr/bin/gcc`へ固定する。
計測値の単位と欠測、判定の根拠は[実行モデル](execution-model.md)に従う。

## 判定結果

初期の`judge-runner`は、少なくとも次の結果を返す。

- Accepted。
- Wrong Answer。
- Time Limit Exceeded。
- Memory Limit Exceeded。
- Runtime Error。
- Compile Error。
- Output Limit Exceeded。
- Judge Error。

サービス全体やホストのメモリ不足はJudge Errorとし、Memory Limit Exceededへ読み替えない。
ケース用cgroupのOOMなど、ユーザープロセス群のメモリ制限による停止を確認した場合にMemory Limit Exceededとして記録する。

## 計測後に決める項目

C++17の初期値は[実行モデル](execution-model.md)に記録した。
次の項目はLightsail実機での計測と他言語対応時に再検討する。

- コンパイル時間の上限。
- コンパイル時のメモリ上限。
- テストケースごとのCPU時間上限と経過時間上限。
- LightsailのCPU残高とホスト競合による計測差、同時実行数。
- 言語ごとの実行時間係数。
- 出力サイズの上限。
- プロセス数とファイル記述子数の上限。
- Javaのヒープ、ネイティブメモリ、スレッドスタックの配分。
- Rustで利用できる外部crate。
- C++で利用できる追加ライブラリ。
- `txt`提出の判定方式。

## 関連する決定

- [ADR 0006](../adr/0006-use-lightsail-and-isolate.md)
- [ADR 0007](../adr/0007-limit-judge-runtime-libraries.md)
- [ランタイムの再構築と公開](runtime-rollout.md)

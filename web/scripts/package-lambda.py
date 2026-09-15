"""Package Nitro's Lambda output, including public assets at their expected paths."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from hashlib import sha256
from io import BytesIO
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
output = root / '.output-lambda'
if not (output / 'server/index.mjs').is_file():
    raise SystemExit('Run bun run build:lambda first')
(root / '.build').mkdir(exist_ok=True)
# Match packageManager and flake.lock; verify the official ARM64 release before packaging.
bun_archive = root / '.build/bun-linux-aarch64-1.3.13.zip'
if not bun_archive.exists():
    with urlopen('https://github.com/oven-sh/bun/releases/download/bun-v1.3.13/bun-linux-aarch64.zip', timeout=60) as response:
        bun_archive.write_bytes(response.read())
bun_bytes = bun_archive.read_bytes()
if sha256(bun_bytes).hexdigest() != '70bae41b3908b0a120e1e58c5c8af30e74afae3b8d11b0d3fdd8e787ddfb4b22':
    raise SystemExit(f'Bun checksum mismatch: remove {bun_archive} and retry')
archive = root / '.build/web.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
    def add_directory(directory, ancestors=frozenset()):
        resolved = directory.resolve()
        if not resolved.is_relative_to(output.resolve()) or resolved in ancestors:
            raise RuntimeError(f'Unsafe or circular bundle link: {directory}')
        for path in sorted(directory.iterdir()):
            if path.is_dir():
                add_directory(path, ancestors | {resolved})
            elif path.is_file():
                bundle.write(path, path.relative_to(output))
    # Nitro uses directory symlinks for dependencies; dereference them in the zip.
    add_directory(output)
    bundle.write(root / 'scripts/lambda-runtime.mjs', 'lambda-runtime.mjs')
    for name, data in [('bootstrap', (root / 'scripts/bootstrap').read_bytes()),
                       ('bun', ZipFile(BytesIO(bun_bytes)).read('bun-linux-aarch64/bun'))]:
        info = ZipInfo(name)
        info.create_system = 3
        info.external_attr = 0o100755 << 16
        bundle.writestr(info, data, compress_type=ZIP_DEFLATED)
print(f'Packaged {archive.name}: {archive.stat().st_size:,} bytes')

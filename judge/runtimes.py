"""Operator-owned runtime commands. Never accept executable paths from a job."""
ROOT = '/opt/judge-runtimes'
GCC = ROOT + '/gcc/bin/'
CLANG = ROOT + '/llvm/bin/'
INCLUDES = ['-I' + ROOT + '/include']
LIBS = ['-Wl,-rpath,' + ROOT + '/gcc/lib64']
JAVA_CP = ROOT + '/java-libs/*'


def native(compiler, standard, source, extra=()):
    return dict(source=source, compile=[compiler, '-std=' + standard, '-O2', '-pipe',
                '/box/' + source, *extra, '-o', '/box/main'], run=['/box/main'], artifact='native')


def python(executable):
    return dict(source='main.py', compile=[executable, '-I', '-B', '-c',
                "import ast; ast.parse(open('/box/main.py').read())"],
                run=[executable, '-I', '-B', '/box/main'], artifact='source')


RUNTIMES = {
    'cpp17-isolate': native('/usr/bin/g++', 'c++17', 'main.cpp'),
    'c23-gcc-isolate': native(GCC + 'gcc', 'c23', 'main.c', ['-lm', *LIBS]),
    'c23-clang-isolate': native(CLANG + 'clang', 'c23', 'main.c', ['--gcc-toolchain=' + ROOT + '/gcc', '-lm', *LIBS]),
    'cpp23-gcc-isolate': native(GCC + 'g++', 'c++23', 'main.cpp', [*INCLUDES, *LIBS]),
    'cpp23-clang-isolate': native(CLANG + 'clang++', 'c++23', 'main.cpp', ['--gcc-toolchain=' + ROOT + '/gcc', '-stdlib=libstdc++', *INCLUDES, *LIBS]),
    'python314-isolate': python(ROOT + '/python/bin/python3.14'),
    'pypy311-isolate': python(ROOT + '/pypy/bin/pypy3'),
    'codon020-isolate': dict(source='main.py', compile=[ROOT + '/codon/bin/codon', 'build', '-release', '/box/main.py', '-o', '/box/main'], run=['/box/main'], artifact='native'),
    'rust2024-isolate': dict(source='main.rs', compile=[ROOT + '/rust/bin/rustc', '--edition=2024', '-C', 'opt-level=2', '-C', 'linker=/usr/bin/gcc', '@/opt/judge-runtimes/rust/extern.args', '/box/main.rs', '-o', '/box/main'], run=['/box/main'], artifact='native'),
    'java24-isolate': dict(source='Main.java', compile=[ROOT + '/java/bin/javac', '-J-Xmx512m', '-J-XX:ActiveProcessorCount=1', '-J-XX:-UsePerfData', '--release', '24', '-encoding', 'UTF-8', '-cp', JAVA_CP, '-d', '/box/classes', '/box/Main.java'],
        run=[ROOT + '/java/bin/java', '-Xms16m', '-Xmx256m', '-Xss1m', '-XX:MaxMetaspaceSize=96m', '-XX:ReservedCodeCacheSize=32m', '-XX:MaxDirectMemorySize=32m', '-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1', '-XX:+ExitOnOutOfMemoryError', '-XX:-UsePerfData', '-cp', '/box/main:' + JAVA_CP, 'Main'], artifact='java'),
}

ENVIRONMENT = ['LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'HOME=/box',
               'OPENBLAS_NUM_THREADS=1', 'OMP_NUM_THREADS=1', 'MKL_NUM_THREADS=1',
               'NUMEXPR_NUM_THREADS=1', 'PYTHONDONTWRITEBYTECODE=1',
               'CODON_PATH=' + ROOT + '/codon/lib/codon/stdlib']

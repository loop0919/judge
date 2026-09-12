"""Run under the production service limits, with the worker stopped."""
import json
from pathlib import Path


def run(runtime, requested, fixtures, judge):
    c = '#include <stdio.h>\n#include <assert.h>\nint main(){for(int n=10;n<12;n++){printf("%d\\n",n);fflush(stdout);int x;assert(scanf("%d",&x)==1 && x==2*n);}}'
    python = 'for n in range(10,12):\n print(n, flush=True)\n assert int(input()) == n*2'
    rust = 'use std::io::{self,Write}; fn main(){for n in 10..12 {println!("{}",n);io::stdout().flush().unwrap();let mut s=String::new();io::stdin().read_line(&mut s).unwrap();assert_eq!(s.trim().parse::<i32>().unwrap(),2*n);}}'
    java = 'import java.util.*; public class Main {public static void main(String[] a){Scanner s=new Scanner(System.in);for(int n=10;n<12;n++){System.out.println(n);System.out.flush();assert s.nextInt()==2*n;}}}'
    solution = '#include <cstdio>\nint main(){int n;while(scanf("%d",&n)==1){printf("%d\\n",2*n);fflush(stdout);}}'
    def check(name, source, code, want, *, submitted='cpp17-isolate', cases=None):
        job = dict(runtime=submitted, runtimeDigest=runtime, source=source,
                   interactor=dict(runtime=name.removesuffix('-isolate'), source=code),
                   timeLimitMs=1000, memoryLimitMb=512,
                   cases=cases or [dict(input='10', output='private expected')] * 2)
        result = judge(job, runtime)
        assert result['verdict'] == want, (name, want, result)
        print(name, 'interactive', want, 'OK', flush=True)
        return result
    for name in requested:
        code = c if name.startswith(('cpp', 'c23')) else rust if name.startswith('rust') else java if name.startswith('java') else python
        check(name, solution, code, 'AC')
        check(name, solution.replace('2*n', '3*n'), code, 'WA')
        # Library fixtures also execute under the interactor's 256 MiB limit.
        for fixture in fixtures[name]:
            if fixture['verdict'] != 'AC':
                continue
            source = '''#include <iostream>
#include <sstream>
#include <iterator>
#include <unistd.h>
#include <cassert>
int main(){std::cout<<INPUT<<std::flush;close(1);std::string data((std::istreambuf_iterator<char>(std::cin)),{});std::istringstream a(data),b(EXPECTED);std::string x,y;while(b>>y){assert(a>>x);assert(x==y);}assert(!(a>>x));}'''.replace('INPUT', json.dumps(fixture.get('input', ''))).replace('EXPECTED', json.dumps(fixture.get('output', '3')))
            check(name, source, fixture['source'], 'AC')
    private = '''import os,sys
assert len(sys.argv)==5
assert open(sys.argv[1]).read()=='10'
assert open(sys.argv[2]).read()=='private expected'
assert open(sys.argv[3]).read()
with open(sys.argv[4],'w') as f: f.write('1')
assert os.getuid()==60001
assert not os.path.exists('marker')
open('marker','w').close()
assert not os.path.exists('/run/judge/main')
assert not os.path.exists('/root/.aws/credentials')
print(10,flush=True)
assert int(input())==20
assert sys.stdin.read()==''
print('private diagnostic',file=sys.stderr)
'''
    private_solution = '''import os
assert os.getuid()==60000
for p in ('/box/test-input','/box/expected-output','/box/submission-source','/run/judge/main','/root/.aws/credentials'):
 assert not os.path.exists(p)
assert not os.path.exists('marker')
open('marker','w').close()
print(int(input())*2,flush=True)
'''
    result = check('python314-isolate', private_solution, private, 'AC', submitted='python314-isolate')
    assert 'private diagnostic' in result['checkerLog']
    # The 768 MiB allocation stays live on both sides, plus files and relay buffers.
    stress = '''import sys
memory=bytearray(MEMORY*1024*1024)
with open('working-file','wb') as f: f.write(b'x'*(16*1024*1024))
'''
    check('python314-isolate', stress.replace('MEMORY', '420') + 'print(int(input())*2,flush=True)',
          stress.replace('MEMORY', '180') + 'print(10,flush=True)\nassert int(input())==20', 'AC', submitted='python314-isolate')
    for source, code, want in [
        ('int main(){}', 'invalid interactor', 'JE'),
        ('invalid solution', c, 'CE'),
        ('int main(){return 2;}', c, 'RE'),
        ('int main(){for(;;){}}', c, 'TLE'),
        (solution, 'int main(){for(;;){}}', 'JE'),
        (solution, '#include <unistd.h>\nint main(){sleep(60);}', 'TLE'),
        ('#include <unistd.h>\nint main(){sleep(60);}', 'int main(){}', 'TLE'),
        ('#include <cstdio>\nint main(){for(;;)putchar(65);}', '#include <cstdio>\nint main(){while(getchar()!=EOF){}}', 'OLE'),
        (solution, '#include <cstdio>\nint main(){for(;;)putchar(65);}', 'JE'),
        (solution, '#include <cstdio>\nint main(){for(;;)fputc(65,stderr);}', 'JE'),
    ]:
        check('cpp17-isolate', source, code, want, cases=[dict(input='', output='')])
    allocate = '#include <cstdlib>\nint main(){for(;;){volatile char* p=(char*)malloc(16<<20);if(p)for(int i=0;i<(16<<20);i+=4096)p[i]=1;}}'
    check('cpp17-isolate', allocate, c, 'MLE', cases=[dict(input='', output='')])
    check('cpp17-isolate', solution, allocate, 'JE', cases=[dict(input='', output='')])
    # Descendants cannot survive a completed case or prevent later submissions.
    fork = '#include <unistd.h>\n#include <cstdio>\nint main(){if(fork()==0){sleep(60);return 0;}puts("10");fflush(stdout);int x;return scanf("%d",&x)==1 && x==20 ? 0 : 1;}'
    check('cpp17-isolate', solution, fork, 'AC')
    check('python314-isolate', private_solution, private, 'AC', submitted='python314-isolate')

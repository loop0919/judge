#!/usr/bin/python3
"""Run on the target Lightsail host, with the queue worker stopped. No AWS access."""
from host import judge, prepare_cgroup, verify_assets, slot

with slot():
    runtime = verify_assets()
    prepare_cgroup()
    programs = [
        ('AC', '#include <cstdio>\nint main(){puts("3");}'),
        ('WA', '#include <cstdio>\nint main(){puts("4");}'),
        ('CE', 'this does not compile'),
        ('TLE', 'int main(){for(;;){}}'),
        ('TLE', '#include <unistd.h>\nint main(){sleep(60);}'),
        ('MLE', '#include <cstdlib>\nint main(){for(;;){volatile char* p=(char*)malloc(16<<20);if(p)for(int i=0;i<(16<<20);i+=4096)p[i]=1;}}'),
        ('MLE', '#include <unistd.h>\n#include <sys/wait.h>\n#include <cstdlib>\nint main(){for(int n=0;n<3;n++)if(fork()==0){volatile char* p=(char*)malloc(300<<20);if(!p)return 2;for(int i=0;i<(300<<20);i+=4096)p[i]=1;sleep(10);return 0;}while(wait(nullptr)>0){}}'),
        ('AC', '#include <unistd.h>\n#include <cstdio>\nint main(){for(int i=0;i<200;i++){int p=fork();if(p<0){puts("3");return 0;}if(p==0){sleep(10);return 0;}}puts("4");}'),
        ('OLE', '#include <cstdio>\nint main(){for(;;)putchar(65);}'),
        ('AC', '#include <cstdio>\n#include <unistd.h>\nint main(){puts(access("/run/judge/meta",F_OK)==-1?"3":"4");}'),
        ('AC', '#include <unistd.h>\n#include <cstdio>\nint main(){puts(access("/root/.aws/credentials",F_OK)==-1 && access("/opt/judge/worker.env",F_OK)==-1 && access("/etc/shadow",F_OK)==-1?"3":"4");}'),
        ('AC', '#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <cstdio>\nint main(){int s=socket(AF_INET,SOCK_STREAM,0);sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(80);inet_pton(AF_INET,"169.254.169.254",&a.sin_addr);puts(connect(s,(sockaddr*)&a,sizeof(a))==-1?"3":"4");}'),
        ('AC', '#include <cstdio>\nint main(){FILE* f=fopen("marker","r");puts(f?"4":"3");if(f)fclose(f);f=fopen("marker","w");if(f)fclose(f);}'),
    ]
    for expected, source in programs:
        job = dict(runtime='cpp17-isolate', runtimeDigest=runtime, source=source,
                   timeLimitMs=1000, memoryLimitMb=512, cases=[dict(name='first', input='', output='3'), dict(name='fresh', input='', output='3')])
        result = judge(job, runtime)
        assert result['verdict'] == expected, (expected, result)
        print(expected, 'OK', flush=True)

# Sent over an existing SSH/docker exec channel. Nothing is installed remotely.
import os, sys, json, stat, base64, hashlib, tempfile

def info(p):
    s = os.stat(p)
    return {'size': s.st_size, 'mtime': s.st_mtime_ns, 'mode': s.st_mode, 'file': stat.S_ISREG(s.st_mode), 'directory': stat.S_ISDIR(s.st_mode)}

def main(a):
    op = a['op']
    if op == 'probe':
        shells = [s for s in ['bash', 'sh'] if os.access('/bin/' + s, os.X_OK)]
        return {'shells': shells, 'uid': os.geteuid(), 'home': os.path.expanduser('~')}
    root = os.path.realpath(a.get('root') or os.getcwd())
    if not os.path.isdir(root): raise ValueError('工作目录不存在')
    if not os.access(root, os.R_OK | os.X_OK): raise PermissionError('没有目录访问权限')
    if op == 'directory': return {'path': root, 'writable': os.access(root, os.W_OK)}
    rel = a.get('path', '')
    if not isinstance(rel, str) or '\x00' in rel or '\\' in rel or rel.startswith('/') or '..' in rel.split('/'): raise ValueError('路径必须位于项目目录中')
    requested = os.path.join(root, rel)
    full = os.path.join(os.path.realpath(os.path.dirname(requested)), os.path.basename(requested)) if op == 'write' else os.path.realpath(requested)
    if os.path.commonpath([root, full]) != root: raise ValueError('不能访问项目目录之外的文件')
    if op == 'resolve': return {'root': root, 'full': full, 'relative': os.path.relpath(full, root) if full != root else ''}
    if op == 'stat': return info(full)
    if op == 'list':
        entries = []
        with os.scandir(full) as it:
            for e in it:
                if e.is_symlink(): continue
                if not (e.is_dir(follow_symlinks=False) or e.is_file(follow_symlinks=False)): continue
                entries.append({'name': e.name, 'path': os.path.relpath(e.path, root), 'directory': e.is_dir(follow_symlinks=False)})
                if len(entries) > 2000: break
        return {'entries': entries[:2000], 'truncated': len(entries) > 2000}
    if op == 'bytes':
        limit = min(int(a.get('limit', 1048576)), 33554432)
        with open(full, 'rb') as f:
            if not stat.S_ISREG(os.fstat(f.fileno()).st_mode): raise ValueError('仅支持普通文件')
            data = f.read(limit + 1)
        if len(data) > limit: raise ValueError('文件超过读取大小限制')
        return {'data': base64.b64encode(data).decode('ascii')}
    if op == 'write':
        data = a['text'].encode('utf-8')
        if len(data) > 196608: raise ValueError('写入文本超过大小限制')
        def check():
            if os.path.lexists(full):
                s = os.lstat(full)
                if not stat.S_ISREG(s.st_mode): raise ValueError('不能覆盖目录或符号链接')
                if s.st_size > 1048576: raise ValueError('文件已变化，请重新读取')
                with open(full, 'rb') as f: digest = hashlib.sha256(f.read(1048577)).hexdigest()
                if digest != a['expectedSha256']: raise ValueError('文件已变化，请重新读取')
                return stat.S_IMODE(s.st_mode)
            if a['expectedSha256'] is not None: raise ValueError('文件已变化，请重新读取')
            return 0o600
        mode = check()
        fd, temp = tempfile.mkstemp(prefix='.amble-', dir=os.path.dirname(full))
        try:
            with os.fdopen(fd, 'wb') as f:
                os.fchmod(f.fileno(), mode); f.write(data); f.flush(); os.fsync(f.fileno())
            check()  # Best-effort conflict detection, not cross-client atomic CAS.
            if a['expectedSha256'] is None:
                os.link(temp, full)  # Refuse overwrite if a concurrent creator won.
                os.unlink(temp)
            else: os.replace(temp, full)
        finally:
            if os.path.exists(temp): os.unlink(temp)
        return {'path': rel, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    raise ValueError('不支持的文件操作')

try:
    print(json.dumps({'result': main(json.load(sys.stdin))}, ensure_ascii=True))
except Exception as e:
    print(json.dumps({'error': str(e)}, ensure_ascii=True))
    sys.exit(1)

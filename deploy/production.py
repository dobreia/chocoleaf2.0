#!/usr/bin/env python3
"""Root-owned RackForest deployer. Only a validated release archive is accepted."""
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid
from pathlib import Path, PurePosixPath

REPOSITORY = "dobreia/chocoleaf2.0"
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_CONTENTS = 1024 * 1024 * 1024
BASE = Path("/var/www/chocoleaf2")
CURRENT = Path("/var/www/chocoleaf-current")
RELEASES = Path("/var/www/chocoleaf-releases")
INCOMING = Path("/var/lib/chocoleaf-deploy/incoming")
BACKUPS = Path("/var/backups/chocoleaf")
NODE = "/opt/chocoleaf-node24/bin/node"
NPM = "/opt/chocoleaf-node24/bin/npm"
LIBVIPS = "/opt/chocoleaf-libvips/lib"


class DeployError(RuntimeError):
    pass


def valid_commit(value):
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise DeployError("Invalid commit identifier.")
    return value


def allowed_path(name):
    path = PurePosixPath(name)
    if (not name or "\\" in name or any(ord(c) < 32 for c in name) or path.is_absolute()
            or path.as_posix() != name or any(p in (".", "..") or p.startswith(".") for p in path.parts)):
        raise DeployError("Unsafe archive path: " + name)
    exact = {"release.json", "backend/package.json", "backend/package-lock.json"}
    prefixes = ("backend/src/", "backend/migrations/", "backend/data/",
                "frontend/dist/", "frontend/public/assets/")
    if name not in exact and not name.startswith(prefixes):
        raise DeployError("Unexpected archive path: " + name)
    return path


def read_json(archive, member):
    if member.size > 1024 * 1024:
        raise DeployError("Oversized JSON manifest.")
    with archive.extractfile(member) as source:
        return json.load(source)


def validate_archive(filename, commit, allow_preview=False):
    valid_commit(commit)
    members, size = {}, 0
    with tarfile.open(filename, "r:gz") as archive:
        for member in archive:
            allowed_path(member.name)
            if not member.isfile() or member.name in members or member.size > 128 * 1024 * 1024:
                raise DeployError("Only unique regular files are permitted.")
            members[member.name] = member
            size += member.size
            if len(members) > 10000 or size > MAX_CONTENTS:
                raise DeployError("Release exceeds deployment size limits.")
        required = {"release.json", "backend/package.json", "backend/package-lock.json",
                    "backend/src/index.js", "backend/src/migrate.js", "backend/src/db.js",
                    "frontend/dist/index.html", "frontend/dist/version.json"}
        if not required.issubset(members):
            raise DeployError("Incomplete release.")
        manifest = read_json(archive, members["release.json"])
        ref = manifest.get("ref")
        refs = {"refs/heads/prod", "refs/heads/dev"} if allow_preview else {"refs/heads/prod"}
        if ref not in refs or manifest != {"commit": commit, "repository": REPOSITORY, "ref": ref, "format": 1}:
            raise DeployError("Release manifest does not match the requested prod commit.")
        if read_json(archive, members["frontend/dist/version.json"]) != {"commit": commit}:
            raise DeployError("Frontend version does not match the commit.")
        package = read_json(archive, members["backend/package.json"])
        sharp = package.get("dependencies", {}).get("sharp", "")
        if not re.fullmatch(r"\d+\.\d+\.\d+", sharp):
            raise DeployError("The Sharp version must be pinned exactly.")
    return sharp


def extract_release(filename, destination):
    # Do not use extractall: archive metadata, links and permissions are never trusted.
    with tarfile.open(filename, "r:gz") as archive:
        for member in archive:
            target = destination.joinpath(*allowed_path(member.name).parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with archive.extractfile(member) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o644)


def check_migrations(previous, candidate):
    for old in previous.glob("*.sql"):
        new = candidate / old.name
        if not new.is_file() or old.read_text(encoding="utf8") != new.read_text(encoding="utf8"):
            raise DeployError("An existing migration was changed or removed: " + old.name)


def switch_current(target, current=CURRENT):
    temporary = current.with_name(current.name + "." + uuid.uuid4().hex)
    temporary.symlink_to(target, target_is_directory=True)
    os.replace(temporary, current)


def command(args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def as_app(args, directory):
    command(["runuser", "-u", "chocoleaf", "--", "env", "NODE_ENV=production",
             "PATH=/opt/chocoleaf-node24/bin:/usr/bin:/bin", "LD_LIBRARY_PATH=" + LIBVIPS,
             *args], cwd=directory)


def local_health():
    import urllib.request
    with urllib.request.urlopen("http://127.0.0.1:3001/api/health", timeout=5) as response:
        return json.load(response) == {"status": "ok"}


def wait_for_health():
    for _ in range(30):
        try:
            if local_health():
                return
        except Exception:
            pass
        time.sleep(1)
    raise DeployError("The backend did not become healthy.")


def public_health(commit):
    import urllib.request
    base = "https://www.chocoleaf.hu"
    with urllib.request.urlopen(base + "/version.json?deploy=" + commit, timeout=15) as response:
        if json.load(response) != {"commit": commit}:
            raise DeployError("The public frontend is not the requested release.")
    with urllib.request.urlopen(base + "/api/health", timeout=15) as response:
        if json.load(response) != {"status": "ok"}:
            raise DeployError("The public API health check failed.")
    for route in ("/", "/courses", "/admin"):
        with urllib.request.urlopen(base + route, timeout=15) as response:
            if b'id="root"' not in response.read():
                raise DeployError("Frontend route failed: " + route)


def activate(candidate, previous, backup):
    stopped = False
    try:
        # Stop writers before taking the final consistent database snapshot/migrating.
        stopped = True
        command(["systemctl", "stop", "chocoleaf.service"])
        command(["tar", "-czf", backup / "persistent-files.tar.gz", "-C", BASE / "backend", "uploads", "private/vouchers"])
        with (backup / "database.dump").open("xb") as output:
            command(["runuser", "-u", "postgres", "--", "/usr/lib/postgresql/18/bin/pg_dump",
                     "--port=5433", "--format=custom", "--no-owner", "--no-acl", "chocoleaf"], stdout=output)
        # migrate() is transactional. Never restore the database automatically on rollback.
        as_app([NODE, "src/migrate.js"], candidate / "backend")
        switch_current(candidate)
        command(["systemctl", "start", "chocoleaf.service"])
        wait_for_health()
        public_health(json.loads((candidate / "release.json").read_text())["commit"])
    except BaseException:
        if stopped:
            print("Activation failed; restoring the previous code. Database is preserved.", flush=True)
            command(["systemctl", "stop", "chocoleaf.service"])
            switch_current(previous)
            command(["systemctl", "start", "chocoleaf.service"])
            wait_for_health()
        raise


def deploy(commit, check_only=False):
    import fcntl
    import pwd
    if os.geteuid() != 0:
        raise DeployError("This helper must be invoked by the restricted sudo command.")
    valid_commit(commit)
    with open("/run/lock/chocoleaf-deploy.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = CURRENT.resolve(strict=True)
        if previous != BASE and previous.parent != RELEASES:
            raise DeployError("Unexpected current release target.")
        incoming = INCOMING / (commit + ".tar.gz")
        backup = BACKUPS / (time.strftime("%Y%m%d-%H%M%S") + "-" + commit[:12] + "-" + uuid.uuid4().hex[:6])
        backup.mkdir(parents=True, mode=0o700)
        archive = backup / "release.tar.gz"
        descriptor = os.open(incoming, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as source, archive.open("xb") as output:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise DeployError("The uploaded bundle must be a regular file.")
            total = 0
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_ARCHIVE:
                    raise DeployError("The upload exceeds 256 MiB.")
                output.write(chunk)
        sharp = validate_archive(archive, commit, allow_preview=check_only)
        native = Path("/var/lib/chocoleaf/native") / ("sharp-linux-x64-" + sharp + ".node")
        if not native.is_file():
            raise DeployError("No native Sharp build for " + sharp + "; compile it for this VPS before deploying.")
        candidate = RELEASES / (commit + "-" + uuid.uuid4().hex[:8])
        app = pwd.getpwnam("chocoleaf")
        candidate.mkdir(mode=0o755)
        os.chown(candidate, app.pw_uid, app.pw_gid)
        candidate.chmod(0o755)
        # Even extraction and npm lifecycle scripts run without root privileges.
        with archive.open("rb") as source:
            command(["runuser", "-u", "chocoleaf", "--", "tar", "-xzf", "-", "-C", candidate,
                     "--no-same-owner", "--no-same-permissions"], stdin=source)
        as_app([NODE, "-e", """
const fs=require('fs'),path=require('path');
function normalize(dir){fs.chmodSync(dir,0o755);for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const p=path.join(dir,e.name);if(e.isDirectory())normalize(p);else if(e.isFile())fs.chmodSync(p,0o644);else throw Error('Unexpected archive entry');
}}normalize('.');
fs.symlinkSync('/var/www/chocoleaf2/backend/.env','backend/.env');
fs.symlinkSync('/var/www/chocoleaf2/backend/uploads','backend/uploads','dir');
fs.mkdirSync('backend/private',{mode:0o700});
fs.symlinkSync('/var/www/chocoleaf2/backend/private/vouchers','backend/private/vouchers','dir');
fs.chmodSync('backend',0o700);
"""], candidate)
        check_migrations(previous / "backend/migrations", candidate / "backend/migrations")
        backend = candidate / "backend"
        # Existing browser tabs may still request the preceding hashed JS/CSS chunks.
        as_app([NODE, "-e", """
const fs=require('fs'),path=require('path');const from=process.argv[1];
function copy(dir,relative=''){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const r=path.join(relative,e.name),p=path.join(dir,e.name),target=path.join('frontend/dist/assets',r);
 if(e.isDirectory())copy(p,r);else if(e.isFile()&&/\\.(js|css)$/.test(e.name)&&!fs.existsSync(target)){
 fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o755});
 for(let d=path.dirname(target);d!=='frontend/dist';d=path.dirname(d))fs.chmodSync(d,0o755);
 fs.copyFileSync(p,target);fs.chmodSync(target,0o644);
 }}}copy(from);
""", str(previous / "frontend/dist/assets")], candidate)
        as_app([NPM, "ci", "--omit=dev", "--no-audit", "--no-fund"], backend)
        as_app([NODE, "-e", "const fs=require('fs'),path=require('path');const from=process.argv[1],to=path.join('node_modules/sharp/src/build/Release',path.basename(from));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);fs.chmodSync(to,0o600);", str(native)], backend)
        as_app([NODE, "-e", "const sharp=require('sharp');sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).webp().toBuffer().then(b=>{if(!b.length)process.exit(1)}).catch(e=>{console.error(e.message);process.exit(1)})"], backend)
        as_app([NODE, "-e", "require('./src/index.js');require('./src/db').end().then(()=>console.log('Backend module preflight OK'))"], backend)
        check_migrations(previous / "backend/migrations", candidate / "backend/migrations")
        if check_only:
            print("Preflight passed without activation: " + commit, flush=True)
            return
        shutil.copyfile(BASE / "backend/.env", backup / "backend.env")
        (backup / "previous-release.txt").write_text(str(previous) + "\n")
        print("Prepared commit " + commit + "; backup: " + str(backup), flush=True)
        activate(candidate, previous, backup)
        (backup / "success.json").write_text(json.dumps({"commit": commit, "release": str(candidate)}))
        print("Deployment verified: " + commit, flush=True)


def main():
    check_only = len(sys.argv) == 3 and sys.argv[1] == "--check"
    if len(sys.argv) != 2 and not check_only:
        raise DeployError("Usage: chocoleaf-deploy [--check] COMMIT")
    def interrupted(signum, frame):
        raise DeployError("Deployment interrupted by signal " + str(signum))
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, interrupted)
    os.umask(0o077)
    deploy(sys.argv[-1], check_only=check_only)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Deployment failed: " + str(error), file=sys.stderr)
        sys.exit(1)

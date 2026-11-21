#!/usr/bin/env python3
"""Package code/build output, never environment files or production data."""
import io
import json
import sys
import tarfile
from pathlib import Path
from production import REPOSITORY, valid_commit, validate_archive


def package(root, output, commit, preview=False):
    valid_commit(commit)
    folders = ["backend/src", "backend/migrations", "backend/data", "frontend/dist", "frontend/public/assets"]
    files = [root / "backend/package.json", root / "backend/package-lock.json"]
    for folder in folders:
        if not (root / folder).is_dir():
            raise ValueError("Missing release directory: " + folder)
        files.extend(sorted(p for p in (root / folder).rglob("*") if p.is_file()))
    with tarfile.open(output, "w:gz") as archive:
        for file in files:
            relative = file.relative_to(root)
            if any(part.startswith(".") or part == "__MACOSX" for part in relative.parts):
                continue
            if file.is_symlink():
                raise ValueError("Source symlinks are not permitted.")
            name = relative.as_posix()
            if name == "frontend/dist/version.json":
                continue
            archive.add(file, arcname=name, recursive=False)
        for name, value in [
            ("release.json", {"commit": commit, "repository": REPOSITORY, "ref": "refs/heads/dev" if preview else "refs/heads/prod", "format": 1}),
            ("frontend/dist/version.json", {"commit": commit}),
        ]:
            content = json.dumps(value).encode()
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(content), 0o644
            archive.addfile(member, io.BytesIO(content))
    validate_archive(output, commit, allow_preview=preview)


if __name__ == "__main__":
    package(Path(__file__).resolve().parent.parent, Path(sys.argv[2]), sys.argv[1], preview=sys.argv[3:] == ["--check"])

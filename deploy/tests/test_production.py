import importlib.util
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("production", Path(__file__).resolve().parents[1] / "production.py")
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)
SHA = "a" * 40


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.archive = self.root / "release.tar.gz"

    def tearDown(self):
        self.temp.cleanup()

    def bundle(self, extra=None, manifest=None, version=None):
        files = {
            "release.json": json.dumps(manifest or {"commit": SHA, "repository": DEPLOY.REPOSITORY,
                                                     "ref": "refs/heads/prod", "format": 1}),
            "backend/package.json": json.dumps({"dependencies": {"sharp": "0.35.5"}}),
            "backend/package-lock.json": "{}",
            "backend/src/index.js": "module.exports = {};",
            "backend/src/migrate.js": "",
            "backend/src/db.js": "",
            "frontend/dist/index.html": '<div id="root"></div>',
            "frontend/dist/version.json": json.dumps(version or {"commit": SHA}),
        }
        with tarfile.open(self.archive, "w:gz") as archive:
            for name, value in files.items():
                data = value.encode()
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            if extra:
                archive.addfile(extra, io.BytesIO(b"x" * extra.size) if extra.isfile() else None)

    def test_complete_prod_release_is_accepted(self):
        self.bundle()
        self.assertEqual(DEPLOY.validate_archive(self.archive, SHA), "0.35.5")
        output = self.root / "unpacked"
        output.mkdir()
        DEPLOY.extract_release(self.archive, output)
        self.assertTrue((output / "backend/src/index.js").is_file())

    def test_traversal_absolute_windows_hidden_and_unexpected_paths_are_rejected(self):
        for name in ["../evil", "/etc/passwd", "backend/src/../../evil", "backend\\src\\evil",
                     "backend/.env", "frontend/dist/.env", "backend/private/vouchers/a.pdf",
                     "backend/src/a\nfile", "frontend/dist/./index.html", "deploy/install.sh"]:
            with self.subTest(name=name), self.assertRaises(DEPLOY.DeployError):
                DEPLOY.allowed_path(name)

    def test_links_devices_and_duplicate_files_are_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE]:
            extra = tarfile.TarInfo("frontend/dist/escape")
            extra.type, extra.linkname = kind, "/etc"
            self.bundle(extra=extra)
            with self.assertRaises(DEPLOY.DeployError):
                DEPLOY.validate_archive(self.archive, SHA)
        self.bundle(extra=tarfile.TarInfo("backend/src/index.js"))
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.validate_archive(self.archive, SHA)

    def test_other_branch_repository_commit_and_frontend_version_are_rejected(self):
        base = {"commit": SHA, "repository": DEPLOY.REPOSITORY, "ref": "refs/heads/prod", "format": 1}
        for key, value in [("commit", "b" * 40), ("repository", "somebody/other"), ("ref", "refs/heads/dev")]:
            self.bundle(manifest={**base, key: value})
            with self.assertRaises(DEPLOY.DeployError):
                DEPLOY.validate_archive(self.archive, SHA)
        self.bundle(version={"commit": "c" * 40})
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.validate_archive(self.archive, SHA)

    def test_commit_cannot_be_used_as_shell_or_path_input(self):
        for value in ["../tmp", "a" * 39, "a" * 40 + ";id", "a" * 40 + "\n", "A" * 40]:
            with self.assertRaises(DEPLOY.DeployError):
                DEPLOY.valid_commit(value)

    def test_dev_preflight_bundle_can_never_be_activated(self):
        self.bundle(manifest={"commit": SHA, "repository": DEPLOY.REPOSITORY, "ref": "refs/heads/dev", "format": 1})
        self.assertEqual(DEPLOY.validate_archive(self.archive, SHA, allow_preview=True), "0.35.5")
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.validate_archive(self.archive, SHA)

    def test_existing_migrations_are_immutable_but_additions_are_allowed(self):
        old, new = self.root / "old", self.root / "new"
        old.mkdir(); new.mkdir()
        (old / "001.sql").write_text("SELECT 1;")
        (new / "001.sql").write_text("SELECT 1;")
        (new / "002.sql").write_text("SELECT 2;")
        DEPLOY.check_migrations(old, new)
        (old / "001.sql").write_bytes(b"SELECT 1;\r\n")
        (new / "001.sql").write_bytes(b"SELECT 1;\n")
        DEPLOY.check_migrations(old, new)
        (new / "001.sql").write_text("DROP TABLE bookings;")
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.check_migrations(old, new)
        (new / "001.sql").unlink()
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.check_migrations(old, new)

    def test_oversized_and_incomplete_archives_are_rejected(self):
        self.bundle()
        with patch.object(DEPLOY, "MAX_CONTENTS", 1), self.assertRaises(DEPLOY.DeployError):
            DEPLOY.validate_archive(self.archive, SHA)
        with tarfile.open(self.archive, "w:gz"):
            pass
        with self.assertRaises(DEPLOY.DeployError):
            DEPLOY.validate_archive(self.archive, SHA)

    def test_failed_activation_restores_previous_code_without_database_restore(self):
        candidate, previous, backup = self.root / "new", self.root / "old", self.root / "backup"
        candidate.mkdir(); previous.mkdir(); backup.mkdir()
        (candidate / "release.json").write_text(json.dumps({"commit": SHA}))
        with patch.object(DEPLOY, "command") as command, patch.object(DEPLOY, "as_app"), \
                patch.object(DEPLOY, "switch_current") as switch, patch.object(DEPLOY, "wait_for_health"), \
                patch.object(DEPLOY, "public_health", side_effect=DEPLOY.DeployError("not healthy")):
            with self.assertRaises(DEPLOY.DeployError):
                DEPLOY.activate(candidate, previous, backup)
            self.assertEqual([call.args[0] for call in switch.call_args_list], [candidate, previous])
            self.assertFalse(any("pg_restore" in str(call) for call in command.call_args_list))

    def test_failed_migration_restarts_previous_code_and_never_switches_to_new(self):
        candidate, previous, backup = self.root / "new", self.root / "old", self.root / "backup"
        candidate.mkdir(); previous.mkdir(); backup.mkdir()
        with patch.object(DEPLOY, "command"), \
                patch.object(DEPLOY, "as_app", side_effect=DEPLOY.DeployError("migration failed")), \
                patch.object(DEPLOY, "switch_current") as switch, patch.object(DEPLOY, "wait_for_health"):
            with self.assertRaises(DEPLOY.DeployError):
                DEPLOY.activate(candidate, previous, backup)
            switch.assert_called_once_with(previous)

    def test_packager_keeps_customer_files_and_environment_out(self):
        spec = importlib.util.spec_from_file_location("packager", Path(__file__).resolve().parents[1] / "package.py")
        mod = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"production": DEPLOY}):
            spec.loader.exec_module(mod)
        self.bundle()
        source = self.root / "source"
        source.mkdir()
        DEPLOY.extract_release(self.archive, source)
        for folder in ["backend/migrations", "backend/data", "frontend/public/assets", "backend/uploads"]:
            (source / folder).mkdir(parents=True, exist_ok=True)
        (source / "backend/.env").write_text("MAIL_PASS=secret")
        (source / "backend/uploads/private.png").write_bytes(b"private")
        junk=source / "frontend/dist/assets/__MACOSX"
        junk.mkdir(parents=True)
        (junk / "._image.png").write_bytes(b"metadata")
        mod.package(source, self.root / "packed.tar.gz", SHA)
        with tarfile.open(self.root / "packed.tar.gz") as archive:
            names = archive.getnames()
        self.assertNotIn("backend/.env", names)
        self.assertNotIn("backend/uploads/private.png", names)
        self.assertFalse(any("__MACOSX" in name for name in names))


if __name__ == "__main__":
    unittest.main()

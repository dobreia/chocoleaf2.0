#!/bin/bash
# One-time root setup. Do not execute scripts from an uploaded release as root.
set -Eeuo pipefail
umask 077
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
test "$(id -u)" = 0
test -f "$source_dir/production.py"
test -f "$source_dir/ssh-dispatch.sh"
test -f "$source_dir/deploy-key.pub"
test -f /etc/systemd/system/chocoleaf.service
test -f /var/www/chocoleaf2/backend/.env
test -f /var/lib/chocoleaf/native/sharp-linux-x64-0.35.5.node
curl -fsS https://www.chocoleaf.hu/api/health >/dev/null
backup=$(mktemp -d /root/chocoleaf-atvitel/ci-konfiguracio-XXXXXXXX)
cp -a /etc/nginx/sites-available/chocoleaf.hu "$backup/nginx.conf"
cp -a /etc/systemd/system/chocoleaf.service "$backup/chocoleaf.service"
curl -fsS https://www.chocoleaf.hu/ > "$backup/index.before"
rollback() {
    local result="$?"
    trap - ERR
    set +e
    install -o root -g root -m 644 "$backup/nginx.conf" /etc/nginx/sites-available/chocoleaf.hu
    install -o root -g root -m 644 "$backup/chocoleaf.service" /etc/systemd/system/chocoleaf.service
    systemctl daemon-reload
    nginx -t && systemctl reload nginx
    exit "$result"
}
trap rollback ERR
if ! id chocoleaf-deploy >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/chocoleaf-deploy --create-home --shell /bin/bash chocoleaf-deploy
    printf 'dobreia/chocoleaf2.0\n' > /var/lib/chocoleaf-deploy/.chocoleaf-ci-managed
else
    test -f /var/lib/chocoleaf-deploy/.chocoleaf-ci-managed
    grep -qxF 'dobreia/chocoleaf2.0' /var/lib/chocoleaf-deploy/.chocoleaf-ci-managed
fi
chown root:root /var/lib/chocoleaf-deploy
chmod 755 /var/lib/chocoleaf-deploy
install -d -o root -g root -m 755 /var/lib/chocoleaf-deploy/.ssh /usr/local/lib/chocoleaf /var/www/chocoleaf-releases
install -d -o root -g root -m 700 /var/backups/chocoleaf
install -d -o chocoleaf-deploy -g chocoleaf-deploy -m 700 /var/lib/chocoleaf-deploy/incoming
ssh-keygen -lf "$source_dir/deploy-key.pub"
printf 'restrict,command="/usr/local/lib/chocoleaf/ssh-dispatch.sh" %s\n' "$(cat "$source_dir/deploy-key.pub")" > /var/lib/chocoleaf-deploy/.ssh/authorized_keys
chown root:root /var/lib/chocoleaf-deploy/.ssh/authorized_keys
chmod 644 /var/lib/chocoleaf-deploy/.ssh/authorized_keys
install -o root -g root -m 644 "$source_dir/production.py" /usr/local/lib/chocoleaf/production.py
install -o root -g root -m 755 "$source_dir/ssh-dispatch.sh" /usr/local/lib/chocoleaf/ssh-dispatch.sh
cat > /usr/local/sbin/chocoleaf-deploy <<'SH'
#!/bin/sh
exec /usr/bin/python3 -I /usr/local/lib/chocoleaf/production.py "$@"
SH
chown root:root /usr/local/sbin/chocoleaf-deploy
chmod 755 /usr/local/sbin/chocoleaf-deploy
printf 'chocoleaf-deploy ALL=(root) NOPASSWD: /usr/local/sbin/chocoleaf-deploy *\n' > "$backup/sudoers"
visudo -cf "$backup/sudoers"
install -o root -g root -m 440 "$backup/sudoers" /etc/sudoers.d/chocoleaf-deploy
chown root:chocoleaf /var/lib/chocoleaf/native/sharp-linux-x64-0.35.5.node
chmod 640 /var/lib/chocoleaf/native/sharp-linux-x64-0.35.5.node
if test ! -e /var/www/chocoleaf-current; then
    ln -s /var/www/chocoleaf2 /var/www/chocoleaf-current
fi
test -L /var/www/chocoleaf-current
python3 - <<'PY'
from pathlib import Path
current=Path('/var/www/chocoleaf-current').resolve(strict=True)
if current != Path('/var/www/chocoleaf2') and current.parent != Path('/var/www/chocoleaf-releases'):
    raise RuntimeError('Unexpected current target')
nginx=Path('/etc/nginx/sites-available/chocoleaf.hu')
text=nginx.read_text()
old='root /var/www/chocoleaf2/frontend/dist;'
new='root /var/www/chocoleaf-current/frontend/dist;'
if text.count(old)==1:
    nginx.write_text(text.replace(old,new))
elif text.count(new)!=1:
    raise RuntimeError('Unexpected Nginx frontend configuration')
unit=Path('/etc/systemd/system/chocoleaf.service')
text=unit.read_text()
text=text.replace('WorkingDirectory=/var/www/chocoleaf2/backend','WorkingDirectory=/var/www/chocoleaf-current/backend')
text=text.replace('ExecStart=/opt/chocoleaf-node24/bin/node /var/www/chocoleaf2/backend/src/index.js',
                  'ExecStart=/opt/chocoleaf-node24/bin/node /var/www/chocoleaf-current/backend/src/index.js')
if 'WorkingDirectory=/var/www/chocoleaf-current/backend' not in text or 'node /var/www/chocoleaf-current/backend/src/index.js' not in text:
    raise RuntimeError('Unexpected systemd entrypoint')
unit.write_text(text)
PY
nginx -t
systemctl daemon-reload
systemctl reload nginx
curl -fsS https://www.chocoleaf.hu/api/health
printf '\n'
curl -fsS https://www.chocoleaf.hu/ > "$backup/index.after"
cmp -s "$backup/index.before" "$backup/index.after"
curl -fsS https://www.chocoleaf.hu/courses > "$backup/courses.after"
cmp -s "$backup/index.before" "$backup/courses.after"
systemctl is-active chocoleaf.service
trap - ERR
printf 'CI setup ready. Existing application kept running. Config backup: %s\n' "$backup"

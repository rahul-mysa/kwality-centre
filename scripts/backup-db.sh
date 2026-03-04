#!/bin/bash
# Daily Postgres backup script for Kwality Centre
# Add to crontab: 0 2 * * * /opt/kwality-centre/scripts/backup-db.sh

BACKUP_DIR="/opt/kwality-centre/backups"
CONTAINER="kwality-centre-db-1"
KEEP_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump -U kwality kwality_centre | gzip > "$BACKUP_DIR/kc_backup_$TIMESTAMP.sql.gz"

if [ $? -eq 0 ]; then
    echo "$(date): Backup created: kc_backup_$TIMESTAMP.sql.gz"
else
    echo "$(date): Backup FAILED" >&2
    exit 1
fi

find "$BACKUP_DIR" -name "kc_backup_*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "$(date): Cleaned backups older than $KEEP_DAYS days"

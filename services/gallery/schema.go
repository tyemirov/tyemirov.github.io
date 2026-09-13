package gallery

// gallerySchema is the current schema for runtime storage and snapshot validation.
const gallerySchema = ` CREATE TABLE IF NOT EXISTS assets (
 id TEXT PRIMARY KEY, width INTEGER NOT NULL, height INTEGER NOT NULL, format TEXT NOT NULL,
 mime TEXT NOT NULL, created_at TEXT NOT NULL, original BLOB NOT NULL, card BLOB NOT NULL, lightbox BLOB NOT NULL
 ) STRICT;
CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, body BLOB NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY, draft_revision INTEGER NOT NULL, archive BLOB NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS publication_requests (draft_etag TEXT NOT NULL, base_digest TEXT NOT NULL, publication_id TEXT NOT NULL REFERENCES publications(id), PRIMARY KEY(draft_etag,base_digest)) STRICT;
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, key_digest TEXT NOT NULL UNIQUE, request_digest TEXT NOT NULL, access_secret TEXT NOT NULL,
 snapshot BLOB NOT NULL, status TEXT NOT NULL CHECK (status IN ('payment-pending','awaiting-approval','complete','cancelled','revoked')),
 provider_id TEXT NOT NULL DEFAULT '', approval_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
 ) STRICT;
CREATE TABLE IF NOT EXISTS access_reissues (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), key_digest TEXT NOT NULL UNIQUE,
 verified_email TEXT NOT NULL, owner_email TEXT NOT NULL, created_at TEXT NOT NULL
 ) STRICT;
CREATE TABLE IF NOT EXISTS payment_attempts (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), request_id TEXT NOT NULL UNIQUE,
 capture_id TEXT NOT NULL DEFAULT '', lease_id TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0
 ) STRICT;
 CREATE UNIQUE INDEX IF NOT EXISTS payment_capture_identity ON payment_attempts(capture_id) WHERE capture_id!='';
 CREATE TABLE IF NOT EXISTS payment_events(id TEXT PRIMARY KEY, digest TEXT NOT NULL, body BLOB NOT NULL, processed INTEGER NOT NULL DEFAULT 0) STRICT;
 CREATE TABLE IF NOT EXISTS entitlements(order_id TEXT NOT NULL REFERENCES orders(id), offer_id TEXT NOT NULL, revision TEXT NOT NULL REFERENCES assets(id), status TEXT NOT NULL CHECK(status IN ('active','revoked')), PRIMARY KEY(order_id,offer_id)) STRICT;
CREATE TABLE IF NOT EXISTS download_links (
 id TEXT PRIMARY KEY, secret_digest TEXT NOT NULL, order_id TEXT NOT NULL,
 offer_id TEXT NOT NULL, revision TEXT NOT NULL REFERENCES assets(id), expires_at INTEGER NOT NULL,
 FOREIGN KEY(order_id,offer_id) REFERENCES entitlements(order_id,offer_id)
 ) STRICT;
CREATE TABLE IF NOT EXISTS payment_event_retries (
 event_id TEXT PRIMARY KEY REFERENCES payment_events(id), next_attempt INTEGER NOT NULL
 ) STRICT;
CREATE TABLE IF NOT EXISTS receipt_outbox (
 order_id TEXT PRIMARY KEY REFERENCES orders(id), notification_id TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','sent','attention')), next_attempt INTEGER NOT NULL DEFAULT 0,
 lease_id TEXT NOT NULL DEFAULT '',
 CHECK((status='pending' AND notification_id='') OR (status<>'pending' AND notification_id<>''))
 ) STRICT;`

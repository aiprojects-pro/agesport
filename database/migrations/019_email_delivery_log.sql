CREATE TABLE IF NOT EXISTS email_delivery_log (
 id BIGSERIAL PRIMARY KEY,
 recipient TEXT NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('accepted','failed')),
 error_code VARCHAR(60),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_delivery_log_created ON email_delivery_log(created_at DESC);

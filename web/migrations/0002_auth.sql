-- Google 로그인 계정과 세션 (plan.md 45).
-- 관리자·보는 사람(자녀)은 계정으로, 구성원(부모님)은 지금처럼 기기 토큰으로 연결한다.
-- 세션 토큰은 원문을 저장하지 않고 SHA-256 해시(16진수)만 저장한다.

CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  -- Google 계정 고유 ID(ID 토큰의 sub). 이메일은 바뀔 수 있어 식별에 쓰지 않는다
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id);

-- 보는 사람 행은 계정(user_id)으로 잇고 token_hash는 비워 둔다
ALTER TABLE family_members ADD COLUMN user_id TEXT;

CREATE INDEX idx_family_members_user ON family_members (user_id);

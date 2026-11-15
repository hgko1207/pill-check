-- 가족 연결 (plan.md 41). 로그인 없이 초대 코드로 기기를 잇는다.
-- 토큰·초대 코드는 원문을 저장하지 않고 SHA-256 해시(16진수)만 저장한다.
-- 행을 지울 때 연결된 행은 함수 코드에서 직접 지운다(외래키 연쇄에 기대지 않음).

CREATE TABLE family_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE family_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  -- member: 약을 등록하는 사람(부모님) / viewer: 보는 사람(자녀)
  role TEXT NOT NULL CHECK (role IN ('member', 'viewer')),
  display_name TEXT NOT NULL,
  -- 아직 연결 전(다시 잇기 초대만 있는 상태)이면 NULL일 수 있다
  token_hash TEXT UNIQUE,
  meds_json TEXT,
  meds_updated_at INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_family_members_group ON family_members (group_id);

CREATE TABLE family_invites (
  code_hash TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member', 'viewer')),
  display_name TEXT NOT NULL,
  -- 폰을 바꾼 구성원을 같은 행으로 다시 이을 때만 채운다
  member_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_family_invites_group ON family_invites (group_id);

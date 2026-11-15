-- 그룹별 관리자 (plan.md 50).
-- 전체 관리자 한 명이 모든 그룹을 보던 구조에서, 그룹을 만든 사람(과 그가 권한을 준 사람)이
-- 그 그룹만 관리하는 구조로 바꾼다. 관리자는 그 그룹의 보는 사람(계정) 행 중 is_manager = 1인 행이다.
-- 0001·0002는 고치지 않는다.

ALTER TABLE family_members ADD COLUMN is_manager INTEGER NOT NULL DEFAULT 0;
ALTER TABLE family_groups ADD COLUMN created_by TEXT;

-- 기존 데이터 옮기기: 예전 구조에서는 전체 관리자(auth_users.role = 'admin')가 그룹을 만들었다.
-- 그 계정이 그룹에 보는 사람 행이 없으면 관리자 행으로 넣는다(운영: 관리자 1명, 그룹 1개 — 2026-11-15 조회)
INSERT INTO family_members (id, group_id, role, display_name, user_id, is_manager, last_seen_at, created_at)
SELECT lower(hex(randomblob(16))), g.id, 'viewer', COALESCE(u.name, u.email, '관리자'), u.id, 1, NULL, g.created_at
FROM family_groups g CROSS JOIN auth_users u
WHERE u.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM family_members m WHERE m.group_id = g.id AND m.user_id = u.id);

-- 이미 보는 사람으로 들어가 있던 전체 관리자도 그 그룹의 관리자로
UPDATE family_members SET is_manager = 1
WHERE role = 'viewer' AND user_id IN (SELECT id FROM auth_users WHERE role = 'admin');

UPDATE family_groups
SET created_by = (SELECT id FROM auth_users WHERE role = 'admin' ORDER BY created_at LIMIT 1)
WHERE created_by IS NULL;

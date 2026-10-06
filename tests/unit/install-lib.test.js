'use strict';
// scripts/lib/install-lib.sh 순수 함수 테스트 (FIX_GUIDE W5 (c)). 픽스처는 모두 가짜 값이다.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const lib = path.join(__dirname, '..', '..', 'scripts', 'lib', 'install-lib.sh');

function sh(body, input) {
  const r = spawnSync('bash', ['-c', `source "${lib}"; ${body}`], { input, encoding: 'utf8' });
  return { rc: r.status, out: r.stdout.trim() };
}

test('il_version_ge: 비교', () => {
  assert.strictEqual(sh('il_version_ge 26.0 26.0').rc, 0);
  assert.strictEqual(sh('il_version_ge 27.2 26').rc, 0);
  assert.strictEqual(sh('il_version_ge 26.0.1 26.0').rc, 0);
  assert.strictEqual(sh('il_version_ge 15.6 26.0').rc, 1);
  assert.strictEqual(sh('il_version_ge 1.3.10 1.3.2').rc, 0);
  assert.strictEqual(sh('il_version_ge 1.3.2 1.3.10').rc, 1);
  assert.strictEqual(sh('il_version_ge 26 26.0.0').rc, 0);
  assert.strictEqual(sh('il_version_ge 26.0b1 26.0').rc, 0);
});

const FIND_IDENTITY = `  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Apple Development: Test User (AAAAAAAAAA)"
  2) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Developer ID Application: Fake Corp (BBBBBBBBBB)"
  3) FEDCBA9876543210FEDCBA9876543210FEDCBA98 "Apple Development: Other (CCCCCCCCCC)"
     3 valid identities found
`;

test('il_parse_identities: Apple Development 만, SHA-1 추출', () => {
  const r = sh('il_parse_identities', FIND_IDENTITY);
  assert.deepStrictEqual(r.out.split('\n'), [
    '0123456789ABCDEF0123456789ABCDEF01234567',
    'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
  ]);
  assert.strictEqual(sh('il_parse_identities', '     0 valid identities found\n').out, '');
});

test('il_ou_from_subject: 두 가지 subject 형식', () => {
  assert.strictEqual(
    sh(
      'il_ou_from_subject',
      'subject=UID=ZZZZZZZZZZ, CN=Apple Development: Test (AAAAAAAAAA), OU=TEAM123456, O=Test, C=US\n',
    ).out,
    'TEAM123456',
  );
  assert.strictEqual(
    sh(
      'il_ou_from_subject',
      'subject= /UID=ZZZZZZZZZZ/CN=Apple Development: Test/OU=TEAM123456/O=Test/C=US\n',
    ).out,
    'TEAM123456',
  );
  assert.strictEqual(sh('il_ou_from_subject', 'subject=CN=nothing\n').out, '');
});

test('il_cert_pem_for_sha1: 해시에 맞는 PEM 만', () => {
  const input = `keychain: "/x"
SHA-1 hash: AAAA
-----BEGIN CERTIFICATE-----
first
-----END CERTIFICATE-----
SHA-1 hash: BBBB
-----BEGIN CERTIFICATE-----
second
-----END CERTIFICATE-----
`;
  assert.strictEqual(
    sh('il_cert_pem_for_sha1 bbbb', input).out,
    '-----BEGIN CERTIFICATE-----\nsecond\n-----END CERTIFICATE-----',
  );
  assert.strictEqual(sh('il_cert_pem_for_sha1 CCCC', input).out, '');
});

test('il_valid_team_id', () => {
  assert.strictEqual(sh('il_valid_team_id TEAM123456').rc, 0);
  assert.strictEqual(sh('il_valid_team_id team123456').rc, 1);
  assert.strictEqual(sh('il_valid_team_id SHORT').rc, 1);
  assert.strictEqual(sh('il_valid_team_id "A;rm -rf x"').rc, 1);
});

test('il_teams_from_xcode_defaults: teamID 만, 중복 제거, 이름·계정은 무시', () => {
  const input = `{
    "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" =     (
                {
            isFreeProvisioningTeam = 1;
            teamID = TEAM123456;
            teamName = "Fake (Personal Team)";
            teamType = "Personal Team";
        },
                {
            isFreeProvisioningTeam = 0;
            teamID = "TEAMABCDE9";
            teamName = "Other";
        }
    );
    "FFFFFFFF-BBBB-CCCC-DDDD-EEEEEEEEEEEE" =     (
                {
            teamID = TEAM123456;
        }
    );
}`;
  assert.deepStrictEqual(sh('il_teams_from_xcode_defaults', input).out.split('\n'), [
    'TEAM123456',
    'TEAMABCDE9',
  ]);
  assert.strictEqual(sh('il_teams_from_xcode_defaults', 'The domain does not exist\n').out, '');
});

test('il_list_contains', () => {
  assert.strictEqual(sh('il_list_contains " AAA BBB" BBB').rc, 0);
  assert.strictEqual(sh('il_list_contains " AAA BBB" BB').rc, 1);
  assert.strictEqual(sh('il_list_contains "" AAA').rc, 1);
});

test('install.sh --help 에 테스트용 환경 변수가 나온다', () => {
  const r = spawnSync(
    'bash',
    [path.join(__dirname, '..', '..', 'scripts', 'install.sh'), '--help'],
    {
      encoding: 'utf8',
    },
  );
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('TEAM_ID'));
  assert.ok(r.stdout.includes('SDRHDR_SAFARI_VERSION'));
});

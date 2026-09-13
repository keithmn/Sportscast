// One-off: links this site's own Kenya Cup Competition/Club rows to their
// counterparts in the separate Underdawgs Sports Data platform, now that
// that platform holds real (non-demo) Kenya Cup data — see
// packages/database/scripts/import-kenya-cup.ts in that repo, and
// BLUEPRINT.md §25/26 (rename pending) for the sequencing this follows.
//
// This is the FIRST populated row in CanonicalMapping (added in the
// 20260913160709_add_canonical_mapping migration) — the foundation the
// target architecture report called for, now actually wired to real data
// on both sides rather than left empty.
//
// Read-only in spirit: this site doesn't call the Data Platform's API at
// request time yet (that's later, deferred work per the target
// architecture's Wave 1 sequencing) — it just remembers the correspondence
// for when that read path gets built.
//
// IDs below were read directly from each system's own public API
// (GET /api/clubs, GET /api/competitions/kenya-cup on this site;
// GET /v1/teams?sport=rugby, GET /v1/competitions on the Data Platform),
// not invented. Safe to re-run — every write is an upsert.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CANONICAL_COMPETITION_ID = '22dea861-2195-47e5-be90-6b5bf1aaad48'; // Data Platform's Competition "Kenya Cup"
const LOCAL_COMPETITION_ID = 'cmszvxh6i05sdzpfsfmw9sr31'; // this site's Competition "Kenya Cup"

// [local Club id, canonical Team id] pairs — matched by team name across
// both systems' own APIs, not by any shared identifier (none exists yet).
const CLUB_TO_TEAM_PAIRS = [
  ['cmszvxiws05suzpfsw7s23i0e', 'cee52991-1ebe-4f76-b172-c83ddf6a20ec'], // Daystar Falcons
  ['cmszvxja905syzpfs6xyqhtvl', 'a0d0ab8d-d812-451a-b4bf-a05cb505a285'], // Impala RFC
  ['cmszvxhrq05sizpfswuozoviv', '5ee37cf7-af07-469a-ae63-6c4ef8609f4f'], // KCB Rugby
  ['cmszvxicc05sozpfsmi1jojmg', 'c9559646-47b8-4a4c-a036-6939187b562d'], // KU BlakBlad
  ['cmszvxhkr05sgzpfsgg5b241x', '22058f95-0234-46a0-b4b3-6cb406c49980'], // Kabras Sugar
  ['cmszvxj3h05swzpfs8dwmxs25', '6427f2d2-2be3-40e6-ac14-7ef638a3697b'], // Kenya Harlequin FC
  ['cmszvxjgw05t0zpfsjjxw5wyr', 'f7fe4af4-abff-4ba2-882a-9dd08f149c4e'], // Kisumu RFC
  ['cmszvxjnm05t2zpfs2jfdilef', '92aade5d-466b-44c7-b4ae-c710ce51557a'], // MMUST
  ['cmszvxhyr05skzpfsa7f5ht3m', '4d2a14ab-ab95-469d-8cc6-2462465a67c1'], // Menengai Oilers
  ['cmszvxiq005sszpfs5qwk92s5', '48ee90d9-fa1d-4589-9bdb-3a424b3279d1'], // Nakuru RFC
  ['cmszvxij305sqzpfsgtuq5kco', 'c0ceebf3-92ab-4c54-aab8-c795cadb8627'], // Nondescript RFC
  ['cmszvxi5k05smzpfsj6h5evow', 'dd62bc84-1bf7-43d3-970a-92c1ad7f10f9'], // Strathmore Leos
];

async function upsertMapping(localEntityType, localId, canonicalEntityType, canonicalId) {
  await prisma.canonicalMapping.upsert({
    where: { localEntityType_localId_provider: { localEntityType, localId, provider: 'underdawgs-data' } },
    update: { canonicalEntityType, canonicalId },
    create: { localEntityType, localId, canonicalEntityType, canonicalId },
  });
}

async function main() {
  await upsertMapping('COMPETITION', LOCAL_COMPETITION_ID, 'Competition', CANONICAL_COMPETITION_ID);
  for (const [clubId, teamId] of CLUB_TO_TEAM_PAIRS) {
    await upsertMapping('CLUB', clubId, 'Team', teamId);
  }
  const count = await prisma.canonicalMapping.count();
  console.log(`Done. ${count} CanonicalMapping row(s) now exist (1 competition + ${CLUB_TO_TEAM_PAIRS.length} clubs, plus anything pre-existing).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());

# Bowmasters 2.12 (Port 2.14.10) – debug report for `final9` → `final10-fixed`

**Important limitation:** nothing here was run on a device or emulator (the container is x86; the game is an ARM Unity 5.6 /
Mono build packed with 360 Jiagu). Everything below comes from (a) decompiling `Assembly-CSharp.dll`
(1 351 types), (b) reading every Unity data file with UnityPy and cross-checking it against the code, and
(c) IL-level verification of the patched assembly. Fixes are therefore limited to defects that are provable from code/data.
Please play-test the items in "How to test".

The game logic lives in `assets/bin/Data/Managed/Assembly-CSharp.dll` (the Java side is Jiagu-packed and was not touched).
Only that DLL was changed, by **surgical IL patching** (Mono.Cecil) – no wholesale recompile of the decompiled source,
so the original (mcs-compiled) code is byte-for-byte unchanged outside the 8 patched members.

## Fixes applied (6 patch operations in 5 classes) – revision 2

Revision 2 follows review feedback: some earlier "fixes" touched behaviour that is built into the game
(15 s turn timeout, one-time BRUTALITY banner flag, shock animation re-trigger). Those were **reverted**
(`FatalityBase`, `CharacterBase`, `Level` are byte-identical to `final9` again). Online searches found no
documentation of these mechanics, so the rule used is: keep only changes that cannot alter normal behaviour.

| # | Area | Class::member | Problem (evidence) | Fix |
|---|------|---------------|--------------------|-----|
| 1 | **Camera – Mad Mike (upgraded Footballer, golden-ball brutality)** | `FatalityBurningBallUpgrade::RestoreVictimAndPickUpBall` | `Level.UpdateLevel` calls `UnfollowWeaponWithVelocity` every frame while the victim has an active fatality. When the victim is restored (ragdoll removed) that call re-targets the camera to the victim **and resets the zoom to 1**, fighting the fatality's own `SetScaleWithDuration(cameraZoom)` + `TweenMoveToPosition`. Every other ported fatality (Kite, Alien, Kunai, Lumber, Hatchet, …) switches `IsNeedFollowArcherOrWeapon` off first; this one only did so at the final collision. | Auto-follow is switched off when the restore/cinematic step starts. |
| 2 | **Camera** | `CameraController::ApplyShakeWithDuration` | Restoring shakes re-captured the shaken position as origin and a following non-restoring shake cancelled the pending restore (fixed-camera levels, e.g. Birds Hunt). | Origin/flag kept for the duration of an overlapping shake; identical behaviour otherwise. |
| 3 | **Brutality soft-lock guard** | `FatalityManager::UpdateFatality` | An exception in a (ported) fatality update, or a fatality that never completes, leaves the match stuck in FINISH HIM. | Exceptions contained + logged once; watchdog completes the fatality through the normal finish path after an error (≤ 8 s) or 60 s. Never triggers in normal play. |
| 4 | **VFX** | `MagicianAquarium::WaveUpdate` / `EatStart` | Prefab ships `normalColor → redColor` per water sprite (authored colours == `normalColor`) but `WaveUpdate` was an empty stub → water never reddened while piranhas ate. | 1.5 s tint normal→red. |
| 5 | **Gameplay** | `ObjectsSpawner::BeforeTrySelectedCharacterNameType` | Getter read pref `Try_Character` (string id) while the setter writes `Try_Character_NameType`. | Getter reads the right key. |

Reverted from revision 1 (judged built-in / not provably a bug): 15 s turn-timeout hold, BRUTALITY banner flag reset,
electric-shock animation track test.

## Verification performed
* Patched DLL decompiled again with ILSpy and diffed against the original decompile: only the 5 intended classes differ.
* Microsoft **ILVerify** on original vs. patched DLL: **identical output** (no new IL errors introduced). The 11 pre-existing errors are all in
  `BowmastersLab.LocalPurchaseSimulator` (not touched, see "Not fixed").
* No serialized layout changed: only *private, non-serialized* value-type fields were added (`port*`), plus one new method. (Unity 5.6
  release data has no type tree, so a layout change would have corrupted prefabs – this was checked on purpose.)
* APK: only `assets/bin/Data/Managed/Assembly-CSharp.dll` + `META-INF/*` differ from `final9`; all 2 834 manifest digests,
  the signature file digest and the PKCS#7 signature were re-verified. It is signed with the **same certificate** as `final9`
  (public AOSP test key, SHA1 `61:ED:37:7E:85:D3:86:A8:DF:EE:6B:86:4B:D8:5B:0B:FA:A5:AF:81`, `targetSdkVersion 25` → v1 signature is valid),
  so it installs as an update over `final9`.

## Data/asset audit (no defect found – listed so it does not need re-checking)
* All 370 audio items: every string key used in code (170 literals + `AudioKeys`) and in serialized fields (`createSound`, `explosionSound`, …) resolves; no duplicate keys; every sub-item clip exists.
* The shared `Fatalities` list contains all 91 fatality prefabs including every ported one (Kite, Lumber, CardUpgrade, KunaiUpgrade, IceBlocks, AlienProbeUpgrade, BurningBallUpgrade, HatchetBrutality, …); none of them has an unwired (null) reference.
* All 84 character skeletons contain the 22 core animations the code looks up (`idle`, `face_ko`, `spawn`, `stand_up`, `finish_him`, `shock*`, `death_by_*`, …).
* All 199 streamed tk2d textures named in the GUID table exist; the 16 ported atlases are present and referenced.
* GUID table: 1 686 entries, no duplicates (a duplicate would crash `GUIDMapper.Parse`).

## Found but NOT changed (uncertain / needs a device, or out of scope)
* `CameraController::UpdateScaleWithWeaponSpeed` divides by `scaleMaxSpeed` instead of `(max-min)` and ignores the serialized `curveScale` → the zoom-out never reaches `maxScale` (max factor 0.6). Probably the original developer's behaviour, so left as is; change it only if the zoom feels too tight.
* `FatalityManager::StartFatality`: if a fatality exists for the weapon but none matches the activation type (collision/explode/periodical), nothing happens (no `OnFatalityEnd`). Changing this could end matches before a later, matching hit, so not touched (the new watchdog does not cover it because no fatality becomes active).
* Audio data: `fatality_school_bell` has no clip in the APK (only a dangling GUID) and `arrow_firework_create` has one dangling sub-item (silent 1 time in 3). Neither key is referenced by code; `fatality_school_bell` is flagged looping. Needs a new audio asset.
* `MagicianAquarium` surface waving and `Legcuffs::BoneUpdate` are also empty stubs; their exact original behaviour cannot be recovered from the data, so only the colour part (which is fully specified by the data) was implemented.
* `FatalityFlagUpgrade` is listed twice (same prefab) in `Fatalities`; harmless duplicate instance.
* No fatality exists for `BigKnife`, `Door`, `Shield`, `PaperPlane` (by design or unfinished – cannot tell).
* `BowmastersLab.LocalPurchaseSimulator` fails IL verification in 11 places (non-visible method calls, wrong stack types). Mono does not verify, so it may work; it is outside the requested categories and was not touched.
* Balance (`PortBalance`) deliberately ignored as requested.

## How to test (suggested)
1. Mad Mike (upgraded Footballer) golden-ball brutality: after the victim is picked up the camera should zoom/tilt as configured and then follow the running footballer, not snap back to the victim.
2. Fixed-camera mode (Birds Hunt): chain several explosions → camera returns to its start position.
3. Magician upgrade piranha brutality: aquarium water fades to red while the piranhas eat.

## Rebuilding
`bowmasters-fixes/build.sh` re-creates the APK from `final9` (needs dotnet SDK 8, JDK, openssl; the AOSP test key files
`testkey.pk8` / `testkey.x509.pem` are public). Patch sources: `donor/Donor.cs` (new method bodies, plain C#) applied by
`patcher/Program.cs` (Mono.Cecil).

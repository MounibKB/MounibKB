# Bowmasters 2.12 (Port 2.14.10) – debug report for `final9` → `final10-fixed`

**Important limitation:** nothing here was run on a device or emulator (the container is x86; the game is an ARM Unity 5.6 /
Mono build packed with 360 Jiagu). Everything below comes from (a) decompiling `Assembly-CSharp.dll`
(1 351 types), (b) reading every Unity data file with UnityPy and cross-checking it against the code, and
(c) IL-level verification of the patched assembly. Fixes are therefore limited to defects that are provable from code/data.
Please play-test the items in "How to test".

The game logic lives in `assets/bin/Data/Managed/Assembly-CSharp.dll` (the Java side is Jiagu-packed and was not touched).
Only that DLL was changed, by **surgical IL patching** (Mono.Cecil) – no wholesale recompile of the decompiled source,
so the original (mcs-compiled) code is byte-for-byte unchanged outside the 8 patched members.

## Fixes applied (8 patch operations in 7 classes)

| # | Area | Class::member | Problem (evidence) | Fix |
|---|------|---------------|--------------------|-----|
| 1 | **Camera** | `CameraController::ApplyShakeWithDuration` | Every restoring shake re-captured the *currently shaken* position as the restore origin, and any following shake without the restore flag (`FatalityEffect.EmitBrainEffect/EmitGutsEffect` fire a 0.1 s shake inside an explosion shake) silently cancelled the pending restore. On fixed-camera levels (Birds Hunt, `isMoving=false`, where `ExplodeComponent` uses restore) the camera ended up permanently displaced after chained explosions. | Restore origin and restore flag are now kept for the duration of an overlapping shake. Non-overlapping behaviour is identical to before. |
| 2 | **Brutality / Camera / Turn flow** | `FatalityManager::UpdateFatality` + new `Level::PortResetTurnTimeout` | `Level.UpdateLevel` force-ends the turn 15 s after the weapon is released (`activeTurnTimeoutTimer > 15f → TurnActiveActions = 0 → TurnFinished → NextTurn`). `NextTurn` swaps the active archer, moves the camera (`UpdateCameraPosition`) and spawns a new weapon. Several ported brutalities (Alien probe, Kunai, Lumber, Flag/moon, Jackhammer…) run 15–25 s, so the turn logic could fire **in the middle of the brutality** (camera jump away from the scene, archer swap). | While a fatality is active the timeout is held at 0. |
| 3 | **Brutality soft-lock** | `FatalityManager::UpdateFatality` | An exception in any fatality's `UpdateFatality` (the ported classes are new code), or a fatality that never reports completion, leaves the match stuck in FINISH HIM with no result screen. | Exceptions are contained and logged once; a watchdog force-completes the fatality (through the normal `FatalityBase_OnFatalityFinish` path: achievements, `OnFatalityEnd`, level end) after an error (≤ 8 s later) or after 60 s. |
| 4 | **Brutality banner (VFX/SFX)** | `FatalityBase::StartFatality` | `isBrutalityShowed` was set to `true` by `ShowBrutalityEffect` and never reset, but fatality objects are reused → the BRUTALITY sign + sound only ever appeared once per fatality instance. | Flag reset when a fatality starts. |
| 5 | **VFX (Magician-upgrade piranha brutality)** | `MagicianAquarium::WaveUpdate` / `EatStart` | The prefab ships `waters[]` with `normalColor` → `redColor` (blue → red "blood" tint; the authored sprite colours equal `normalColor` exactly), but `WaveUpdate` was an empty stub, so the water never turned red when the piranhas ate. | `EatStart` starts a 1.5 s tint; `WaveUpdate` lerps `water` and `surface` sprites normal→red. |
| 6 | **Animation** | `CharacterBase::StartElectricityAnimation` | The shock loop plays on **track 6**, but the "already playing?" test compared against track 0 (`CurrentAnimation`), which is never the shock clip → every periodical-damage tick restarted the shock animation from frame 0 (stutter). | Test track 6 instead. |
| 7 | **Gameplay (try-a-character)** | `ObjectsSpawner::BeforeTrySelectedCharacterNameType` getter | Setter writes pref `Try_Character_NameType`, getter read `Try_Character` (which holds the *string id*), so the previously selected character name-type was never restored correctly after a try-character session. | Getter reads the right key. |

(Patches 2 and 3 are two changes in the same method.)

## Verification performed
* Patched DLL decompiled again with ILSpy and diffed against the original decompile: only the intended 7 classes differ.
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
1. Fixed-camera mode (Birds Hunt): chain several explosions → camera must return to its start position.
2. Finish a match with the long brutalities (Alien probe, Kunai, Lumber, Flag, Jackhammer): camera must stay on the scene and the match must end normally.
3. Magician upgrade piranha brutality: aquarium water fades to red while the piranhas eat.
4. Shock a standing character (Thor/Mjolnir): shock pose animates smoothly, no restarting.
5. Use the same weapon twice in a session: BRUTALITY banner shows each time.

## Rebuilding
`bowmasters-fixes/build.sh` re-creates the APK from `final9` (needs dotnet SDK 8, JDK, openssl; the AOSP test key files
`testkey.pk8` / `testkey.x509.pem` are public). Patch sources: `donor/Donor.cs` (new method bodies, plain C#) applied by
`patcher/Program.cs` (Mono.Cecil).

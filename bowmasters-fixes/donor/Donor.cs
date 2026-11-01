using System;
using Spine;
using UnityEngine;

// Donor bodies. Each method named  TargetType__TargetMethod  replaces the body of the corresponding
// instance method in Assembly-CSharp.dll (first parameter == "this").
public static class Donor
{
    // ------------------------------------------------------------------------------------------------
    // CAMERA: overlapping shakes.
    // Original: every ApplyShakeWithDuration(restore:true) re-captured the *currently shaken* position as the
    // restore origin and a following shake without the restore flag (the brain/guts effects fire 0.1s shakes
    // inside an explosion shake) cancelled the pending restore -> fixed-camera levels (Birds Hunt) ended up
    // permanently displaced after chained explosions.
    // ------------------------------------------------------------------------------------------------
    public static void CameraController__ApplyShakeWithDuration(CameraController self, float duration, float amplitude, bool isRestoreAfterShake, bool isHorizontal, bool isVertical, float oneSideDuration)
    {
        bool pending = self.portHasOrigin && self.shakeTime <= self.shakeDuration;
        if (pending)
        {
            isRestoreAfterShake = true;
        }
        self.shakeDuration = duration;
        self.shakeAmplitude = amplitude;
        self.shakeTime = 0f;
        self.isRestoringAfterShake = isRestoreAfterShake;
        if (isRestoreAfterShake)
        {
            if (!pending)
            {
                Vector2 p = self.Position;
                self.portOriginX = p.x;
                self.portOriginY = p.y;
                self.portHasOrigin = true;
            }
            self.cameraStartPosition = new Vector2(self.portOriginX, self.portOriginY);
        }
        else
        {
            self.portHasOrigin = false;
        }
        self.isHorizontalOnlyShake = isHorizontal;
        self.isVerticalOnlyShake = isVertical;
        self.oneSideShakeTime = oneSideDuration;
        self.currentOneSideShakeTime = self.oneSideShakeTime;
        self.isFirstMovement = false;
    }

    // ------------------------------------------------------------------------------------------------
    // BRUTALITY soft-lock guard: an exception inside a (ported) fatality update, or a fatality that never
    // signals completion, left the match stuck in "FINISH HIM" forever.  Exceptions are now contained and
    // a watchdog force-completes the fatality so the match result screen is always reached.
    // ------------------------------------------------------------------------------------------------
    public static void FatalityManager__UpdateFatality(FatalityManager self, float deltaTime)
    {
        FatalityBase fb = self.activeFatality;
        if (fb == null)
        {
            self.portActiveTime = 0f;
            self.portLoggedError = false;
            return;
        }
        self.portActiveTime += deltaTime;
        try
        {
            fb.UpdateFatality(deltaTime);
        }
        catch (Exception e)
        {
            if (!self.portLoggedError)
            {
                self.portLoggedError = true;
                Debug.LogError("[FatalityManager] fatality update failed: " + e);
            }
            if (self.portActiveTime < 52f)
            {
                self.portActiveTime = 52f;
            }
        }
        if (self.activeFatality == fb && self.portActiveTime > 60f)
        {
            Debug.LogWarning("[FatalityManager] fatality watchdog expired, forcing completion");
            self.portActiveTime = 0f;
            self.FatalityBase_OnFatalityFinish(fb);
        }
    }

    // ------------------------------------------------------------------------------------------------
    // CAMERA (Mad Mike / upgraded Footballer burning-ball brutality): Level.UpdateLevel calls
    // UnfollowWeaponWithVelocity every frame while the victim has an active fatality.  Once the victim is
    // restored (ragdoll removed) that call re-targets the camera at the victim and resets the zoom to 1,
    // fighting the fatality's own zoom + tween.  Other ported fatalities switch the auto-follow off first.
    // ------------------------------------------------------------------------------------------------
    public static void FatalityBurningBallUpgrade__RestoreVictimAndPickUpBall(FatalityBurningBallUpgrade self, SkeletonUtilityBone ballBone)
    {
        if (self.IsActive)
        {
            PortUtil.CurrentLevel.IsNeedFollowArcherOrWeapon = false;
            self.affectedCharacter.RestoreBurningBall();
            // The victim was knocked back by the ball and is snapped to its final position by the restore above.
            // The run-up (and therefore the touchdown/cheer sound sync) must be measured from THAT position,
            // not from where the victim stood before the hit.
            self.directionMultiplier = ((self.footballerCharacter.transform.position.x > self.affectedCharacter.transform.position.x) ? (-1f) : 1f);
            self.xStartPosition = self.affectedCharacter.transform.position.x - self.directionMultiplier * self.xStartDistance;
            // Design: the VICTIM holds the ball (ball_catch -> ball_panic), Mike runs in empty-handed and the
            // touchdown tackle takes the ball (FootballerCollide parents it to Mike's ball_idle_out).  The port
            // instead teleported the ball into Mike's hand.  Attach it to the victim's weapon-hand anchor exactly
            // like Level.CreateWeapon attaches a weapon to a character.
            Character victim = self.affectedCharacter as Character;
            Transform anchor = (victim != null) ? victim.WeaponAnchorTransform : null;
            if (anchor != null)
            {
                anchor.localRotation = Quaternion.Euler(0f, 0f, self.burningBall.BoneAngle);
                self.burningBall.transform.parent = anchor;
                self.burningBall.transform.localPosition = self.burningBall.AnchorPointOffset;
                self.burningBall.transform.localRotation = Quaternion.identity;
                self.burningBall.transform.localScale = Vector3.one;
            }
            CameraController cameraController = self.CachedCameraController;
            cameraController.SetScaleWithDuration(self.cameraZoom, self.timeForCameraChangePosition);
            cameraController.TweenMoveToPosition(cameraController.Position + Vector2.up * self.cameraVerticalOffset, self.timeForCameraChangePosition);
        }
    }

    // SFX: unlike the other ported brutalities this class did not override PlayFatalityStartSound, so the base
    // class also played crowd_glee/crowd_loop at t=0 on top of the per-sound isNeedToPlayCrowdHappySound flag
    // (doubling the crowd for mike_brutality_2 and adding it to mike_brutality_3 where the data says "no").
    public static void NEWOVR_FatalityBurningBallUpgrade__PlayFatalityStartSound(FatalityBurningBallUpgrade self)
    {
        AudioManager.PlayAudioWithKey("fatality_start", null);
    }

    // VFX/ANIMATION: ragdoll parts were thrown with free X/Y rotation (all other fatalities freeze them with
    // constraints 56) so they tumbled out of the 2D plane; the physical guts chunks were never emitted.
    public static void FatalityBurningBallUpgrade__ApplyFatalityEffects(FatalityBurningBallUpgrade self)
    {
        CharacterBase currentCharacter = self.CachedManager.CurrentCharacter;
        currentCharacter.ApplyCharacterRagdoll();
        self.CachedMask.Activate(self.startFatalityCollider, self.startFatalityUtilityBone);
        CharacterType characterType = currentCharacter.CharacterType;
        self.CachedEffect.EmitBrainEffect(characterType, self.transform, self.CachedHead.transform.position, self.CachedHead.transform.eulerAngles);
        self.CachedEffect.EmitBrain(self.transform, self.CachedHead.transform.position, Vector3.up);
        self.CachedEffect.EmitGutsEffect(characterType, self.transform, self.CachedBody.transform.position, self.CachedBody.transform.eulerAngles);
        self.CachedEffect.EmitGuts(self.transform, self.CachedBody.transform.position, Vector3.up);
        Rigidbody rigidbody = self.CachedManager.CharacterRagdoll.GetRigidbody(self.CachedBody.boneName);
        Rigidbody[] rigidbodyArray = self.CachedManager.CharacterRagdoll.GetRigidbodyArray();
        if (rigidbody != null && rigidbodyArray != null)
        {
            for (int i = 0; i < rigidbodyArray.Length; i++)
            {
                if (rigidbodyArray[i] == null)
                {
                    continue;
                }
                string text = rigidbodyArray[i].name;
                bool flag = false;
                Bone bone = self.CachedBody.bone;
                if (bone != null)
                {
                    for (int j = 0; j < bone.Children.Count; j++)
                    {
                        if (bone.Children.Items[j].Data.Name == text)
                        {
                            flag = true;
                            break;
                        }
                    }
                }
                if (flag)
                {
                    Vector3 position = rigidbodyArray[i].transform.position;
                    Vector3 position2 = rigidbody.transform.position;
                    float z = Mathf.Atan2(position.y - position2.y, position.x - position2.x) * 57.2958f;
                    self.CachedEffect.EmitBloodEffect(characterType, self.CachedBody.transform, position, new Vector3(0f, 0f, z));
                }
                rigidbodyArray[i].velocity = new Vector3(self.explodeForce * self.directionMultiplier, Mathf.Abs(self.explodeForce * 0.3f), 0f);
                rigidbodyArray[i].constraints = (RigidbodyConstraints)56;
                self.BreakSelfJoint(rigidbodyArray[i]);
            }
        }
        self.CachedEffect.EmitGUICameraEffects(BrutalityEffectType.Finished);
    }

    // ------------------------------------------------------------------------------------------------
    // VFX: piranha-aquarium brutality (Magician upgrade). The water colour data (normalColor -> redColor)
    // was shipped but WaveUpdate was an empty stub, so the water never turned red while the piranhas ate.
    // ------------------------------------------------------------------------------------------------
    public static void MagicianAquarium__EatStart(MagicianAquarium self)
    {
        for (int i = 0; i < self.bubblesSystems.Count; i++)
        {
            self.bubblesSystems[i].StopFX(true);
        }
        for (int j = 0; j < self.piranhas.Length; j++)
        {
            self.piranhas[j].transform.position = self.piranhas[j].transform.position + new Vector3(0f, 0f, 3f);
        }
        GameObject gameObject = ((self.eatEffect != null) ? (self.eatEffect.GetAsset() as GameObject) : null);
        if (gameObject != null)
        {
            GameObject obj = UnityEngine.Object.Instantiate(gameObject);
            obj.transform.parent = self.gameObject.transform;
            obj.transform.localPosition = new Vector3(0f, 170f, 0f);
            obj.transform.localRotation = Quaternion.identity;
        }
        GUIControl component = self.GetComponent<GUIControl>();
        if (component != null)
        {
            component.Show();
        }
        self.portTinting = true;
    }

    public static void MagicianAquarium__WaveUpdate(MagicianAquarium self, float deltaTime)
    {
        if (self.waters == null)
        {
            return;
        }
        if (self.portTinting && self.portTint < 1f)
        {
            self.portTint = Mathf.Min(1f, self.portTint + deltaTime / 1.5f);
        }
        else if (!self.portTinting)
        {
            return;
        }
        for (int i = 0; i < self.waters.Count; i++)
        {
            AquariumWaterInfo w = self.waters[i];
            Color c = Color.Lerp(w.normalColor, w.redColor, self.portTint);
            if (w.water != null)
            {
                w.water.color = c;
            }
            if (w.surface != null)
            {
                w.surface.color = c;
            }
        }
    }
}

namespace System.Runtime.CompilerServices
{
    public class CompilationRelaxationsAttribute : Attribute { public CompilationRelaxationsAttribute(int relaxations) { } }
    public class RuntimeCompatibilityAttribute : Attribute { public bool WrapNonExceptionThrows { get; set; } }
}

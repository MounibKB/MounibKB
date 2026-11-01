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
    // BRUTALITY banner: FatalityBase instances are reused, but isBrutalityShowed was never reset, so a
    // second use of the same fatality object never showed the BRUTALITY sign again.
    // ------------------------------------------------------------------------------------------------
    public static void FatalityBase__StartFatality(FatalityBase self, CollisionInfo infoCollision)
    {
        if (!self.isActive)
        {
            self.isActive = true;
            self.isBrutalityShowed = false;
            self.currentTime = self.time;
            self.CachedManager.CharacterAnimation.state.SetAnimation(0, self.CachedManager.AnimationFace, true);
            self.startFatalityCollider = infoCollision.otherCollider;
            self.startFatalityUtilityBone = self.CachedManager.GetUtilityBone(self.startFatalityCollider);
            self.PlayFatalityStartSound();
        }
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
        // Level.UpdateLevel force-ends the turn 15s after the weapon was released.  Long brutalities (ported
        // ones run 15-25s) were cut by NextTurn() (camera jump, archer swap, new weapon) mid-animation.
        if (self.level != null)
        {
            self.level.PortResetTurnTimeout();
        }
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

    public static void NEW_Level__PortResetTurnTimeout(Level self)
    {
        self.activeTurnTimeoutTimer = 0f;
    }

    // ------------------------------------------------------------------------------------------------
    // ANIMATION: the electric "shock" loop plays on track 6 but the "already playing?" test looked at track 0,
    // so every periodical-damage tick restarted the shock animation from frame 0 (stuttering pose).
    // ------------------------------------------------------------------------------------------------
    public static void CharacterBase__StartElectricityAnimation(CharacterBase self)
    {
        if (!self.IsFinishHim && !self.RootRigidBody)
        {
            TrackEntry current = self.animationCache.AnimationState.GetCurrent(6);
            if (current == null || current.Animation != self.animationCache.ShockAnimation)
            {
                self.animationCache.AnimationState.SetAnimation(6, self.animationCache.ShockAnimation, true);
            }
        }
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

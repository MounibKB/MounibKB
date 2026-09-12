# 🤖 OBLIVION RUMBLE — FIX THE AI BEFORE IT FILES FOR DIVORCE

I need you to **completely audit, debug, and properly overhaul the enemy AI in this game.**

And I mean **properly**.

Do NOT just slap 25 `if` statements onto the existing AI, call it “improved,” and walk away.

The current AI has reached a level of stupidity where it deserves its own documentary.

---

# 🚨 THE CURRENT AI PROBLEM

There is a very specific behavior that perfectly demonstrates what is wrong.

The AI can be standing directly next to the player.

The player is within attack range.

The AI attacks.

**THE AI SUCCESSFULLY HITS THE PLAYER.**

This should obviously be a good thing.

A normal fighting-game AI would think:

> “Excellent. My attack connected. The enemy is still right here. I should continue applying pressure.”

Our AI apparently thinks:

> **“I HAVE SUCCESSFULLY COMPLETED MY MISSION.”**

Then it jumps.

For no obvious reason.

The player is still there.

The player is still reachable.

The AI could literally attack again.

But no.

**THE AI HAS OTHER PLANS.**

It jumps onto the nearby platform on its right, follows the navigation nodes, walks across the entire platform, reaches the edge, falls off, travels back toward the player, attacks again...

...and then does the exact same thing.

So the actual loop is:

```text
ATTACK PLAYER
      ↓
HIT PLAYER
      ↓
“MISSION ACCOMPLISHED”
      ↓
RANDOMLY JUMP
      ↓
NAVIGATION SYSTEM WAKES UP
      ↓
“AH YES, THE PLATFORM”
      ↓
WALK RIGHT
      ↓
WALK RIGHT
      ↓
WALK RIGHT
      ↓
REACH EDGE
      ↓
FALL OFF PLATFORM
      ↓
REALIZE PLAYER EXISTS AGAIN
      ↓
RETURN TO PLAYER
      ↓
ATTACK
      ↓
REPEAT
```

This is not combat.

This is **a scheduled commute.**

The bot isn't fighting the player.

It's doing a **round trip between the player and the nearest platform.**

---

# 🧠 WHAT THE AI CURRENTLY FEELS LIKE

Imagine an actual human playing the game.

They hit you.

You are standing directly in front of them.

Their natural response would be:

> “Nice, I hit him. I'll attack again.”

The AI:

> “Nice, I hit him.”

> “I should jump.”

> “Why?”

> “I don't know.”

> “Where are you going?”

> “That platform.”

> “Why?”

> “The node graph demands it.”

> “There's literally an enemy right here.”

> “The platform has spoken.”

And then it walks off the platform like it has suddenly remembered an appointment.

---

# 🔥 THIS IS NOT JUST A PLATFORM BUG

Do NOT treat the platform loop as an isolated bug.

The platform behavior is a **symptom of a much larger AI architecture problem.**

The actual fundamental problem is:

> **The AI does not properly maintain combat intent after engaging the player.**

The desired decision loop is:

```text
ATTACK
 ↓
MAINTAIN TARGET / AGGRO
 ↓
EVALUATE CURRENT SITUATION
 ↓
CHOOSE BEST ACTION
 ↓
CONTINUE COMBAT
```

The current behavior is more like:

```text
ATTACK
 ↓
“JOB DONE”
 ↓
FORGET WHY I'M HERE
 ↓
JUMP
 ↓
FOLLOW NODE
 ↓
VISIT PLATFORM
 ↓
FALL
 ↓
RETURN
 ↓
“Oh yeah, the enemy.”
 ↓
ATTACK
```

This needs to be fixed **at the architectural level.**

---

# 🎯 CORE AI PRIORITY

The AI's primary objective is to **fight its target.**

Not:

- admire platforms
- take scenic routes
- perform recreational jumping
- walk to the nearest node because it exists
- retreat for absolutely no reason
- complete a pilgrimage around the map
- repeatedly fall off the same platform
- forget the player after landing a successful hit

The AI should constantly ask:

> **“What is the best thing I can do to defeat my target RIGHT NOW?”**

Not:

> “Which node has the highest tourism rating?”

---

# ⚔️ COMBAT MUST HAVE PRIORITY OVER NAVIGATION

This is extremely important.

Navigation should support combat.

**Combat should not be interrupted by navigation unless navigation is genuinely necessary.**

If:

- the player is alive
- the player is the current target
- the player is reachable
- the AI is capable of attacking
- the AI is within effective attack range

then the AI should prioritize combat.

Period.

Do not let a generic movement/navigation routine suddenly take control because:

> “Attack finished.”

That is how we get the AI equivalent of:

**Punch → resign from combat → go sightseeing.**

---

# 🥊 AFTER EVERY ATTACK, REASSESS

After an attack finishes, the AI should NOT automatically jump, retreat, navigate, or switch to some unrelated movement state.

It should immediately reassess:

```text
Did my attack connect?
        ↓
Where is the player now?
        ↓
Is the player still nearby?
        ↓
Can I attack again?
        ↓
Can I continue a combo?
        ↓
Do I need to reposition?
        ↓
Is jumping actually necessary?
        ↓
Is navigation actually necessary?
```

If the player is still standing directly in front of the AI:

**KEEP FIGHTING.**

Do not go visit Platform Land.

---

# 🧭 NAVIGATION NEEDS TO STOP BEING THE BOSS

The navigation system should NOT independently decide where the AI should go.

It should receive a meaningful objective from the AI.

For example:

> “I need to reach the player.”

NOT:

> “There is a node nearby. Go there.”

The AI should never navigate toward a platform simply because that platform is close.

A platform is useful only if it helps the AI achieve a legitimate goal.

---

# 🛑 CANCEL STUPID NAVIGATION

Suppose the AI genuinely needs to navigate.

Fine.

It starts moving toward a platform.

Then the player becomes reachable.

The AI should immediately go:

> **“Oh. Never mind. I can fight him now.”**

Cancel the navigation.

Return to combat.

Do NOT finish the entire route because:

> “But sir, the GPS already calculated it.”

The AI is not an Uber driver.

---

# 🧱 STOP THE PLATFORM SUICIDE

The AI must have proper awareness of platform boundaries and movement goals.

If it reaches the edge of a platform and the player isn't there:

**REASSESS.**

Do not blindly continue walking into the void because some ancient navigation target told it to go right.

The AI should understand:

> “There is no floor here.”

This should not require discovering gravity through repeated experimentation.

---

# 🦘 JUMPING MUST HAVE A REASON

Jumping should be a deliberate action.

Valid reasons:

- reaching a necessary platform
- avoiding an attack
- pursuing a target vertically
- performing a deliberate aerial attack
- escaping danger
- recovering from a legitimate situation

Invalid reason:

> “I just attacked someone.”

The current behavior of:

**HIT → JUMP**

must be investigated and eliminated unless the jump is genuinely justified by the game state.

---

# 🎯 TARGET / AGGRO MUST BE PERSISTENT

Once the AI engages the player, it should maintain target awareness.

Do not accidentally reset or lose the target because:

- an attack ended
- the AI jumped
- the AI landed
- a navigation state started
- the player moved slightly
- a waypoint was reached
- the AI changed direction

The AI should continuously track the actual player position.

It should not behave like:

> “I haven't seen the player for 0.7 seconds. I assume he has escaped to another dimension.”

---

# 📏 RESPECT ATTACK RANGE

The AI should understand its weapon.

If the player is within effective attack range:

**ATTACK.**

If slightly outside range:

**APPROACH.**

If unreachable:

**NAVIGATE.**

Do not use generic movement logic that makes the AI retreat from a player who is perfectly attackable.

Short-range weapons especially must not become useless because the AI repeatedly backs away from its target.

---

# ⚔️ WEAPON AWARENESS

The AI should understand:

- attack range
- attack type
- attack cooldown
- attack recovery
- projectile availability
- ammunition
- reload state
- resource requirements
- special attacks
- melee/ranged behavior
- whether an attack is currently possible
- whether an attack is likely to connect

Do not let the AI blindly attempt actions that its weapon cannot currently perform.

Likewise, don't make it run away simply because one attack is unavailable.

It should choose another useful action.

---

# 🔫 AMMO / RESOURCE MANAGEMENT

If the current weapon uses ammunition/resources, the AI must understand that state.

For example:

```text
Ammo available?
 ├─ YES → continue combat
 └─ NO
      ↓
Can reload safely?
 ├─ YES → reload
 └─ NO → reposition / evade / use alternative
```

The AI should know **why** it is moving.

Every major movement decision should have a purpose.

---

# 🧠 MAKE THE AI ACTUALLY REASON ABOUT SITUATIONS

The AI shouldn't just execute isolated behaviors.

It needs situational decision-making.

Examples:

### Player is directly in front of AI

Attack.

Not:

> “Ah yes, the platform.”

### Player is slightly too far away

Approach.

Not:

> “RETREAT.”

### Player is attacking

Consider evading, blocking if applicable, repositioning, or attacking depending on the situation.

### Player moves away

Pursue.

### Player moves to another platform

Determine whether the platform is actually necessary.

### AI is already on a useful platform

Stay engaged.

### AI starts navigating but the player becomes reachable

Cancel navigation.

### AI repeatedly performs the same failed behavior

Recalculate.

---

# 🔄 ANTI-INFINITE-LOOP SYSTEM

The AI must detect repetitive behavior.

If it keeps doing:

```text
ATTACK
→ JUMP
→ SAME NODE
→ SAME PLATFORM
→ FALL
→ RETURN
→ ATTACK
```

it should recognize that this behavior is not accomplishing anything.

The solution is NOT:

> “Let's make it do the exact same thing but 0.4 seconds slower.”

The AI needs to invalidate its current plan and reassess.

---

# 🏗️ PROPER AI ARCHITECTURE

This is perhaps the most important requirement:

**DO NOT FIX THIS WITH A GIANT PILE OF SPECIAL CASES.**

I do NOT want:

```text
if attackFinished...
if playerNear...
if platform...
if jump...
if node...
if maybe...
if probably...
if definitely...
if PLEASE_STOP...
```

followed by another 800 lines of emergency patches.

That is not architecture.

That's **duct tape with a CPU attached.**

Instead, inspect the existing system and establish clear responsibilities between:

```text
TARGETING
COMBAT DECISION-MAKING
MOVEMENT
NAVIGATION
JUMPING
ATTACK EXECUTION
WEAPON STATE
RESOURCE MANAGEMENT
STATE TRANSITIONS
```

There should be a clear authority over the AI's current intention and movement.

The systems should not fight each other.

Right now it feels like:

> Combat AI: “Attack him.”

> Movement AI: “Jump.”

> Navigation AI: “Platform.”

> Physics: “You are falling.”

> Combat AI: “Wait, where did he go?”

> Navigation AI: “Don't worry, I know the way.”

> Player: “I'm literally still standing here.”

---

# 🤖 RECOMMENDED DECISION STRUCTURE

Use a coherent state/decision architecture appropriate for the existing codebase.

Conceptually, something like:

```text
IDLE
SEARCH
APPROACH
COMBAT
REPOSITION
EVADE
RELOAD
NAVIGATE
RECOVER
```

But do not blindly copy this if the existing architecture has a better equivalent.

The important thing is that:

**COMBAT must be able to interrupt NAVIGATION.**

And:

**NAVIGATION must never silently override COMBAT.**

After a successful attack:

```text
COMBAT
 ↓
REASSESS
 ↓
COMBAT / REPOSITION / PURSUE
```

NOT:

```text
COMBAT
 ↓
ATTACK COMPLETE
 ↓
JUMP
 ↓
NAVIGATION
```

---

# 🧪 AUDIT THE EXISTING CODE FIRST

Before making major changes, inspect the existing AI implementation carefully.

Find the actual causes of:

1. Why the AI jumps after successfully attacking.
2. Why that jump activates navigation.
3. Why the right-side platform is selected.
4. Why the AI walks across the entire platform.
5. Why it doesn't cancel its path when the player remains reachable.
6. Why it doesn't reconsider its objective.
7. Why it walks off the platform.
8. Why it returns to the player only after falling.
9. Why this behavior repeats indefinitely.
10. Whether combat and navigation are both modifying movement simultaneously.
11. Whether attack completion triggers an incorrect state transition.
12. Whether target/aggro state is being reset.
13. Whether weapon state is incorrectly influencing movement.
14. Whether the node system has too much authority.
15. Whether there are multiple competing movement controllers.

**Do not guess. Trace the actual logic.**

---

# 🎮 TEST THE AI PROPERLY

After fixing it, test all of these:

### Test 1 — Player stands still

The AI should approach and attack continuously when appropriate.

### Test 2 — Player stands directly within attack range

The AI should attack.

It should NOT jump away.

### Test 3 — AI lands a successful hit

The AI should reassess and continue combat.

### Test 4 — Player moves slightly away

AI should pursue locally.

### Test 5 — Player retreats

AI should pursue intelligently.

### Test 6 — Player moves onto another platform

AI should determine whether navigation is actually necessary.

### Test 7 — AI begins navigating

Move the player back into attack range.

AI should cancel navigation and engage.

### Test 8 — AI reaches platform edge

AI should reassess rather than blindly walk into the void.

### Test 9 — Weapon has cooldown

AI should make a useful decision instead of wandering.

### Test 10 — Weapon is out of ammo/resources

AI should reload/reposition/use an alternative appropriately.

### Test 11 — Extended combat

Ensure the AI does not gradually fall into a repetitive movement loop.

### Test 12 — Repeated successful attacks

Ensure the AI can actually chain pressure instead of treating every successful hit as the end of its career.

---

# 🏆 FINAL GOAL

I want the AI to feel like an actual opponent.

Not an NPC following a list of errands.

Not a navigation demo.

Not a Roomba with a weapon.

Not a man who gets punched once and immediately remembers he left the oven on.

The AI should understand:

> **“This person is my target. I'm fighting them. What should I do next?”**

Every action should serve that objective unless there is a legitimate tactical reason to temporarily disengage.

The final desired loop is:

```text
SEE PLAYER
 ↓
TARGET PLAYER
 ↓
APPROACH
 ↓
ENTER ATTACK RANGE
 ↓
ATTACK
 ↓
DID IT CONNECT?
 ↓
REASSESS
 ↓
CONTINUE COMBAT
 ↓
ADAPT TO PLAYER
 ↓
REPOSITION WHEN NECESSARY
 ↓
NAVIGATE ONLY WHEN NECESSARY
 ↓
RETURN TO COMBAT
```

The AI should **never** randomly transform this into:

```text
SEE PLAYER
 ↓
ATTACK
 ↓
JUMP
 ↓
PLATFORM
 ↓
WALK RIGHT
 ↓
WALK RIGHT
 ↓
WALK RIGHT
 ↓
FALL
 ↓
“WHERE IS THE PLAYER?”
 ↓
RETURN
 ↓
ATTACK
 ↓
“THIS WAS A GREAT STRATEGY”
 ↓
REPEAT
```

That behavior must be completely eliminated.

## IMPORTANT

Do not just make the AI *look* smarter.

Make the underlying decision-making genuinely more coherent.

**Fix the architecture. Fix the state transitions. Fix combat priority. Fix navigation authority. Fix target persistence. Fix weapon awareness. Fix repetitive behavior.**

And above all:

### **MAKE THE BOT REMEMBER THAT IT CAME TO FIGHT THE PLAYER.**

Because currently it gets one successful hit and immediately goes on a fucking field trip.
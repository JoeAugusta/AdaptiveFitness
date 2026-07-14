/** Setup / execution cues keyed by exerciseLibrary id — merged in exerciseLibrary.ts */
export const EXERCISE_CUES: Record<string, readonly [string, string, string]> = {
  c01: [
    'Grip just outside shoulder width, retract your shoulder blades into the bench',
    'Lower to lower chest — elbows at 45° to your torso, not flared out',
    'Press in a slight arc back toward your face, not straight up',
  ],
  c02: [
    'Set bench incline 30–45°, bar over upper chest, shoulders packed',
    'Lower to upper chest with elbows under the bar, not flared wide',
    'Drive up while keeping wrists stacked over elbows',
  ],
  c03: [
    'Dumbbells over chest, neutral or slight inward angle, feet planted',
    'Lower with control until elbows break 90° or stretch at bottom',
    'Press up and slightly together without clanking the bells',
  ],
  c04: [
    'Incline bench, dumbbells outside shoulders at bottom',
    'Press up and in so elbows stay under wrists at lockout',
    'Keep ribs down — don’t arch excessively off the pad',
  ],
  c05: [
    'Step out, slight forward lean, soft elbows — not locked straight',
    'Open arms in a wide arc, feel stretch across chest at the back',
    'Squeeze chest together at the front without shrugging shoulders',
  ],
  c06: [
    'Lie flat, slight bend in elbows, dumbbells over chest',
    'Lower in a wide arc until comfortable stretch — no shoulder pinch',
    'Bring weights together over chest using chest, not a press motion',
  ],
  c07: [
    'Adjust seat so handles line up mid-chest, back flat on pad',
    'Press without letting shoulders roll forward at the end',
    'Control return — don’t let stack slam between reps',
  ],
  c08: [
    'Hands under shoulders, body straight from head to heels',
    'Lower chest toward floor, elbows at ~45° to ribs',
    'Press floor away, keep core tight — no sagging hips',
  ],
  c09: [
    'Secure legs, bar over lower chest, wrists stacked',
    'Lower with control to lower chest; avoid bouncing off chest',
    'Press up without flaring elbows or losing shoulder position',
  ],
  c10: [
    'Place bar on chest, feet flat, back naturally arched',
    'Press straight up — Smith guides the path; focus on chest squeeze',
    "Control the descent; don't rely on the bar stops as a crutch",
  ],
  c11: [
    'Adjust seat so handles align with upper chest at incline angle',
    'Press up and slightly back — maintain shoulder blade retraction',
    'Lower with control; feel upper chest stretch at the bottom',
  ],
  c12: [
    'Set incline 30-45°, bar over upper chest, latch safety stops',
    'Press with control — Smith path is fixed so focus on chest engagement',
    'Lower until stretch is felt across upper chest, not past comfort',
  ],
  c13: [
    'Adjust seat so arms align with mid-chest when elbows are bent 90°',
    "Bring pads together using chest — don't let shoulders roll forward",
    'Pause at peak contraction; control the return without slamming',
  ],
  c14: [
    'Seat height so handles are at mid-chest, slight forward lean',
    'Squeeze chest to bring handles together in an arc motion',
    'Open with control — feel the chest stretch at the back position',
  ],

  b01: [
    'Hinge to roughly 45°, back flat — not rounded, not upright',
    'Pull to your lower chest/upper stomach, lead with your elbows',
    'Control the descent — 2 seconds down, don’t let the bar drop',
  ],
  b02: [
    'Bar over mid-foot, hip-width stance, grip just outside legs',
    'Hinge to the bar, chest up, back flat — push the floor away',
    'Keep the bar against your body the whole way up and down',
  ],
  b03: [
    'Hang with full grip, shoulders down — not shrugged to ears',
    'Pull chest to bar, drive elbows down and back',
    'Lower with control to full hang without swinging',
  ],
  b04: [
    'Grip just outside shoulder width, slight lean back',
    'Pull to upper chest — lead with elbows, not hands',
    'Full stretch at top between every rep, don’t short the range',
  ],
  b05: [
    'Sit tall, slight knee bend, arms extended with shoulder stretch',
    'Row to lower chest/stomach — elbows close to sides',
    'Pause briefly at full contraction, don’t rock your torso',
  ],
  b06: [
    'Knee and hand on bench, back flat and parallel to floor',
    'Pull to hip — elbow goes straight back, not out to the side',
    'Let your shoulder blade move — full retraction at top',
  ],
  b07: [
    'Chest supported or hinged — spine neutral, core braced',
    'Pull handle to lower chest, squeeze shoulder blades together',
    'Don’t jerk the torso — the back does the work',
  ],
  b08: [
    'Supinated grip, hang with shoulders packed',
    'Pull chin over bar path, elbows trace down toward ribs',
    'Lower slowly; avoid kipping unless programmed',
  ],
  b09: [
    'Chest on pad or sit tall — whichever the machine needs',
    'Pull handles to torso without shrugging neck forward',
    'Release with control; reset posture each rep',
  ],
  b10: [
    'Chest on pad, arms hanging straight — full shoulder stretch at start',
    'Row handles to lower chest, squeeze shoulder blades together',
    'Chest stays on pad throughout — no torso momentum',
  ],
  b11: [
    'Set counterweight so you can complete full reps with control',
    'Pull chin over bar, elbows drive down toward hips',
    'Lower slowly — use it to build to unassisted pull-ups',
  ],

  s01: [
    'Grip just outside shoulders, bar resting on upper chest',
    'Brace core hard, press straight up — tuck chin as bar passes face',
    'Lock out fully overhead, don’t hyperextend your lower back',
  ],
  s02: [
    'Dumbbells at shoulder height, palms forward or neutral',
    'Press straight up without letting low back arch hard',
    'Touch heads lightly at top or stop just shy — no clashing',
  ],
  s03: [
    'Slight bend in elbows, lead with your elbows not your hands',
    'Raise to shoulder height — thumbs slightly lower than pinkies',
    'Lower slowly — don’t let them drop, the descent is half the work',
  ],
  s04: [
    'Stand beside stack, cable slightly behind your body',
    'Raise arm out to the side with fixed elbow bend',
    'Stop before traps take over — pure delt, not shrug',
  ],
  s05: [
    'Rope at face height, thumbs toward you at start',
    'Pull rope apart toward ears, elbows high and wide',
    'Squeeze rear delts — don’t lean back to cheat',
  ],
  s06: [
    'Hinge forward, dumbbells hanging under chest',
    'Fly out with slight elbow bend, thumbs down bias',
    'Pause at top rear delt height, lower with control',
  ],
  s07: [
    'Start palms-in at shoulder height, rotate as you press',
    'Full range without arching low back excessively',
    'Reverse the rotation on the way down under control',
  ],
  s08: [
    'Seat and handles so elbows track comfortably at 90° start',
    'Press overhead in a straight line, head neutral',
    'Don’t lock knees or drive hips — shoulders do the work',
  ],
  s09: [
    'Adjust seat so arm pads contact just above elbows',
    'Raise arms to shoulder height using lateral delts only — no shrug',
    'Lower with 2-second control; resist the weight on the way down',
  ],

  bi01: [
    'Stand tall, elbows pinned to your sides throughout',
    'Curl the bar to shoulder height — don’t swing your body',
    'Lower slowly — 2–3 seconds on the way down',
  ],
  bi02: [
    'Alternating or together — elbows stay at your ribs',
    'Supinate fully at top if rotating; control the negative',
    'No hip thrust or leaning back for momentum',
  ],
  bi03: [
    'Neutral grip, elbows at sides',
    'Curl straight up without letting elbows drift forward',
    'Squeeze at top, resist on the way down',
  ],
  bi04: [
    'Armpit on pad, bar clears thighs at bottom',
    'Curl only through the elbows — upper arm vertical',
    'Full extension at bottom without resting on the rack',
  ],
  bi05: [
    'Cable low, elbows fixed at your sides',
    'Curl to shoulders, keep shoulders down',
    'Step back slightly for constant tension if needed',
  ],
  bi06: [
    'Back on incline, arms hang straight down',
    'Curl with minimal shoulder movement — long head bias',
    'Pause at top stretch position, no bouncing',
  ],
  bi07: [
    'Adjust seat so elbows align with machine pivot, upper arms supported',
    'Curl through full range without letting elbows lift off pad',
    'Lower with control — 2-3 second negative for maximum stimulus',
  ],
  bi08: [
    'Set armrest height so upper arm lies flat on pad, no gap',
    'Curl using only forearms — upper arm stays on pad throughout',
    'Full extension at bottom without resting weight on the stack',
  ],

  tr01: [
    'Elbows pinned to sides, upper arms vertical',
    'Press down to full extension — lock out briefly',
    'Control the return — don’t let the weight pull your elbows up',
  ],
  tr02: [
    'Elbow high and fixed, cable behind head or beside',
    'Extend forearms only — upper arm doesn’t drift forward',
    'Feel long head stretch at top, full lockout at bottom',
  ],
  tr03: [
    'Upper arms vertical and fixed — only your forearms move',
    'Lower bar to forehead or just behind head',
    'Press back up without flaring elbows out',
  ],
  tr04: [
    'Hands shoulder-width on bar, feet planted, slight arch',
    'Touch lower chest, elbows tucked ~45°',
    'Drive up — triceps finish the lockout without flaring elbows',
  ],
  tr05: [
    'Hinge forward, upper arm parallel to floor, elbow pinned',
    'Extend to straight arm behind you, pause',
    'Don’t swing torso — isolate the triceps',
  ],
  tr06: [
    'Support on bars or rings, shoulders depressed',
    'Lower until shoulders stay stable — depth you own',
    'Press up, lean torso angle consistent through set',
  ],
  tr07: [
    'Adjust seat height so handles are at lower chest level',
    'Press down using triceps and chest, keep elbows tracking forward',
    'Control the return — full extension at bottom without locking hard',
  ],
  tr08: [
    'Adjust counterweight so movement is challenging but controlled',
    'Lower with control until arms straighten, chest near handles',
    'Press up through full range — use as bodyweight dip progression',
  ],
  tr09: [
    'Adjust pad height so elbows align with machine pivot point',
    'Press down to full extension using only triceps',
    "Control the return — don't let the stack bounce at the top",
  ],
  tr10: [
    'Sit facing machine, handles at forehead height, elbows up',
    'Extend forearms to full lockout — upper arms stay vertical',
    'Lower with control; feel the long head stretch at top position',
  ],
  tr11: [
    'Grip narrower than shoulder width, latch safety stops',
    'Lower to chest with elbows tracking close to ribs',
    'Press to lockout — triceps finish the movement, chest initiates',
  ],

  q01: [
    'Bar on upper traps, feet shoulder-width, toes slightly out',
    'Brace your core, push your knees out over your toes as you descend',
    'Drive through your whole foot on the way up — don’t rise on your toes',
  ],
  q02: [
    'Bar in front rack, elbows high, chest tall',
    'Squat deep while keeping torso as upright as you can',
    'Drive up with knees tracking toes, elbows stay lifted',
  ],
  q03: [
    'Feet shoulder-width, mid-height on platform',
    'Lower until knees near 90° — don’t let lower back peel off pad',
    'Press through whole foot, don’t lock knees out hard at top',
  ],
  q04: [
    'Pad hits just above ankle, back flat on seat',
    'Extend to full knee straighten without snapping joints',
    'Control the weight down — no slamming the stack',
  ],
  q05: [
    'Feet placement lets you keep full foot contact on pad',
    'Descend until thighs near parallel without hips tucking under',
    'Drive up through mid-foot, maintain torso angle',
  ],
  q06: [
    'Rear foot elevated, front foot far enough forward to keep shin vertical',
    'Lower straight down — front knee tracks over toes',
    'Drive through front heel to stand, keep torso upright',
  ],
  q07: [
    'Hold dumbbell or kettlebell at chest height, feet shoulder-width',
    'Squat deep — elbows track inside knees at the bottom',
    'Keep chest tall throughout, drive through heels to stand',
  ],
  q08: [
    'Step long enough that front knee stays over ankle',
    'Back knee travels toward floor — torso tall',
    'Push through front foot to stand; reset balance each step',
  ],
  q09: [
    'Feet shoulder-width, toes slightly out, bar across upper traps',
    'Squat until thighs parallel — knees track over toes throughout',
    'Drive up through whole foot; Smith guides path so focus on depth',
  ],
  q10: [
    'One foot centered on platform, other foot off — maintain balance',
    'Lower until knee approaches 90° without hip lifting off seat',
    'Press through full foot; unilateral work reveals side-to-side imbalances',
  ],

  h01: [
    'Soft knee bend throughout — this is a hinge, not a squat',
    'Push your hips back as you lower, keep the bar close to your legs',
    'Feel the stretch in your hamstrings — stop before your back rounds',
  ],
  h02: [
    'Align knee with machine hinge, pad on lower calf',
    'Curl heels toward glutes without lifting hips off pad',
    'Lower slowly — full extension each rep',
  ],
  h03: [
    'Bar close, slight knee bend, hinge from hips',
    'Lower until you feel strong hamstring load — flat back',
    'Drive hips forward to stand, squeeze glutes at top',
  ],
  h04: [
    'Dumbbells in front, soft knees, neutral spine',
    'Hinge until dumbbells pass knees — bar path vertical',
    'Stand tall by extending hips, not hyperextending low back',
  ],
  h05: [
    'Knees padded, ankles secured, body straight from knees up',
    'Lower with control using hamstrings — don’t collapse',
    'Push back up using hamstrings and glutes, minimal hand help',
  ],
  h06: [
    'Feet hip-width, hike bell back to load hamstrings',
    'Hinge and snap hips — arms are ropes, not pulling',
    'Stop at chest height; bell floats — don’t squat the swing',
  ],
  h07: [
    'Lie face down, align knees with machine hinge, pad on lower calf',
    'Curl heels toward glutes without hips lifting off pad',
    'Lower with 2-3 second control — the eccentric is where growth happens',
  ],
  h08: [
    'Sit with knees at machine hinge, back against pad, ankle pad secure',
    'Curl heels under seat through full range of motion',
    'Pause at peak contraction; lower with control to full extension',
  ],

  g01: [
    'Upper back on bench, bar over hip crease with pad, feet flat',
    'Drive through heels, squeeze glutes hard at the top',
    'Full hip extension at top — body forms a straight line, chin tucked',
  ],
  g02: [
    'Lie on floor, feet under knees, arms at sides',
    'Drive hips up by squeezing glutes, not arching low back',
    'Pause at top, lower with control — ribs stay down',
  ],
  g03: [
    'Cable low, between legs, soft knees',
    'Hinge and let cable pass back, then drive hips forward',
    'Squeeze glutes at lockout without overarching spine',
  ],
  g04: [
    'Wide stance, toes out, grip inside knees',
    'Drop hips between legs, chest up, knees track toes',
    'Drive floor away, lock hips and knees together at top',
  ],
  g05: [
    'Hinge slightly, cable on ankle strap',
    'Kick back with straight leg — glute does the work',
    'Don’t rotate hips open; keep pelvis square',
  ],
  g06: [
    'Band over hips, upper back on bench, feet planted',
    'Drive hips up against band tension',
    'Hold top squeeze, control down — band pulls evenly',
  ],
  g07: [
    'Back against pad, bar or pad across hip crease, feet flat',
    'Drive hips up to full extension — squeeze glutes hard at the top',
    'Lower with control; reset position each rep for consistent stimulus',
  ],
  g08: [
    'Sit in machine with hip pad across upper glutes/lower back',
    'Drive hips forward through full extension using glutes',
    'Control return — machine isolates glutes better than barbell hip thrust',
  ],

  cv01: [
    'Balls of feet on platform, stand tall through hips',
    'Rise onto toes as high as possible, pause',
    'Lower heels below platform for full stretch — no bouncing',
  ],
  cv02: [
    'Knees bent 90°, pad on thighs, balls of feet on edge',
    'Extend ankles — squeeze calves at top',
    'Slow negative; full stretch at bottom each rep',
  ],
  cv03: [
    'Stand on step or floor, dumbbell in one or both hands',
    'Rise maximally, balance without leaning forward',
    'Control the descent through full range',
  ],
  cv04: [
    'Toes on sled platform, legs nearly straight, safeties set',
    'Press sled with toes — calves only, minimal knee bend',
    'Full stretch at bottom, smooth reps',
  ],
  cv05: [
    'Edge of step, body upright, hand on wall for balance if needed',
    'Max height raise, 1–2 second hold',
    'Lower past neutral for stretch when safe',
  ],
  cv06: [
    'Bar on traps or hands on bar, balls of feet on low block',
    'Same path as standing raise — full ROM',
    'Don’t let hips drive the motion; ankles do the work',
  ],

  co01: [
    'Forearms on floor, body in a straight line from head to heels',
    'Squeeze glutes and brace core — don’t let hips sag or pike',
    'Breathe steadily, hold the position without holding your breath',
  ],
  co02: [
    'Hang with active shoulders, slight posterior pelvic tilt',
    'Curl pelvis up, lifting legs with control',
    'Lower without swinging — scale to knee tuck if needed',
  ],
  co03: [
    'Knees bent or hips flexed, rope high on chest',
    'Crunch spine down and in — not pulling with arms only',
    'Exhale at contraction, full extension at top',
  ],
  co04: [
    'Knees under hips, wheel under shoulders',
    'Roll out maintaining neutral spine as long as possible',
    'Pull back with lats and abs — don’t collapse into low back',
  ],
  co05: [
    'Feet up or down, lean back slightly, chest tall',
    'Rotate shoulders side to side from the core',
    'Don’t yank with arms — ribs move, not just hands',
  ],
  co06: [
    'Side-on to cable, hands at chest, feet wide',
    'Press straight out, resist rotation — torso doesn’t turn',
    'Bring hands back with control; reset breath each rep',
  ],
  co07: [
    'Lie on back, arms up, hips and knees at 90°',
    'Lower opposite arm and leg slowly without back arching',
    'Return with exhale; keep low back gently pressed to floor',
  ],

  tp01: [
    'Bar at arms length, shoulders down before you shrug',
    'Lift straight up — traps elevate, not roll forward',
    'Lower with control; don’t bounce the bar',
  ],
  tp02: [
    'Dumbbells at sides, chest up, neutral spine',
    'Shrug straight up, pause at top',
    'Avoid excessive neck jutting — motion is vertical',
  ],
  tp03: [
    'Narrow grip, bar close to body at start',
    'Lead with elbows, pull bar up along body to chest height',
    'Don’t yank — if shoulders impinge, widen grip or reduce load',
  ],
  tp04: [
    'Arms straight, cable low, stand tall',
    'Shrug up and slightly back — rear bias',
    'Pause, lower slowly',
  ],
  tp05: [
    'Heavy dumbbells at sides, chest tall, short steps',
    'Walk with even steps, no leaning side to side',
    'Grip and traps work together — don’t rush the distance',
  ],
  tp06: [
    'Kettlebells hanging at sides, shoulders packed',
    'Shrug vertically without rotating wrists',
    'Control the drop — protect shoulders and grip',
  ],

  f01: [
    'Forearms on thighs, wrists past knees, underhand grip',
    'Curl wrists up through full range, squeeze flexors',
    'Lower slowly — 2 seconds down',
  ],
  f02: [
    'Forearms on thighs, overhand grip, wrists neutral start',
    'Extend wrists up, then lower below neutral for extensors',
    'Keep movement small and strict — no elbow swing',
  ],
  f03: [
    'Overhand grip, elbows at sides',
    'Curl bar with minimal shoulder help — wrists neutral',
    'Emphasize slow eccentric for brachioradialis',
  ],
  f04: [
    'Pinch smooth plates together between fingers and thumb',
    'Stand tall, hold for time without dropping',
    'Don’t hitch shoulders — pure grip endurance',
  ],
  f05: [
    'Forearm on bench or thigh, wrist off edge, palm up',
    'Curl wrist through full flexion',
    'Lower past neutral for stretch, repeat',
  ],
  f06: [
    'Anchor band low, palm down, forearm supported',
    'Extend wrist against band, control return',
    'Keep elbow still — only wrist moves',
  ],
  // ── Append inside EXERCISE_CUES in exerciseLibraryCues.ts ──
// 74 entries covering every non-alias exercise that currently falls to DEFAULT_EXERCISE_CUES.
// Alias ids (c02b, c05d, c06a, s03b, s19, tr03b, tr04b, tr06b, h03b, h05b, tp07, cv08)
// are intentionally ABSENT — resolve them via canonicalExerciseId() in the lookup.

c01a: [
  'Grip 1–2 hand-widths wider than your normal bench grip',
  'Lower to mid-chest — shorter stroke, more chest, less triceps',
  'Keep elbows under the bar; wide grip punishes flaring hardest',
],
c01b: [
  'Underhand grip just outside shoulders, thumbs wrapped, wrists stacked',
  'Lower to lower chest with elbows tucked close to ribs',
  'Press up and slightly back — targets upper chest despite flat bench',
],
c05a: [
  'Set pulleys high, step forward, slight forward lean',
  'Sweep hands down and together toward your hips',
  'Squeeze lower chest at the bottom — don’t turn it into a pressdown',
],
c05b: [
  'Set pulleys low, palms facing forward, staggered stance',
  'Sweep up and together, finishing at upper-chest height',
  'Lead with your chest, not your biceps — soft elbows throughout',
],
c05c: [
  'Set pulleys at chest height, one foot forward for balance',
  'Bring hands together straight in front of your sternum',
  'Hold the squeeze a beat — mid-cable hits the whole pec evenly',
],
c15: [
  'Set pulleys low, bench at 30–45° between the stacks',
  'Fly up and together over your upper chest',
  'Keep shoulder blades pinned to the pad — no reaching at the top',
],
c16: [
  'Set bench to a slight decline, dumbbells over lower chest',
  'Lower with elbows about 45° from your torso',
  'Press up without letting the bells drift toward your face',
],
c17: [
  'Lie across or along bench, one dumbbell held over your chest',
  'Lower behind your head with slightly bent elbows until you feel a lat stretch',
  'Pull back over your chest — ribs down, no arching off the bench',
],
b01a: [
  'Grip well outside shoulders, hinge to ~45°, bar under shoulders',
  'Row to your lower chest with elbows flared wider than usual',
  'Squeeze upper back and rear delts — this grip targets thickness up high',
],
b01b: [
  'Overhand grip at shoulder width or inside, braced hinge position',
  'Pull to your stomach with elbows staying close to your sides',
  'Drive elbows back, not up — narrower grip means more lat',
],
b01c: [
  'Underhand grip at shoulder width, hinge and brace before pulling',
  'Row to your belt line, elbows tight to your ribs',
  'Don’t curl the bar up — pull with your back, arms just connect',
],
b12: [
  'Stand inside the bar, grip handles, chest up, hips back',
  'Drive through your whole foot to stand tall — no leaning back',
  'Lower under control by pushing hips back, not folding at the spine',
],
b13: [
  'Set pins just below your knees, grip like a deadlift',
  'Brace hard, then drive hips through to lockout',
  'Squeeze glutes at the top — don’t hyperextend your lower back',
],
b04a: [
  'Grip wide on the bar, chest tall, slight lean back',
  'Pull to your upper chest, elbows driving down and out',
  'Wide grip shortens the stroke — full stretch at the top still matters',
],
b04b: [
  'Close neutral or narrow grip, chest up, shoulders down',
  'Pull to your sternum, elbows tracking straight down',
  'Let your arms fully lengthen at the top — that stretch is the rep',
],
b04c: [
  'Underhand grip at shoulder width, wrists straight',
  'Pull the bar to your upper chest, elbows tight to your sides',
  'Resist turning it into a curl — lats pull, biceps assist',
],
b05a: [
  'Feet braced, close-grip handle, sit tall with chest up',
  'Pull to your stomach, elbows skimming your ribs',
  'Pause the squeeze, then let your shoulder blades reach forward fully',
],
b05b: [
  'Wide bar attachment, grip outside shoulders, chest proud',
  'Row to your lower chest with elbows flared out',
  'Think about pinching your shoulder blades — upper back does the work',
],
b05c: [
  'Underhand grip on a straight bar, sit tall',
  'Pull to your belt line, elbows tucked tight',
  'Keep torso still — no rocking to move the stack',
],
b05d: [
  'One handle, brace your free hand on your thigh or the machine',
  'Row to your hip, letting your shoulder blade fully retract',
  'Resist torso rotation — the stack shouldn’t swing you around',
],
b06a: [
  'Knee and hand on bench, dumbbell hanging, palm facing back',
  'Row to your hip with your elbow flaring slightly outward',
  'Pronated grip biases upper back — squeeze between your shoulder blades',
],
b14: [
  'Straight bar at high pulley, arms long, slight hinge forward',
  'Sweep the bar to your thighs with elbows nearly locked',
  'Pure lat pullover motion — if your elbows bend, it’s a pushdown',
],
b15: [
  'Landmine bar beside you, staggered stance, grip the sleeve end',
  'Row to your hip with your elbow tracking wide',
  'Brace your free forearm on your thigh — no torso twist',
],
b16: [
  'Lie chest-down on a high flat bench, bar hanging below',
  'Row to touch the bench underside, squeeze your mid-back',
  'The bench kills momentum — if reps stall, the weight is honest',
],
s10: [
  'Hold an upright post, lean your body away from the low cable',
  'Raise the cable arm to shoulder height, leading with your elbow',
  'The lean loads the full range — control the bottom stretch',
],
s10a: [
  'Set cables at face height, grab opposite handles, arms crossed',
  'Pull open and back in a wide arc to your sides',
  'Finish with arms wide like a T — rear delts, not traps',
],
s11: [
  'Hold a band at shoulder height, hands inside shoulder width',
  'Pull the band apart until it touches your chest',
  'Keep ribs down and shoulders low — small muscles, strict reps',
],
s12: [
  'Face the pec deck pad, handles at shoulder height',
  'Sweep arms open and back with a slight elbow bend',
  'Pause when your arms pass your torso line — no shrugging',
],
s13: [
  'Seat under the Smith bar, bar at chin height to start',
  'Press straight up to lockout without banging the stops',
  'Lower to chin level under control — fixed path, strict tempo',
],
s14: [
  'Low cable behind you, handle in one or both hands',
  'Raise straight in front to shoulder height, arms nearly straight',
  'Stop at eye level — higher just shifts load to your traps',
],
s15: [
  'Dumbbells resting on your thighs, palms facing down or neutral',
  'Raise straight forward to shoulder height, one or both arms',
  'No swing from the hips — lighter and stricter beats heavier and sloppy',
],
s16: [
  'Grip a barbell at shoulder width, resting on your thighs',
  'Raise to shoulder height with straight arms, ribs down',
  'Lower in three seconds — the bar punishes momentum on this one',
],
s17: [
  'Hold a plate at 3 and 9 o’clock against your thighs',
  'Raise to eye level with slightly bent arms',
  'Keep your torso vertical — leaning back is cheating the front delts',
],
s18: [
  'Hinge to nearly parallel, dumbbells hanging under your chest',
  'Raise out to your sides, pinkies leading slightly',
  'Dead-stop each rep at the bottom — swinging steals the rear delts’ work',
],
s20: [
  'Sit on a bench end, chest to your thighs, bells under your legs',
  'Raise out wide with soft elbows to shoulder height',
  'The seat locks out momentum — stay folded over throughout',
],
bi02a: [
  'Palms up from the very bottom of every rep',
  'Curl to shoulder height without your elbows drifting forward',
  'Squeeze hard at the top — full supination is the biceps’ best angle',
],
bi02b: [
  'Palms down, grip the bells like hammers turned flat',
  'Curl with your elbows pinned to your sides',
  'Lower slow — pronated grip loads your forearms and brachialis',
],
bi09: [
  'Neutral grip, curl one dumbbell across toward your opposite shoulder',
  'Keep your elbow at your side — only your forearm travels',
  'Alternate arms, no torso lean to help the bell over',
],
bi10: [
  'Rope at low pulley, neutral grip, elbows at your sides',
  'Curl the rope up, keeping palms facing each other',
  'Constant cable tension — no rest at the bottom, no swing at the top',
],
bi11: [
  'Seated, elbow braced against your inner thigh',
  'Curl to your shoulder with zero upper-arm movement',
  'The brace exposes cheating — if the weight moves, your biceps moved it',
],
bi12: [
  'Face away from a low cable, arm behind your body',
  'Curl from a deep stretch, elbow staying behind your torso',
  'The stretch is the point — full extension every rep',
],
bi13: [
  'Grip the EZ bar on the angled sections, palms semi-supinated',
  'Curl to shoulder height, elbows pinned to your sides',
  'The angle spares your wrists — don’t let it invite extra weight',
],
bi14: [
  'Grip the EZ bar on the outer angled sections',
  'Curl with elbows tucked, wide grip biasing the inner biceps',
  'Lower fully each rep — half reps hide in wide-grip curls',
],
bi15: [
  'Rope at the low pulley, palms facing each other',
  'Curl and twist your palms up as you reach the top',
  'Spread the rope ends at the peak for a harder squeeze',
],
bi16: [
  'Chest against an incline bench set steep, arms hanging straight down',
  'Curl to your forehead line without your elbows swinging back',
  'Arms hang in front — no shoulder assistance is possible; stay strict',
],
tr01a: [
  'Rope at high pulley, elbows locked to your sides',
  'Push down and spread the rope ends apart at the bottom',
  'Full elbow lockout each rep — the spread is the squeeze',
],
tr01b: [
  'Straight bar, overhand grip, elbows pinned to your ribs',
  'Push to full lockout without your shoulders rounding forward',
  'Let the bar rise to chest height — full stretch, no elbow drift',
],
tr01c: [
  'V-bar at high pulley, neutral grip, slight forward lean',
  'Press down to lockout, elbows glued to your sides',
  'Neutral grip lets you go heavier — keep the reps just as strict',
],
tr01d: [
  'Underhand grip on a straight bar, wrists straight',
  'Push down to lockout, keeping tension through your knuckles',
  'Lighter than overhand is normal — this grip isolates the medial head',
],
tr02a: [
  'Face away from the cable, rope behind your head, elbows up',
  'Extend forward to lockout, biceps staying beside your ears',
  'The stretch at the back is the money — control it, don’t drop it',
],
tr02b: [
  'One dumbbell or handle overhead, opposite hand bracing your elbow',
  'Lower behind your head, then extend to full lockout',
  'Keep the working elbow pointed at the ceiling the whole set',
],
tr12: [
  'Face away from a high pulley, rope overhead, staggered stance',
  'Extend forward and up to full lockout',
  'Elbows stay narrow — flaring turns it into a press',
],
tr13: [
  'EZ bar over your forehead, grip on the angled sections',
  'Lower to your hairline with elbows pointed at the ceiling',
  'Extend without your elbows flaring — the angle spares your wrists, not your form',
],
tr14: [
  'Dumbbells over your face, palms facing each other',
  'Lower beside your ears, elbows fixed and narrow',
  'Neutral grip allows a deeper stretch — use it, control it',
],
tr15: [
  'Hands under your chest, thumbs and index fingers forming a diamond',
  'Lower until your chest touches your hands, elbows tight',
  'Press away without your hips sagging — narrow means triceps',
],
q11: [
  'Step backward into a lunge, front shin staying vertical',
  'Lower until your back knee nearly touches the floor',
  'Drive through your front heel to stand — torso tall throughout',
],
q12: [
  'Full foot on a knee-height box, torso leaning slightly forward',
  'Drive through the elevated leg to stand tall on the box',
  'Lower slowly — don’t push off the bottom leg to cheat',
],
q13: [
  'One leg on the extension pad, the other resting aside',
  'Extend to full lockout and squeeze your quad hard',
  'Lower in three seconds — single-leg exposes the strong side’s cheating',
],
q14: [
  'Ankle cuff on a low cable, face away, brace on something stable',
  'Kick forward to full knee lockout',
  'Control the return — the cable pulls back faster than a machine',
],
h09: [
  'Heels on the ball, hips bridged off the floor',
  'Curl the ball toward you, hips staying high',
  'Extend back out slowly — dropping your hips deletes the hamstrings',
],
h10: [
  'Stand at the machine, pad behind one ankle, hips square',
  'Curl your heel toward your glutes without your hip flexing',
  'Lower slow — standing curls cheat easily through hip swing',
],
h11: [
  'One dumbbell opposite the working leg, soft standing knee',
  'Hinge forward as your rear leg extends behind for balance',
  'Push your hips back, not down — stop when your hamstring says stop',
],
h12: [
  'Bar on your back like a squat, feet hip width',
  'Push your hips back and fold forward with a flat spine',
  'Stop at your hamstring stretch limit — this is a hinge, not a bow',
],
g09: [
  'On all fours, core braced, one knee bent at 90°',
  'Drive that heel toward the ceiling using your glute',
  'Stop when your thigh reaches torso line — arching your back is fake range',
],
g10: [
  'Sit tall in the machine, pads outside your knees',
  'Push your knees apart against the pads',
  'Pause at full spread — lean slightly forward to bias the upper glutes',
],
cv07: [
  'One foot on the edge of a step, other foot hooked behind',
  'Press to full tiptoe, pause at the top',
  'Lower until your heel drops below the step — full stretch every rep',
],
cv09: [
  'Bar on your back, balls of your feet on a plate or block',
  'Rise to full tiptoe without bending your knees',
  'Slow negatives — bouncing out of the stretch wastes the rep',
],
co08: [
  'Lie back holding a plate or dumbbell against your chest',
  'Curl your shoulder blades off the floor, ribs toward hips',
  'Exhale hard at the top — short range, maximum squeeze',
],
co09: [
  'Knees bent, feet anchored or flat, hands across your chest',
  'Curl up one vertebra at a time to your knees',
  'Lower with the same control — flopping down is half a rep',
],
co10: [
  'Lie flat, hands under your hips for support',
  'Raise straight legs to vertical, lower back staying pressed down',
  'Lower until just off the floor — if your back arches, shorten the range',
],
co11: [
  'Hands lightly behind your head, legs raised, knees bent',
  'Drive opposite elbow toward opposite knee as the other leg extends',
  'Slow rotation beats fast flailing — count the squeeze, not the reps',
],
co12: [
  'Forearm under your shoulder, feet stacked, body in one line',
  'Lift your hips so nothing sags between shoulder and ankle',
  'Breathe steadily — hold time only counts while the line is straight',
],
co13: [
  'Cable set high, both hands on the handle, feet wide',
  'Pull diagonally across your body to the opposite hip',
  'Rotate through your torso — arms stay long, hips finish the turn',
],
tp08: [
  'Smith bar at arm’s length in front of your thighs',
  'Shrug straight up toward your ears, pause at the top',
  'The fixed path removes stability work — earn it with a two-second hold',
],
};

export const DEFAULT_EXERCISE_CUES: readonly [string, string, string] = [
  'Brace your core and set a stable base before moving.',
  'Control the lifting and lowering phases — no bouncing or jerking.',
  'Stop before form breaks down — quality reps beat sloppy weight.',
];

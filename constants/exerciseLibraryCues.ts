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
};

export const DEFAULT_EXERCISE_CUES: readonly [string, string, string] = [
  'Brace your core and set a stable base before moving.',
  'Control the lifting and lowering phases — no bouncing or jerking.',
  'Stop before form breaks down — quality reps beat sloppy weight.',
];

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ExerciseEducationEntry = {
  difficulty: ExerciseDifficulty;
  primaryMuscles: string[];
  formCues: string[];
  commonMistakes: string[];
};

export const EXERCISE_EDUCATION: Record<string, ExerciseEducationEntry> = {
  'back squat': {
    difficulty: 'advanced',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Brace your core before you unrack and keep ribs stacked over pelvis.',
      'Drive knees out over toes as you sit back and down together.',
      'Keep the bar path vertical over mid-foot through the whole rep.',
      'Stand up by pushing the floor away; squeeze glutes at the top.',
      'Stop before your lower back rounds or hips tuck under.',
    ],
    commonMistakes: [
      'Knees caving inward — adds knee stress and kills hip drive.',
      'Heels lifting — shifts load forward and overloads the low back.',
      'Good-morninging the weight up — turns squat into hinge and risks spine.',
    ],
  },
  'front squat': {
    difficulty: 'advanced',
    primaryMuscles: ['Quadriceps', 'Upper back'],
    formCues: [
      'Keep elbows high and chest tall so the bar cannot roll forward.',
      'Sit straight down between hips; do not hinge back excessively.',
      'Drive out of the hole with knees and chest rising together.',
      'Keep full foot planted; balance over mid-foot.',
      'Breathe and brace at the top of each rep before descending.',
    ],
    commonMistakes: [
      'Elbows dropping — bar rolls onto neck and dumps you forward.',
      'Leaning torso forward — loses quad stimulus and strains low back.',
      'Shallow depth with heavy forward lean — not a true front squat pattern.',
    ],
  },
  'romanian deadlift': {
    difficulty: 'intermediate',
    primaryMuscles: ['Hamstrings', 'Glutes'],
    formCues: [
      'Softly unlock knees then push hips back like closing a car door.',
      'Keep the bar sliding close to thighs; lats engaged the whole time.',
      'Stop when you feel a strong hamstring stretch, not when you lose back.',
      'Return by driving hips forward to stand tall in one line.',
      'Reset brace at the top before each rep.',
    ],
    commonMistakes: [
      'Rounding lower back at bottom — disc risk with load.',
      'Squatting the weight down — kills hamstring tension.',
      'Bar drifting forward — increases lever arm on spine.',
    ],
  },
  'conventional deadlift': {
    difficulty: 'advanced',
    primaryMuscles: ['Hamstrings', 'Glutes', 'Back'],
    formCues: [
      'Set hips so shoulders sit slightly in front of the bar.',
      'Pull slack out of the bar; brace lats and core before you break the floor.',
      'Push the floor away until the bar passes your knees.',
      'Finish tall with hips and knees locked; do not hyperextend spine.',
      'Lower by reversing the pattern with control.',
    ],
    commonMistakes: [
      'Hips shooting up first — turns deadlift into stiff-leg with weak leg drive.',
      'Bar swinging away from shins — multiplies spinal load.',
      'Jerking off the floor — breaks position and leaks force.',
    ],
  },
  'sumo deadlift': {
    difficulty: 'advanced',
    primaryMuscles: ['Glutes', 'Adductors', 'Quadriceps'],
    formCues: [
      'Open hips and toes; shins stay vertical as you set your grip.',
      'Spread the floor apart with your feet as you initiate the pull.',
      'Keep chest over the bar until knees lock; then open hips to finish.',
      'Track knees over toes; do not let them collapse inward.',
      'Maintain a long neutral spine from head to tailbone.',
    ],
    commonMistakes: [
      'Turning it into a wide stiff-leg — hips too high kills leg drive.',
      'Knees caving — loses torque and stresses groin.',
      'Rounding upper back without a tight setup — risky under load.',
    ],
  },
  'bench press': {
    difficulty: 'intermediate',
    primaryMuscles: ['Chest', 'Triceps', 'Front delts'],
    formCues: [
      'Pull shoulder blades together and down onto the bench.',
      'Touch the bar low on chest with elbows angled toward feet.',
      'Press back toward the rack in a slight arc, not straight up only.',
      'Keep wrists stacked over elbows through the press.',
      'Keep feet planted and glutes lightly on the bench for leg drive.',
    ],
    commonMistakes: [
      'Elbows flaring wide — shifts load off chest onto shoulders.',
      'Bouncing off the chest — loses tension and risks rib or shoulder injury.',
      'Losing upper back tightness — shoulders roll forward and press stalls.',
    ],
  },
  'incline bench press': {
    difficulty: 'intermediate',
    primaryMuscles: ['Upper chest', 'Front delts'],
    formCues: [
      'Set bench so bar clears the rack with a slight backward path.',
      'Touch bar near upper chest or clavicle line, not neck.',
      'Keep elbows under the bar; press up and slightly back.',
      'Maintain upper back pinch and slight arch through set.',
      'Control the eccentric; do not let shoulders shrug to ears.',
    ],
    commonMistakes: [
      'Flaring elbows at 90 degrees — beats up shoulders.',
      'Bouncing at bottom — loses pec tension and risks injury.',
      'Lifting hips high — turns press into decline and cheats range.',
    ],
  },
  'decline bench press': {
    difficulty: 'intermediate',
    primaryMuscles: ['Lower chest', 'Triceps'],
    formCues: [
      'Lock legs into pads so you cannot slide toward the plates.',
      'Unrack with straight arms; settle shoulder blades before reps.',
      'Lower to lower chest with elbows tucked moderately.',
      'Press up without letting shoulders roll off the bench.',
      'Have a spotter or safe catches for heavy attempts.',
    ],
    commonMistakes: [
      'Sliding on bench — loses leg anchor and risks dropping bar.',
      'Touching too high on chest — awkward path and shoulder strain.',
      'Bouncing at bottom — dangerous with decline leverage.',
    ],
  },
  'overhead press': {
    difficulty: 'intermediate',
    primaryMuscles: ['Shoulders', 'Triceps'],
    formCues: [
      'Brace glutes and quads; ribs down before you press.',
      'Bar clears nose by moving face back slightly, not bar around face wildly.',
      'Press straight up to lockout over mid-foot.',
      'Fully lock elbows without shrugging ears into shoulders.',
      'Lower under control to front rack without collapsing forward.',
    ],
    commonMistakes: [
      'Excessive low back arch — turns press into standing incline bench.',
      'Pressing out in front — misses vertical line and stalls lockout.',
      'Flaring ribs forward — leaks brace and hurts spine.',
    ],
  },
  'barbell row': {
    difficulty: 'intermediate',
    primaryMuscles: ['Lats', 'Upper back'],
    formCues: [
      'Hinge until torso is roughly parallel to floor with neutral spine.',
      'Pull elbows back along ribs; squeeze shoulder blades at top.',
      'Keep bar path straight up to lower chest or upper abdomen.',
      'Do not use momentum from hips on strict rows.',
      'Lower with control until arms fully lengthen.',
    ],
    commonMistakes: [
      'Standing too upright — turns row into shrug and shrinks range.',
      'Rounding spine under load — high injury risk.',
      'Yanking with hips — hides weak lats and cheats stimulus.',
    ],
  },
  'pendlay row': {
    difficulty: 'advanced',
    primaryMuscles: ['Lats', 'Upper back'],
    formCues: [
      'Set torso parallel to floor each rep with flat back.',
      'Let bar rest on floor between reps; reset brace every pull.',
      'Explode elbows back; keep bar close to shins and body.',
      'Do not let hips rise before the bar leaves the floor.',
      'Stop set when you cannot maintain flat back explosiveness.',
    ],
    commonMistakes: [
      'Turning into a rounded-back yank — risks disc injury.',
      'Shortening range — bar never truly dead-stops each rep.',
      'Hips shooting up — steals leg drive and changes angle.',
    ],
  },
  'barbell curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Biceps'],
    formCues: [
      'Keep elbows fixed at your sides; only forearms move.',
      'Supinate wrists slightly at top for a hard biceps squeeze.',
      'Lower slowly; do not let shoulders swing the bar up.',
      'Stand tall with ribs down and glutes squeezed.',
      'Stop before lower back arches to finish the rep.',
    ],
    commonMistakes: [
      'Swinging hips forward — uses momentum instead of biceps.',
      'Elbows drifting forward — shortens range and shifts load.',
      'Shrugging at top — steals work from arms into traps.',
    ],
  },
  'skull crushers': {
    difficulty: 'intermediate',
    primaryMuscles: ['Triceps'],
    formCues: [
      'Keep upper arms angled slightly back toward head, not vertical.',
      'Hinge only at elbows; lower toward forehead or behind head.',
      'Extend elbows without letting shoulders roll forward.',
      'Keep wrists neutral; do not let them collapse backward.',
      'Use moderate weight; triceps fail with small joint angles.',
    ],
    commonMistakes: [
      'Letting elbows flare wide — shifts stress to elbows and shoulders.',
      'Dropping weight too fast — loses control at risky joint angle.',
      'Shrugging shoulders — removes tension from triceps.',
    ],
  },
  'closegrip bench press': {
    difficulty: 'intermediate',
    primaryMuscles: ['Triceps', 'Chest'],
    formCues: [
      'Hands inside shoulder width with wrists stacked.',
      'Touch lower chest with elbows tucked on descent.',
      'Press straight up while keeping elbows under the bar.',
      'Pinch shoulder blades same as standard bench.',
      'Stop if wrists or elbows ache; adjust grip slightly.',
    ],
    commonMistakes: [
      'Hands too narrow — wrecks wrists without more triceps benefit.',
      'Flaring elbows — defeats close-grip purpose and hurts shoulders.',
      'Bouncing off chest — dangerous with narrow hand position.',
    ],
  },
  'good mornings': {
    difficulty: 'advanced',
    primaryMuscles: ['Hamstrings', 'Glutes', 'Low back'],
    formCues: [
      'Bar sits on upper traps like a squat; feet hip-width.',
      'Unlock hips and knees slightly; hinge until torso is near parallel.',
      'Keep spine neutral; imagine long crown to tailbone line.',
      'Drive hips forward to return; squeeze glutes to finish.',
      'Use light loads until pattern is perfect.',
    ],
    commonMistakes: [
      'Rounding spine under load — very high injury risk.',
      'Bending knees like a squat — loses hinge stimulus.',
      'Going too heavy too soon — form breaks instantly.',
    ],
  },
  'hip thrust barbell': {
    difficulty: 'intermediate',
    primaryMuscles: ['Glutes'],
    formCues: [
      'Upper back on bench; bar over hip crease with pad.',
      'Drive through heels; chin tucked slightly.',
      'Extend hips to full lockout with ribs down, not hyperextended spine.',
      'Lower with control without losing rib-pelvis stack.',
      'Pause one second at top on lighter sets to feel glutes.',
    ],
    commonMistakes: [
      'Hyperextending low back at top — hurts spine, not more glutes.',
      'Pushing through toes — reduces glute drive.',
      'Feet too far forward — turns thrust into hamstring curl.',
    ],
  },
  'zercher squat': {
    difficulty: 'advanced',
    primaryMuscles: ['Quadriceps', 'Core', 'Upper back'],
    formCues: [
      'Bar sits in elbow crease; hands clasped or overlapped.',
      'Stay tall through torso; squat down between hips.',
      'Keep elbows high enough that bar cannot slip toward belly.',
      'Drive up evenly through mid-foot.',
      'Brace hard; this position challenges the abs intensely.',
    ],
    commonMistakes: [
      'Elbows dropping — bar slides and crushes forearms or dumps you.',
      'Leaning excessively forward — loses quad stimulus.',
      'Using too much weight before elbows tolerate load.',
    ],
  },
  'hack squat barbell': {
    difficulty: 'advanced',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Bar behind legs demands extreme ankle and knee patience.',
      'Sit back and down while keeping torso as upright as mobility allows.',
      'Keep knees tracking over toes without caving.',
      'Stand by pushing floor away; do not round to stand.',
      'Progress load slowly; balance is the limiter early on.',
    ],
    commonMistakes: [
      'Rounding to reach depth — dangerous behind-the-body bar path.',
      'Knees caving — common with narrow stance hacks.',
      'Cutting depth because of pain — fix mobility before loading.',
    ],
  },
  'box squat': {
    difficulty: 'intermediate',
    primaryMuscles: ['Glutes', 'Quadriceps'],
    formCues: [
      'Sit back until glutes touch box lightly; do not collapse onto it.',
      'Pause or touch-and-go per program; keep chest tall.',
      'Drive knees out as you ascend.',
      'Choose box height that keeps spine neutral.',
      'Treat box as feedback for depth, not a crash pad.',
    ],
    commonMistakes: [
      'Relaxing fully on box — loses tightness and jars spine.',
      'Rocking forward off box — turns into good morning squat.',
      'Box too low for current mobility — rounds low back.',
    ],
  },
  'dumbbell press': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest', 'Triceps'],
    formCues: [
      'Set bench angle; press dumbbells over mid-chest at bottom.',
      'Press up and slightly inward at top without clanking bells.',
      'Keep shoulder blades pinned; feet flat on floor.',
      'Lower under control with elbows roughly 45 degrees from torso.',
      'Stop if shoulder pinches; adjust elbow angle slightly.',
    ],
    commonMistakes: [
      'Letting dumbbells drift too wide — irritates shoulders.',
      'Bouncing at bottom — loses pec tension and risks injury.',
      'Arching off bench excessively — shifts load to low back.',
    ],
  },
  'dumbbell row': {
    difficulty: 'beginner',
    primaryMuscles: ['Lats', 'Upper back'],
    formCues: [
      'Support non-working hand on bench; back flat and parallel-ish.',
      'Pull elbow toward hip pocket, not straight out to the side.',
      'Lower until arm fully lengthens without rounding spine.',
      'Keep neck neutral; eyes slightly ahead of dumbbell.',
      'Match reps both sides for balance.',
    ],
    commonMistakes: [
      'Rotating torso to heave weight — cheats range and risks spine.',
      'Shrugging at top — steals lat work.',
      'Rounding low back — common as weight climbs.',
    ],
  },
  'dumbbell curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Biceps'],
    formCues: [
      'Elbows stay at sides; curl without letting them drift forward.',
      'Control the lowering phase for full biceps stretch.',
      'Stand tall; avoid leaning back as weights rise.',
      'Alternate or both arms per program; keep tempo honest.',
      'Stop before shoulders take over the lift.',
    ],
    commonMistakes: [
      'Swinging torso — momentum replaces muscle work.',
      'Cutting bottom range — leaves gains on the table.',
      'Shrugging at top — shifts tension to traps.',
    ],
  },
  'dumbbell fly': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest'],
    formCues: [
      'Soft elbows; open arms wide with pec stretch at bottom.',
      'Bring dumbbells together over chest in a hugging arc.',
      'Keep shoulder blades pinned; do not roll shoulders forward.',
      'Use moderate weight; this is not a press.',
      'Stop if front shoulder pinches; reduce depth slightly.',
    ],
    commonMistakes: [
      'Bending elbows into a press — wrong exercise stimulus.',
      'Going too heavy — risks pec and shoulder tears.',
      'Losing scapular pinch — shoulders dump forward painfully.',
    ],
  },
  'incline dumbbell press': {
    difficulty: 'beginner',
    primaryMuscles: ['Upper chest', 'Front delts'],
    formCues: [
      'Set incline modest; 30–45 degrees hits upper chest well.',
      'Touch dumbbells outside upper chest with control.',
      'Press up and slightly together without rotating palms wildly.',
      'Keep feet planted and glutes on bench.',
      'Control descent; never drop elbows below safe range.',
    ],
    commonMistakes: [
      'Bench too steep — becomes mostly shoulder press.',
      'Flaring elbows 90 degrees — beats up shoulders.',
      'Bouncing at bottom — loses tension and risks injury.',
    ],
  },
  'incline dumbbell fly': {
    difficulty: 'beginner',
    primaryMuscles: ['Upper chest'],
    formCues: [
      'Same incline as press; soft elbows throughout.',
      'Open until you feel stretch; avoid deep pain in shoulder.',
      'Squeeze upper chest bringing bells together.',
      'Keep wrists neutral relative to forearms.',
      'Lower weight if you cannot keep shoulder blades set.',
    ],
    commonMistakes: [
      'Turning fly into incline press — wrong stimulus.',
      'Dropping elbows below bench line — shoulder impingement risk.',
      'Using max dumbbells — form always breaks first.',
    ],
  },
  'dumbbell lateral raise': {
    difficulty: 'beginner',
    primaryMuscles: ['Side delts'],
    formCues: [
      'Slight bend in elbows; lead with elbows and pinkies slightly up.',
      'Raise to shoulder height or just below if shoulder feels pinch.',
      'Lower slowly; resist gravity on the way down.',
      'Keep ribs down; do not swing hips for momentum.',
      'Think “pour water” at top for a slight tilt, not huge rotation.',
    ],
    commonMistakes: [
      'Using body English — loads traps instead of delts.',
      'Shrugging hard — steals side delt work.',
      'Going too high with impingement — pain means stop higher.',
    ],
  },
  'dumbbell front raise': {
    difficulty: 'beginner',
    primaryMuscles: ['Front delts'],
    formCues: [
      'Lift to eye level or shoulder height with soft elbows.',
      'Keep torso vertical; do not rock backward.',
      'Lower with control; pause at bottom between reps if needed.',
      'Alternate arms or both per program consistently.',
      'Use light weight; front delts are small.',
    ],
    commonMistakes: [
      'Swinging from hips — defeats isolation purpose.',
      'Raising too high behind pain — adjust range.',
      'Shrugging throughout — turns raise into trap exercise.',
    ],
  },
  'dumbbell rear delt fly': {
    difficulty: 'beginner',
    primaryMuscles: ['Rear delts', 'Upper back'],
    formCues: [
      'Hinge forward; let arms hang under shoulders.',
      'Open arms wide like hugging a tree behind you.',
      'Squeeze shoulder blades without cranking neck.',
      'Keep slight elbow bend fixed throughout.',
      'Use moderate reps; feel rear delts burn, not traps only.',
    ],
    commonMistakes: [
      'Standing too upright — becomes shrug not rear delt.',
      'Using momentum — swings dumbbells instead of controlling.',
      'Looking up — strains neck; keep neutral gaze.',
    ],
  },
  'dumbbell shoulder press': {
    difficulty: 'beginner',
    primaryMuscles: ['Shoulders', 'Triceps'],
    formCues: [
      'Seated or standing; dumbbells at shoulder height to start.',
      'Press up and slightly inward without clanking.',
      'Keep ribs down and glutes tight if standing.',
      'Lower until elbows near 90 or comfortable depth.',
      'Do not let lower back arch into hyperextension.',
    ],
    commonMistakes: [
      'Pressing out in front — awkward path and weak lockout.',
      'Leg driving seated press — different exercise entirely.',
      'Arching hard — low back takes overload.',
    ],
  },
  'dumbbell tricep extension': {
    difficulty: 'beginner',
    primaryMuscles: ['Triceps'],
    formCues: [
      'Hold one or two dumbbells overhead with upper arms vertical.',
      'Lower behind head by bending only elbows.',
      'Keep elbows pointing up; do not let them flare wide.',
      'Extend fully without locking aggressively into joint pain.',
      'Keep core braced so ribs do not flare.',
    ],
    commonMistakes: [
      'Elbows splitting apart — loses triceps tension.',
      'Flaring ribs — low back compensates overhead.',
      'Going too heavy — elbows drift and form collapses.',
    ],
  },
  'dumbbell lunge': {
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Step long enough that front knee stays over ankle.',
      'Drop straight down; back knee travels toward floor.',
      'Drive through front heel to stand; rear foot assists balance.',
      'Keep torso tall; dumbbells hang at sides vertical.',
      'Alternate legs or do all one side per program.',
    ],
    commonMistakes: [
      'Short step — front knee dives past toes awkwardly.',
      'Leaning torso forward — turns lunge into good morning.',
      'Knee caving inward — adds knee stress.',
    ],
  },
  'dumbbell rdl': {
    difficulty: 'intermediate',
    primaryMuscles: ['Hamstrings', 'Glutes'],
    formCues: [
      'Hold dumbbells in front of thighs; soft knees unlocked.',
      'Push hips back until hamstrings tighten hard.',
      'Keep dumbbells close; shoulders above hips.',
      'Stand by thrusting hips forward to neutral.',
      'Stop before low back rounds.',
    ],
    commonMistakes: [
      'Squatting instead of hinging — wrong muscle emphasis.',
      'Rounding spine — risky with front-loaded dumbbells.',
      'Letting weights drift forward — increases back stress.',
    ],
  },
  'dumbbell goblet squat': {
    difficulty: 'beginner',
    primaryMuscles: ['Quadriceps', 'Core'],
    formCues: [
      'Hold dumbbell vertically at chest; elbows point down.',
      'Squat between hips with upright torso.',
      'Let elbows track inside knees; push knees out gently.',
      'Stand tall without dumping dumbbell forward.',
      'Use heel elevation if ankles are stiff.',
    ],
    commonMistakes: [
      'Leaning forward and dropping weight — loses quad stimulus.',
      'Heels rising — fix ankle mobility or elevate heels.',
      'Collapsing knees inward — adds knee stress.',
    ],
  },
  'dumbbell stepup': {
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Place full foot on box; knee tracks over toes.',
      'Drive through top leg; do not push off bottom leg excessively.',
      'Stand tall at top with hip fully extended.',
      'Lower slowly; quiet landings protect knees.',
      'Match height and reps both legs.',
    ],
    commonMistakes: [
      'Springing off bottom foot — cheats single-leg work.',
      'Half-stepping onto box — unstable and sloppy.',
      'Knee caving — common with fatigue or weak glutes.',
    ],
  },
  'dumbbell shrug': {
    difficulty: 'beginner',
    primaryMuscles: ['Traps'],
    formCues: [
      'Lift shoulders straight up toward ears, not roll backward.',
      'Pause at top one second on lighter sets.',
      'Lower fully between reps for range.',
      'Keep arms straight; movement is scap elevation only.',
      'Avoid cranking neck forward.',
    ],
    commonMistakes: [
      'Rolling shoulders in big circles — not better for traps.',
      'Using hips to bounce weight — pointless momentum.',
      'Half reps — no stretch at bottom means weak stimulus.',
    ],
  },
  'dumbbell pullover': {
    difficulty: 'intermediate',
    primaryMuscles: ['Lats', 'Chest'],
    formCues: [
      'Lie across bench with hips low; hold one dumbbell with palms up.',
      'Lower dumbbell behind head with slight elbow bend fixed.',
      'Pull back over chest using lats and chest together.',
      'Keep low back from arching off bench excessively.',
      'Breathe out on the pull-over portion if it helps brace.',
    ],
    commonMistakes: [
      'Bending and straightening elbows a lot — turns into triceps.',
      'Going too deep with shoulder pain — shorten range.',
      'Arching hard off bench — low back takes load.',
    ],
  },
  'hammer curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Brachialis', 'Biceps'],
    formCues: [
      'Neutral grip; elbows pinned at sides.',
      'Curl without rotating wrists mid-rep.',
      'Lower slowly to full elbow extension.',
      'Stand tall; no hip swing.',
      'Keep shoulders relaxed down away from ears.',
    ],
    commonMistakes: [
      'Swinging torso — same mistake as standard curls.',
      'Letting elbows drift forward — shortens range.',
      'Shrugging — hides weak arms with traps.',
    ],
  },
  'concentration curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Biceps'],
    formCues: [
      'Sit; elbow braced inside thigh near knee.',
      'Curl dumbbell toward shoulder without moving upper arm.',
      'Squeeze at top; lower until arm almost straight.',
      'Keep back flat; do not hunch over.',
      'Do all reps one arm before switching if program says so.',
    ],
    commonMistakes: [
      'Pulling elbow off thigh — cheats isolation.',
      'Using shoulder to start rep — defeats concentration curl.',
      'Cutting bottom range — limits growth stimulus.',
    ],
  },
  'dumbbell deadlift': {
    difficulty: 'intermediate',
    primaryMuscles: ['Hamstrings', 'Glutes', 'Back'],
    formCues: [
      'Dumbbells outside feet; hinge with neutral spine.',
      'Push floor away as hips and knees extend together.',
      'Keep dumbbells close to legs entire pull.',
      'Finish tall without leaning back.',
      'Lower by reversing hinge pattern under control.',
    ],
    commonMistakes: [
      'Squatting too upright — loses hinge stimulus.',
      'Rounding back — same risk as barbell if heavy.',
      'Letting weights drift forward — increases lever on spine.',
    ],
  },
  'cable row': {
    difficulty: 'beginner',
    primaryMuscles: ['Lats', 'Mid back'],
    formCues: [
      'Sit tall; feet planted on platform.',
      'Pull handle to lower ribs or upper abdomen.',
      'Squeeze shoulder blades; keep chest proud.',
      'Return until shoulders protract slightly without rounding hard.',
      'Do not lean way back after each pull.',
    ],
    commonMistakes: [
      'Excessive torso swing — momentum replaces muscle.',
      'Shrugging at end of pull — upper traps takeover.',
      'Rounding forward at stretch — loses safe shoulder position.',
    ],
  },
  'cable fly': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest'],
    formCues: [
      'Step forward into split stance for balance.',
      'Slight elbow bend fixed; bring hands together in front of chest.',
      'Control the stretch when arms open wide.',
      'Keep shoulders down; do not shrug during fly.',
      'Stand tall; avoid leaning forward into cable stack.',
    ],
    commonMistakes: [
      'Bending elbows into a press — wrong movement pattern.',
      'Going too heavy — cables jerk shoulders.',
      'Losing posture — low back arches to compensate.',
    ],
  },
  'cable crossover': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest'],
    formCues: [
      'Set handles high or low per chest emphasis.',
      'Step forward; slight forward lean from ankles, not low back.',
      'Hands meet in front with pec squeeze at peak.',
      'Control return; feel stretch across chest.',
      'Keep elbows soft and path smooth.',
    ],
    commonMistakes: [
      'Over-leaning with low back — hurts spine, not more chest.',
      'Shrugging throughout — hides weak pecs.',
      'Rushing reps — loses constant tension benefit.',
    ],
  },
  'cable lateral raise': {
    difficulty: 'beginner',
    primaryMuscles: ['Side delts'],
    formCues: [
      'Stand sideways or facing stack per setup; handle at hip.',
      'Lead with elbow; raise to shoulder height smoothly.',
      'Keep cable line clear of body rubbing.',
      'Lower slowly; maintain constant cable tension.',
      'Keep opposite hand on hip for balance if needed.',
    ],
    commonMistakes: [
      'Leaning away hard — cheats range with bodyweight.',
      'Using huge weight — side delts cannot respond.',
      'Shrugging — same error as dumbbell version.',
    ],
  },
  'cable tricep pushdown': {
    difficulty: 'beginner',
    primaryMuscles: ['Triceps'],
    formCues: [
      'Elbows pinned to sides; only forearms move.',
      'Push handle down to full elbow lockout.',
      'Stand tall; slight forward torso lean is fine.',
      'Choose rope or bar per comfort; keep wrists neutral.',
      'Control up without letting elbows drift forward.',
    ],
    commonMistakes: [
      'Elbows flaring forward — loses triceps tension.',
      'Cutting top stretch — half reps limit growth.',
      'Leaning over bar and using body — pure momentum.',
    ],
  },
  'cable curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Biceps'],
    formCues: [
      'Face stack; elbows fixed at sides.',
      'Curl handle toward shoulders under control.',
      'Keep constant tension; cables load the stretch too.',
      'Do not step too close and lose bottom tension.',
      'Squeeze biceps hard at peak without shrugging.',
    ],
    commonMistakes: [
      'Stepping too far back — awkward lean and elbow drift.',
      'Swinging low back — cheats the curl.',
      'Letting elbows move forward — shortens range.',
    ],
  },
  'cable face pull': {
    difficulty: 'beginner',
    primaryMuscles: ['Rear delts', 'Rotator cuff'],
    formCues: [
      'Set cable upper chest height; rope toward face.',
      'Pull rope apart as hands pass face; thumbs drift back.',
      'Elbows high and wide; finish with external rotation feel.',
      'Control return; keep shoulders away from ears.',
      'Use moderate weight; quality over load.',
    ],
    commonMistakes: [
      'Pulling with low elbows — becomes row, not rear delt.',
      'Shrugging hard — defeats rear delt focus.',
      'Going too heavy — form falls apart immediately.',
    ],
  },
  'cable pullthrough': {
    difficulty: 'intermediate',
    primaryMuscles: ['Glutes', 'Hamstrings'],
    formCues: [
      'Face away from stack; rope between legs.',
      'Hinge hips back; arms stay straight as cable travels back.',
      'Drive hips forward to stand; squeeze glutes hard.',
      'Keep spine neutral; do not squat the pattern.',
      'Take small steps out until you feel hamstrings load.',
    ],
    commonMistakes: [
      'Squatting instead of hinging — wrong muscles fire.',
      'Rounding back at bottom — risky with forward pull.',
      'Overextending low back at top — not more glutes.',
    ],
  },
  'lat pulldown': {
    difficulty: 'beginner',
    primaryMuscles: ['Lats'],
    formCues: [
      'Grip slightly outside shoulders; sit tall with thighs pinned.',
      'Pull bar to upper chest by driving elbows down and in.',
      'Lean back only a few degrees; do not lay back.',
      'Control bar up until arms almost straight.',
      'Keep shoulders down away from ears at bottom.',
    ],
    commonMistakes: [
      'Pulling behind neck — unnecessary shoulder risk.',
      'Using momentum from torso — hides weak lats.',
      'Shrugging at top — traps steal the work.',
    ],
  },
  'cable crunch': {
    difficulty: 'beginner',
    primaryMuscles: ['Abs'],
    formCues: [
      'Kneel facing stack; hold rope beside head.',
      'Round upper back slightly; curl ribs toward pelvis.',
      'Exhale hard at bottom contraction.',
      'Return until mild stretch; do not hyperextend low back.',
      'Keep hips quiet; movement is spine flexion.',
    ],
    commonMistakes: [
      'Pulling with arms — arms tire before abs.',
      'Arching low back at top — loses ab stimulus.',
      'Sitting hips back — turns into hip flexor exercise.',
    ],
  },
  'cable woodchop': {
    difficulty: 'intermediate',
    primaryMuscles: ['Obliques', 'Core'],
    formCues: [
      'Set cable high or low per diagonal direction.',
      'Rotate through thoracic spine; hips follow slightly.',
      'Keep arms straight-ish; hands are just hooks.',
      'Brace at end range; control back to start.',
      'Breathe out on the chop effort.',
    ],
    commonMistakes: [
      'Pulling only with arms — no rotation means wrong exercise.',
      'Feet sliding — set stance stable before reps.',
      'Using huge weight — rotation quality disappears.',
    ],
  },
  'cable kickback': {
    difficulty: 'beginner',
    primaryMuscles: ['Glutes'],
    formCues: [
      'Hinge lightly; hold machine or cable for balance.',
      'Kick leg back from hip; knee stays soft, not locked.',
      'Squeeze glute at top without arching low back.',
      'Lower with control; do not crash foot down.',
      'Keep torso quiet; minimal rotation.',
    ],
    commonMistakes: [
      'Arching low back to lift higher — fake range.',
      'Bending knee a lot — turns into hamstring curl.',
      'Leaning forward more each rep — cheats height.',
    ],
  },
  'straightarm pulldown': {
    difficulty: 'intermediate',
    primaryMuscles: ['Lats'],
    formCues: [
      'Stand facing stack; slight hip hinge; arms straight overhead.',
      'Pull bar down to thighs with straight arms.',
      'Keep ribs down; do not lean back to finish.',
      'Raise under control until lats stretch.',
      'Think elbows pointing to back wall at bottom.',
    ],
    commonMistakes: [
      'Bending elbows halfway — becomes pulldown, not isolation.',
      'Leaning back hard — uses bodyweight not lats.',
      'Shrugging at top — breaks lat engagement.',
    ],
  },
  'cable upright row': {
    difficulty: 'intermediate',
    primaryMuscles: ['Side delts', 'Traps'],
    formCues: [
      'Pull rope or bar up leading with elbows high.',
      'Stop at chest height if shoulders feel pinch.',
      'Keep bar close to body throughout.',
      'Lower slowly; do not dump shoulders forward.',
      'Use light to moderate weight for joint comfort.',
    ],
    commonMistakes: [
      'Pulling too high with impingement — pain means stop lower.',
      'Bar drifting away — awkward shoulder angles.',
      'Using body momentum — defeats delt focus.',
    ],
  },
  'leg press': {
    difficulty: 'beginner',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Feet shoulder-width; full foot stays on platform.',
      'Lower until comfortable depth without butt rounding off pad.',
      'Drive through mid-foot; do not lift hips.',
      'Do not lock knees violently at top.',
      'Breathe and brace before each rep.',
    ],
    commonMistakes: [
      'Butt curling off pad at depth — high disc risk.',
      'Knees caving — adds joint stress.',
      'Hands pushing knees — band-aid for bad foot placement.',
    ],
  },
  'leg extension': {
    difficulty: 'beginner',
    primaryMuscles: ['Quadriceps'],
    formCues: [
      'Set pad so shins hang freely; back against seat.',
      'Extend knees smoothly; squeeze quads at top.',
      'Lower with control; do not slam weight stacks.',
      'Keep toes relaxed; do not point hard unless programmed.',
      'Stop if sharp knee pain; reduce load or range.',
    ],
    commonMistakes: [
      'Swinging torso — uses momentum not quads.',
      'Locking knees aggressively — joint discomfort.',
      'Cutting range — leaves stimulus on the table.',
    ],
  },
  'leg curl': {
    difficulty: 'beginner',
    primaryMuscles: ['Hamstrings'],
    formCues: [
      'Align knee joint with machine hinge axis.',
      'Curl heels toward glutes without lifting hips.',
      'Squeeze hamstrings at peak; lower slowly.',
      'Keep hips pinned on prone or seated versions.',
      'Match tempo both legs if unilateral option exists.',
    ],
    commonMistakes: [
      'Thrusting hips up — cheats hamstring length.',
      'Using low back to yank — wrong muscle group.',
      'Rushing negatives — loses half the growth stimulus.',
    ],
  },
  'seated calf raise': {
    difficulty: 'beginner',
    primaryMuscles: ['Soleus'],
    formCues: [
      'Place balls of feet on platform; knees bent 90 degrees.',
      'Drop heels below platform for full stretch.',
      'Press up through big toe and ball of foot.',
      'Pause one second at top on lighter sets.',
      'Use slow tempo; calves respond to stretch and squeeze.',
    ],
    commonMistakes: [
      'Bouncing at bottom — Achilles irritation risk.',
      'Cutting depth — soleus never fully lengthens.',
      'Locking knees on wrong setup — use machine as designed.',
    ],
  },
  'standing calf raise': {
    difficulty: 'beginner',
    primaryMuscles: ['Gastrocnemius'],
    formCues: [
      'Stand tall on balls of feet; knees straight but not hyperlocked.',
      'Lower heels below platform under control.',
      'Drive up tall; squeeze calves hard at top.',
      'Hold balance aid lightly; do not pull yourself up.',
      'Keep ankles stable; no collapsing inward.',
    ],
    commonMistakes: [
      'Bouncing reps — reduces tension and risks tendon issues.',
      'Half range — misses full gastroc stretch.',
      'Leaning way forward — changes load line.',
    ],
  },
  'chest press machine': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest', 'Triceps'],
    formCues: [
      'Adjust seat so handles align mid-chest.',
      'Press handles forward without shrugging shoulders.',
      'Control return until mild stretch across chest.',
      'Keep head and butt on pad throughout.',
      'Breathe out on press; in on return.',
    ],
    commonMistakes: [
      'Seat too low or high — irritates shoulders.',
      'Bouncing handles off stack — loses tension.',
      'Rounding upper back off pad — unstable pressing.',
    ],
  },
  'shoulder press machine': {
    difficulty: 'beginner',
    primaryMuscles: ['Shoulders', 'Triceps'],
    formCues: [
      'Adjust seat so handles near shoulder height at start.',
      'Press overhead in machine arc without locking harshly.',
      'Keep low back neutral; use pad if available.',
      'Lower until comfortable stretch; no pain.',
      'Keep head neutral; do not jut chin forward.',
    ],
    commonMistakes: [
      'Arching low back off pad — overloads spine.',
      'Using legs to assist — defeats shoulder work.',
      'Pressing unevenly — one arm works harder.',
    ],
  },
  'lat pulldown machine': {
    difficulty: 'beginner',
    primaryMuscles: ['Lats'],
    formCues: [
      'Same cues as cable lat pulldown; pad locks thighs.',
      'Pull handles to chest with elbows down.',
      'Avoid excessive lean; stay tall.',
      'Full stretch at top without shrugging.',
      'Match grip width to comfortable shoulder feel.',
    ],
    commonMistakes: [
      'Behind-neck variation — avoid for most people.',
      'Pulling with body English — weak lats stay weak.',
      'Half reps — no stretch means poor development.',
    ],
  },
  'seated row machine': {
    difficulty: 'beginner',
    primaryMuscles: ['Mid back', 'Lats'],
    formCues: [
      'Sit tall; chest proud; feet on platform.',
      'Pull handles to torso; squeeze shoulder blades.',
      'Keep neck neutral; do not crane forward.',
      'Return until arms straight without rounding hard.',
      'Do not snap torso backward each rep.',
    ],
    commonMistakes: [
      'Excessive lean back — momentum replaces rows.',
      'Shrugging at finish — traps take over.',
      'Rounded shoulders at stretch — poor posture under load.',
    ],
  },
  'pec deck': {
    difficulty: 'beginner',
    primaryMuscles: ['Chest'],
    formCues: [
      'Set arms so elbows and pads align comfortably.',
      'Bring pads together with pec squeeze; soft elbows.',
      'Control return until stretch across chest.',
      'Keep shoulder blades stable on pad.',
      'Stop if front shoulder pinches; reduce range.',
    ],
    commonMistakes: [
      'Pressing with triceps — elbows too straight.',
      'Going too heavy — shoulders bear brunt.',
      'Bouncing at stretch — risky for pec tendon.',
    ],
  },
  'hack squat machine': {
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Shoulders under pads; feet mid-platform to start.',
      'Unlock and squat to depth you own with spine supported.',
      'Drive through feet evenly; knees track toes.',
      'Do not let lower back peel off pad.',
      'Rerack carefully; never rush near failure.',
    ],
    commonMistakes: [
      'Feet too low on platform — excessive knee shear feeling.',
      'Collapsing at bottom — dangerous on machine angle.',
      'Knees caving — add foot width or reduce load.',
    ],
  },
  'smith machine squat': {
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Set feet slightly forward so knees can travel with bar path.',
      'Sit down between hips; bar tracks vertical.',
      'Keep chest tall; brace core each rep.',
      'Do not rely on lockout bounce at top.',
      'Use safeties at appropriate height always.',
    ],
    commonMistakes: [
      'Feet directly under bar — awkward knee angles.',
      'Letting knees cave — same as free squat risk.',
      'Going too deep with butt wink — stop higher.',
    ],
  },
  'cable machine row': {
    difficulty: 'beginner',
    primaryMuscles: ['Mid back', 'Lats'],
    formCues: [
      'Use whichever handle attachment program prescribes.',
      'Pull to torso with tall chest; squeeze blades.',
      'Control forward without collapsing shoulders.',
      'Keep cable stack smooth; no jerking.',
      'Match stance and knee bend per station design.',
    ],
    commonMistakes: [
      'Torso swing — defeats constant tension rows.',
      'Shrugging — traps overpower rhomboids.',
      'Rounded stretch position — poor mechanics.',
    ],
  },
  pullup: {
    difficulty: 'advanced',
    primaryMuscles: ['Lats', 'Biceps'],
    formCues: [
      'Hang with full grip; pack shoulders slightly down.',
      'Pull chest toward bar by driving elbows down and back.',
      'Clear chin over bar without craning neck wildly.',
      'Lower to dead hang or near-dead hang per program.',
      'Keep legs still; no excessive kipping unless training kip.',
    ],
    commonMistakes: [
      'Half reps — chin never clears — stalls strength gains.',
      'Shrugging into ears — loses lat engagement.',
      'Kipping for strict reps — false strength progress.',
    ],
  },
  chinup: {
    difficulty: 'advanced',
    primaryMuscles: ['Lats', 'Biceps'],
    formCues: [
      'Supinated grip; hands shoulder-width typically.',
      'Pull chest to bar; elbows track down and forward.',
      'Lower with control; full stretch at bottom if shoulders allow.',
      'Squeeze biceps and lats together at top.',
      'Keep core tight to limit swinging.',
    ],
    commonMistakes: [
      'Neck craning to clear bar — fake rep height.',
      'Swinging hips — momentum replaces pulling strength.',
      'Stopping short at bottom — limits range gains.',
    ],
  },
  pushup: {
    difficulty: 'beginner',
    primaryMuscles: ['Chest', 'Triceps'],
    formCues: [
      'Hands under shoulders; body straight from head to heels.',
      'Lower chest to floor; elbows angle about 45 degrees.',
      'Press floor away; keep ribs tucked slightly.',
      'Squeeze glutes and quads for one straight line.',
      'Do not let hips sag or pike upward.',
    ],
    commonMistakes: [
      'Hips sagging — low back stress, not more chest.',
      'Elbows flaring 90 degrees — shoulder irritation.',
      'Head hanging — hurts neck and breaks line.',
    ],
  },
  dip: {
    difficulty: 'intermediate',
    primaryMuscles: ['Chest', 'Triceps'],
    formCues: [
      'Support on bars with shoulders depressed, not shrugged.',
      'Lean slightly forward for chest bias or stay vertical for triceps.',
      'Lower until comfortable shoulder stretch; no sharp pain.',
      'Press up without shrugging into ears.',
      'Keep legs still or slightly forward per style.',
    ],
    commonMistakes: [
      'Dropping too deep — shoulder impingement risk.',
      'Shrugging at bottom — unstable and painful.',
      'Kipping wildly — not strength training.',
    ],
  },
  'inverted row': {
    difficulty: 'intermediate',
    primaryMuscles: ['Upper back', 'Biceps'],
    formCues: [
      'Hang under bar; body straight like upside-down plank.',
      'Pull chest to bar; squeeze shoulder blades.',
      'Keep neck neutral; do not jut chin.',
      'Lower until arms straight without hips sagging.',
      'Elevate feet to progress if needed.',
    ],
    commonMistakes: [
      'Hips sagging — turns row into worm motion.',
      'Cutting range — chest never nears bar.',
      'Flaring elbows wide — shoulder discomfort.',
    ],
  },
  'glute bridge': {
    difficulty: 'beginner',
    primaryMuscles: ['Glutes'],
    formCues: [
      'Lie on back; feet under knees about hip-width.',
      'Drive hips up by squeezing glutes, not arching low back.',
      'Pause at top; ribs stay down toward pelvis.',
      'Lower with control; tap floor lightly between reps.',
      'Do not push through neck or shoulders.',
    ],
    commonMistakes: [
      'Hyperextending low back — hurts and skips glutes.',
      'Feet too far — hamstrings cramp, glutes mute.',
      'Pushing through toes — reduces glute drive.',
    ],
  },
  'hip thrust bodyweight': {
    difficulty: 'beginner',
    primaryMuscles: ['Glutes'],
    formCues: [
      'Upper back on bench; feet planted under knees.',
      'Drop hips slightly then thrust up tall.',
      'Finish with vertical shins and horizontal thighs.',
      'Keep chin tucked slightly; look forward.',
      'Squeeze glutes hard at top each rep.',
    ],
    commonMistakes: [
      'Arching low back at top — same error as loaded thrust.',
      'Feet wrong distance — feels like hamstring not glute.',
      'Bouncing off floor — loses tension.',
    ],
  },
  plank: {
    difficulty: 'beginner',
    primaryMuscles: ['Core'],
    formCues: [
      'Elbows under shoulders; forearms parallel.',
      'Push floor away; shoulder blades slightly spread.',
      'Squeeze glutes; tuck pelvis slightly.',
      'Breathe behind brace; do not hold breath until you pass out.',
      'Keep head in line with spine.',
    ],
    commonMistakes: [
      'Hips sagging — low back compression and useless plank.',
      'Piking hips up — avoids real anti-extension work.',
      'Looking up — strains neck.',
    ],
  },
  'side plank': {
    difficulty: 'intermediate',
    primaryMuscles: ['Obliques'],
    formCues: [
      'Elbow under shoulder; feet stacked or staggered.',
      'Lift hips to straight line from head to feet.',
      'Reach top arm up or place on hip per program.',
      'Keep hips from rotating forward or backward.',
      'Breathe in short controlled breaths.',
    ],
    commonMistakes: [
      'Hips dropping — loses oblique stimulus.',
      'Rotating chest toward floor — cheats alignment.',
      'Shrugging shoulder into ear — unstable support arm.',
    ],
  },
  'dead bug': {
    difficulty: 'beginner',
    primaryMuscles: ['Deep core'],
    formCues: [
      'Lie on back; knees and hips at 90 degrees.',
      'Press low back gently into floor before moving limbs.',
      'Extend opposite arm and leg slowly without back arching.',
      'Return and switch sides with control.',
      'Exhale as limbs extend away.',
    ],
    commonMistakes: [
      'Low back peeling off floor — defeats anti-extension goal.',
      'Moving too fast — no control means no progress.',
      'Holding breath — raises blood pressure and ruins brace.',
    ],
  },
  'bird dog': {
    difficulty: 'beginner',
    primaryMuscles: ['Glutes', 'Low back stabilizers'],
    formCues: [
      'Hands under shoulders; knees under hips.',
      'Reach opposite arm and leg long; keep hips square.',
      'Do not rotate pelvis open to the side.',
      'Hold briefly; return under control.',
      'Move slow; quality beats height.',
    ],
    commonMistakes: [
      'Rotating torso — cheats anti-rotation challenge.',
      'Looking up — breaks neutral neck.',
      'Rushing reps — balance never improves.',
    ],
  },
  'ab wheel rollout': {
    difficulty: 'advanced',
    primaryMuscles: ['Abs', 'Lats'],
    formCues: [
      'Knees on pad; hands on wheel under shoulders.',
      'Brace abs; roll forward only as far as you can with flat back.',
      'Pull wheel back using lats and abs together.',
      'Stop before low back caves into extension.',
      'Shorten range until perfect before going longer.',
    ],
    commonMistakes: [
      'Leading with low back — sharp spine stress.',
      'Going too far too soon — form always breaks first.',
      'Holding breath entire set — dizzy and weak.',
    ],
  },
  'hanging leg raise': {
    difficulty: 'advanced',
    primaryMuscles: ['Abs', 'Hip flexors'],
    formCues: [
      'Hang with shoulders packed slightly down.',
      'Lift knees or legs with posterior pelvic tilt first.',
      'Exhale as knees rise toward chest.',
      'Lower with control; minimize swinging.',
      'Stop if grip fails; use straps only if allowed.',
    ],
    commonMistakes: [
      'Swinging from shoulders — fake ab reps.',
      'Arching hard at bottom — irritates low back.',
      'Using only hip flexors — forget pelvic tilt cue.',
    ],
  },
  'hollow body hold': {
    difficulty: 'intermediate',
    primaryMuscles: ['Abs'],
    formCues: [
      'Lie on back; press low back into floor.',
      'Lift shoulders and legs; arms overhead or by sides.',
      'Hold position while breathing shallow and controlled.',
      'Keep lower back glued down the whole time.',
      'Reduce lift height if back arches.',
    ],
    commonMistakes: [
      'Low back lifting — hollow is gone, stop and regress.',
      'Holding breath until failure — bad strategy.',
      'Looking up — strains neck; tuck chin slightly.',
    ],
  },
  superman: {
    difficulty: 'beginner',
    primaryMuscles: ['Low back', 'Glutes'],
    formCues: [
      'Lie prone; arms forward, legs straight.',
      'Lift chest and thighs slightly off floor together.',
      'Squeeze glutes; do not crank neck backward.',
      'Lower slowly; small range is fine.',
      'Keep reps smooth; this is not a ballistic yank.',
    ],
    commonMistakes: [
      'Hyperextending neck — hurts cervical spine.',
      'Jerking up fast — low back irritation.',
      'Overarching — more is not better here.',
    ],
  },
  'nordic hamstring curl': {
    difficulty: 'advanced',
    primaryMuscles: ['Hamstrings'],
    formCues: [
      'Knees padded; ankles anchored; body tall from knees.',
      'Lower forward with hips extended as long as possible.',
      'Catch with hands before face hits; push back up.',
      'Keep hips extended; do not pike early.',
      'Progress range slowly over weeks.',
    ],
    commonMistakes: [
      'Bending at hips immediately — avoids hamstring lengthening.',
      'Dropping uncontrolled — face or shoulder impact risk.',
      'Progressing too fast — strains distal hamstring tendon.',
    ],
  },
  'pike pushup': {
    difficulty: 'intermediate',
    primaryMuscles: ['Shoulders', 'Upper chest'],
    formCues: [
      'Hips piked high; hands wider than shoulders on floor.',
      'Lower head toward floor between hands.',
      'Press up while keeping elbows angled forward slightly.',
      'Keep ribs tucked; do not sag into low back arch.',
      'Elevate feet later to increase difficulty.',
    ],
    commonMistakes: [
      'Head not traveling forward — wrong shoulder line.',
      'Elbows flaring — shoulder pinch city.',
      'Hips dropping — becomes weird push-up, not pike.',
    ],
  },
  'wall sit': {
    difficulty: 'beginner',
    primaryMuscles: ['Quadriceps'],
    formCues: [
      'Back flat on wall; feet stepped out so knees over ankles.',
      'Thighs parallel to floor if you can hold quality.',
      'Press entire foot into floor evenly.',
      'Breathe steadily; shake is normal near end.',
      'Slide up wall to rest safely when done.',
    ],
    commonMistakes: [
      'Knees past toes excessively — uncomfortable shear.',
      'Hands on thighs pushing — defeats quad loading.',
      'Feet too close — slides you down awkwardly.',
    ],
  },
  'box jump': {
    difficulty: 'intermediate',
    primaryMuscles: ['Quadriceps', 'Glutes'],
    formCues: [
      'Start close; swing arms and dip slightly.',
      'Jump up softly onto box; land with bent knees.',
      'Stand tall on box; step down one foot at a time.',
      'Choose box height you own every rep.',
      'Reset fully between jumps if doing singles.',
    ],
    commonMistakes: [
      'Jumping down backward — shin scrape and fall risk.',
      'Collapsing into valgus landing — knee injury risk.',
      'Using max height with poor landing — skill first.',
    ],
  },
  burpee: {
    difficulty: 'intermediate',
    primaryMuscles: ['Full body', 'Cardio'],
    formCues: [
      'Drop hands to floor; jump feet back to plank.',
      'Chest touches or hovers per standard; keep core tight.',
      'Jump feet in; stand or jump up to finish.',
      'Breathe rhythmically; do not hold breath entire set.',
      'Step back instead of jump if fatigue breaks form.',
    ],
    commonMistakes: [
      'Sagging plank — low back stress during burpee.',
      'Landing with locked knees — joint shock.',
      'Rushing reps — turns into sloppy flop.',
    ],
  },
  'mountain climber': {
    difficulty: 'beginner',
    primaryMuscles: ['Core', 'Hip flexors'],
    formCues: [
      'High plank; hands under shoulders.',
      'Drive knees toward chest alternately with level hips.',
      'Keep shoulders over wrists; do not pike hips high.',
      'Light quick feet or slow controlled per goal.',
      'Breathe steadily through the burn.',
    ],
    commonMistakes: [
      'Bouncing butt up and down — wrong pattern.',
      'Hands too far forward — awkward shoulder angle.',
      'Losing core — low back sags.',
    ],
  },
  'russian twist': {
    difficulty: 'beginner',
    primaryMuscles: ['Obliques'],
    formCues: [
      'Sit leaning back slightly; feet down or up per level.',
      'Rotate torso side to side touching weight near hips.',
      'Move from thoracic rotation; keep height steady.',
      'Hold weight close to body for control.',
      'Stop if low back feels shear instead of obliques.',
    ],
    commonMistakes: [
      'Yanking with arms only — no trunk rotation.',
      'Rounding hard — uncomfortable for spine.',
      'Feet flailing — means core is not controlling.',
    ],
  },
  vup: {
    difficulty: 'intermediate',
    primaryMuscles: ['Abs'],
    formCues: [
      'Lie flat; arms overhead, legs straight.',
      'Lift torso and legs toward each other into V shape.',
      'Lower with control; do not crash to floor.',
      'Exhale on crunch portion hard.',
      'Bend knees slightly if low back lifts off early.',
    ],
    commonMistakes: [
      'Using momentum from arms — swings you up unfairly.',
      'Slamming back down — spine impact.',
      'Neck straining — look at knees not ceiling.',
    ],
  },
  'flutter kick': {
    difficulty: 'beginner',
    primaryMuscles: ['Hip flexors', 'Abs'],
    formCues: [
      'Lie on back; hands under hips or low back for support.',
      'Lift shoulders slightly; legs hover straight.',
      'Small rapid kicks without low back arching off hands.',
      'Press low back gently toward floor.',
      'Stop if back tension beats ab burn.',
    ],
    commonMistakes: [
      'Big kicks with arched back — low back pain, not abs.',
      'Holding breath — limits endurance.',
      'Hands not supporting — back lifts uncontrollably.',
    ],
  },
};

const EDUCATION_KEYS_SORTED = Object.keys(EXERCISE_EDUCATION).sort(
  (a, b) => b.length - a.length,
);

/** Spaced spellings that normalize differently than compact keys (hyphens removed vs words split). */
const EDUCATION_ALIASES: Record<string, string> = {
  'dumbbell step up': 'dumbbell stepup',
  'close grip bench press': 'closegrip bench press',
  'cable pull through': 'cable pullthrough',
  'straight arm pulldown': 'straightarm pulldown',
  'pike push up': 'pike pushup',
  'v up': 'vup',
};

/** Normalize exercise name for education lookup (lowercase, trim, collapse space, strip specials). */
export function normalizeExerciseEducationKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

/** Resolve education entry: exact key, then longest key contained in normalized name. */
export function getExerciseEducation(name: string): ExerciseEducationEntry | null {
  const key = normalizeExerciseEducationKey(name);
  if (!key) return null;
  const direct = EXERCISE_EDUCATION[key];
  if (direct) return direct;
  const aliasTarget = EDUCATION_ALIASES[key];
  if (aliasTarget && EXERCISE_EDUCATION[aliasTarget]) {
    return EXERCISE_EDUCATION[aliasTarget];
  }
  for (const k of EDUCATION_KEYS_SORTED) {
    if (key.includes(k)) return EXERCISE_EDUCATION[k];
  }
  return null;
}

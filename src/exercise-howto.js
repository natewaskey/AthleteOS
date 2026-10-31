/*
 * How-to cards: for every exercise in the library, which animated demo to play (ExerciseDemo id), how to set up,
 * three coaching points and the most common mistake. Also maps the form-check lifts, camera tests and jump tests
 * to their demos. lookup(name) is case-insensitive and falls back to a close match for custom names
 * ("DB bench press" → bench press) so coaches' own exercise names still get a demo where one fits.
 */
(function (root) {
  'use strict';

  // name: [demo, setup, [cues], avoid]
  const H = {
    // warm-up & corrective
    "World's greatest stretch": ['world-greatest', 'Step into a long lunge, both hands inside the front foot.', ['Drop the back knee toward the floor', 'Elbow down toward the front ankle', 'Rotate and reach the same arm to the ceiling'], 'Letting the back knee collapse to the floor and resting there.'],
    '90/90 hip switches': ['90-90', 'Sit tall with both knees bent 90°, feet wide.', ['Keep the chest up as the knees swing', 'Both knees touch down on each side', 'Move slowly, no hands if you can'], 'Leaning back and using the hands to push over.'],
    'Leg swings': ['leg-swings', 'Stand side-on to a wall, one hand on it.', ['Swing from the hip, standing leg straight', 'Grow the range a little each swing', 'Keep the trunk still'], 'Arching the lower back to swing higher.'],
    'Walking lunge with rotation': ['lunge-rotation', 'Arms out in front at shoulder height.', ['Long step, back knee just off the floor', 'Rotate the chest over the front leg', 'Front knee stays over the foot'], 'Letting the front knee cave inward as you turn.'],
    Inchworm: ['inchworm', 'Stand tall, feet hip-width.', ['Fold down with soft knees, hands to the floor', 'Walk the hands out to a push-up position', 'Walk the feet back in toward the hands'], 'Sagging hips in the push-up position.'],
    'Glute bridge': ['glute-bridge', 'Lie on your back, knees bent, feet flat and hip-width.', ['Press through the heels', 'Squeeze the glutes to lift the hips', 'Straight line from knees to shoulders at the top'], 'Arching the lower back instead of using the glutes.'],
    'Band pull-apart': ['band-pull-apart', 'Hold a light band at shoulder height, arms straight.', ['Pull the band apart to your chest', 'Squeeze the shoulder blades together', 'Control the return'], 'Shrugging the shoulders up to the ears.'],
    'Jumping jacks': ['jumping-jacks', 'Stand tall, arms by your sides.', ['Jump the feet out as the arms go up', 'Land softly on the balls of the feet', 'Keep a steady rhythm'], 'Landing flat-footed and heavy.'],
    'Mini-band squat': ['miniband-squat', 'Band just above the knees, feet shoulder-width.', ['Push the knees out against the band', 'Sit down between the heels', 'Chest up, heels down'], 'Letting the band pull the knees together.'],
    'Lateral band walk': ['band-walk', 'Band around the ankles or knees, half-squat.', ['Step sideways, keep tension on the band', 'Toes point forward', 'Stay low and level'], 'Standing up tall and dragging the trailing foot.'],
    'Tempo goblet squat': ['tempo-goblet', 'Hold a light weight at the chest.', ['3 seconds down', 'Pause 1 second at the bottom', 'Stand up with control'], 'Dropping into the bottom and bouncing out.'],
    'Wall hip hinge': ['wall-hinge', 'Stand a foot-length in front of a wall, back to it.', ['Push the hips back until they touch the wall', 'Soft knees, flat back', 'Stand by driving the hips forward'], 'Bending the knees into a squat instead of hinging.'],
    'Dowel hip hinge': ['dowel-hinge', 'Hold a stick along your spine: head, upper back and tailbone.', ['Keep all 3 points on the stick', 'Hinge at the hips with soft knees', 'Stop when the back starts to round'], 'Losing contact with the stick at the head or tailbone.'],
    'Split squat hold': ['split-hold', 'Long split stance, back knee just off the floor.', ['Front shin roughly vertical', 'Torso tall, hips square', 'Breathe and hold the position'], 'Leaning forward over the front thigh.'],
    'Scapular push-up': ['scap-pushup', 'High plank, arms straight.', ['Let the chest sink between the shoulder blades', 'Push the floor away to spread them', 'Elbows stay locked'], 'Bending the elbows: this is a shoulder-blade move only.'],
    'Wall slide': ['wall-slide', 'Back against a wall, forearms on the wall.', ['Keep ribs down and lower back flat', 'Slide the arms up as far as you can', 'Forearms stay in contact'], 'Arching the lower back off the wall to get higher.'],
    'Band external rotation': ['band-er', 'Band at elbow height, elbow tucked to your side (a towel helps).', ['Rotate the forearm out, elbow stays put', 'Pause at the end', 'Slow 2-second return'], 'Swinging the elbow away from the body.'],
    'Single-leg balance': ['sl-balance', 'Stand on one leg, knee soft.', ['Hips level', 'Stand tall, eyes on a fixed point', 'Progress: eyes closed or unstable surface'], 'Letting the hip drop or the knee lock out.'],
    'Tibialis raise': ['tib-raise', 'Back against a wall, heels about a foot forward.', ['Lift the toes as high as you can', 'Pause at the top', 'Lower slowly'], 'Rocking the body instead of using the shins.'],
    'Eccentric wrist extension': ['wrist-ecc', 'Forearm on your thigh, palm down, light weight.', ['Use the other hand to lift the weight up', 'Lower slowly over 3–5 seconds', 'Keep the forearm still'], 'Lifting with the working wrist: it only lowers.'],
    'Neck isometrics': ['neck-iso', 'Sit or stand tall, hand on the head.', ['Push the head into the hand', 'Hand resists so the head doesn’t move', 'Front, back and each side, 10 s each'], 'Pushing so hard the head moves or jerks.'],
    // mobility
    'Ankle rocks (knee to wall)': ['ankle-rocks', 'Half-kneel facing a wall, front foot near it.', ['Drive the knee forward over the toes', 'Heel stays down', 'Touch the wall, back off, repeat'], 'Letting the heel lift or the knee cave in.'],
    'Couch stretch': ['couch-stretch', 'Back knee at the wall, shin up the wall, front foot forward.', ['Squeeze the glute of the back leg', 'Tuck the pelvis under', 'Bring the chest up as it allows'], 'Arching the lower back to fake an upright position.'],
    'Deep squat hold': ['deep-squat-hold', 'Feet shoulder-width, toes slightly out.', ['Sit as deep as you can, heels down', 'Elbows push the knees out', 'Chest tall, breathe'], 'Heels lifting off the floor.'],
    'Hip flexor stretch': ['hip-flexor', 'Half-kneeling, back knee on a pad.', ['Tuck the pelvis, squeeze the back glute', 'Shift forward slightly', 'Reach the same-side arm overhead'], 'Leaning far forward and arching the back.'],
    'Thoracic rotations': ['thoracic', 'Lie on your side, knees bent 90° (a roller under the knees helps).', ['Keep the knees together on the floor', 'Open the top arm across to the other side', 'Follow the hand with your eyes'], 'Letting the knees lift as you rotate.'],
    'Cat-cow': ['cat-cow', 'Hands under shoulders, knees under hips.', ['Round the whole spine up, exhale', 'Drop the belly and lift the chest, inhale', 'Move one segment at a time'], 'Moving only at the neck.'],
    'Hip CARs': ['hip-cars', 'Stand tall, hand on a wall.', ['Lift the knee, open it out to the side', 'Rotate it behind you and back down', 'Biggest circle you can, slowly'], 'Twisting the trunk to make the circle bigger.'],
    'Shoulder CARs': ['shoulder-cars', 'Stand tall, brace the trunk.', ['Make the biggest arm circle you can', 'Move slowly and keep tension', 'Ribs stay down'], 'Arching the back as the arm goes overhead.'],
    'Hamstring floss': ['ham-floss', 'Lie on your back, hold behind one thigh.', ['Thigh stays still', 'Straighten the knee toward the ceiling', 'Pull the toes down at the top'], 'Letting the thigh drift away from you.'],
    'Sleeper stretch': ['sleeper', 'Lie on your side, bottom arm out at 90°, elbow bent.', ['Use the top hand to press the forearm down', 'Gentle stretch at the back of the shoulder', 'Hold, don’t bounce'], 'Rolling the body backward or pushing into pain.'],
    'Foam roll': ['foam-roll', 'Roller under the muscle, hands supporting you.', ['Roll slowly, about an inch a second', 'Pause on tight spots for 20–30 s', 'Breathe and relax the muscle'], 'Rolling fast or directly over joints and bones.'],
    // speed & agility
    'A-skips': ['a-skip', 'Tall posture, light on the balls of the feet.', ['Drive the knee up to hip height', 'Toe up, strike down under the hip', 'Opposite arm drives'], 'Leaning back or landing on the heel.'],
    'B-skips': ['b-skip', 'Same as the A-skip.', ['Drive the knee up', 'Extend the lower leg out', 'Paw it back down under the hip'], 'Kicking out with a locked knee and landing in front.'],
    'High knees': ['high-knees', 'Tall posture, quick rhythm.', ['Knees to hip height', 'Land on the balls of the feet under you', 'Fast arms, elbows at 90°'], 'Leaning back and sitting into the hips.'],
    Carioca: ['carioca', 'Sideways, arms out for balance.', ['Back foot crosses in front, then behind', 'Hips rotate, shoulders stay square', 'Stay on the balls of the feet'], 'Looking down at your feet.'],
    'Acceleration sprint': ['accel', 'Start from a 2-point or falling start.', ['Strong forward lean from the ankles', 'Powerful pushes behind you', 'Rise up gradually over 10–20 yd'], 'Popping straight up in the first steps.'],
    'Flying sprint': ['flying', 'Build up over 20–30 yd, then sprint the zone.', ['Tall posture, slight forward lean', 'Feet land under the hips', 'Relaxed face and shoulders'], 'Over-striding and reaching out in front.'],
    'Pro agility (5-10-5)': ['pro-agility', 'Start in the middle, cones 5 yd either side.', ['Sprint 5 yd, touch the line', 'Turn and sprint 10 yd, touch the line', 'Sprint back through the middle'], 'Rounding the turns instead of planting.'],
    '3-cone drill (L-drill)': ['l-drill', 'Three cones in an L, 5 yd apart.', ['Sprint to cone 2 and back', 'Around cone 2, weave cone 3', 'Back around cone 2 to the finish'], 'Taking wide turns around the cones.'],
    'T-drill': ['t-drill', 'Cones in a T: 10 yd forward, 5 yd each side.', ['Sprint forward to the middle cone', 'Shuffle left, then right, then back to middle', 'Backpedal to the start'], 'Crossing the feet during the shuffle.'],
    'Agility ladder: in-in-out-out': ['ladder-iioo', 'Face the ladder side-on.', ['Both feet in, both feet out', 'Light, quick contacts', 'Arms move with the feet'], 'Watching your feet the whole way.'],
    'Agility ladder: Icky shuffle': ['ladder-icky', 'Stand beside the ladder.', ['Out, in, in, then out the other side', 'Stay on the balls of the feet', 'Rhythm before speed'], 'Hitting the rungs.'],
    'Lateral shuffle': ['shuffle', 'Athletic stance, knees bent.', ['Push off the trail leg', 'Feet never cross or click together', 'Hips stay low and level'], 'Bouncing up and down.'],
    'Backpedal to sprint': ['backpedal', 'Athletic stance facing forward.', ['Backpedal with low, short steps', 'Open the hips on the cue', 'Sprint out of the turn'], 'Standing up tall while backpedalling.'],
    'Sled sprint': ['sled-sprint', 'Harness at the hips, light load.', ['Big forward lean', 'Drive the knees, push the ground back', 'Keep the arms pumping'], 'A load so heavy the sprint turns into a march.'],
    'Hill sprint': ['hill', 'A 5–10° hill, 20–40 yd.', ['Lean into the hill from the ankles', 'Powerful arm drive', 'Walk back down to recover'], 'Bending at the waist.'],
    'Reaction ball drops': ['reaction-ball', 'Partner stands across holding a reaction ball.', ['Athletic stance, eyes on the ball', 'React and catch after one bounce', 'Reset fully between reps'], 'Guessing early before the bounce.'],
    'Mirror drill': ['mirror', 'Face a partner, cones 5 yd apart either side.', ['Shuffle to copy your partner', 'Stay square and low', 'Short, quick steps'], 'Crossing the feet to catch up.'],
    // plyometrics
    'Box jump': ['box-jump', 'Stand a foot from a box you can land on easily.', ['Swing the arms and jump', 'Land softly in a half squat', 'Step down, don’t jump down'], 'A box so high you land in a deep squat.'],
    'Depth jump': ['depth-jump', 'Stand on a 12–18 in box.', ['Step off, don’t jump off', 'Land and rebound as fast as you can', 'Jump straight up'], 'Long, soft ground contacts.'],
    'Broad jump': ['broad-jump', 'Feet hip-width behind a line.', ['Swing the arms back, then forward hard', 'Jump out and up', 'Stick the landing, knees over toes'], 'Falling forward or backward on the landing.'],
    'Pogo hops': ['pogo', 'Stand tall, hands on hips or relaxed.', ['Stiff ankles, bounce off the balls of the feet', 'Minimal knee bend', 'Quick contacts'], 'Landing on the heels.'],
    'Tuck jumps': ['tuck-jump', 'Feet hip-width.', ['Jump up and pull the knees to the chest', 'Land softly on both feet', 'Reset or rebound quickly'], 'Knees caving in on landing.'],
    'Lateral bound (skater)': ['skater', 'Stand on one leg.', ['Bound sideways to the other leg', 'Land soft and hold 1 s', 'Knee stays over the foot'], 'Landing with the knee falling inward.'],
    'Single-leg hop': ['sl-hop', 'Stand on one leg.', ['Hop forward', 'Land on the same leg, soft knee', 'Hold the landing 2 s'], 'Knee caving inward when landing.'],
    'Hurdle hops': ['hurdle-hops', 'Mini hurdles in a row.', ['Jump over each hurdle', 'Pull the knees up', 'Quick, springy contacts'], 'Pausing between hurdles.'],
    'Split squat jump': ['split-jump', 'Start in a split squat.', ['Explode up', 'Switch legs in the air', 'Land soft back into the split'], 'Front knee caving in on landing.'],
    Bounding: ['bounding', 'Run-up of a few steps.', ['Exaggerated running strides', 'Drive the knee forward and up', 'Hang in the air, then land under you'], 'Short, choppy steps.'],
    'Drop landing (stick it)': ['drop-landing', 'Stand on a 12 in box.', ['Step off', 'Land on both feet, knees bent', 'Freeze for 2 s, knees over toes'], 'Knees collapsing inward or landing stiff-legged.'],
    'Clap push-up': ['clap-pushup', 'High plank.', ['Lower, then push up hard', 'Clap in the air', 'Land with soft elbows'], 'Hips sagging during the push.'],
    // power
    'Power clean': ['power-clean', 'Bar over mid-foot, shins near the bar, flat back.', ['Push the floor away, bar close', 'Jump and shrug at the hips', 'Fast elbows to catch on the shoulders'], 'Pulling with the arms early.'],
    'Hang clean': ['hang-clean', 'Stand with the bar at mid-thigh.', ['Hinge to just above the knees', 'Jump and shrug', 'Fast elbows to the front rack'], 'Reverse-curling the bar up.'],
    'Hang snatch': ['hang-snatch', 'Wide grip, bar at mid-thigh.', ['Hinge, then jump explosively', 'Bar stays close to the body', 'Punch overhead into a quarter squat'], 'Swinging the bar away from the body.'],
    'Clean pull': ['clean-pull', 'Same start as the clean.', ['Push the floor away', 'Full hip extension and shrug', 'No catch: control it back down'], 'Bending the arms during the pull.'],
    'Kettlebell swing': ['kb-swing', 'Bell a foot in front, hinge to grab it.', ['Hike it back between the legs', 'Snap the hips forward', 'Bell floats to chest height'], 'Squatting the swing or lifting with the arms.'],
    'Jump squat': ['jump-squat', 'Light bar on the back or bodyweight.', ['Quick dip', 'Explode up', 'Land soft and reset'], 'Using a load that slows the jump.'],
    'Med ball slam': ['mb-slam', 'Ball overhead, feet shoulder-width.', ['Reach tall', 'Slam the ball down hard with the whole body', 'Catch or pick up and repeat'], 'Rounding the back to pick the ball up.'],
    'Med ball chest pass': ['mb-chest', 'Ball at the chest, facing a wall or partner.', ['Small dip', 'Step and push the ball out hard', 'Arms finish straight'], 'Throwing with the arms only.'],
    'Med ball rotational throw': ['mb-rot', 'Side-on to a wall, ball at the hip.', ['Load the back hip', 'Rotate the hips first, then the arms', 'Throw through the wall'], 'Throwing with the arms without turning the hips.'],
    'Push press': ['push-press', 'Bar in the front rack.', ['Short dip at the knees', 'Drive up with the legs', 'Press to lockout, head through'], 'A deep dip or leaning back.'],
    // strength
    'Back squat': ['back-squat', 'Bar on the upper back, feet shoulder-width.', ['Brace, then sit down between the heels', 'Knees track over the toes', 'Drive up, chest and hips together'], 'Knees caving in or heels lifting.'],
    'Front squat': ['front-squat', 'Bar on the front of the shoulders, elbows high.', ['Elbows stay up', 'Sit straight down', 'Upright torso'], 'Elbows dropping and the bar rolling forward.'],
    'Goblet squat': ['goblet-squat', 'Hold the weight at the chest.', ['Elbows inside the knees', 'Sit deep, chest up', 'Drive through the whole foot'], 'Rounding forward at the bottom.'],
    Deadlift: ['deadlift', 'Bar over mid-foot, hips between knees and shoulders.', ['Flat back, lats tight', 'Push the floor away', 'Lock out with the glutes, not the lower back'], 'Rounding the back off the floor.'],
    'Trap bar deadlift': ['trap-bar', 'Stand inside the bar, handles at your sides.', ['Chest up, flat back', 'Push through the floor', 'Stand tall at the top'], 'Hips shooting up first.'],
    'Romanian deadlift': ['rdl', 'Stand tall holding the bar.', ['Soft knees, push the hips back', 'Bar slides down the thighs', 'Stop when the back would round'], 'Squatting it down instead of hinging.'],
    'Bench press': ['bench', 'Eyes under the bar, feet flat, shoulder blades pinched.', ['Lower to mid-chest', 'Elbows about 45° from the body', 'Press back up over the shoulders'], 'Bouncing the bar off the chest or lifting the hips.'],
    'Incline dumbbell press': ['incline-db', 'Bench at 30–45°.', ['Lower to the upper chest', 'Elbows slightly tucked', 'Press up and slightly in'], 'Flaring the elbows straight out.'],
    'Overhead press': ['ohp', 'Bar in the front rack, glutes tight.', ['Press straight up past the face', 'Head through at the top', 'Ribs down'], 'Leaning back into a standing incline press.'],
    'Pull-up': ['pullup', 'Overhand grip just wider than shoulders.', ['Start from a dead hang', 'Pull the chest to the bar', 'Lower with control'], 'Kipping or half reps.'],
    'Chin-up': ['chinup', 'Underhand grip, shoulder-width.', ['Dead hang start', 'Pull the chin over the bar', 'Slow lowering'], 'Swinging the legs for momentum.'],
    'Barbell row': ['bb-row', 'Hinge to about 45°, bar below the knees.', ['Flat back', 'Pull the bar to the lower ribs', 'Squeeze the shoulder blades'], 'Standing up as you pull.'],
    'Dumbbell row': ['db-row', 'Hand and knee on a bench, flat back.', ['Pull the elbow back to the hip', 'Pause at the top', 'Lower all the way'], 'Twisting the trunk to lift.'],
    'Lat pulldown': ['lat-pulldown', 'Thighs under the pads, grip just wider than shoulders.', ['Slight lean back', 'Pull the bar to the upper chest', 'Control it back up'], 'Pulling behind the neck or leaning way back.'],
    'Split squat': ['split-squat', 'Long split stance.', ['Drop the back knee straight down', 'Front shin about vertical', 'Push through the front foot'], 'Front knee caving in.'],
    'Bulgarian split squat': ['bss', 'Back foot on a bench, front foot well forward.', ['Lower straight down', 'Slight forward lean is fine', 'Drive through the front heel'], 'Standing too close to the bench.'],
    'Walking lunge': ['walking-lunge', 'Tall posture, weights at your sides.', ['Long step forward', 'Back knee to just off the floor', 'Step through into the next rep'], 'Short steps that push the knee way past the toes.'],
    'Step-up': ['step-up', 'Box about knee height.', ['Whole foot on the box', 'Drive through the top leg', 'Don’t push off the bottom foot'], 'Springing off the trailing leg.'],
    'Hip thrust': ['hip-thrust', 'Upper back on a bench, bar across the hips.', ['Chin tucked, ribs down', 'Drive the hips up to a straight line', 'Squeeze the glutes 1 s at the top'], 'Arching the lower back at the top.'],
    'Single-leg RDL': ['sl-rdl', 'Stand on one leg, soft knee.', ['Hinge as the back leg lifts', 'Hips stay square to the floor', 'Back flat'], 'Hips opening up toward the ceiling.'],
    'Nordic hamstring curl': ['nordic', 'Kneel on a pad, heels anchored.', ['Straight line from knees to head', 'Lower as slowly as you can', 'Catch yourself with your hands'], 'Bending at the hips to make it easier.'],
    'Copenhagen plank': ['copenhagen', 'Side plank with the top leg on a bench.', ['Body in a straight line', 'Lift the bottom leg to the bench', 'Hold, breathe'], 'Hips sagging toward the floor.'],
    'Push-up': ['pushup', 'Hands slightly wider than shoulders.', ['Straight line from head to heels', 'Chest to fist height', 'Elbows about 45°'], 'Hips sagging or half reps.'],
    Dips: ['dips', 'Arms straight on parallel bars.', ['Lower until the shoulders are just below the elbows', 'Slight forward lean', 'Press to lockout'], 'Dropping too deep with shoulders rolling forward.'],
    'Face pull': ['face-pull', 'Rope at head height.', ['Pull the rope to your face', 'Elbows high, hands apart', 'Rotate the hands back at the end'], 'Pulling low to the chest with the elbows down.'],
    'Farmer carry': ['farmer', 'A heavy weight in each hand.', ['Stand tall, shoulders back', 'Short, quick steps', 'Grip hard, don’t let the weights swing'], 'Leaning to one side or shrugging.'],
    'Calf raise': ['calf-raise', 'Balls of the feet on the floor or a step.', ['Rise all the way up', 'Pause at the top', 'Lower slowly below level if on a step'], 'Bouncing through short reps.'],
    // core
    Plank: ['plank', 'Forearms down, elbows under the shoulders.', ['Straight line from head to heels', 'Squeeze the glutes and brace', 'Breathe'], 'Hips sagging or piking up.'],
    'Side plank': ['side-plank', 'On your side, elbow under the shoulder, feet stacked.', ['Hips up into a straight line', 'Top hand on the hip', 'Hold without twisting'], 'Hips dropping toward the floor.'],
    'Dead bug': ['dead-bug', 'On your back, arms up, knees over hips.', ['Press the lower back into the floor', 'Lower the opposite arm and leg slowly', 'Return and switch'], 'The lower back arching off the floor.'],
    'Bird dog': ['bird-dog', 'Hands under shoulders, knees under hips.', ['Reach the opposite arm and leg out long', 'Keep the hips level', 'Pause, return, switch'], 'Twisting the hips or arching the back.'],
    'Pallof press': ['pallof', 'Side-on to a cable or band, hands at the chest.', ['Press straight out', 'Don’t let it pull you round', 'Return slowly'], 'Rotating toward the anchor.'],
    'Hanging leg raise': ['hanging-leg-raise', 'Dead hang from a bar.', ['Brace the trunk', 'Raise the legs to hip height or higher', 'Lower slowly, no swing'], 'Swinging to get the legs up.'],
    'Ab wheel rollout': ['ab-wheel', 'Kneel, wheel under the shoulders.', ['Brace and roll out slowly', 'Go as far as you can without the back sagging', 'Pull back with the abs'], 'Lower back sagging at the end range.'],
    'Hollow hold': ['hollow', 'Lie on your back.', ['Press the lower back into the floor', 'Lift shoulders and legs', 'Arms overhead to make it harder'], 'Lower back lifting off the floor.'],
    'Russian twist': ['russian-twist', 'Sit, lean back slightly, feet down or up.', ['Rotate from the trunk', 'Touch the weight beside each hip', 'Keep the chest tall'], 'Moving only the arms.'],
    // conditioning
    'Tempo runs (110s)': ['tempo-run', '110 yd at about 70% effort.', ['Smooth, relaxed stride', 'Walk the recovery', 'Same pace every rep'], 'Turning it into a sprint.'],
    '300-yard shuttle': ['shuttle', 'Lines 25 yd apart.', ['Sprint 25 yd and back, 6 lengths', 'Touch each line', 'Low, efficient turns'], 'Wide, rounded turns.'],
    'Bike intervals': ['bike', 'Seat at hip height, slight knee bend at the bottom.', ['Hard effort for the work time', 'Easy spin to recover', 'Stay seated'], 'Bouncing in the saddle.'],
    'Row intervals': ['rower', 'Feet strapped in, start at the catch.', ['Legs, then body, then arms', 'Reverse on the way back', 'Strong push with the legs'], 'Pulling with the arms first.'],
    'Assault bike sprint': ['assault-bike', 'Seat set as on a bike.', ['Push and pull with the arms', 'Drive with the legs', 'All-out for the work time'], 'Pacing it: these are sprints.'],
    'Sled push': ['sled-push', 'Hands high on the poles, arms locked.', ['Big lean into the sled', 'Drive with short, powerful steps', 'Keep the back flat'], 'Standing up tall and losing the lean.'],
    'Jump rope': ['jump-rope', 'Rope handles at hip height.', ['Small hops on the balls of the feet', 'Turn the rope with the wrists', 'Elbows close to the body'], 'Jumping too high or double bouncing.'],
    'Battle ropes': ['battle-ropes', 'Athletic stance, a rope end in each hand.', ['Alternate arms fast', 'Waves go all the way to the anchor', 'Stay low, brace'], 'Standing up tall and using only the arms.'],
    'Stadium stairs': ['stairs', 'Start at the bottom of the stairs.', ['Drive up, every step or every other', 'Pump the arms', 'Walk down to recover'], 'Looking down and hunching over.'],
    'Easy run': ['easy-run', 'Conversational pace.', ['Relaxed shoulders and hands', 'Feet land under the hips', 'You should be able to talk'], 'Running too fast on easy days.'],
    // cool-down
    'Easy jog': ['easy-jog', 'Very easy pace.', ['Relax and breathe', 'Short, light steps', 'Let the heart rate come down'], 'Turning the cool-down into another workout.'],
    'Static stretching': ['static-stretch', 'Quads, hamstrings, shoulders.', ['Hold each stretch 30 s', 'Breathe slowly', 'Mild tension, never pain'], 'Bouncing into the stretch.'],
    'Pigeon stretch': ['pigeon', 'Front shin across the body, back leg long.', ['Hips square to the floor', 'Fold forward slowly', 'Breathe into the hip'], 'Letting the hips tilt to one side.'],
    "Child's pose": ['child', 'Kneel, big toes together, knees wide.', ['Sit the hips back to the heels', 'Reach the arms long', 'Breathe into the back'], 'Holding your breath.'],
    'Box breathing': ['box-breathing', 'Sit or lie comfortably.', ['In for 4', 'Hold for 4', 'Out for 4, hold for 4'], 'Forcing the breath.'],
  };

  const BY = {};
  for (const [name, [demo, setup, cues, avoid]] of Object.entries(H)) BY[name.toLowerCase()] = { name, demo, setup, cues, avoid };

  // Form-check lifts (Movement.EXERCISES ids) → library names.
  const FORM = { squat: 'Back squat', deadlift: 'Deadlift', rdl: 'Romanian deadlift', lunge: 'Split squat', bss: 'Bulgarian split squat', bench: 'Bench press', pushup: 'Push-up', ohp: 'Overhead press', landing: 'Drop landing (stick it)', row: 'Barbell row', pullup: 'Pull-up', hipthrust: 'Hip thrust', clean: 'Power clean', sprintstart: 'Acceleration sprint', cut: null, running: 'Easy run' };
  const EXTRA = {
    cut: { name: 'Cutting test', demo: 'cut', setup: 'Sprint at a cone about 5 yd away.', cues: ['Lower your hips into the plant', 'Plant the outside foot, knee over toes', 'Push off hard at 45°'], avoid: 'Knee caving in on the plant foot.' },
    cmj: { name: 'Countermovement jump', demo: 'cmj', cues: ['Hands on hips the whole time', 'Quick dip, then jump as high as you can', 'Land on the same spot with straight legs'], avoid: 'Tucking the knees in the air: it inflates the height.' },
    'cmj-left': { name: 'Single-leg CMJ', demo: 'sl-cmj', cues: ['Hands on hips', 'Dip and jump on one leg', 'Land on the same leg'], avoid: 'Swinging the free leg to get higher.' },
    'cmj-right': { name: 'Single-leg CMJ', demo: 'sl-cmj', cues: ['Hands on hips', 'Dip and jump on one leg', 'Land on the same leg'], avoid: 'Swinging the free leg to get higher.' },
    drop: { name: 'Drop jump', demo: 'drop-jump', cues: ['Step off, don’t jump off', 'Touch down and rebound as fast as you can', 'Jump straight up'], avoid: 'Sinking into a deep squat on landing.' },
    aslr: { name: 'Straight leg raise', demo: 'aslr', cues: ['Both knees straight', 'Bottom leg stays flat', 'Lift as high as you can, hold 2 s'], avoid: 'Bending the knee or lifting the bottom leg.' },
    shoulderflex: { name: 'Arm overhead', demo: 'shoulderflex', cues: ['Ribs down, no back arch', 'Raise the straight arm as high as it goes', 'Hold 2 s at the top'], avoid: 'Arching the back to get the arm higher.' },
  };

  // Close-enough matches for coaches' own names, most specific first.
  const ALIASES = [
    [/clap/, 'Clap push-up'], [/push.?up/, 'Push-up'], [/bench|floor press|chest press/, 'Bench press'], [/incline/, 'Incline dumbbell press'], [/push press|jerk/, 'Push press'], [/overhead press|shoulder press|military|\bohp\b/, 'Overhead press'],
    [/bulgarian|rear.?foot/, 'Bulgarian split squat'], [/split squat jump|lunge jump/, 'Split squat jump'], [/split squat/, 'Split squat'], [/lunge/, 'Walking lunge'], [/step.?up/, 'Step-up'],
    [/front squat/, 'Front squat'], [/goblet/, 'Goblet squat'], [/jump squat|squat jump/, 'Jump squat'], [/squat/, 'Back squat'],
    [/single.?leg (rdl|deadlift)|sl ?rdl/, 'Single-leg RDL'], [/rdl|romanian|stiff/, 'Romanian deadlift'], [/trap|hex/, 'Trap bar deadlift'], [/deadlift/, 'Deadlift'],
    [/hang snatch|snatch/, 'Hang snatch'], [/hang clean/, 'Hang clean'], [/clean pull|high pull/, 'Clean pull'], [/clean/, 'Power clean'], [/swing/, 'Kettlebell swing'],
    [/chin/, 'Chin-up'], [/pull.?up/, 'Pull-up'], [/pulldown/, 'Lat pulldown'], [/(db|dumbbell|single.?arm).*row/, 'Dumbbell row'], [/row(ing|er)? (interval|machine)|erg/, 'Row intervals'], [/row/, 'Barbell row'], [/face pull/, 'Face pull'], [/dip/, 'Dips'],
    [/hip thrust|glute thrust/, 'Hip thrust'], [/bridge/, 'Glute bridge'], [/nordic/, 'Nordic hamstring curl'], [/copenhagen|adductor plank/, 'Copenhagen plank'], [/side plank/, 'Side plank'], [/plank/, 'Plank'],
    [/calf|heel raise/, 'Calf raise'], [/tib/, 'Tibialis raise'], [/carry|farmer|suitcase/, 'Farmer carry'],
    [/box jump/, 'Box jump'], [/depth jump|drop jump/, 'Depth jump'], [/broad jump|long jump/, 'Broad jump'], [/pogo/, 'Pogo hops'], [/tuck/, 'Tuck jumps'], [/skater|lateral bound/, 'Lateral bound (skater)'], [/hurdle/, 'Hurdle hops'], [/bound/, 'Bounding'], [/single.?leg hop|sl hop/, 'Single-leg hop'], [/landing|stick/, 'Drop landing (stick it)'],
    [/slam/, 'Med ball slam'], [/chest pass/, 'Med ball chest pass'], [/rotational|scoop toss|med ball throw/, 'Med ball rotational throw'],
    [/sled push|prowler/, 'Sled push'], [/sled/, 'Sled sprint'], [/hill/, 'Hill sprint'], [/flying|fly/, 'Flying sprint'], [/accel|sprint start|block start/, 'Acceleration sprint'], [/5-10-5|pro agility|shuttle run/, 'Pro agility (5-10-5)'], [/300/, '300-yard shuttle'], [/l-drill|3.?cone/, '3-cone drill (L-drill)'], [/t-drill/, 'T-drill'], [/icky/, 'Agility ladder: Icky shuffle'], [/ladder/, 'Agility ladder: in-in-out-out'],
    [/carioca|grapevine/, 'Carioca'], [/shuffle/, 'Lateral shuffle'], [/backpedal/, 'Backpedal to sprint'], [/a-?skip/, 'A-skips'], [/b-?skip/, 'B-skips'], [/high knee/, 'High knees'], [/tempo run|tempo/, 'Tempo runs (110s)'], [/sprint/, 'Acceleration sprint'], [/jog/, 'Easy jog'], [/run/, 'Easy run'],
    [/assault|air ?bike|echo/, 'Assault bike sprint'], [/bike|cycl|spin/, 'Bike intervals'], [/stair|bleacher/, 'Stadium stairs'], [/rope/, 'Jump rope'], [/battle/, 'Battle ropes'],
    [/dead ?bug/, 'Dead bug'], [/bird ?dog/, 'Bird dog'], [/pallof|anti.?rotation/, 'Pallof press'], [/leg raise|toes to bar|knee raise/, 'Hanging leg raise'], [/rollout|ab wheel/, 'Ab wheel rollout'], [/hollow/, 'Hollow hold'], [/twist/, 'Russian twist'],
    [/pull.?apart/, 'Band pull-apart'], [/external rotation|\ber\b/, 'Band external rotation'], [/wall slide|wall angel/, 'Wall slide'], [/band walk|monster walk/, 'Lateral band walk'], [/hinge/, 'Dowel hip hinge'],
    [/couch/, 'Couch stretch'], [/hip flexor/, 'Hip flexor stretch'], [/pigeon/, 'Pigeon stretch'], [/child/, "Child's pose"], [/90.?90/, '90/90 hip switches'], [/cat.?cow/, 'Cat-cow'], [/thoracic|t-spine|open book/, 'Thoracic rotations'], [/sleeper/, 'Sleeper stretch'], [/foam|roll(er|ing)/, 'Foam roll'], [/ankle/, 'Ankle rocks (knee to wall)'], [/hamstring/, 'Hamstring floss'], [/leg swing/, 'Leg swings'], [/inchworm/, 'Inchworm'], [/greatest/, "World's greatest stretch"], [/stretch/, 'Static stretching'], [/breath/, 'Box breathing'], [/balance/, 'Single-leg balance'], [/jumping jack|jacks/, 'Jumping jacks'],
  ];

  function lookup(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    if (BY[n]) return { ...BY[n], exact: true };
    for (const [re, target] of ALIASES) if (re.test(n)) return { ...BY[target.toLowerCase()], exact: false };
    return null;
  }
  const forForm = (id) => (EXTRA[id] && FORM[id] === null ? EXTRA[id] : FORM[id] ? BY[FORM[id].toLowerCase()] : null);
  const forTest = (id) => EXTRA[id] || null;

  const HowTo = { H, BY, FORM, EXTRA, ALIASES, lookup, forForm, forTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = HowTo;
  else root.HowTo = HowTo;
})(typeof window !== 'undefined' ? window : globalThis);

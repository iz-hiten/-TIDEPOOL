// ULTRA-SURVIVAL BRAIN - EAT EVERYTHING, NEVER DIE
if (!_state.init) {
  _state.goodFood = {};
  _state.badFood = {};
  _state.lastReward = 0;
  _state.eatCount = 0;
  _state.init = true;
}

// Track rewards to learn good/bad foods
if (sensors.reward !== _state.lastReward && sensors.reward !== 0) {
  const sig = Math.round(sensors.chemical * 1000);
  if (sensors.reward > 0) {
    _state.goodFood[sig] = (_state.goodFood[sig] || 0) + 1;
    delete _state.badFood[sig];
  } else {
    _state.badFood[sig] = (_state.badFood[sig] || 0) + 1;
  }
}
_state.lastReward = sensors.reward;

const isNight = sensors.daylight < 0.3;
const nightComing = (sensors.t % 800) > 550 && (sensors.t % 800) < 750;

// Find closest shelter
let shelterDist = 999;
for (let i = 0; i < sensors.proximity.length; i++) {
  if (sensors.proximity[i].type === 4) {
    shelterDist = Math.min(shelterDist, sensors.proximity[i].dist);
  }
}
const inShelter = shelterDist < 4.5;

// Find predators
let predDist = 999;
let predAngle = 0;
for (let i = 0; i < sensors.proximity.length; i++) {
  if (sensors.proximity[i].type === 2 && sensors.proximity[i].dist < predDist) {
    predDist = sensors.proximity[i].dist;
    predAngle = (i / 8) * Math.PI * 2;
  }
}

// Find food
let foodDist = 999;
let foodAngle = 0;
let foodFound = false;
const chemSig = Math.round(sensors.chemical * 1000);
const isGoodFood = _state.goodFood[chemSig] > 0;
const isBadFood = _state.badFood[chemSig] > 2;

for (let i = 0; i < sensors.proximity.length; i++) {
  if (sensors.proximity[i].type === 1) {
    const d = sensors.proximity[i].dist;
    // In emergency, take any food. Otherwise prefer good, avoid bad
    const emergency = sensors.energy < 120;
    if (emergency || !isBadFood || sensors.energy < 80) {
      if (d < foodDist) {
        foodDist = d;
        foodAngle = (i / 8) * Math.PI * 2;
        foodFound = true;
      }
    } else if (isGoodFood && d < foodDist) {
      foodDist = d;
      foodAngle = (i / 8) * Math.PI * 2;
      foodFound = true;
    }
  }
}

// DECISION LOGIC
let thrust = 0.8;
let turn = 0;
let eat = 0;

// ABSOLUTE PRIORITY 1: Dying - eat ANYTHING nearby
if (sensors.energy < 70) {
  if (foodFound) {
    turn = foodAngle;
    thrust = 1.0;
    eat = foodDist < 2.0 ? 1 : 0;
  } else {
    // Desperate search
    turn = Math.sin(sensors.t * 0.1) * Math.PI / 4;
    thrust = 1.0;
  }
}

// PRIORITY 2: Predator very close - evade
else if (predDist < 3.5 && !inShelter) {
  turn = predAngle + Math.PI;
  thrust = 1.0;
  // But still eat if food is right there
  if (foodFound && foodDist < 1.3 && sensors.energy < 180) eat = 1;
}

// PRIORITY 3: Night and not in shelter - go to shelter
else if (isNight && !inShelter) {
  const sh = sensors.shelterBeacons[0];
  const shAngle = Math.atan2(sh.uy, sh.ux) - sensors.theta;
  turn = Math.atan2(Math.sin(shAngle), Math.cos(shAngle));
  thrust = 0.9;
  // Grab food on the way
  if (foodFound && foodDist < 1.5 && sensors.energy < 200) eat = 1;
}

// PRIORITY 4: Night approaching - head to shelter if energy is OK
else if (nightComing && !inShelter && sensors.energy > 140) {
  const sh = sensors.shelterBeacons[0];
  const shAngle = Math.atan2(sh.uy, sh.ux) - sensors.theta;
  turn = Math.atan2(Math.sin(shAngle), Math.cos(shAngle));
  thrust = 0.8;
  if (foodFound && foodDist < 1.5) eat = 1;
}

// PRIORITY 5: In shelter at night - rest
else if (isNight && inShelter) {
  thrust = 0.05;
  turn = 0;
  if (foodFound && foodDist < 1.2) eat = 1;
}

// PRIORITY 6: Need energy - aggressive foraging
else if (sensors.energy < 180 && foodFound) {
  turn = foodAngle;
  thrust = 0.9;
  eat = foodDist < 1.5 ? 1 : 0;
}

// PRIORITY 7: Safe - moderate foraging
else if (foodFound && (isGoodFood || sensors.energy < 220)) {
  turn = foodAngle;
  thrust = 0.7;
  eat = foodDist < 1.5 ? 1 : 0;
}

// PRIORITY 8: Explore
else {
  turn = Math.sin(sensors.t * 0.02) * Math.PI / 6;
  thrust = 0.6;
}

// CRITICAL OVERRIDES
// If energy CRITICAL, eat anything within 2.5 units
if (sensors.energy < 60) {
  for (let i = 0; i < sensors.proximity.length; i++) {
    if (sensors.proximity[i].type === 1 && sensors.proximity[i].dist < 2.5) {
      eat = 1;
      turn = (i / 8) * Math.PI * 2;
      thrust = 1.0;
      break;
    }
  }
}

// Never let energy drop by being too conservative
if (sensors.energy < 150 && foodFound && foodDist < 2.0) {
  eat = 1;
}

turn = Math.max(-Math.PI/6, Math.min(Math.PI/6, turn));
return { thrust, turnRate: turn, eat };

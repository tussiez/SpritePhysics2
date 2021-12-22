// Vehicle system for serverside
// @author tussiez
// Old version!

const Vehicle = function (Physijs, scene, Vector3, ObjectParams) {
  this.Car = (options) => {
    const {
      carMesh,
      minSteering,
      maxSteering,
      brakePower,
      wheelGeometry,
      wheelMaterial,
      suspensionStiffness,
      suspensionCompression,
      suspensionDamping,
      suspensionTravel,
      suspensionSlip,
      suspensionMaxForce,
      wheelOffset1,
      wheelY,
      wheelOffset2,
      wheelSuspensionHeight,
      wheelRadius,
      enginePower,
      steeringDamping,
      steeringReturnDamping,
      maxEngineRPM,
      transmissionMaxGear,
      transmissionGearShiftRPM, // array up to max gear-1
      transmissionGearPowerMult,
      speedCap, // max speed
     } = options;

    let tuning = new Physijs.VehicleTuning(
      suspensionStiffness || 10.88,
      suspensionCompression || 1.83,
      suspensionDamping || 0.28,
      suspensionTravel || 500,
      suspensionSlip || 10.5,
      suspensionMaxForce || 6000
    );
    if(carMesh.params) {
      carMesh.params._doNotSimulate = true;
    }
    let car = new Physijs.Vehicle(
      carMesh,
      tuning
    );
    let wheelDir = new Vector3(0, -1, 0);
    let wheelAxle = new Vector3(-1, 0, 0);
    car.mesh.parentVehicle = car; //parent
    scene.add(car); //important!
    car.mesh.setLinearFactor(new Vector3(1, 0.5, 1))

    // params
    car.force = {
      direction: null,
      power: null,
      steering: 0,
    };
    car.__isVehicle = true; // is a vehicle
    car.minSteering = minSteering;
    car.maxSteering = maxSteering;
    car.enginePower = enginePower;
    car.steeringDamping = steeringDamping;
    car.brakePower = brakePower;
    car.steeringReturnDamping = steeringReturnDamping;
    car.maxEngineRPM = maxEngineRPM || 7500;
    car.gear = 1;
    car.maxGear = transmissionMaxGear || 5;
    car.speedCap = speedCap || 10;
    car.throttle = 0; // throttle (e.g gas pedal by key);
    car.throttleHoldTime = 0; // multiplier
    car.maxThrottle = 1;
    car.gearShiftRPM = transmissionGearShiftRPM || [1500, 2000, 2500, 3000, 3500]; // stepped
    car.gearPowerMult = transmissionGearPowerMult || [1, 1.5, 2, 2.5, 3];

    car.rpm = 1000; // 1000rpm start
    car.isManual = false;
    car.neutral = false;


    car.applyEngine = (force) => {
      force *=(1-(car.rpm/car.maxEngineRPM)); // Higher RPM, less performance on engine
      car.applyEngineForce(force,0);
      car.applyEngineForce(force,1); // all wheels
      car.applyEngineForce(force, 2);
      car.applyEngineForce(force, 3);
    }


    for (let i = 0; i < 4; i++) {
      car.addWheel(
        ObjectParams, // for object to be constructed correctly so it can be seen on client
        wheelGeometry,
        wheelMaterial,
        new Vector3(
          0 === (i & 1) ? wheelOffset1 : -wheelOffset1,
          wheelY,
          i < 2 ? wheelOffset1 : wheelOffset2,
        ),
        wheelDir,
        wheelAxle,
        wheelSuspensionHeight,
        wheelRadius,
        i < 2,

      );

    }

    car.manual = (dir) => {
      if(dir === 1 || dir === -1) car.isManual = true;
      if(dir === 0) car.isManual = false;
      if(dir === 1) {
        if(car.gearShiftRPM[car.gear+1]) {
          // can shift up
          car.gear += 1;
          if(car.rpm-(car.gearShiftRPM[car.gear]) >= 1000) { // > idle rpm
            car.rpm -= car.gearShiftRPM[car.gear]; // reduce rpm

            // improve perf
          }
        }
      }
      if(dir === -1) {
        if(car.gearShiftRPM[car.gear-1]) {
          car.rpm += car.gearShiftRPM[car.gear]/8;
          car.gear -= 1;
        }
      }
    }


    car.update = (fps) => {
      if (Number.isNaN(car.speed) || car.speed === undefined) car.speed = 0;
      if (car.force.direction != null) {
        // Steer car.
        car.force.steering -= car.force.direction / car.steeringDamping;
        if (car.force.steering < car.minSteering) car.force.steering = car.minSteering;
        if (car.force.steering > car.maxSteering) car.force.steering = car.maxSteering; // Minimum and maximum steer
        car.setSteering(car.force.steering, 0);
        car.setSteering(car.force.steering, 1);
      } else {
        if (car.force.steering > 0) car.force.steering -= car.steeringReturnDamping * car.force.steering;
        if (car.force.steering < 0) car.force.steering -= car.steeringReturnDamping * car.force.steering;
        car.force.steering = Number(car.force.steering.toFixed(2));
        if (car.force.steering < car.steeringReturnDamping && car.force.steering > -car.steeringReturnDamping) car.force.steering = 0; // clamping
        car.setSteering(car.force.steering, 0);
        car.setSteering(car.force.steering, 1)
      }
      

      if (car.force.power == true || car.force.power == 2) {
        // up throttle
        car.throttleHoldTime += 0.04;
        if (car.throttleHoldTime > 1) car.throttleHoldTime = 1;
        car.throttle += (1 / 500) * (car.throttleHoldTime); // Exp. increase
        //car.rpm += ((0.5 * 5) * (car.throttleHoldTime/1.2)) * (car.gearPowerMult[car.gear]) * ((car.gear + 1) * 4);
        
        if (car.throttle > 1) car.throttle = 1;
      } else {
        // no power? slowly drop throttle
        car.throttleHoldTime = 0; // reset
        car.throttle -= 1 / 700;
        if (car.throttle < 0) car.throttle = 0;
        if (car.rpm >= 1000 && car.neutral == false) {
          let calc = -(car.throttle * enginePower * car.gearPowerMult[car.gear] / ((car.rpm - 999) / 300)) / 2;
          if (calc < -1) calc = 0;
          if (car.speed < 0.1) calc = 0;
          car.applyEngine(calc); // Artificial engine resistance while in gear
        } else if (car.neutral === false) {
          car.applyEngine(0); // Stalled
          car.setBrake(car.brakePower, 2);
          car.setBrake(car.brakePower, 3);
        } else if (car.neutral === true) {
          car.applyEngine(0);
        }
      //  car.rpm -= 50;
        if (car.rpm < 1000 && car.isManual === false || car.neutral === true) { car.rpm = 1000 };
        if (car.rpm < 0 && car.isManual === true && car.neutral === false) {
          car.rpm = 1;
        }
      }
      //  car.rpm = car.throttle*car.maxEngineRPM; // rpm
      if(!car.speed) car.speed = 0;
      car.rpm = ((car.speed*3+1) * (car.throttle*(car.gear+1.5)+0.01) * car.gearPowerMult[car.gear] / ((car.gear)/4+1))*20;
      if(car.rpm > car.maxEngineRPM) car.rpm = car.maxEngineRPM;
      if(car.rpm < 0) car.rpm = 0;

      // GEAR SWITCH
      if (car.isManual === false) { //
        let range = 13000;
      //  if (car.speed > (car.gearShiftRPM[car.gear] + range) / 300) {
        if(car.rpm > car.maxEngineRPM -300) {
          if (car.gearShiftRPM[car.gear + 1]) {
            // can shift up
            car.gear += 1;

          }

        }

       // if (car.speed < (car.gearShiftRPM[car.gear] * (range / 1200)) / 250 || car.throttleHoldTime > 1.5) {
         if(car.rpm < 2000  || car.throttleHoldTime > 1.5) {

          if(car.gearShiftRPM[car.gear -1]) {
          // shift down
            car.gear -= 1;

        }
        }
      }
      // console.log('GEAR: '+ car.gear +' RPM:' + car.rpm);


      if (car.force.power == true) {
        if (car.neutral === false) {
          car.applyEngine(car.throttle * car.enginePower * car.gearPowerMult[car.gear] * (car.gearShiftRPM[car.gear] / 100));

          car.reverse = false;
          car.setBrake(0, 1);
          car.setBrake(0, 0);
          car.setBrake(0, 2);
          car.setBrake(0, 3);
        }
      } else if (car.force.power == 2) {
        if (car.gear > 1) { car.applyEngine(0); car.setBrake(car.brakePower, 2); car.setBrake(car.brakePower, 3) }
        if (car.gear === 0) {
          car.applyEngine((-car.throttleHoldTime/2) * 10 * car.enginePower);
          car.reverse = true;

          car.setBrake(0, 1);
          car.setBrake(0, 0); // clear brakes
          car.setBrake(0, 2);
          car.setBrake(0, 3);
        }
      } else if (car.force.power == false) {
       car.applyEngine(0); // Force brakes!
       // car.setBrake(car.brakePower, 2);
       // car.setBrake(car.brakePower, 3);
        car.setBrake(car.brakePower,0);
        car.setBrake(car.brakePower,1);

        let vel = car.mesh.getLinearVelocity();
        car.mesh.setLinearVelocity(new THREE.Vector3(vel.x,-20,vel.z));
      } else {
        //car.applyEngineForce(0); would brake
      }

      if (car.brakeGlass && car.force.power === false) { car.brakeGlass.material.emissiveIntensity = 1 ;
      } else {
        if (car.brakeGlass) {
          car.brakeGlass.material.emissiveIntensity = 0.3;
        }
      }

      if(car.toggleReverse) {
        if(car.reverse === true) {
          car.toggleReverse(1);
        } else if(car.reverse === false){
          car.toggleReverse(0);
        }
      }


      let carVeloc = car.mesh.getLinearVelocity();
      carVeloc.clamp(new Vector3(
        -car.speedCap,
        -car.speedCap,
        -car.speedCap,
      ),
        new Vector3(
          car.speedCap,
          car.speedCap,
          car.speedCap
        ));
      car.mesh.setLinearVelocity(carVeloc); // clamp
      // Compute speed
      if (car.mesh._vehicleLastPosition === undefined) { car.mesh._vehicleLastPosition = new Vector3().copy(car.mesh.position); }
      car.mesh._vehicleLastPosition.y = car.mesh.position.y; // correct suspension error

      if (!car.speedSamples) car.speedSamples = [];
      let dist2 = car.mesh.position.distanceTo(car.mesh._vehicleLastPosition) *1000/60; //1000/60 * (1000/fps);
      if(dist2 < Infinity) {
      car.speedSamples.push(dist2);
      }
      if (car.speedSamples.length > fps) car.speedSamples.shift();

      let someCounter = 0;
      for (let sp of car.speedSamples) someCounter += sp;
      car.speed = (someCounter / car.speedSamples.length)*7; //for fps variation

      car.mesh._vehicleLastPosition.copy(car.mesh.position);
    }

    return car;
  }
};
module.exports = Vehicle;

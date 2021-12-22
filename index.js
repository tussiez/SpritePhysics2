// Scroll to bottom to add objects


// SpritePhysics 2
// Server side
const NodePhysijs = require('nodejs-physijs');
const Ammo = NodePhysijs.Ammo;
const THREE = NodePhysijs.THREE;
const Physijs = NodePhysijs.Physijs(THREE, Ammo);
const NewTHREE = require('three');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const middleware = require('socketio-wildcard')();
const Vehicle = require('./vehicle.js');
const {
  performance
} = require('perf_hooks');
io.use(middleware);

app.use(express.static(__dirname + '/public'));
app.get('/', (req, res) => res.sendFile('/index.html'));

let scene, block, simLoop, fps, frames = 0, id = 0, players = [], vehicleSystem, vehicles = [];


/*

Physijs Multiplayer Engine

@author tussiez

*/


// Token gen for object UUID and player IDs
let chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
const token = () => {
	let i = 15;
	let str = '';
	while (i--) {
		str += chars[Math.floor(Math.random() * chars.length)]
	}
	return str;
}


// Geometry generators & materials

const boxGeometry = (h, w, d) => {
  let geo = new THREE.CubeGeometry(h, w, d);
  geo.name = 'box';
  return geo;
}

const sphereGeometry = (r, h, w) => {
  let geo = new THREE.SphereGeometry(r, h, w);
  geo.name = 'sphere';
  return geo;
}

const planeGeometry = (x, y, xs, ys) => {
  let geo = new THREE.PlaneGeometry(x, y, xs, ys);
  geo.name = 'plane';
  return geo;
}

const spotLight = (color, intensity) => {
  let light = new THREE.SpotLight(color, intensity);
  light.name = 'spot';
  light._lightType = 'spot';
  light._lightParams = [color, intensity];
  return light;
}

const ambientLight = (color, intensity) => {
  let light = new THREE.AmbientLight(color, intensity);
  light.name = 'ambient';
  light._lightType = 'ambient';
  light._lightParams = [color, intensity];
  return light;
}

const hemisphereLight = (color0, color1, intensity) => {
  let light = new THREE.HemisphereLight(color0, color1, intensity);
  light.name = 'hemisphere';
  light._lightType = 'hemisphere';
  light._lightParams = [color0, color1, intensity];
  return light;
}

const cylinderGeometry = (x, y, z) => {
  let geo = new THREE.CylinderGeometry(x, y, z);
  geo.name = 'cylinder';
  geo.paramX = x;
  geo.paramY = y;
  geo.paramZ = z; // for client
  geo.paramRotation = [0, 0, 0];
  geo.rotate = function(vec, amt) {
    geo.paramRotation[vec] = amt;
    return geo;
  }
  return geo;
}

const basicMaterial = (params) => {
  let mat = new THREE.MeshBasicMaterial(params);
  mat.name = 'basic';
  return mat;
}

const phongMaterial = (params) => {
  let mat = new THREE.MeshPhongMaterial(params);
  mat.name = 'phong';
  return mat;
}

const lambertMaterial = (params) => {
  let mat = new THREE.MeshLambertMaterial(params);
  mat.name = 'lambert';
  return mat;
}

const ObjectParams = function(obj) {
  let geoParams;
  let matParams;
  if(obj.geometry) {
    // Actually an object and not a lite 
    if(obj.geometry.name == 'box' || obj.geometry.name == 'plane') {
      geoParams = {
        name: obj.geometry.name,
        height: obj.geometry.width, // I forgot why swapped
        width: obj.geometry.height,
        depth: obj.geometry.depth,
      }
    }
    if(obj.geometry.name == 'sphere') {
      // Sphere geom 
      geoParams = {
        name: obj.geometry.name,
        radius: obj.geometry.radius,
      }
    }
    if(obj.geometry.name == 'cylinder') {
      geoParams = {
        name: obj.geometry.name,
        x: obj.geometry.paramX,
        y: obj.geometry.paramY,
        z: obj.geometry.paramZ,
        rotation: obj.geometry.paramRotation, // Wheels support (rot. cyl)
      }
    }
    matParams = {
      name: obj.material.name,
      color: obj.material.color,
      friction: obj.material._physijs != undefined ? obj.material._physijs.friction : 0.8,
      restitution: obj.material._physijs != undefined ? obj.material._physijs.restitution : 0.2, // Fric & rest for client side phys
    }
  } else {
    // A light 
    geoParams = {
      lightType: obj._lightType,
      lightParams: obj._lightParams,
      target: new THREE.Vector3(), // Spot light tar. pos.
    }
  }
  obj.params = { // general info
    position: obj.position,
    rotation: obj.rotation,
    geometry: geoParams,
    material: matParams,
    lastLinVeloc: new THREE.Vector3(),
    lastAngVeloc: new THREE.Vector3(), // Client side physics data
    id: token(), // uuid gen 
    forceUpdate: true, // Force update ignore interpol 
    sleeping: false, // update getter 
    mass: obj.mass | 0, // Static
  }

  obj.updateParams = function() {
    // Refresh this object 
    if(obj.params.vehicle_autoFlip == true) {
      // Flip the vehicle 
      // TODO 
    }


    // Update pos rot
    obj.params.position = obj.position;
    obj.params.rotation = obj.rotation;

    if(obj.params.lastPosition == undefined) obj.params.lastPosition = obj.params.position.clone();
    if(obj.params.lastRotation == undefined) obj.params.lastRotaton = obj.params.rotation.clone();

    if(typeof obj.getLinearVelocity != 'undefined') {
      // physijs object 
      obj.params.sleeping = obj.getLinearVelocity() == obj.params.lastLinVeloc && obj.getAngularVelocity() == obj.params.lastAngVeloc ? true : false; // not moving? 

      obj.params.lastLinVeloc = obj.getLinearVelocity();
      obj.params.lastAngVeloc = obj.getAngularVelocity();
    }

    obj.params.forceUpdate = false; // Already updated.
  }
  id++;
  return obj; // Done
}

const updateFPS = () => { // Simple FPS func
  let current = frames;
  setTimeout(() => {
    fps = (frames - current);
    updateFPS();
  },1000);
}

const init = () => {
  scene = new Physijs.Scene({fixedTimeStep: 1/60});

  scene.setGravity(new THREE.Vector3(0,-9.87,0));

  vehicleSystem = new Vehicle(Physijs, scene, THREE.Vector3, ObjectParams);

  buildWorld();


  setInterval(simulatePhysics, 1000 / 70); // Call simulation

  updateFPS(); // Start FPS counter
}


const simulatePhysics = () => {
    scene.setGravity(new THREE.Vector3(0,-12.87,0));

  if(scene.simulate() != 423134) { // Simulate
    frames++;

    let dataGroup = {
      fps, // FPS
      frame: frames, // used to sync client
      objects: [], // ObjectParams
    }

    for(let vehc of vehicles) {
      vehc.update(fps); // Update system
      vehc.mesh.applyCentralImpulse({x: 0, y: -5, z: 0}); // ground
      if(vehc.socketUpdate) {
        // update the client
        vehc.mesh.params.__vehicleClientInfo = vehc.socketUpdate();
      }

      if(vehc.mesh.position.y < -20) {
        vehc.mesh.position.set(0,10,0);
        vehc.mesh.__dirtyPosition = true;
        vehc.mesh.params.forceUpdate = true;
      }
    }

    if(vehicles.length < 1) {
      makeCar({x:0,y:10,z:0});
    }

    for(let i = 0; i < scene.children.length; i++){
      
      // All objects 
      let obj = scene.children[i];

      if(obj.params) {

        if(obj._player) { // Player tp
          if(obj.position.y < -20) {
            obj.position.set(0,10,0);
            obj.__dirtyPosition = true;
            obj.forceUpdate = true;
          }
        }

        // Sendable 
        let needsUpdate = obj.params.forceUpdate;
        dataGroup.objects.push(obj.params);
        let idx = dataGroup.objects.indexOf(obj.params);
        obj.updateParams();
        dataGroup.objects[idx].forceUpdate = needsUpdate; // Fix for forced updates 

        if(obj.params.sleeping == true && needsUpdate == false) {
          // Rid of object 
          dataGroup.objects.splice(idx, 1);

        }

      }

    }


    for(let plyr of players) {

      if(plyr.driving != undefined) {
        // Is driving a car, lock player location
        plyr.obj.position.set(
          plyr.driving.mesh.position.x,
          plyr.driving.mesh.position.y+1.5,
          plyr.driving.mesh.position.z,
        )
        plyr.obj.__dirtyPosition = true;
      }

      let cla = new THREE.Vector3()
      .copy(
        plyr.obj.getLinearVelocity()
      )
      .clamp(
        new THREE.Vector3(-5,-100,-5),
        new THREE.Vector3(5,60,5)
      ); // Prevent infinite speeds 

      plyr.obj.setLinearVelocity(cla);
      plyr.obj.setAngularVelocity({x:0,y:0,z:0}); // Limit player sphere movement 
      plyr.obj.rotation.set(0,0,0);


    }

    // Send data to clients 
    io.emit('simulate', dataGroup);

  }
}

// convenience

const geometries = {
  'box': boxGeometry,
  'sphere': sphereGeometry,
  'plane': planeGeometry,
}

const materials = {
  'phong': phongMaterial,
  'lambert': lambertMaterial,
  'basic': basicMaterial,
}

const bodyTypes = {
  'box': Physijs.BoxMesh,
  'sphere': Physijs.SphereMesh,
}


// Anti-spam chat delays
const minMessageDelay = 300; // ms
const maxMessageDelay = 5000;


const getObjectById = (id) => { // Search for object by ID

  for(let i = 0; i < scene.children.length; i ++) {

    let obj = scene.children[i];

    if(obj.params && obj.params.id == id) return obj; // Found object

  }

}

const getPlayerByToken = (token) => { // Find player by token

  for(let py of players) {

    if(py.id == token) return py; // Found player

  }

}

const getPlayerByName = (name) => { // Find player by their name 

  for(let py of players) {

    if(py.name == name) return py; // Found
    
  }

}

io.on('connection', (socket) => {

  // On connection from a client 

  let socketToken = token(); // generate uuid 

  players.push({
    id: socketToken,
    name: undefined, // A name has not been chosen 
    obj: null, // Character not generated 
    self: socket, // For reference 
    driving: undefined, // Not driving. 
    admin: true, // Lol free admin
  });

  let canJump = true;

  let tempPlayerGeo = cylinderGeometry(0.8,0.8,1.6); // Generate geometry on load


  let plyr = getPlayerByToken(socketToken); // get player again 

  tempPlayerGeo.computeBoundingSphere = () => {tempPlayerGeo.boundingSphere = {radius:0.8}};

  plyr.obj = new ObjectParams( // Generate object for player
    new Physijs.SphereMesh(
      tempPlayerGeo,
      Physijs.createMaterial(phongMaterial({
        color: 'red',
        shininess: 120,
      }),1,0),
      1
    )
  );
  plyr.obj._player = true;
  plyr.obj._playerId = socket.id;
  plyr.obj.params.texture = 'img/spritelogo.webp';

  plyr.obj.addEventListener('collision', (other,linv,angv,normal) => {

    // Upon collision 
    canJump = true;

  });

  plyr.obj.params.playerId = socket.id; // For client side info 

  plyr.obj.position.set(0,10,0); // Spawn location 

  scene.add(plyr.obj); // Add player to scene 

  console.log('Player ' + plyr.obj.params.id + ' joined. Waiting for name');


  // Player left 

  socket.on('disconnect', () => {

    if(plyr) {

      // Is the player even there? 

      if(plyr.driving) {
        // Clear driving
        plyr.driving.hasDriver = false;
        plyr.driving.mesh.params.__hasDriver = false;
        plyr.driving.applyEngineForce(0); // Stop engine
      
        let em = new THREE.Vector3();
        plyr.driving.mesh.setLinearVelocity(em);
        plyr.driving.mesh.setAngularVelocity(em);
        plyr.driving.mesh.applyCentralImpulse(new THREE.Vector3(0,-10,0)); // Ground
        plyr.driving.force.direction = null;
        plyr.driving.force.power = null;
      }

      scene.remove(plyr.obj);
      players.splice(players.indexOf(plyr),1);
      console.log('Player '+socketToken+' left.');

      io.emit('player_leave', { // Clear from client side
        name: plyr.name,
      });

    } else {

      // strange occurrence 
      console.warn('WARN: Unknown player left the game.');

    }

  });


  socket.on('setName', (name) => {

    // Set the name of the player 
    let duplicate = getPlayerByName(name); // First make sure there is nobody else using

    if(!duplicate) {

      // No duplicates
      plyr.name = name;
      plyr.obj.params._playerName = plyr.name;
      console.log('Set '+plyr.id+"'s name to "+plyr.name);
      
      // Player has name set, allow to join 
      socket.emit("setName_pass");
      io.emit("user_joined", {name: plyr.name, id: plyr.id});


    } else {

      // Attempted to join with a duplicate name 
      console.log(plyr.id + 'tried to join with a duplicate name.');

      socket.emit('setName_error', 'duplicate'); // Warn client

    }

  });

  // chat system 

  let lastMessageTimestamp = performance.now(); // Last time a message was sent
  let messageDelay = minMessageDelay; // Current message delay for player

  socket.on('chat', (msg) => {

    if(performance.now() - lastMessageTimestamp >= messageDelay) { // Sent after delay time

      messageDelay = minMessageDelay; // Reset delay
      lastMessageTimestamp = performance.now(); // Reset timestamp

      if(msg != '') {

        console.log((plyr.name ? plyr.name : plyr.obj.params.id) + ': '+msg); //Log

        io.emit("chat", "["+(plyr.name ? plyr.name : plyr.id)+'] '+msg); // Send

      }

    } else {

      messageDelay *= 2; // Spamming, increase message delay
      lastMessageTimestamp = performance.now();

      if(messageDelay > maxMessageDelay) messageDelay = maxMessageDelay; // Cap

      socket.emit('chat', "[System] Wait "+((messageDelay / 1000).toFixed(1))+"s to send a message"); // Send system message to client only

    }

  });


  socket.on('client_driveVehicle', () => {
    if(plyr.driving == undefined) {
      // not already driving
      for(let car of vehicles) {
        // Check distance to player
        if(
          car.mesh.position.distanceTo(plyr.obj.position) < 5 && // With in reach
          car.hasDriver == false // not alreay having a driver
        ) {

          car.hasDriver = true; // Has driver now
          car.mesh.params.__hasDriver = true; // For client prompt
          plyr.driving = car; // Driving this

          plyr.driving.socketUpdate = () => {
            if(plyr.driving && socket) {

              return {
                gear: plyr.driving.gear,
                rpm: plyr.driving.rpm,
                speed: plyr.driving.speed,
                socketId: socket.id, 
                /*
                Note
                allows others to see your vehicle data, it is globablly sent
                */
              }

            }
          }

          socket.emit('client_driveVehicle', true); // Found car
          break; // stop

        }
      }
    }
  });

  socket.on('client_deleteVehicle', () => {
    if(plyr.driving != undefined) {
      let idx = vehicles.indexOf(plyr.driving);
      scene.remove(plyr.driving);
      plyr.driving.mesh.params.__hasDriver = false;
      plyr.driving.socketUpdate = undefined; //No longer sending
      vehicles.splice(idx,1);
      plyr.driving = undefined;
      socket.emit('client_driveVehicle', false);
    } else {
      // No vehicle to delete
    }
  });

  socket.on('client_exitVehicle', () => {
    // Get out of vehicle, do not delete
    if(plyr.driving != undefined) {

      plyr.driving.hasDriver = false;
      plyr.driving.mesh.params.__hasDriver = false;
      plyr.driving.applyEngineForce(0); // Stop engine
      plyr.driving.force.direction = null;
      plyr.driving.force.power = null;
      
      let em = new THREE.Vector3();
      plyr.driving.mesh.setLinearVelocity(em);
      plyr.driving.mesh.setAngularVelocity(em);
      plyr.driving.mesh.applyCentralImpulse(new THREE.Vector3(0,-10,0)); // Ground

      plyr.driving = undefined;
      socket.emit('client_driveVehicle', false); // Ejected

    }
  });

  socket.on('client_flipVehicle', () => {
    // Flip vehicle if tipped
    if(plyr.driving != undefined) {
      let em = new THREE.Vector3();
      plyr.driving.mesh.setLinearVelocity(em);
      plyr.driving.mesh.setAngularVelocity(em);
      plyr.driving.mesh.applyCentralImpulse(new THREE.Vector3(0,10,0));
      plyr.driving.mesh.rotation.set(0,plyr.driving.mesh.rotation.y,0);
      plyr.driving.mesh.__dirtyRotation = true;
      // Done
    }
  });

  socket.on('client_controlVehicle', (direction, power, brake) =>{
    if(plyr.driving != undefined) {
      // Drive the vehicle
      if(direction!= 'NOT_DEFINED') {
        plyr.driving.force.direction = direction;
      }
      if(power != 'NOT_DEFINED') {
        plyr.driving.force.power = power;
      }
      if(brake != 'NOT_DEFINED') {
        if(brake == 'ENGINE_OFF') { // Hard brake (parking)
          plyr.driving.setBrake(plyr.driving.brakePower,0);
          plyr.driving.setBrake(plyr.driving.brakePower,1);
          plyr.driving.applyEngineForce(0);
        } else {
          for(let w of brake) { // Brake per wheel
            plyr.driving.setBrake(plyr.driving.brakePower, w);
          }
        }
      }
    }
  })

  /*

  WARNING
  
  The following are client backdoors. These will be removed later. 

  */

  socket.on('client_setVelocity', (position) => {

    if(position.x && position.y && position.z && typeof position.x == 'number' && typeof position.y == 'number' && typeof position.z == 'number') {

      plyr.obj.setLinearVelocity(
        new THREE.Vector3(
          position.x,
          position.y,
          position.z,
        )
      );

    }

  });

  socket.on('client_addVelocity', (position, speed) => {
  
    if(typeof position.x == 'number' && typeof position.y == 'number' && typeof position.z == 'number' && typeof speed == 'number') {

      let cur = new NewTHREE.Vector3();
      cur.addScaledVector(
        new THREE.Vector3(
          position.x,
          position.y,
          position.z,
        ),
        speed,
      );

      plyr.obj.applyCentralImpulse(cur);

    }

  });

  socket.on('client_jump', () => {
    if(canJump == true) {
      canJump = false;
      plyr.obj.applyCentralImpulse(new THREE.Vector3(0,10,0));
    }
  });

  // Admin tools

  socket.on('deleteObject', (id) => {

    if(plyr.admin == true) {

      if(getObjectById(id)) {
        
        scene.remove(
          getObjectById(id)
        );

      }

    }

  });

  socket.on('setObjectPosition', (id,position) => {

    if(plyr.admin == true) {

      let obj = getObjectById(id);

      if(obj) {

        if(
          position &&
          position.x &&
          position.y &&
          position.z &&
          typeof position.x == 'number' &&
          typeof position.y == 'number' &&
          typeof position.z == 'number'
        ) {

          obj.position.set(
            position.x,
            position.y,
            position.z,
          );
          obj.__dirtyPosition = true;
          obj.updateParams();
          obj.params.forceUpdate = true;

        }

      }

    }
    
  });

  socket.on('setObjectRotation', (id, rotation) => {

    if(plyr.admin == true) {

      let obj = getObjectById(id);

      if(obj) {

        if(
          rotation &&
          rotation.x &&
          rotation.y && 
          rotation.z &&
          typeof rotation.x == 'number' &&
          typeof rotation.y == 'number' && 
          typeof rotation.z == 'number'
        ) {
          
          obj.rotation.set(
            rotation.x,
            rotation.y,
            rotation.z,
          );
          obj.__dirtyRotation = true;
          obj.updateParams();
          obj.params.forceUpdate = true;

        }

      }

    }
    
  });

  socket.on('setObjectLinearVelocity', (id,velocity) => {

    if(plyr.admin) {

      let obj = getObjectById(id);

      if(obj) {

        if(
          velocity &&
          velocity.x &&
          velocity.y &&
          velocity.z &&
          typeof velocity.x == 'number' &&
          typeof velocity.y == 'number' &&
          typeof velocity.z == 'number'
        ) {

          obj.setLinearVelocity(
            new THREE.Vector3(
              velocity.x,
              velocity.y,
              velocity.z,
            )
          );

        }

      }

    }

  });

  socket.on('setObjectAngularVelocity', (id,velocity) => {
    
    if(plyr.admin) {

      let obj = getObjectById(id);

      if(obj) {

        if(
          velocity &&
          velocity.x &&
          velocity.y &&
          velocity.z &&
          typeof velocity.x == 'number' &&
          typeof velocity.y == 'number' &&
          typeof velocity.z == 'number'
        ) {

          obj.setAngularVelocity(
            new THREE.Vector3(
              velocity.x,
              velocity.y,
              velocity.z,
            )
          );

        }

      }

    }
    
  })

  socket.on('createObject', (geometry,material,mass,position,rotation,linv,angv) => {

    if(plyr.admin == true) {

      if
      (
        geometry && 
        material && 
        mass && 
        position && 
        rotation && 
        linv && 
        angv && 
        geometry.name && 
        material.name && 
        materials[material.name] && 
        geometries[geometry.name] && 
        material.color && 
        typeof mass == 'number' && 
        typeof position.x == 'number' && 
        typeof position.y == 'number' && 
        typeof position.z == 'number' && 
        typeof rotation.x == 'number' && 
        typeof rotation.y  == 'number' && 
        typeof rotation.z == 'number' && 
        typeof linv.x == 'number' &&
        typeof linv.y == 'number' && 
        typeof linv.z == 'number' && 
        typeof angv.x == 'number' && 
        typeof angv.y == 'number' && 
        typeof angv.z == 'number'
        ) {

        let geo, mat;

        mat = materials[material.name](
          {
            color: material.color,
          }
        );

        if(geometry.name == 'box' || geometry.name == 'plane') {
          
          if
          (
            geometry.height && 
            geometry.width && 
            geometry.depth && 
            typeof geometry.height == 'number' && 
            typeof geometry.width == 'number' && 
            typeof geometry.depth == 'number'
          ) {

          geo = geometries[geometry.name](geometry.height,geometry.width,geometry.depth);

          }
        
        }

        if(geometry.name == 'sphere') {

          if(geometry.radius && typeof geometry.radius == 'number') {

            geo = geometries[geometry.name](geometry.radius);

          }

        }

        let obj = new ObjectParams(
          new bodyTypes[geometry.name](
            geo,
            mat,
            mass
          )
        );
        
        obj.position.set(
          position.x,
          position.y,
          position.z,
        );
        obj.rotation.set(
          rotation.x,
          rotation.y,
          rotation.z,
        );

        scene.add(obj);

        obj.setLinearVelocity(
          new THREE.Vector3(
            linv.x,
            linv.y,
            linv.z,
          )
        );
        obj.setAngularVelocity(
          new THREE.Vector3(
            angv.x,
            angv.y,
            angv.z
          )
        );

        obj.updateParams();
        obj.params.forceUpdate = true;

        socket.emit("chat",`[System]: Created object ` +obj.params.id);

      } else {
        socket.emit('chat',`[System]: Invalid arguments. Valid: /createObject [{"name": "box", "height": 2, "width": 2, "depth": 2},{"name":"phong","color": {"r":1,"g":0.5,"b": 0.5}},1,{"x":0,"y":10,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0}]`);
      }
      
    } else {
      socket.emit("chat", `[System] You are not an administrator`);
    }

  })

});

http.listen(80, () => {
  console.log('Now listening on *:80');
});



/*
END MULTIPLAYER ENGINE
*/

const buildWorld = () => {
  let amb = new ObjectParams(ambientLight(0xffffff,0.5));
  scene.add(amb);

  let spot = new ObjectParams(spotLight(0xffffff, 0.8));
  spot.params.shadowCameraNear = 40;
  spot.params.shadowCameraFar = 70;
  spot.position.set(0,70,0);
  spot.updateParams();
  spot.params.forceUpdate = true;
  scene.add(spot);


  let obj = new ObjectParams(
    new Physijs.BoxMesh(
      boxGeometry(550,1,550),
      phongMaterial({color: 'green'}),
      0
    )
  );
  obj.params.texture = 'img/oldspritegreen.png';
  obj.params.textureRepeat = 2;
  obj.position.set(0,0,0);
  obj.updateParams();
  obj.params.forceUpdate = true;
  scene.add(obj);

  function makeCyl(x,y,z) {
    let obj = new ObjectParams(
      new Physijs.CylinderMesh(
        cylinderGeometry(5,5,10),
        phongMaterial({}),
        0,
      )
    );
    obj.params.texture = 'img/spritelogo.webp';
    obj.position.set(x,y,z);
    obj.updateParams();
    obj.params.forceUpdate = true;
    scene.add(obj);
  }

  makeCyl(-15,5,-15);
  makeCyl(-15,5,15);
  makeCyl(15,5,-15);
  makeCyl(15, 5, 15);

  // Car spawners
  let sp = new ObjectParams(
    new Physijs.BoxMesh(
      boxGeometry(2,2,2),
      phongMaterial({color:'red'}),
      0
    )
  );
  sp.position.set(-10,2,0);
  sp.params.texture = 'img/spawner.png';
  sp.updateParams();
  sp.params.forceUpdate = true;
  scene.add(sp);

  let lastPress = performance.now();

  sp.addEventListener('collision', other => {
    if(other._player == true) {
      // spawn
      if(performance.now() - lastPress > 2000) {
        if(vehicles.length < 5) {
          makeCar({x:0,y:10,z:0});
          lastPress = performance.now();
        } else {
          io.to(other._playerId).emit('chat',"[System] Too many vehicles spawned");
        }
      } else {
        io.to(other._playerId).emit('chat',"[System] Spawning too fast");
      }
    }
  });
  
}

const makeCar = (pos) => {
  let geo = cylinderGeometry(1.2,1.2,1.2).rotate(2, Math.PI/2); // Wheel
  let mat = phongMaterial({color: 'red'});
  let mes = new ObjectParams(
    new Physijs.BoxMesh(
      boxGeometry(4,2,7),
      phongMaterial({color: 'red'}),
      10
    )
  );
  mes.params.texture = 'img/spritelogogreen.png';
  let car = vehicleSystem.Car({
    carMesh: mes,
    minSteering: -0.6,
    maxSteering: 0.6,
    brakePower: 2,
    enginePower: 3.5,
    wheelGeometry: geo,
    wheelMaterial: mat,
    suspensionStiffness: 17.88,
    suspensionCompression: 1.83,
    suspensionDamping: 0.08,
    suspensionTravel: 5000,
    suspensionSlip: 200.5,
    suspensionMaxForce: 60000,
    wheelOffset1: 2.5,
    wheelOffset2: -2.5,
    wheelY: -0.6,
    wheelSuspensionHeight: 0.5,
    wheelRadius: 1.2,
    steeringDamping: 40,
    steeringReturnDamping: 0.1,
    maxEngineRPM: 7000,
    transmissionMaxGear: 5,
    transmissionGearShiftRPM: [1000,1200,1500,1700,1750,1800, 1900, 2000, 2100, 2250],
    transmissionGearPowerMult: [0.5, 0.7, 0.75, 1, 1.25, 1.5, 2, 2.5, 2.75, 3].reverse(),
    speedCap: 40,
  });
  car.mesh.position.copy(pos);
  car.mesh.__dirtyPosition = true;
  car.mesh.params.vehicle_autoFlip = true;
  car.hasDriver = false;
  car.mesh.params.__hasDriver = false;
  vehicles.push(car);
}


init(); // Start